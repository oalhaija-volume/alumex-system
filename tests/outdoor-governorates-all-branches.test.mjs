import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const projectId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const offices = ['Karkh', 'Rasafa', 'Najaf'];
const governorates = ['البصرة', 'الرمادي', 'صلاح الدين', 'ديالى', 'الحلة', 'كربلاء', 'الديوانية', 'الكوت', 'العمارة', 'الناصرية', 'السماوة'];
const employee = branch => ({ id: actorId, name: 'Outdoor fixture', role: 'Outdoor Sales', branch });

function modules(dependencies = {}) {
  const cache = new Map();
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {};
    cache.set(url.href, exports);
    const source = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
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
const load = modules(), access = load('lib/auth/projectBranchAccess'), rotation = load('lib/intake/outdoorRotation');

for (const branch of ['Karkh', 'Rasafa']) test(`${branch} Outdoor can create Governorates while Najaf stays isolated`, () => {
  const actor = employee(branch);
  const date = new Date('2026-11-20T08:00:00Z');
  assert.deepEqual(rotation.outdoorProjectBranches(actor, date), ['Rasafa', 'Governorates']);
  assert.deepEqual(access.projectBranchesForActor(actor), ['Karkh', 'Rasafa', 'Governorates']);
  assert.equal(rotation.normalizeOutdoorProjectBranch(actor, 'Governorates', date), 'Governorates');
  for (const office of offices) {
    assert.equal(access.canAccessProjectBranch(actor, office), office !== 'Najaf');
    assert.equal(access.canAccessProjectRow(actor, { branch: office, created_by: actorId }), office !== 'Najaf');
    if (office !== 'Rasafa') assert.throws(() => rotation.normalizeOutdoorProjectBranch(actor, office, date));
  }
  assert.equal(access.canAccessProjectRow(actor, { branch: 'Najaf', created_by: otherId }), false);
});

test('Najaf Outdoor creation remains within Najaf', () => {
  const actor = employee('Najaf');
  assert.deepEqual(rotation.outdoorProjectBranches(actor), ['Najaf']);
  assert.deepEqual(access.projectBranchesForActor(actor), ['Najaf']);
  for (const branch of ['Karkh', 'Rasafa', 'Governorates']) assert.throws(() => rotation.normalizeOutdoorProjectBranch(actor, branch));
});

test('new Governorates geography has eleven choices and rejects geographic Najaf and missing values', () => {
  const geography = load('lib/intake/projectBranch');
  assert.deepEqual(geography.projectGovernorates, governorates);
  for (const value of governorates) assert.equal(geography.normalizeProjectGovernorate('Governorates', value), value);
  for (const value of ['النجف', '', null, undefined]) assert.throws(() => geography.normalizeProjectGovernorate('Governorates', value), /Choose the project governorate/);
  assert.equal(geography.normalizeProjectGovernorate('Najaf', 'النجف'), null, 'The independent employee branch remains valid');
});

test('Governorates follow-up remains exclusive to Karkh Indoor Sales and Sales Managers', () => {
  for (const branch of offices) for (const role of ['Outdoor Sales', 'Indoor Sales', 'Sales Manager']) {
    assert.equal(access.canOwnProjectFollowUp({ role, branch }, 'Governorates'), role !== 'Outdoor Sales' && branch === 'Karkh');
  }
  assert.deepEqual(access.projectBranchesForActor({ role: 'Indoor Sales', branch: 'Najaf' }), ['Najaf']);
  assert.deepEqual(access.projectBranchesForActor({ role: 'Indoor Sales', branch: 'Rasafa' }), ['Rasafa']);
  for (const branch of [null, undefined, '', 'Governorates']) {
    assert.deepEqual(rotation.outdoorProjectBranches(employee(branch)), []);
    assert.throws(() => rotation.normalizeOutdoorProjectBranch(employee(branch), 'Governorates'));
  }
});

for (const branch of offices) test(`${branch} legacy Governorates/Najaf records obey Najaf isolation without changing storage`, () => {
  const project = { id: projectId, branch: 'Governorates', governorate: 'النجف', created_by: actorId, assigned_outdoor_sales_id: actorId };
  const state = { actor: employee(branch), projects: [project], queue: [{ id: 'saved-change', projectId, action: 'opening', payload: { note: 'Preserved old entry' } }],
    openings: [{ id: 'saved-opening', projectId, skylight: { photo: 'saved-photo' } }], syncedAt: null };
  const before = structuredClone(state), cache = load('lib/offline/projectAccess');
  assert.equal(access.canAccessProjectRow(state.actor, project), branch === 'Najaf');
  assert.equal(cache.canAccessFieldProject(state, project), branch === 'Najaf');
  const visible = cache.visibleFieldState(state);
  for (const key of ['projects', 'queue', 'openings']) assert.deepEqual(visible[key], branch === 'Najaf' ? state[key] : []);
  assert.deepEqual(state, before, 'Removing a new-registration province must not relabel or discard old records');
});

for (const branch of ['Karkh', 'Rasafa']) test(`${branch} Governorates writes require creator or current self/team assignment`, () => {
  const actor = { ...employee(branch), outdoorTeamMemberIds: [actorId, otherId] };
  const project = { id: projectId, branch: 'Governorates', governorate: 'البصرة', created_by: 'unrelated-creator', assigned_outdoor_sales_id: 'unrelated-assignee' };
  const field = load('lib/offline/projectAccess');
  const stateFor = row => ({ actor, projects: [row], openings: [], queue: [], syncedAt: null });
  assert.equal(field.canAccessFieldProject(stateFor(project), project), false);
  for (const row of [{ ...project, created_by: actorId }, { ...project, assigned_outdoor_sales_id: actorId }, { ...project, assigned_outdoor_sales_id: otherId }]) {
    assert.equal(field.canAccessFieldProject(stateFor(row), row), true);
  }
  const state = { actor, projects: [project], openings: [], queue: [], syncedAt: null };
  assert.deepEqual(load('lib/offline/projectAccess').visibleFieldState(state).projects, []);
});

const payload = governorate => ({ client: { clientName: 'Governorates fixture', mobile: '07000000000', clientType: 'individual' },
  project: { branch: 'Governorates', governorate, buildingType: 'villa_house', structureReadiness: 'ready', address: 'Fixture address', locationLatitude: 33.3, locationLongitude: 44.4 } });

function endpoint(path, branch) {
  const writes = [];
  const route = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, role: 'Outdoor Sales', profile: { branch }, user: { id: actorId } }) },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
    '@/lib/supabase/admin': { createAdminClient: () => ({
      from(table) { assert.ok(['projects', 'field_sync_receipts'].includes(table)); return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }; },
      rpc: async (name, input) => { writes.push({ name, input }); return { data: { projectId }, error: null }; },
    }) },
  })(`app/api/${path}/route`);
  return { writes, async post(governorate) {
    const input = payload(governorate), body = path === 'offline' ? { id: projectId, projectId, userId: actorId, action: 'register', recordedAt: '2026-11-15T08:00:00Z', payload: input } : input;
    return route.POST({ json: async () => body });
  } };
}

for (const branch of ['Karkh', 'Rasafa']) for (const path of ['sales-intake', 'offline']) {
  test(`${path}: ${branch} Outdoor can register every allowed governorate`, async () => {
    const x = endpoint(path, branch);
    for (const governorate of governorates) {
      const response = await x.post(governorate);
      assert.equal(response.status, path === 'sales-intake' ? 201 : 200);
      const write = x.writes.at(-1);
      assert.equal(write.input.p_actor, actorId);
      assert.equal(write.input.p_payload.project.branch, 'Governorates');
      assert.equal(write.input.p_payload.project.governorate, governorate);
    }
    assert.equal(x.writes.length, 11);
  });
  test(`${path}: ${branch} Outdoor cannot submit geographic Najaf or an empty governorate`, async () => {
    const x = endpoint(path, branch);
    for (const value of ['النجف', '', undefined]) assert.equal((await x.post(value)).status, 400);
    assert.deepEqual(x.writes, []);
  });
}

for (const path of ['sales-intake', 'offline']) test(`${path}: Najaf Outdoor cannot register Governorates`, async () => {
  const x = endpoint(path, 'Najaf');
  assert.equal((await x.post('البصرة')).status, 400);
  assert.deepEqual(x.writes, []);
});

function offline(t, branch) {
  const descriptors = new Map(['window', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); });
  let state = { actor: employee(branch), projects: [], openings: [], queue: [], syncedAt: null };
  globalThis.window = { location: { pathname: '/offline' }, dispatchEvent() {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  const store = { activeFieldUser: () => actorId, setFieldUser() {}, readStoredFieldState: async () => structuredClone(state), readFieldState: async () => structuredClone(state),
    updateFieldState: async (id, update) => { assert.equal(id, actorId); state = update(structuredClone(state)); return structuredClone(state); } };
  return { client: modules({ './store': store, './device': { isOfflineDevice: () => true } })('lib/offline/client'), get raw() { return structuredClone(state); } };
}

for (const branch of ['Karkh', 'Rasafa']) test(`${branch} offline client queues allowed Governorates entries and rejects Najaf before a durable change`, async t => {
  const x = offline(t, branch);
  for (const governorate of governorates) await x.client.saveFieldChange('register', crypto.randomUUID(), payload(governorate), actorId);
  assert.equal(x.raw.projects.length, 11);
  assert.deepEqual(x.raw.queue.map(change => change.payload.project.governorate), governorates);
  assert.ok(x.raw.projects.every(project => project.branch === 'Governorates' && project.created_by === actorId));
  const before = x.raw;
  await assert.rejects(x.client.saveFieldChange('register', crypto.randomUUID(), payload('النجف'), actorId), /Choose the project governorate/);
  assert.deepEqual(x.raw, before);
});

test('Najaf offline client rejects Governorates before any durable change', async t => {
  const x = offline(t, 'Najaf'), before = x.raw;
  await assert.rejects(x.client.saveFieldChange('register', crypto.randomUUID(), payload('البصرة'), actorId), /project from your branch/);
  assert.deepEqual(x.raw, before);
});
