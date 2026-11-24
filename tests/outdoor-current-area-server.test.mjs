import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const teammateId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const operationId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const compiled = new Map();
const periods = [
  ['2026-11-15T20:59:59.999Z', 'Rasafa'],
  ['2026-11-15T21:00:00.000Z', 'Karkh'],
  ['2026-11-30T21:00:00.000Z', 'Rasafa'],
];

function fixture(at, options = {}) {
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [at])); }
    static now() { return Date.parse(at); }
  }
  const actor = { id: actorId, full_name: 'Outdoor fixture', username: 'fixture', role: options.role ?? 'Outdoor Sales',
    branch: 'Rasafa', outdoor_rotation_start_branch: 'Rasafa', is_active: true, status: 'Active' };
  function project(index, branch, extra = {}) {
    return { id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`, project_number: `PRJ-FIXTURE-${index}`,
      project_name: `${branch} fixture`, branch, governorate: null, governorate_office: null,
      created_by: actorId, assigned_outdoor_sales_id: actorId, legacy_outdoor_sales_id: actorId,
      original_creator_role: 'Outdoor Sales', client_id: `client-${index}`, structure_readiness: 'ready',
      sales_status: 'new_lead', status: 'Draft', created_at: at, updated_at: at, measurement_delayed: false,
      additional_openings_state: null, archived_at: null, address: 'Fixture address', ...extra };
  }
  const projects = [project(1, 'Karkh'), project(2, 'Rasafa'), project(3, 'Governorates', { governorate: 'البصرة' }),
    project(4, 'Rasafa', { created_by: otherId, assigned_outdoor_sales_id: otherId }),
    project(5, 'Karkh', { created_by: otherId, assigned_outdoor_sales_id: otherId, legacy_outdoor_sales_id: null }),
    project(6, 'Rasafa', { created_by: otherId, assigned_outdoor_sales_id: otherId, legacy_outdoor_sales_id: null }),
    project(7, 'Najaf')];
  const tables = {
    projects, profiles: [actor, { ...actor, id: teammateId, full_name: 'Teammate' },
      { ...actor, id: otherId, full_name: 'Other fixture', role: 'Indoor Sales', branch: 'Karkh' }],
    clients: projects.map(project => ({ id: project.client_id, mobile: '07000000000', client_name: 'Fixture client' })),
    openings: projects.map((project, index) => ({ id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`,
      project_id: project.id, created_by: actorId, width: 100, height: 100, quantity: 1, floor: 'GF', room: 'Office',
      opening_type: 'Window', opening_direction: 'Sliding', has_arch: false, has_roller_shutter: false,
      curtain_wall_capture: { note: 'Fixture facade' }, skylight_capture: { note: 'Fixture skylight' } })),
    field_sync_receipts: projects.slice(4, 6).map((project, index) => ({ operation_id: `history-${index}`, project_id: project.id,
      actor_id: actorId, action: 'finish', recorded_at: at, result: {} })),
    measurement_completion_reports: [],
  };
  const reads = [], writes = [], rpcCalls = [];
  const admin = { from(table) {
    assert.ok(table in tables, `Unexpected table ${table}`);
    const filters = []; let columns = '*', offset = 0, last = Infinity;
    function result() {
      const rows = tables[table].filter(row => filters.every(accept => accept(row))).slice(offset, last + 1);
      reads.push({ table, ids: rows.map(row => row.id), projectIds: rows.map(row => row.project_id) });
      return { error: null, data: rows.map(row => columns === '*' ? { ...row }
        : Object.fromEntries(columns.split(',').map(column => [column.trim(), row[column.trim()]]))) };
    }
    return { select(value) { columns = value; return this; },
      eq(key, value) { filters.push(row => row[key] === value); return this; },
      is(key, value) { filters.push(row => (row[key] ?? null) === value); return this; },
      in(key, values) { filters.push(row => values.includes(row[key])); return this; },
      or(expression) { if (table === 'projects') { const options = expression.split(',').map(clause => clause.split('.eq.')); filters.push(row => options.some(([key, value]) => row[key] === value)); } return this; },
      order() { return this; }, range(start, end) { offset = start; last = end; return this; }, limit(count) { last = count - 1; return this; },
      async single() { const value = result(); return { ...value, data: value.data[0] ?? null }; },
      async maybeSingle() { const value = result(); return { ...value, data: value.data[0] ?? null }; },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
  }, async rpc(name, args) {
    rpcCalls.push({ name, args: structuredClone(args) });
    if (name === 'acknowledge_hidden_field_receipt') {
      if (options.ackThrows) throw new Error('Private receipt backend failure');
      return { data: typeof options.acknowledged === 'function' ? options.acknowledged(args) : options.acknowledged ?? false, error: options.ackError ?? null };
    }
    writes.push({ name, args }); return { data: { id: args.p_project }, error: null };
  } };
  const dependencies = {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, user: { id: actorId }, role: actor.role,
      profile: actor, outdoorTeamMemberIds: [actorId, teammateId] }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
  };
  const modules = new Map();
  function load(path) {
    const url = new URL(path, import.meta.url);
    if (modules.has(url.href)) return modules.get(url.href);
    const exports = {}; modules.set(url.href, exports);
    if (!compiled.has(url.href)) compiled.set(url.href, ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
    new Function('require', 'exports', 'Date', compiled.get(url.href))(name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.startsWith('@/')) return load(`../src/${name.slice(2)}.ts`);
      if (name.startsWith('.')) return load(new URL(`${name}.ts`, url));
      throw new Error(`Unexpected module ${name}`);
    }, exports, FixedDate);
    return exports;
  }
  return { load, projects, reads, writes, rpcCalls, tables };
}

function savedOpening(x, patch = {}) {
  return { id: operationId, userId: actorId, projectId: x.projects[1].id, action: 'opening', recordedAt: periods[1][0], acknowledgeOnly: true,
    payload: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', floor: ' GF ', room: 'Office', width: 100, height: 100,
      quantity: 1, hasArch: false, hasRollerShutter: false, structuralType: 'Window', openingType: 'Sliding', ignoredPrivateField: 'Do not forward' }, ...patch };
}
function post(x, body) {
  return x.load('../src/app/api/offline/route.ts').POST(new Request('http://localhost:3003/api/offline', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}

test('hidden committed receipts acknowledge exact normalized work without returning a project or running a write', async () => {
  const x = fixture(periods[1][0], { acknowledged: true }); const body = savedOpening(x);
  const response = await post(x, body);
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(await response.json(), { acknowledged: true, operationId, projectId: body.projectId });
  assert.deepEqual(x.rpcCalls, [{ name: 'acknowledge_hidden_field_receipt', args: {
    p_operation: operationId, p_actor: actorId, p_project: body.projectId, p_action: 'opening',
    p_payload: { hasRollerShutter: false, hasArch: false, id: body.payload.id, quantity: 1, width: 100, height: 100,
      floor: 'GF', room: 'Office', otherRoom: '', structuralType: 'Window', openingType: 'Sliding' },
  } }]);
  assert.deepEqual(x.writes, []); assert.deepEqual(x.reads, [], 'The receipt-only path never loads a hidden project snapshot');
});

test('a missing or hash-mismatched receipt fails closed and never falls through to writes, including visible projects', async () => {
  for (const projectIndex of [0, 1]) {
    const x = fixture(periods[1][0], { acknowledged: false }); const response = await post(x, savedOpening(x, { projectId: x.projects[projectIndex].id }));
    assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: 'Project not found.' });
    assert.equal(x.rpcCalls.length, 1); assert.deepEqual(x.writes, []); assert.deepEqual(x.reads, []);
  }
  const x = fixture(periods[1][0], { acknowledged: args => args.p_payload.width === 100 });
  const body = savedOpening(x); body.payload.width = 101;
  assert.equal((await post(x, body)).status, 404); assert.deepEqual(x.writes, []);
});

test('receipt-only requests cannot forge actor identity, bypass action normalization, or use non-Outdoor roles', async () => {
  for (const patch of [{ userId: otherId }, { id: 'invalid' }, { action: 'unknown' }, { payload: { width: -1 } }]) {
    const x = fixture(periods[1][0], { acknowledged: true }); assert.equal((await post(x, savedOpening(x, patch))).status, 400);
    assert.deepEqual(x.rpcCalls, []); assert.deepEqual(x.writes, []);
  }
  for (const role of ['Indoor Sales', 'Admin']) {
    const x = fixture(periods[1][0], { role, acknowledged: true }); assert.equal((await post(x, savedOpening(x))).status, 403);
    assert.deepEqual(x.rpcCalls, []); assert.deepEqual(x.writes, []);
  }
});

for (const failure of [{ ackError: { message: 'Private receipt backend failure', code: 'XX000' } }, { ackThrows: true }]) test(`receipt verification failures are generic recoverable errors: ${JSON.stringify(failure)}`, async () => {
  const x = fixture(periods[1][0], failure); const response = await post(x, savedOpening(x));
  assert.equal(response.status, 503); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(await response.json(), { error: 'Unable to verify the saved change. Try again when connected.' });
  assert.deepEqual(x.writes, []); assert.deepEqual(x.reads, []);
});

test('a wrong-half registration receipt is checked for presence and normalized before acknowledgement only', async () => {
  const x = fixture(periods[1][0], { acknowledged: true });
  x.tables.field_sync_receipts.push({ operation_id: operationId, actor_id: actorId, project_id: x.projects[1].id,
    action: 'register', result: { project_name: 'Never return this private receipt snapshot' } });
  const body = savedOpening(x, { action: 'register', payload: { client: { clientType: 'individual', clientName: ' Fixture ', mobile: '07000000000' },
    project: { branch: 'Rasafa', address: ' Site address ', structureReadiness: 'ready', buildingType: 'villa_house' } } });
  const response = await post(x, body);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { acknowledged: true, operationId, projectId: body.projectId });
  assert.deepEqual(x.reads.map(read => read.table), ['field_sync_receipts']);
  assert.equal(x.rpcCalls[0].name, 'acknowledge_hidden_field_receipt');
  assert.equal(x.rpcCalls[0].args.p_payload.client.clientName, 'Fixture');
  assert.equal(x.rpcCalls[0].args.p_payload.project.address, 'Site address');
  assert.equal(x.rpcCalls[0].args.p_payload.project.branch, 'Rasafa');
  assert.deepEqual(x.writes, []);
});

for (const [at, area] of periods) {
  for (const endpoint of ['workspace', 'offline', 'dashboard']) test(`${endpoint} propagates the verified Rasafa seed and hides opposite-area history at ${at}`, async () => {
    const x = fixture(at), route = x.load(`../src/app/api/${endpoint}/route.ts`);
    const response = await route.GET(new Request(`http://localhost:3003/api/${endpoint}?outdoorRotationStartBranch=Karkh`));
    assert.equal(response.status, 200); const body = await response.json();
    const visible = body.projects.map(project => project.id);
    assert.ok(visible.includes(x.projects.find(project => project.branch === area).id));
    assert.ok(visible.includes(x.projects[2].id), 'Existing creator access to Governorates is preserved');
    assert.ok(body.projects.every(project => project.branch === area || project.branch === 'Governorates'));
    assert.ok(!visible.includes(x.projects[6].id), 'Najaf remains isolated');
    if (endpoint !== 'dashboard') {
      assert.equal(body.actor.outdoorRotationStartBranch, 'Rasafa');
      assert.ok(visible.includes(x.projects[area === 'Karkh' ? 4 : 5].id), 'Current-area historical visits remain visible');
    }
    assert.deepEqual(x.writes, []);
  });

  for (const branch of ['Karkh', 'Rasafa']) test(`direct measurement and project media gates propagate the verified seed for ${branch} at ${at}`, async () => {
    const x = fixture(at), project = x.projects.find(project => project.branch === branch);
    const context = { params: Promise.resolve({ projectId: project.id }) };
    const response = await x.load('../src/app/api/initial-measurements/[projectId]/route.ts').GET(new Request('http://localhost:3003/api/initial-measurements/fixture'), context);
    assert.equal(response.status, branch === area ? 200 : 404);
    const result = await x.load('../src/lib/workflow/access.ts').salesProject(project.id);
    assert.equal(result.response?.status ?? 200, branch === area ? 200 : 404);
    const reports = await x.load('../src/app/api/measurement-reports/[projectId]/route.ts').GET(new Request('http://localhost:3003/api/measurement-reports/fixture'), context);
    assert.equal(reports.status, branch === area ? 200 : 404);
    assert.deepEqual(x.writes, []);
  });

  test(`offline opening replay cannot forge a rotation seed after the area boundary at ${at}`, async () => {
    const x = fixture(at), project = x.projects.find(project => ['Karkh', 'Rasafa'].includes(project.branch) && project.branch !== area);
    const opening = { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', floor: 'GF', room: 'Office', width: 100, height: 100,
      quantity: 1, hasArch: false, hasRollerShutter: false, structuralType: 'Window', openingType: 'Sliding' };
    const body = { id: operationId, userId: actorId, projectId: project.id, action: 'opening', payload: opening,
      recordedAt: at, outdoorRotationStartBranch: 'Karkh' };
    const response = await x.load('../src/app/api/offline/route.ts').POST(new Request('http://localhost:3003/api/offline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    assert.equal(response.status, 404); assert.deepEqual(x.writes, [], 'No receipt or measurement mutation occurs outside the current area');
  });
}
