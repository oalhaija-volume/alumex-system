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

test('the verified Indoor online-only policy remains scoped to its account when device storage is blocked', () => {
  const current = load('src/lib/offline/policy.ts');
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.localStorage;
  globalThis.window = {};
  globalThis.localStorage = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); }, removeItem() { throw new Error('Blocked'); } };
  try {
    current.setIndoorOnlineUser('indoor');
    assert.equal(current.isIndoorOnlineUser('indoor'), true);
    assert.equal(current.isIndoorOnlineUser('other'), false);
    current.setIndoorOnlineUser(null);
    assert.equal(current.isIndoorOnlineUser('indoor'), false);
  } finally { globalThis.window = previousWindow; globalThis.localStorage = previousStorage; }
});

test('Indoor offline downloads are rejected before querying business data', async () => {
  for (const path of ['src/app/api/offline/route.ts', 'src/app/api/offline/quotations/route.ts']) {
    const route = load(path, {
      'next/server': { NextResponse: Response },
      '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, user: { id: 'employee' }, role: 'Indoor Sales' }) },
      '@/lib/supabase/admin': { createAdminClient: () => { throw new Error('A denied download must not query data'); } },
      '@/lib/offline/policy': policy,
    });
    const response = await route.GET(new Request('https://example.test/api/offline'));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'INDOOR_ONLINE_REQUIRED');
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  }
});

test('Indoor identity checks stay available for legacy synchronization and account switching', async () => {
  const profile = { full_name: 'Indoor employee', branch: 'Karkh' };
  const query = { select() { return this; }, eq() { return this; }, single: async () => ({ data: profile }) };
  const route = load('src/app/api/offline/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, user: { id: 'employee' }, role: 'Indoor Sales' }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => { assert.equal(table, 'profiles'); return query; } }) },
    '@/lib/offline/policy': policy,
  });
  const response = await route.GET(new Request('https://example.test/api/offline?session=1'));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).actor, {
    id: 'employee', name: 'Indoor employee', role: 'Indoor Sales', branch: 'Karkh', outdoorRotationStartBranch: null,
  });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

async function followUps(online, refresh = false) {
  const effects = [], state = [], requests = [], listeners = new Map();
  let slot = 0;
  globalThis.window = { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
  const snapshot = { actor: { id: 'employee', role: 'Indoor Sales' }, projects: [], queue: [],
    followUpHistories: { project: { project: { id: 'project' }, entries: [{ note: 'Stale device note' }] } } };
  const remote = { project: { id: 'project' }, entries: [{ note: 'Current server note' }] };
  globalThis.fetch = async (url, init) => { requests.push({ url, init }); return Response.json(remote); };
  const hook = load('src/components/workflow/useFollowUpHistory.ts', {
    react: { useEffect: callback => effects.push(callback), useState: initial => { const index = slot++; state[index] = initial; return [initial, value => { state[index] = value; }]; } },
    '@/lib/offline/store': { activeFieldUser: () => 'employee', readFieldState: async () => snapshot,
      updateFieldState: () => { throw new Error('Indoor follow-ups must not be cached'); } },
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

test('Indoor follow-ups use the current server history without merging or storing device data', async () => {
  const result = await followUps(true);
  assert.deepEqual(result.state[0], result.remote);
  assert.equal(result.state[1], ''); assert.equal(result.state[3], false);
  assert.equal(result.requests.length, 1); assert.equal(result.requests[0].init.cache, 'no-store');
  assert.equal(result.listeners.size, 0);
});

test('Indoor follow-ups fail closed offline even with a downloaded history', async () => {
  const result = await followUps(false);
  assert.equal(result.state[0], null);
  assert.match(result.state[1], /requires an internet connection/);
  assert.equal(result.requests.length, 0);
});

test('a committed workspace update reloads the latest Indoor follow-up from the server', async () => {
  const result = await followUps(true, true);
  assert.equal(result.requests.length, 2);
  assert.equal(result.state[0].entries[0].note, 'New note from another device');
  assert.equal(result.state[3], false);
  assert.equal(result.listeners.size, 0);
});
