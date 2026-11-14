import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const outdoorId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const baghdadId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const projectId = '11111111-1111-4111-8111-111111111111';
const updatedAt = '2026-11-14T08:00:00.123456+00:00';
const legacyProject = { id: projectId, branch: 'Governorates', governorate: 'النجف', created_by: actorId,
  project_name: 'Legacy Najaf project', project_number: 'PRJ-LEGACY-NAJAF', client_id: 'client',
  structure_readiness: 'ready', sales_status: 'new_lead', original_creator_role: 'Outdoor Sales',
  assigned_outdoor_sales_id: outdoorId, updated_at: updatedAt, next_follow_up_at: null };

function modules(dependencies = {}) {
  const cache = new Map();
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {};
    cache.set(url.href, exports);
    const source = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'exports', source)(name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.startsWith('@/')) return load(new URL(`../src/${name.slice(2)}.ts`, import.meta.url));
      if (name.startsWith('.')) return load(new URL(`${name}.ts`, url));
      throw new Error(`Unexpected dependency: ${name}`);
    }, exports);
    return exports;
  }
  return path => load(new URL(`../src/${path}.ts`, import.meta.url));
}

test('legacy Najaf names use effective geography and retain existing role grants', () => {
  const load = modules(), projectNames = load('lib/workflow/projectName'), clientNames = load('lib/clients/name');
  for (const governorate of ['النجف', 'نجف', ' Najaf ']) {
    const project = { ...legacyProject, governorate };
    for (const role of ['Indoor Sales', 'Sales Manager']) {
      assert.equal(projectNames.canRenameProject(project, { id: actorId, role, branch: 'Najaf' }), true);
      assert.equal(clientNames.canRenameClient(project, { role, branch: 'Najaf' }), true);
      for (const branch of ['Karkh', 'Rasafa']) {
        assert.equal(projectNames.canRenameProject(project, { id: actorId, role, branch }), false);
        assert.equal(clientNames.canRenameClient(project, { role, branch }), false);
      }
    }
    for (const role of ['Admin', 'Sales Director', 'Company Owner', 'Outdoor Sales']) {
      assert.equal(projectNames.canRenameProject(project, { id: actorId, role, branch: 'Najaf' }), false);
      assert.equal(clientNames.canRenameClient(project, { role, branch: 'Najaf' }), role === 'Admin');
    }
    assert.equal(projectNames.canRenameProject({ ...project, project_log_only: true }, { id: actorId, role: 'Indoor Sales', branch: 'Najaf' }), false);
    assert.equal(clientNames.canRenameClient({ ...project, project_log_only: true }, { role: 'Admin' }), false);
  }
});

function assignmentEndpoint(role, actorBranch, ownerBranch) {
  const reads = [], writes = [];
  const owner = { id: ownerId, role: 'Indoor Sales', branch: ownerBranch, full_name: 'Najaf owner', is_active: true, status: 'Active' };
  const admin = { from(table) {
    const filters = []; let updating = false;
    const query = {
      select() { return this; }, eq(column, value) { filters.push([column, value]); return this; },
      in(column, values) { filters.push([column, values]); return this; },
      update(value) { updating = true; writes.push({ table, value, filters }); return this; },
      async maybeSingle() {
        reads.push(table);
        if (table === 'profiles') return { data: owner, error: null };
        return { data: updating ? { id: projectId, follow_up_owner_id: ownerId, updated_at: updatedAt } : legacyProject, error: null };
      },
    };
    return query;
  } };
  const api = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, role, user: { id: actorId }, profile: { branch: actorBranch } }) },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
  })('app/api/projects/[projectId]/indoor-sales/route');
  return { reads, writes, patch: () => api.PATCH({ json: async () => ({ followUpOwnerId: ownerId, expectedUpdatedAt: updatedAt }) },
    { params: Promise.resolve({ projectId }) }) };
}

test('leadership assigns legacy Najaf projects only to Najaf Indoor Sales without relabeling them', async () => {
  for (const role of ['Admin', 'Sales Director', 'Company Owner', 'CEO']) {
    const x = assignmentEndpoint(role, 'Najaf', 'Najaf');
    assert.equal((await x.patch()).status, 200, role);
    assert.equal(x.writes.length, 1);
    assert.deepEqual(x.writes[0].value, { follow_up_owner_id: ownerId });
    assert.ok(x.writes[0].filters.some(([column, value]) => column === 'branch' && value === 'Governorates'));
  }
  for (const ownerBranch of ['Karkh', 'Rasafa']) {
    const x = assignmentEndpoint('Admin', 'Karkh', ownerBranch);
    assert.equal((await x.patch()).status, 400);
    assert.deepEqual(x.writes, []);
  }
  for (const branch of ['Karkh', 'Rasafa']) {
    const x = assignmentEndpoint('CEO', branch, 'Najaf');
    assert.equal((await x.patch()).status, 404);
    assert.deepEqual(x.reads, ['projects']);
    assert.deepEqual(x.writes, []);
  }
  const ordinary = assignmentEndpoint('Indoor Sales', 'Najaf', 'Najaf');
  assert.equal((await ordinary.patch()).status, 403, 'Geographic access does not grant leadership-only reassignment');
  assert.deepEqual(ordinary.writes, []);
});

function offline(context, role = 'Indoor Sales', branch = 'Najaf') {
  const descriptors = new Map(['window', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  context.after(() => { for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); });
  let state = { actor: { id: actorId, role, branch, name: 'Employee' }, projects: [structuredClone(legacyProject)],
    outdoorSales: [{ id: outdoorId, name: 'Najaf outdoor', branch: 'Najaf' }, { id: baghdadId, name: 'Baghdad outdoor', branch: 'Karkh' }],
    indoorSales: [{ id: ownerId, name: 'Najaf owner', role: 'Indoor Sales', branch: 'Najaf' }, { id: baghdadId, name: 'Baghdad owner', role: 'Indoor Sales', branch: 'Karkh' }],
    openings: [], queue: [], syncedAt: null };
  globalThis.window = { location: { pathname: '/offline' }, dispatchEvent() {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  const store = { activeFieldUser: () => actorId, setFieldUser() {}, readStoredFieldState: async () => structuredClone(state),
    readFieldState: async () => structuredClone(state), updateFieldState: async (id, update) => { assert.equal(id, actorId); state = update(structuredClone(state)); return structuredClone(state); } };
  const client = modules({ './store': store, './device': { isOfflineDevice: () => true } })('lib/offline/client');
  return { client, get state() { return structuredClone(state); } };
}

test('Najaf Indoor keeps legacy project title and local follow-up controls available offline', async context => {
  const x = offline(context);
  await x.client.saveFieldChange('rename-project', projectId, { projectName: 'Updated Najaf title' }, actorId);
  await x.client.saveFieldChange('follow-up', projectId, { nextFollowUp: '2026-11-20T08:00:00Z', followUpType: 'call', note: 'Najaf follow-up', followUpOwnerId: ownerId }, actorId);
  await x.client.saveFieldChange('assign-measurements', projectId, { assignedOutdoorSalesId: outdoorId }, actorId);
  assert.deepEqual(x.state.queue.map(change => change.action), ['rename-project', 'follow-up', 'assign-measurements']);
  assert.equal(x.state.projects[0].project_name, 'Updated Najaf title');
  assert.equal(x.state.projects[0].follow_up_owner_id, ownerId);
  assert.equal(x.state.projects[0].assigned_outdoor_sales_id, outdoorId);
  assert.equal(x.state.projects[0].branch, 'Governorates');
  assert.equal(x.state.projects[0].governorate, 'النجف');
});

for (const branch of ['Karkh', 'Rasafa']) test(`${branch} Indoor cannot queue legacy Najaf edits despite creator identity`, async context => {
  const x = offline(context, 'Indoor Sales', branch), before = x.state;
  for (const [action, payload] of [['rename-project', { projectName: 'Denied' }], ['assign-measurements', { assignedOutdoorSalesId: outdoorId }]]) {
    await assert.rejects(x.client.saveFieldChange(action, projectId, payload, actorId), /not available/);
  }
  assert.deepEqual(x.state, before);
});

test('global offline access cannot assign legacy Najaf work to Baghdad employees', async context => {
  const x = offline(context, 'Admin', 'Karkh'), before = x.state;
  await assert.rejects(x.client.saveFieldChange('assign-measurements', projectId, { assignedOutdoorSalesId: baghdadId }, actorId), /project branch/);
  await assert.rejects(x.client.saveFieldChange('follow-up', projectId, { nextFollowUp: '2026-11-20T08:00:00Z', followUpType: 'call', note: '', followUpOwnerId: baghdadId }, actorId), /project branch/);
  assert.deepEqual(x.state, before);
});
