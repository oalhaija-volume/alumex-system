import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', source)(exports, name => dependencies[name] ?? {});
  return exports;
}

const policy = load('src/lib/offline/policy.ts');

test('Admin and Indoor Sales are online-only while supported field roles retain offline work', () => {
  for (const role of ['Admin', 'Indoor Sales']) assert.equal(policy.canUseOfflineWorkspace(role), false);
  for (const role of ['Outdoor Sales', 'Sales Manager', 'Sales Director', 'Company Owner', 'CEO']) {
    assert.equal(policy.canUseOfflineWorkspace(role), true);
  }
});

test('the verified online-only policy remains scoped to its account when device storage is blocked', () => {
  const current = load('src/lib/offline/policy.ts');
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.localStorage;
  globalThis.window = {};
  globalThis.localStorage = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); }, removeItem() { throw new Error('Blocked'); } };
  try {
    for (const account of ['admin', 'indoor']) {
      current.setIndoorOnlineUser(account);
      assert.equal(current.isIndoorOnlineUser(account), true);
      assert.equal(current.isIndoorOnlineUser('other'), false);
      current.setIndoorOnlineUser(null);
      assert.equal(current.isIndoorOnlineUser(account), false);
    }
  } finally { globalThis.window = previousWindow; globalThis.localStorage = previousStorage; }
});

for (const role of ['Admin', 'Indoor Sales']) test(`${role} offline downloads are rejected before querying business data`, async () => {
  for (const path of ['src/app/api/offline/route.ts', 'src/app/api/offline/quotations/route.ts']) {
    const route = load(path, {
      'next/server': { NextResponse: Response },
      '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, user: { id: 'employee' }, role }) },
      '@/lib/supabase/admin': { createAdminClient: () => { throw new Error('A denied download must not query data'); } },
      '@/lib/offline/policy': policy,
    });
    const response = await route.GET(new Request('https://example.test/api/offline'));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: policy.indoorOnlineRequiredMessage, code: 'INDOOR_ONLINE_REQUIRED' });
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  }
});

for (const role of ['Admin', 'Indoor Sales']) test(`${role} identity checks stay available for legacy synchronization and account switching`, async () => {
  const profile = { full_name: `${role} employee`, branch: 'Karkh' };
  const query = { select() { return this; }, eq() { return this; }, single: async () => ({ data: profile }) };
  const route = load('src/app/api/offline/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, user: { id: 'employee' }, role }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => { assert.equal(table, 'profiles'); return query; } }) },
    '@/lib/offline/policy': policy,
  });
  const response = await route.GET(new Request('https://example.test/api/offline?session=1'));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).actor, {
    id: 'employee', name: `${role} employee`, role, branch: 'Karkh', outdoorRotationStartBranch: null,
  });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

for (const role of ['Admin', 'Indoor Sales']) test(`${role} retains authenticated synchronization of already saved measurements`, async () => {
  const employee = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const projectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const operation = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const calls = [];
  const query = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { id: projectId, branch: 'Karkh' } }) };
  const route = load('src/app/api/offline/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, user: { id: employee }, role, profile: { branch: 'Karkh' } }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({
      from: table => { assert.equal(table, 'projects'); return query; },
      rpc: async (name, args) => { calls.push({ name, args }); return { data: { id: projectId, sales_status: 'ready_for_quotation' }, error: null }; },
    }) },
    '@/lib/auth/projectBranchAccess': { hasGlobalProjectAccess: value => value === 'Admin', canAccessProjectRow: () => true },
    '@/lib/measurements/completion': load('src/lib/measurements/completion.ts'),
    '@/lib/offline/policy': policy,
  });
  const body = { id: operation, userId: employee, projectId, recordedAt: '2026-11-23T09:00:00Z', action: 'finish', payload: { note: 'Already saved measurements' } };
  const response = await route.POST(new Request('https://example.test/api/offline', { method: 'POST', body: JSON.stringify(body) }));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'sync_field_change');
  assert.equal(calls[0].args.p_actor, employee);
  assert.equal(calls[0].args.p_operation, operation);
  assert.equal(calls[0].args.p_recorded_at, body.recordedAt);
  assert.equal(calls[0].args.p_payload.note, body.payload.note);
  const otherAccount = await route.POST(new Request('https://example.test/api/offline', { method: 'POST', body: JSON.stringify({ ...body, userId: 'another-employee' }) }));
  assert.equal(otherAccount.status, 400);
  assert.equal(calls.length, 1, 'A different account cannot synchronize the retained operation');
});

async function followUps(online, refresh = false, role = 'Indoor Sales') {
  const effects = [], state = [], requests = [], listeners = new Map();
  let slot = 0;
  globalThis.window = { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
  const snapshot = { actor: { id: 'employee', role }, projects: [], queue: [],
    followUpHistories: { project: { project: { id: 'project' }, entries: [{ note: 'Stale device note' }] } } };
  const remote = { project: { id: 'project' }, entries: [{ note: 'Current server note' }] };
  globalThis.fetch = async (url, init) => { requests.push({ url, init }); return Response.json(remote); };
  const hook = load('src/components/workflow/useFollowUpHistory.ts', {
    react: { useEffect: callback => effects.push(callback), useState: initial => { const index = slot++; state[index] = initial; return [initial, value => { state[index] = value; }]; } },
    '@/lib/offline/store': { activeFieldUser: () => 'employee', readFieldState: async () => snapshot,
      updateFieldState: () => { throw new Error('Online-only follow-ups must not be cached'); } },
    '@/lib/offline/client': { isFieldOnline: () => online },
    '@/lib/offline/policy': { ...policy, isIndoorOnlineUser: () => true },
    '@/lib/workflow/workspaceEvents': { subscribeWorkspaceChanges: callback => {
      listeners.set('workspace', callback); return () => listeners.delete('workspace');
    } },
  });
  hook.useFollowUpHistory('project');
  const cleanup = effects[0]();
  for (let index = 0; index < 3; index++) await new Promise(resolve => setImmediate(resolve));
  if (refresh) {
    remote.entries = [{ note: 'New note from another device' }];
    listeners.get('workspace')();
    for (let index = 0; index < 3; index++) await new Promise(resolve => setImmediate(resolve));
  }
  cleanup();
  return { state, requests, remote, listeners };
}

for (const role of ['Admin', 'Indoor Sales']) test(`${role} follow-ups use the current server history without merging or storing device data`, async () => {
  const result = await followUps(true, false, role);
  assert.deepEqual(result.state[0], result.remote);
  assert.equal(result.state[1], ''); assert.equal(result.state[3], false);
  assert.equal(result.requests.length, 1); assert.equal(result.requests[0].init.cache, 'no-store');
  assert.equal(result.listeners.size, 0);
});

for (const role of ['Admin', 'Indoor Sales']) test(`${role} follow-ups fail closed offline even with a downloaded history`, async () => {
  const result = await followUps(false, false, role);
  assert.equal(result.state[0], null);
  assert.equal(result.state[1], policy.indoorOnlineRequiredMessage);
  assert.equal(result.requests.length, 0);
});

for (const role of ['Admin', 'Indoor Sales']) test(`a committed workspace update reloads the latest ${role} follow-up from the server`, async () => {
  const result = await followUps(true, true, role);
  assert.equal(result.requests.length, 2);
  assert.equal(result.state[0].entries[0].note, 'New note from another device');
  assert.equal(result.state[3], false);
  assert.equal(result.listeners.size, 0);
});
