import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const operationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const employee = (role = 'Indoor Sales', branch = 'Karkh') => ({ id: actorId, name: 'Karkh Indoor', role, branch });

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

const load = modules();
const geography = load('lib/intake/projectBranch');
const access = load('lib/auth/projectBranchAccess');
const project = { id: projectId, branch: 'Governorates', governorate: 'النجف', created_by: actorId, assigned_outdoor_sales_id: actorId };

test('only Karkh Indoor Sales receives Najaf after Karbala in the governorate choices', () => {
  const baseline = geography.projectGovernorates;
  assert.equal(baseline.length, 11);
  assert.ok(!baseline.includes('النجف'));
  assert.deepEqual(geography.projectGovernoratesForActor(employee()), [
    ...baseline.slice(0, 6), 'النجف', ...baseline.slice(6),
  ]);
  for (const actor of [undefined, employee('Indoor Sales', 'Rasafa'), employee('Indoor Sales', 'Najaf'), employee('Indoor Sales', null),
    employee('Outdoor Sales'), employee('Outdoor Sales', 'Rasafa'), employee('Outdoor Sales', 'Najaf'), employee('Sales Manager'), employee('Admin')]) {
    assert.deepEqual(geography.projectGovernoratesForActor(actor), baseline);
    assert.throws(() => geography.normalizeProjectGovernorate('Governorates', 'النجف', actor), /Choose the project governorate/);
  }
});

test('Karkh Indoor governorate validation accepts canonical Najaf and retains existing validation', () => {
  for (const governorate of [...geography.projectGovernorates, 'النجف']) {
    assert.equal(geography.normalizeProjectGovernorate('Governorates', governorate, employee()), governorate);
  }
  for (const invalid of ['', undefined, null, 'نجف', 'Najaf', ' النجف ', 'Other']) {
    assert.throws(() => geography.normalizeProjectGovernorate('Governorates', invalid, employee()), /Choose the project governorate/);
  }
  assert.equal(geography.normalizeProjectGovernorate('Karkh', 'النجف', employee()), null);
  assert.equal(geography.normalizeProjectGovernorate('Najaf', 'النجف'), null);
});

test('new Najaf governorate projects stay with Karkh while legacy and dedicated Najaf remain isolated', () => {
  const marked = { ...project, governorate_office: 'Karkh' };
  assert.equal(access.effectiveProjectBranch(marked), 'Governorates');
  assert.equal(access.canAccessProjectRow(employee(), marked), true);
  assert.equal(access.canOwnProjectFollowUp(employee(), access.effectiveProjectBranch(marked)), true);
  for (const branch of ['Rasafa', 'Najaf']) assert.equal(access.canAccessProjectRow(employee('Indoor Sales', branch), marked), false);
  for (const governorate of ['النجف', 'نجف', 'Najaf', '  nAjAf  ']) {
    const legacy = { ...project, governorate };
    assert.equal(access.effectiveProjectBranch(legacy), 'Najaf');
    assert.equal(access.canAccessProjectRow(employee(), legacy), false, 'Creator identity cannot reveal old Najaf work');
    assert.equal(access.canAccessProjectRow(employee('Indoor Sales', 'Najaf'), legacy), true);
  }
  const dedicated = { ...marked, branch: 'Najaf', governorate: null };
  assert.equal(access.effectiveProjectBranch(dedicated), 'Najaf');
  assert.equal(access.canAccessProjectRow(employee(), dedicated), false);
  assert.equal(access.canAccessProjectRow(employee('Indoor Sales', 'Najaf'), dedicated), true);
});

function registration(governorate = 'النجف', extraProject = {}) {
  return {
    client: { clientName: 'Najaf governorate client', mobile: '07000000000', clientType: 'individual' },
    project: { branch: 'Governorates', governorate, assignedOutdoorSalesId: actorId, buildingType: 'villa_house',
      address: 'Najaf project address', locationLatitude: 32, locationLongitude: 44.3, structureReadiness: 'ready', ...extraProject },
  };
}

function endpoint(path, actor = employee(), existing = null, savedReceipt = false) {
  const writes = [], reads = [];
  const route = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, role: actor.role, profile: { branch: actor.branch }, user: { id: actor.id } }) },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
    '@/lib/supabase/admin': { createAdminClient: () => ({
      from(table) {
        assert.ok(['projects', 'field_sync_receipts'].includes(table), `Unexpected table ${table}`);
        reads.push(table);
        return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({
          data: table === 'projects' ? existing : savedReceipt ? { operation_id: operationId } : null, error: null,
        }) };
      },
      rpc: async (name, input) => { writes.push({ name, input }); return { data: { projectId, ...project, governorate_office: 'Karkh' }, error: null }; },
    }) },
  })(`app/api/${path}/route`);
  return {
    writes, reads,
    async post(input = registration(), action = 'register') {
      const body = path === 'offline' ? {
        id: operationId, projectId, userId: actor.id, action, recordedAt: '2026-11-18T08:00:00Z',
        expectedUpdatedAt: '2026-11-17T08:00:00Z', payload: input,
      } : input;
      return route.POST({ json: async () => body });
    },
  };
}

for (const path of ['sales-intake', 'offline']) {
  test(`${path}: Karkh Indoor registers Najaf with self measurements and ignores a supplied office marker`, async () => {
    const x = endpoint(path);
    const response = await x.post(registration('النجف', { governorate_office: 'Najaf' }));
    assert.equal(response.status, path === 'sales-intake' ? 201 : 200);
    assert.equal(x.writes.length, 1);
    const { name, input } = x.writes[0];
    assert.equal(name, path === 'sales-intake' ? 'register_sales_project' : 'sync_field_change');
    assert.equal(input.p_actor, actorId);
    assert.equal(input.p_payload.project.branch, 'Governorates');
    assert.equal(input.p_payload.project.governorate, 'النجف');
    assert.equal(input.p_payload.project.assignedOutdoorSalesId, actorId);
    assert.ok(!Object.hasOwn(input.p_payload.project, 'governorate_office'), 'SQL derives the office from the authenticated creator');
    assert.ok(!x.reads.includes('field_sync_receipts'), 'Fresh Karkh registration does not need an old receipt');
  });

  test(`${path}: other offices and roles cannot create Najaf governorate projects using a forged marker`, async () => {
    for (const actor of [employee('Outdoor Sales'), employee('Outdoor Sales', 'Rasafa'), employee('Indoor Sales', 'Rasafa'),
      employee('Indoor Sales', 'Najaf'), employee('Sales Manager'), employee('Admin')]) {
      const x = endpoint(path, actor);
      assert.equal((await x.post(registration('النجف', { governorate_office: 'Karkh' }))).status, 400, `${actor.role}/${actor.branch}`);
      assert.deepEqual(x.writes, []);
    }
  });

  test(`${path}: Karkh Indoor cannot use missing or alias Najaf values`, async () => {
    const x = endpoint(path);
    for (const value of ['', null, 'نجف', 'Najaf', ' النجف ']) assert.equal((await x.post(registration(value))).status, 400);
    assert.deepEqual(x.writes, []);
  });
}

test('offline POST cannot replay old Najaf registration or edit legacy Najaf as its Karkh creator', async () => {
  const x = endpoint('offline', employee(), project, true);
  assert.equal((await x.post(registration('النجف', { governorate_office: 'Karkh' }))).status, 404);
  assert.equal((await x.post({ projectName: 'Forbidden rename', governorate_office: 'Karkh' }, 'rename-project')).status, 404);
  assert.deepEqual(x.writes, []);
});

test('offline POST keeps new Karkh Najaf accessible for a later project rename', async () => {
  const x = endpoint('offline', employee(), { ...project, governorate_office: 'Karkh' });
  const response = await x.post({ projectName: 'Najaf quotation project' }, 'rename-project');
  assert.equal(response.status, 200);
  assert.deepEqual(x.writes[0].input.p_payload, { projectName: 'Najaf quotation project' });
});

function offline(context, actor = employee(), projects = []) {
  const descriptors = new Map(['window', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  context.after(() => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  let state = { actor, projects: structuredClone(projects), indoorSales: [actor], outdoorSales: [], openings: [], queue: [], syncedAt: null };
  globalThis.window = { location: { pathname: '/offline' }, dispatchEvent() {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  const store = {
    activeFieldUser: () => actor.id, setFieldUser() {},
    readStoredFieldState: async () => structuredClone(state), readFieldState: async () => structuredClone(state),
    updateFieldState: async (id, update) => { assert.equal(id, actor.id); state = update(structuredClone(state)); return structuredClone(state); },
  };
  return { client: modules({ './store': store, './device': { isOfflineDevice: () => true } })('lib/offline/client'), get state() { return structuredClone(state); } };
}

test('Karkh Indoor Najaf registration and edits require online access', async context => {
  const x = offline(context);
  const before=x.state;
  await assert.rejects(x.client.saveFieldChange('register', projectId, registration('النجف', { governorate_office: 'Najaf' }), actorId),/Indoor Sales.*internet/i);
  await assert.rejects(x.client.saveFieldChange('rename-project', projectId, { projectName: 'New Najaf showroom project' }, actorId),/Indoor Sales.*internet/i);
  await assert.rejects(x.client.saveFieldChange('follow-up', projectId, {
    nextFollowUp: '2026-11-20T08:00:00Z', followUpType: 'call', note: 'Karkh follows up', followUpOwnerId: actorId,
  }, actorId),/Indoor Sales.*internet/i);
  assert.deepEqual(x.state,before);
});

test('offline Outdoor cannot forge the Karkh Najaf office marker during registration', async context => {
  const x = offline(context, employee('Outdoor Sales'));
  const before = x.state;
  await assert.rejects(x.client.saveFieldChange('register', projectId, registration('النجف', { governorate_office: 'Karkh' }), actorId), /Choose the project governorate/);
  assert.deepEqual(x.state, before, 'A denied registration must not alter durable projects or queue');
});

test('offline Karkh creator cannot mark legacy Najaf through a queued edit', async context => {
  const x = offline(context, employee(), [project]);
  const before = x.state;
  await assert.rejects(x.client.saveFieldChange('rename-project', projectId, { projectName: 'Denied', governorate_office: 'Karkh' }, actorId), /Indoor Sales.*internet/i);
  assert.deepEqual(x.state, before);
});
