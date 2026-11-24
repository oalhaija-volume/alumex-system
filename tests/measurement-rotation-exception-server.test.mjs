import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const at = '2026-11-24T09:00:00Z';
const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const mohammadId = '11111111-1111-4111-8111-111111111111';
const aliId = '22222222-2222-4222-8222-222222222222';
const ehabId = '33333333-3333-4333-8333-333333333333';
const indoorId = '44444444-4444-4444-8444-444444444444';
const operationId = '55555555-5555-4555-8555-555555555555';
const mohammad = { id: mohammadId, name: 'Mohammad fixture', role: 'Outdoor Sales', branch: 'Karkh',
  outdoorRotationStartBranch: 'Karkh', outdoorTeamMemberIds: [mohammadId, aliId] };
const ehab = { ...mohammad, id: ehabId, name: 'Ehab fixture', branch: 'Rasafa',
  outdoorRotationStartBranch: 'Rasafa', outdoorTeamMemberIds: [ehabId, aliId] };
const indoor = { id: indoorId, name: 'Indoor fixture', role: 'Indoor Sales', branch: 'Karkh' };
const base = { id: projectId, branch: 'Karkh', measurement_branch: 'Rasafa', governorate: null, governorate_office: null,
  project_number: 'PRJ-MEASUREMENT-AREA', project_name: 'Separate measurement territory', client_id: 'client',
  created_by: indoorId, registeredBy: 'Indoor fixture', follow_up_owner_id: indoorId,
  assigned_outdoor_sales_id: ehabId, measurement_assignment_id: operationId, measurement_exception_employee_id: ehabId, measurement_exception_assignment_id: operationId, measurement_exception_reason: 'Explicit employee-only rotation exception', structure_readiness: 'ready', sales_status: 'new_lead',
  created_at: at, updated_at: at, archived_at: null, address: 'A manually reviewed site address',
  additional_openings_state: null, additional_openings_original_ids: [], measurement_delayed: false, client_cancelled_at: null };

function modules(dependencies = {}) {
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [at])); } }
  const cache = new Map();
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {};
    cache.set(url.href, exports);
    const source = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'exports', 'Date', source)(name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.startsWith('@/')) return load(new URL(`../src/${name.slice(2)}.ts`, import.meta.url));
      if (name.startsWith('.')) return load(new URL(`${name}.ts`, url));
      throw new Error(`Unexpected dependency: ${name}`);
    }, exports, FixedDate);
    return exports;
  }
  return name => load(new URL(`../src/${name}.ts`, import.meta.url));
}

const load = modules();
const access=load('lib/auth/projectBranchAccess');

function fixture(actor, projectPatch = {}, options = {}) {
  const project = { ...base, ...projectPatch };
  const profiles = [actor, { ...mohammad, id: aliId }, indoor].map(employee => ({
    id: employee.id, full_name: employee.name, username: employee.name, role: employee.role, branch: employee.branch,
    outdoor_rotation_start_branch: employee.outdoorRotationStartBranch ?? null, is_active: true, status: 'Active',
  }));
  const tables = { projects: [project], profiles, clients: [{ id: 'client', mobile: 'fixture-phone', client_name: 'Fixture client' }],
    openings: [], field_sync_receipts: [], measurement_completion_reports: [], audit_events: [] };
  const reads = [], calls = [];
  const mutations = { inserts: 0, updates: 0, committed: 0 };
  const receipts = new Set();
  const admin = { from(table) {
    assert.ok(Object.hasOwn(tables, table), `Unexpected table: ${table}`);
    let columns = '*', start = 0, end = Infinity;
    const predicates = [];
    function result(single = false) {
      const selected = tables[table].filter(row => predicates.every(predicate => predicate(row))).slice(start, end + 1);
      reads.push({ table, columns });
      const rows = selected.map(row => columns === '*' ? { ...row }
        : Object.fromEntries(columns.split(',').map(column => [column.trim(), row[column.trim()]])));
      return { data: single ? rows[0] ?? null : rows, error: null };
    }
    return {
      insert() { mutations.inserts++; return Promise.resolve({error:null}); },
      update() { mutations.updates++; return {eq:async()=>({error:null})}; },
      select(value) { columns = value; return this; }, eq(key, value) { predicates.push(row => row[key] === value); return this; },
      is(key, value) { predicates.push(row => (row[key] ?? null) === value); return this; },
      in(key, values) { predicates.push(row => values.includes(row[key])); return this; },
      or(value) { const clauses = value.split(',').map(clause => clause.split('.eq.')); predicates.push(row => clauses.some(([key, expected]) => row[key] === expected)); return this; },
      order() { return this; }, range(first, last) { start = first; end = last; return this; }, limit(count) { end = count - 1; return this; },
      single: async () => result(true), maybeSingle: async () => result(true),
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
  }, async rpc(name, input) {
    calls.push({ name, input });
    options.beforeRpc?.(project);
    if(actor.role==='Outdoor Sales'&&!access.canAccessProjectRow(actor,project))return {data:null,error:{message:'Project is not available to this employee'}};
    if(!receipts.has(input.p_operation)){receipts.add(input.p_operation);mutations.committed++;}
    return {data:{...project},error:null};
  } };
  const load = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/auth/adminServer': { requireRole: async allowed => allowed.includes(actor.role)
      ? { ok: true, role: actor.role, user: { id: actor.id }, profile: { branch: actor.branch,
        outdoor_rotation_start_branch: actor.outdoorRotationStartBranch }, outdoorTeamMemberIds: actor.outdoorTeamMemberIds }
      : { ok: false, status: 403, error: 'Denied' } },
    '@/lib/supabase/admin': { createAdminClient: () => admin }, '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
  });
  const context = { params: Promise.resolve({ projectId }) };
  const request = body => new Request('http://localhost:3003/api/offline', body ? { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  return { load, reads, calls, project, mutations, tables,
    post: body=>load('app/api/initial-measurements/[projectId]/route').POST(request(body),context),
    patch: body=>load('app/api/initial-measurements/[projectId]/route').PATCH(request(body),context),
    offline: (action,payload)=>load('app/api/offline/route').POST(request({id:operationId,projectId,userId:actor.id,recordedAt:at,action,payload})),
    get: endpoint => load(`app/api/${endpoint}/route`).GET(request(), context),
    assign: (endpoint, body) => endpoint === 'workspace'
      ? load('app/api/workspace/route').PATCH(request({ projectId, ...body }))
      : load('app/api/offline/route').POST(request({ id: operationId, projectId, userId: actor.id, recordedAt: at,
        action: body.action, payload: { assignedOutdoorSalesId: aliId, ...Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'action')) } })),
  };
}

const requiredFields = ['measurement_assignment_id', 'measurement_exception_employee_id',
  'measurement_exception_assignment_id', 'measurement_exception_reason', 'structure_readiness', 'sales_status', 'archived_at'];
const opening = { id: '66666666-6666-4666-8666-666666666666', floor: 'GF', room: 'Other', otherRoom: 'Fixture room',
  width: 100, height: 120, quantity: 1, structuralType: 'Window', openingType: 'Sliding' };
const teammate = { ...ehab, id: aliId, name: 'Sajjad fixture', outdoorTeamMemberIds: [ehabId, aliId] };

for (const endpoint of ['workspace', 'offline', 'dashboard', 'initial-measurements/[projectId]', 'measurement-reports/[projectId]']) {
  test(`${endpoint} selects exact assignment proof and grants only its named Outdoor employee outside area`, async () => {
    const x = fixture(ehab), before = structuredClone(x.project), response = await x.get(endpoint);
    assert.equal(response.status, 200);
    const rows = endpoint.includes('[projectId]') ? [response.body.project ?? x.project] : response.body.projects;
    assert.deepEqual(rows.map(row => row.id), [projectId]);
    for (const read of x.reads.filter(row => row.table === 'projects')) {
      const selected = read.columns.split(',').map(column => column.trim());
      for (const field of requiredFields) assert.ok(selected.includes(field), `${endpoint}: missing ${field}`);
    }
    assert.deepEqual(x.project, before, 'Reading the exception cannot change physical area, office or ownership');
    const denied = fixture(teammate), hidden = await denied.get(endpoint);
    if (endpoint.includes('[projectId]')) {
      assert.equal(hidden.status, 404);
      assert.equal(denied.reads.some(read => ['openings', 'measurement_completion_reports'].includes(read.table)), false);
    } else assert.deepEqual(hidden.body.projects, []);
  });
}

test('the helper fails closed for stale bindings, locked stages, archives, malformed reasons and non-Baghdad actors', () => {
  assert.equal(access.hasMeasurementRotationException(base, ehab), true);
  for (const patch of [
    { measurement_assignment_id: null }, { measurement_assignment_id: 'another-task' },
    { measurement_exception_assignment_id: null }, { measurement_exception_employee_id: aliId },
    { assigned_outdoor_sales_id: aliId }, { sales_status: 'ready_for_quotation' },
    { sales_status: 'quotation_in_progress' }, { structure_readiness: 'not_ready' }, { archived_at: at },
    { measurement_exception_reason: '' }, { measurement_exception_reason: ' '.repeat(10) },
    { measurement_exception_reason: 'x'.repeat(1001) }, { branch: 'Najaf' }, { branch: 'Governorates' },
  ]) assert.equal(access.hasMeasurementRotationException({ ...base, ...patch }, ehab), false, JSON.stringify(patch));
  for (const actor of [{ ...ehab, branch: 'Najaf' }, { ...ehab, role: 'Indoor Sales' }, teammate]) {
    assert.equal(access.hasMeasurementRotationException(base, actor), false);
  }
  assert.equal(access.canAccessProjectRow(ehab, { ...base, measurement_exception_assignment_id: null }), false);
  assert.equal(access.canAccessProjectRow(teammate, base), false);
});

test('only an issued, still-bound pending finish retains its local view; it is not a new task', () => {
  const pending = { ...base, pending: true, sales_status: 'ready_for_quotation' };
  assert.equal(access.hasMeasurementRotationException(pending, ehab), true);
  assert.equal(access.canAccessProjectRow(ehab, pending), true);
  assert.deepEqual(load('lib/workflow/salesTasks').measurementTasks([pending], ehab), []);
  assert.equal(access.canAccessProjectRow(ehab, { ...pending, pending: false }), false);
  assert.equal(access.canAccessProjectRow(ehab, { ...pending, measurement_assignment_id: 'next-task' }), false);
});

test('normalizer preserves omitted legacy payload and trims only the authorized optional reason', () => {
  const { normalizeMeasurementAssignment } = load('lib/workflow/followUps');
  assert.deepEqual(normalizeMeasurementAssignment({ assignedOutdoorSalesId: ehabId }), { assignedOutdoorSalesId: ehabId });
  assert.deepEqual(normalizeMeasurementAssignment({ assignedOutdoorSalesId: ehabId, measurementExceptionReason: '  Named exception  ',
    branch: 'forged', measurement_exception_employee_id: aliId }), { assignedOutdoorSalesId: ehabId, measurementExceptionReason: 'Named exception' });
  assert.equal(normalizeMeasurementAssignment({ assignedOutdoorSalesId: ehabId, measurementExceptionReason: 'x'.repeat(1000) }).measurementExceptionReason.length, 1000);
  for (const reason of [undefined, null, '', '  ', 7, {}, 'x'.repeat(1001)]) {
    assert.throws(() => normalizeMeasurementAssignment({ assignedOutdoorSalesId: ehabId, measurementExceptionReason: reason }), /exception reason/);
  }
});

for (const endpoint of ['workspace', 'offline']) test(`${endpoint} permits reason only for Admin assigning a Baghdad task`, async () => {
  const input = { action: 'assign-measurements', assignedOutdoorSalesId: ehabId, measurementExceptionReason: '  Explicit exception  ',
    branch: 'forged', followUpOwnerId: ehabId };
  const admin = { ...indoor, role: 'Admin' }, x = fixture(admin), before = structuredClone(x.project);
  assert.equal((await x.assign(endpoint, input)).status, 200);
  assert.equal(x.calls[0].name, 'sync_field_change');
  assert.deepEqual(x.calls[0].input.p_payload, { assignedOutdoorSalesId: ehabId, measurementExceptionReason: 'Explicit exception' });
  assert.deepEqual(x.project, before);
  for (const role of ['Indoor Sales', 'Sales Manager', 'Sales Director', 'CEO', 'Company Owner', 'Outdoor Sales']) {
    const forbidden = fixture({ ...indoor, role });
    assert.equal((await forbidden.assign(endpoint, input)).status, 403, role);
    assert.equal(forbidden.calls.length, 0);
  }
  for (const action of ['ready', 'request-openings', 'follow-up', 'register']) {
    const forbidden = fixture(admin);
    assert.equal((await forbidden.assign(endpoint, { ...input, action })).status, 400, action);
    assert.equal(forbidden.calls.length, 0);
  }
  for (const branch of ['Governorates', 'Najaf']) {
    const forbidden = fixture(admin, { branch });
    assert.equal((await forbidden.assign(endpoint, input)).status, 400, branch);
    assert.equal(forbidden.calls.length, 0);
  }
});

test('exception opening saves use a stable UUID and verified actor through SQL, including an exact retry', async () => {
  const x = fixture(ehab);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await x.post({ ...opening, created_by: aliId, pending: true, measurement_exception_employee_id: aliId });
    assert.equal(response.status, 201); assert.deepEqual(response.body, { id: opening.id });
  }
  assert.equal(x.calls.length, 2); assert.equal(x.mutations.committed, 1); assert.equal(x.mutations.inserts, 0);
  for (const { name, input } of x.calls) {
    assert.equal(name, 'sync_field_change'); assert.equal(input.p_operation, opening.id); assert.equal(input.p_actor, ehabId);
    assert.equal(input.p_action, 'opening'); assert.equal(input.p_expected_updated_at, at);
    assert.equal(input.p_payload.id, opening.id);
    assert.equal(Object.hasOwn(input.p_payload, 'measurement_exception_employee_id'), false);
    assert.equal(Object.hasOwn(input.p_payload, 'created_by'), false);
  }
});

test('revocation between opening precheck and SQL save denies the write without a direct insert', async () => {
  const x = fixture(ehab, {}, { beforeRpc: row => { row.measurement_exception_assignment_id = null; } });
  assert.equal((await x.post(opening)).status, 409);
  assert.equal(x.calls.length, 1); assert.deepEqual(x.mutations, { inserts: 0, updates: 0, committed: 0 });
});

test('legacy finish uses SQL proof atomically and never directly updates a project under an exception', async () => {
  const x = fixture(ehab, {}, { beforeRpc: row => { row.measurement_exception_assignment_id = null; } });
  x.tables.openings.push({ id: opening.id, project_id: projectId, floor: 'GF', room: 'Fixture room', width: 100,
    height: 120, quantity: 1, opening_type: 'Window', opening_direction: 'Sliding', has_arch: false, has_roller_shutter: false });
  assert.equal((await x.patch({ action: 'finish' })).status, 409);
  assert.equal(x.calls[0].input.p_action, 'finish');
  assert.deepEqual(x.mutations, { inserts: 0, updates: 0, committed: 0 });
});

test('server-selected rows cannot gain a completed exception from a forged pending request body', async () => {
  const x = fixture(ehab, { sales_status: 'ready_for_quotation' });
  assert.equal((await x.post({ ...opening, pending: true })).status, 404);
  assert.equal(x.calls.length, 0); assert.equal(x.mutations.inserts, 0);
});

test('ordinary same-area opening saves retain the direct insert path and no new exception permission', async () => {
  const x = fixture(ehab, { measurement_branch: 'Karkh', measurement_exception_employee_id: null,
    measurement_exception_assignment_id: null, measurement_exception_reason: null });
  assert.equal((await x.post(opening)).status, 201);
  assert.equal(x.calls.length, 0); assert.equal(x.mutations.inserts, 1);
});
