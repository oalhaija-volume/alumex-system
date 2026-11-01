import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const indoor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Indoor entrant', role: 'Indoor Sales', branch: 'Karkh' };
const owner = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Original Outdoor owner', role: 'Outdoor Sales', is_active: true, status: 'Active' };
const collector = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Measurement collector', role: 'Outdoor Sales', is_active: true, status: 'Active' };
const projectId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const operationId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

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

function payload(project = {}) {
  return {
    client: { clientType: 'individual', clientName: 'Pre-system client', mobile: '07700000000' },
    project: {
      branch: 'Karkh', address: 'Baghdad', buildingType: 'villa_house',
      locationLatitude: 33.3, locationLongitude: 44.4, structureReadiness: 'ready',
      assignedOutdoorSalesId: indoor.id, legacyOutdoorSalesId: owner.id, ...project,
    },
  };
}

function endpoint(name, { role = indoor.role, employees = [owner, collector] } = {}) {
  const writes = [];
  const profiles = [{ ...indoor, role, is_active: true, status: 'Active' }, ...employees];
  const admin = {
    from(table) {
      const filters = [];
      const result = () => ({
        data: table === 'profiles' ? profiles.find(profile => filters.every(([key, value]) => profile[key] === value)) ?? null : null,
        error: null,
      });
      return {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        maybeSingle: async () => result(),
        single: async () => result(),
      };
    },
    async rpc(rpc, args) {
      writes.push({ rpc, args });
      if (name === 'offline' && args.p_payload.project.legacyOutdoorSalesId && !profiles.some(profile =>
        profile.id === args.p_payload.project.legacyOutdoorSalesId && profile.role === 'Outdoor Sales' && profile.is_active && profile.status === 'Active')) {
        return { data: null, error: { message: 'Choose an active Outdoor Sales employee as the original project owner.' } };
      }
      return { data: name === 'sales-intake' ? { projectId, projectNumber: 'PRJ-LEGACY' } : { id: projectId, legacy_outdoor_sales_id: owner.id }, error: null };
    },
  };
  const load = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, role, user: { id: indoor.id }, profile: { branch: 'Karkh' } }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
  });
  const route = load(`app/api/${name}/route`);
  return {
    writes,
    submit: input => route.POST({ json: async () => name === 'sales-intake' ? input : {
      id: operationId, userId: indoor.id, projectId, action: 'register',
      recordedAt: '2026-11-01T07:00:00Z', payload: input,
    } }),
  };
}

for (const name of ['sales-intake', 'offline']) {
  for (const role of ['Indoor Sales', 'Sales Manager', 'Admin']) {
    test(`${name}: ${role} credits the original Outdoor owner independently of the measurement collector`, async () => {
      const x = endpoint(name, { role });
      const measurementCollector = role === 'Admin' ? collector.id : indoor.id;
      const response = await x.submit(payload({ assignedOutdoorSalesId: measurementCollector }));
      assert.equal(response.status, name === 'sales-intake' ? 201 : 200);
      assert.equal(x.writes.length, 1);
      const { rpc, args } = x.writes[0];
      assert.equal(rpc, name === 'sales-intake' ? 'register_sales_project' : 'sync_field_change');
      assert.equal(args.p_actor, indoor.id, 'Registration must run as the authenticated entrant');
      assert.equal(args.p_payload.project.legacyOutdoorSalesId, owner.id);
      assert.equal(args.p_payload.project.assignedOutdoorSalesId, measurementCollector);
      if (name === 'offline') assert.equal(args.p_operation, operationId);
    });
  }

  for (const scenario of ['malformed', 'missing', 'inactive', 'non-outdoor']) {
    test(`${name}: rejects ${scenario} original ownership without creating a project`, async () => {
      const employees = scenario === 'missing' ? [] : [{
        ...owner,
        ...(scenario === 'inactive' ? { is_active: false, status: 'Inactive' } : {}),
        ...(scenario === 'non-outdoor' ? { role: 'Indoor Sales' } : {}),
      }];
      const x = endpoint(name, { employees });
      const response = await x.submit(payload({ legacyOutdoorSalesId: scenario === 'malformed' ? 'a'.repeat(36) : owner.id }));
      assert.equal(response.status, name === 'offline' && scenario !== 'malformed' ? 409 : 400);
      assert.match(response.body.error, /Outdoor Sales|original project owner/);
      assert.equal(x.writes.length, name === 'offline' && scenario !== 'malformed' ? 1 : 0);
    });
  }

  for (const role of ['Outdoor Sales', 'Sales Director', 'CEO', 'Company Owner']) {
    test(`${name}: ${role} cannot forge pre-system ownership`, async () => {
      const x = endpoint(name, { role });
      const response = await x.submit(payload({ assignedOutdoorSalesId: collector.id }));
      assert.equal(response.status, 400);
      assert.match(response.body.error, /Only Indoor Sales/);
      assert.deepEqual(x.writes, []);
    });
  }

  test(`${name}: ordinary registrations omit legacy credit and ignore forged creator/owner fields`, async () => {
    for (const value of [undefined, null, '  ']) {
      const x = endpoint(name);
      const input = payload({ legacyOutdoorSalesId: value, owner_id: owner.id, created_by: owner.id });
      input.created_by = owner.id;
      input.owner_id = owner.id;
      const response = await x.submit(input);
      assert.equal(response.status, name === 'sales-intake' ? 201 : 200);
      const { p_payload: saved, p_actor: actor } = x.writes[0].args;
      assert.equal(actor, indoor.id);
      for (const key of ['legacyOutdoorSalesId', 'created_by', 'owner_id']) assert.equal(Object.hasOwn(saved.project, key), false);
      assert.equal(Object.hasOwn(saved, 'created_by'), false);
      assert.equal(Object.hasOwn(saved, 'owner_id'), false);
    }
  });
}

function device({ actor = indoor, outdoorSales = [owner, collector] } = {}) {
  let state = { actor, outdoorSales, indoorSales: [indoor], projects: [], openings: [], queue: [], syncedAt: null };
  let active = actor.id;
  globalThis.window = { location: { pathname: '/offline' }, dispatchEvent() {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  const store = {
    activeFieldUser: () => active,
    setFieldUser: id => { active = id; },
    readStoredFieldState: async () => structuredClone(state),
    readFieldState: async () => structuredClone(state),
    updateFieldState: async (id, change) => {
      assert.equal(id, actor.id);
      state = change(structuredClone(state));
      return structuredClone(state);
    },
  };
  const client = modules({ './store': store, './device': { isOfflineDevice: () => true } })('lib/offline/client');
  return { client, get state() { return state; } };
}

test('offline ownership preserves the Indoor entrant and follow-up owner through a measurement handoff', async () => {
  const x = device();
  await x.client.saveFieldChange('register', projectId, payload(), indoor.id);
  let saved = x.state.projects[0];
  assert.equal(saved.created_by, indoor.id);
  assert.equal(saved.registeredBy, indoor.name);
  assert.equal(saved.original_creator_role, indoor.role);
  assert.equal(saved.follow_up_owner_id, indoor.id);
  assert.equal(saved.legacy_outdoor_sales_id, owner.id);
  assert.equal(saved.owner_id, owner.id);
  assert.equal(saved.sales_engineer_id, owner.id);
  assert.equal(saved.legacyOutdoorSalesOwner, owner.name);
  assert.equal(saved.assigned_outdoor_sales_id, indoor.id);
  assert.equal(x.state.queue[0].userId, indoor.id);
  assert.equal(x.state.queue[0].payload.project.legacyOutdoorSalesId, owner.id);
  await x.client.saveFieldChange('assign-measurements', projectId, { assignedOutdoorSalesId: collector.id }, indoor.id);
  saved = x.state.projects[0];
  assert.equal(saved.assigned_outdoor_sales_id, collector.id);
  assert.equal(saved.legacy_outdoor_sales_id, owner.id);
  assert.equal(saved.owner_id, owner.id);
  assert.equal(saved.sales_engineer_id, owner.id);
  assert.equal(saved.legacyOutdoorSalesOwner, owner.name);
  assert.equal(saved.created_by, indoor.id);
  assert.equal(saved.follow_up_owner_id, indoor.id);
});

test('an unavailable original owner cannot enter the offline queue or project cache', async () => {
  for (const id of [indoor.id, 'not-a-uuid', 'ffffffff-ffff-4fff-8fff-ffffffffffff']) {
    const x = device();
    await assert.rejects(x.client.saveFieldChange('register', projectId, payload({ legacyOutdoorSalesId: id }), indoor.id), /Outdoor Sales/);
    assert.deepEqual(x.state.projects, []);
    assert.deepEqual(x.state.queue, []);
  }
});

test('ordinary offline registration leaves pre-system attribution unset', async () => {
  const x = device();
  const input = payload();
  delete input.project.legacyOutdoorSalesId;
  await x.client.saveFieldChange('register', projectId, input, indoor.id);
  assert.equal(x.state.projects[0].legacy_outdoor_sales_id ?? null, null);
  assert.equal(x.state.projects[0].legacyOutdoorSalesOwner ?? null, null);
  assert.equal(Object.hasOwn(x.state.queue[0].payload.project, 'legacyOutdoorSalesId'), false);
  assert.equal(x.state.projects[0].created_by, indoor.id);
});

test('the credited Outdoor owner can retain a reference record without gaining measurement tasks or writes', async () => {
  const x = device({ actor: owner });
  const project = {
    id: projectId, created_by: indoor.id, assigned_outdoor_sales_id: collector.id,
    legacy_outdoor_sales_id: owner.id, project_log_only: true,
    structure_readiness: 'ready', sales_status: 'new_lead',
  };
  x.state.projects.push(project);
  const load = modules();
  const history = load('lib/measurements/visitHistory');
  assert.equal(history.isHistoricalProject(project, owner), true);
  assert.deepEqual(load('lib/workflow/salesTasks').measurementTasks([project], owner), []);
  const opening = { id: operationId, projectId, floor: 'Ground', room: 'Kitchen', width: 120, height: 150, structuralType: 'Window', openingType: 'Sliding' };
  const visible = load('lib/offline/projectAccess').visibleFieldState({ ...x.state, openings: [opening], measurementReports: [{ id: operationId, project_id: projectId }] });
  assert.deepEqual(visible.projects, [project]);
  assert.deepEqual(visible.openings, []);
  assert.deepEqual(visible.measurementReports, []);
  for (const action of ['opening', 'finish', 'reopen']) {
    await assert.rejects(x.client.saveFieldChange(action, projectId, action === 'opening' ? opening : {}, owner.id), /reference only/);
  }
  assert.deepEqual(x.state.queue, []);
});

test('offline ownership survives a lost response and synchronizes using the original operation ID', async () => {
  const x = device();
  await x.client.saveFieldChange('register', projectId, payload(), indoor.id);
  const operation = x.state.queue[0].id;
  const writes = [];
  let lostResponse = true;
  navigator.onLine = true;
  globalThis.fetch = async (url, init) => {
    if (!init?.method) return Response.json({ actor: indoor });
    const change = JSON.parse(init.body);
    writes.push(change);
    if (lostResponse) { lostResponse = false; throw new Error('Response lost after commit'); }
    return Response.json({ project: {
      id: projectId, project_number: 'PRJ-LEGACY', updated_at: '2026-11-01T08:00:00Z',
      legacy_outdoor_sales_id: owner.id, legacyOutdoorSalesOwner: owner.name,
      assigned_outdoor_sales_id: indoor.id,
    } });
  };
  await x.client.syncFieldChanges();
  assert.equal(x.state.queue[0].id, operation);
  assert.equal(x.state.projects[0].legacy_outdoor_sales_id, owner.id);
  await x.client.syncFieldChanges();
  assert.deepEqual(writes.map(change => change.id), [operation, operation]);
  assert.equal(writes.every(change => change.userId === indoor.id && change.payload.project.legacyOutdoorSalesId === owner.id), true);
  assert.deepEqual(x.state.queue, []);
  assert.equal(x.state.projects[0].pending, false);
  assert.equal(x.state.projects[0].legacy_outdoor_sales_id, owner.id);
  assert.equal(x.state.projects[0].legacyOutdoorSalesOwner, owner.name);
  assert.equal(x.state.projects[0].created_by, indoor.id);
  assert.equal(x.state.projects[0].registeredBy, indoor.name);
});
