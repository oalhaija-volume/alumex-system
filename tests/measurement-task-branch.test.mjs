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
  assigned_outdoor_sales_id: aliId, structure_readiness: 'ready', sales_status: 'new_lead',
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
const access = load('lib/auth/projectBranchAccess');
const { measurementTasks } = load('lib/workflow/salesTasks');

test('physical Rasafa task reaches Mohammad/Ali while Ehab is in Karkh and Indoor keeps its registering office', () => {
  const before = structuredClone(base);
  assert.equal(access.effectiveProjectBranch(base), 'Karkh');
  assert.equal(access.effectiveMeasurementBranch(base), 'Rasafa');
  assert.equal(access.canAccessProjectRow(mohammad, base), true);
  assert.equal(access.canAccessProjectRow(ehab, base), false);
  assert.deepEqual(measurementTasks([base], mohammad).map(project => project.id), [projectId]);
  assert.deepEqual(measurementTasks([base], ehab), []);
  assert.equal(access.canAccessProjectRow(indoor, base), true);
  assert.equal(access.canAccessProjectRow({ ...indoor, branch: 'Rasafa' }, base), false);
  assert.deepEqual(base, before, 'Origin office, follow-up ownership and stored assignment must remain unchanged');
});

test('the opposite physical override works without altering static office capability', () => {
  const row = { ...base, branch: 'Rasafa', measurement_branch: 'Karkh' };
  assert.equal(access.canAccessProjectRow(ehab, row), true);
  assert.equal(access.canAccessProjectRow(mohammad, row), false);
  assert.deepEqual(measurementTasks([row], ehab).map(project => project.id), [projectId]);
  assert.deepEqual(access.projectBranchesForActor(mohammad), ['Karkh', 'Rasafa', 'Governorates']);
  assert.equal(access.canAccessProjectBranch(mohammad, 'Karkh'), true);
});

test('a physical area follows the Baghdad calendar at the 16th and month reset independently of origin', () => {
  for (const [instant, visible] of [
    ['2026-11-15T20:59:59.999Z', false], ['2026-11-15T21:00:00.000Z', true],
    ['2026-11-30T20:59:59.999Z', true], ['2026-11-30T21:00:00.000Z', false],
  ]) {
    const date = new Date(instant);
    assert.equal(access.canAccessProjectRow(mohammad, base, date), visible);
    assert.equal(measurementTasks([base], mohammad, date).length, visible ? 1 : 0);
    assert.equal(access.canAccessProjectRow(indoor, base, date), true);
  }
});

test('omitted, null and malformed overrides preserve origin; address text never selects a territory', () => {
  for (const measurement_branch of [undefined, null, '', 'najaf', 'Governorates', 7]) {
    const row = { ...base, measurement_branch, address: 'الرصافة' };
    assert.equal(access.effectiveMeasurementBranch(row), 'Karkh');
    assert.equal(access.canAccessProjectRow(ehab, row), true);
    assert.equal(access.canAccessProjectRow(mohammad, row), false);
  }
});

test('a forged override cannot move Governorates or Najaf across their existing privacy boundary', () => {
  for (const measurement_branch of ['Karkh', 'Rasafa']) {
    for (const row of [
      { ...base, branch: 'Najaf', measurement_branch },
      { ...base, branch: 'Governorates', governorate: 'النجف', measurement_branch },
    ]) {
      assert.equal(access.effectiveMeasurementBranch(row), 'Najaf');
      assert.equal(access.canAccessProjectRow(mohammad, row), false);
      assert.equal(access.canAccessProjectRow({ ...mohammad, branch: 'Najaf' }, row), true);
    }
    const province = { ...base, branch: 'Governorates', governorate: 'البصرة', measurement_branch };
    assert.equal(access.effectiveMeasurementBranch(province), 'Governorates');
    assert.equal(access.canAccessProjectRow(mohammad, province), true);
  }
});

test('manual area normalization is optional, literal and preserves the old payload when omitted', () => {
  const { normalizeMeasurementAssignment } = load('lib/workflow/followUps');
  assert.deepEqual(normalizeMeasurementAssignment({ assignedOutdoorSalesId: aliId }), { assignedOutdoorSalesId: aliId });
  for (const measurementBranch of ['Karkh', 'Rasafa']) {
    assert.deepEqual(normalizeMeasurementAssignment({ assignedOutdoorSalesId: aliId, measurementBranch,
      branch: 'forged', followUpOwnerId: ehabId }), { assignedOutdoorSalesId: aliId, measurementBranch });
  }
  for (const measurementBranch of [undefined, null, '', 'rasafa', 'Najaf', 'Governorates', 7, {}]) {
    assert.throws(() => normalizeMeasurementAssignment({ assignedOutdoorSalesId: aliId, measurementBranch }), /Choose Karkh or Rasafa/);
  }
});

function fixture(actor, projectPatch = {}) {
  const project = { ...base, ...projectPatch };
  const profiles = [actor, { ...mohammad, id: aliId }, indoor].map(employee => ({
    id: employee.id, full_name: employee.name, username: employee.name, role: employee.role, branch: employee.branch,
    outdoor_rotation_start_branch: employee.outdoorRotationStartBranch ?? null, is_active: true, status: 'Active',
  }));
  const tables = { projects: [project], profiles, clients: [{ id: 'client', mobile: 'fixture-phone', client_name: 'Fixture client' }],
    openings: [], field_sync_receipts: [], measurement_completion_reports: [], audit_events: [] };
  const reads = [], calls = [];
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
      select(value) { columns = value; return this; }, eq(key, value) { predicates.push(row => row[key] === value); return this; },
      is(key, value) { predicates.push(row => (row[key] ?? null) === value); return this; },
      in(key, values) { predicates.push(row => values.includes(row[key])); return this; },
      or(value) { const clauses = value.split(',').map(clause => clause.split('.eq.')); predicates.push(row => clauses.some(([key, expected]) => row[key] === expected)); return this; },
      order() { return this; }, range(first, last) { start = first; end = last; return this; }, limit(count) { end = count - 1; return this; },
      single: async () => result(true), maybeSingle: async () => result(true),
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
  }, async rpc(name, input) { calls.push({ name, input }); return { data: project, error: null }; } };
  const load = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/auth/adminServer': { requireRole: async allowed => allowed.includes(actor.role)
      ? { ok: true, role: actor.role, user: { id: actor.id }, profile: { branch: actor.branch,
        outdoor_rotation_start_branch: actor.outdoorRotationStartBranch }, outdoorTeamMemberIds: actor.outdoorTeamMemberIds }
      : { ok: false, status: 403, error: 'Denied' } },
    '@/lib/supabase/admin': { createAdminClient: () => admin }, '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
  });
  const context = { params: Promise.resolve({ projectId }) };
  const request = (body, query = '') => new Request(`http://localhost:3003/api/offline${query}`, body ? { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  return { load, reads, calls, project,
    get: (endpoint, query = '') => load(`app/api/${endpoint}/route`).GET(request(undefined, query), context),
    assign: (endpoint, body) => endpoint === 'workspace'
      ? load('app/api/workspace/route').PATCH(request({ projectId, ...body }))
      : load('app/api/offline/route').POST(request({ id: operationId, projectId, userId: actor.id, recordedAt: at,
        action: body.action, payload: { assignedOutdoorSalesId: aliId, ...Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'action')) } })),
  };
}

for (const endpoint of ['workspace', 'offline', 'dashboard']) test(`${endpoint} selects physical area before returning current Outdoor tasks`, async () => {
  const x = fixture(mohammad), response = await x.get(endpoint);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.projects.map(project => project.id), [projectId]);
  assert.equal(response.body.projects[0].branch, 'Karkh');
  assert.equal(response.body.projects[0].measurement_branch, 'Rasafa');
  if (endpoint !== 'dashboard') assert.equal(response.body.outdoorSales.find(employee => employee.id === aliId).outdoorRotationStartBranch, 'Karkh');
  assert.ok(x.reads.filter(read => read.table === 'projects').every(read => read.columns.split(',').includes('measurement_branch')));
  const denied = await fixture(ehab).get(endpoint);
  assert.deepEqual(denied.body.projects, []);
  const origin = fixture(indoor);
  const originOffice = await origin.get(endpoint, endpoint === 'offline' ? '?recovery=1' : '');
  assert.deepEqual(originOffice.body.projects.map(project => project.id), [projectId]);
  if (endpoint === 'offline') {
    const blocked = await origin.get(endpoint);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'INDOOR_ONLINE_REQUIRED');
  }
});

for (const endpoint of ['initial-measurements/[projectId]', 'measurement-reports/[projectId]']) test(`${endpoint} verifies physical area through its real direct-access selector`, async () => {
  const x = fixture(mohammad), response = await x.get(endpoint);
  assert.equal(response.status, 200);
  assert.ok(x.reads.find(read => read.table === 'projects').columns.includes('measurement_branch'));
  const hidden = fixture(ehab), denied = await hidden.get(endpoint);
  assert.equal(denied.status, 404);
  assert.equal(hidden.reads.some(read => ['openings', 'measurement_completion_reports'].includes(read.table)), false);
});

for (const endpoint of ['workspace', 'offline']) test(`${endpoint} manual area assignment forwards only the reviewed area and employee`, async () => {
  const x = fixture(indoor), response = await x.assign(endpoint, { action: 'assign-measurements', assignedOutdoorSalesId: aliId,
    measurementBranch: 'Rasafa', branch: 'Rasafa', followUpOwnerId: ehabId });
  assert.equal(response.status, 200);
  assert.deepEqual(x.calls[0].input.p_payload, { assignedOutdoorSalesId: aliId, measurementBranch: 'Rasafa' });
  assert.equal(x.project.branch, 'Karkh');
  assert.equal(x.project.follow_up_owner_id, indoorId);
  for (const action of ['ready', 'request-openings', 'follow-up']) {
    const denied = fixture(indoor), result = await denied.assign(endpoint, { action, assignedOutdoorSalesId: aliId, measurementBranch: 'Rasafa' });
    assert.equal(result.status, 400);
    assert.equal(denied.calls.length, 0);
  }
  for (const branch of ['Governorates', 'Najaf']) {
    const denied = fixture({ ...indoor, role: 'Admin' }, { branch, governorate: branch === 'Governorates' ? 'البصرة' : null });
    assert.equal((await denied.assign(endpoint, { action: 'assign-measurements', assignedOutdoorSalesId: aliId, measurementBranch: 'Rasafa' })).status, 400);
    assert.equal(denied.calls.length, 0);
  }
  const outdoor = fixture(mohammad);
  assert.equal((await outdoor.assign(endpoint, { action: 'assign-measurements', assignedOutdoorSalesId: aliId, measurementBranch: 'Rasafa' })).status, 403);
  assert.equal(outdoor.calls.length, 0);
});
