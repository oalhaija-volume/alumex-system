import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const teammateId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const otherId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const actor = { id: actorId, name: 'Outdoor fixture', role: 'Outdoor Sales', branch: 'Karkh', outdoorTeamMemberIds: [actorId, teammateId] };
const branches = ['Karkh', 'Rasafa', 'Governorates', 'Najaf'];
const timestamp = '2026-11-14T08:00:00Z';

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

function project(index, branch, values = {}) {
  return { id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`, branch,
    project_number: `PRJ-CREATOR-${index}`, project_name: `${branch} creator fixture`, client_id: `client-${index}`,
    created_by: actorId, assigned_outdoor_sales_id: otherId, original_creator_role: 'Outdoor Sales',
    structure_readiness: 'ready', sales_status: 'new_lead', status: 'Draft', created_at: timestamp, updated_at: timestamp,
    address: 'Fixture address', phone: null, next_follow_up_at: null, project_notes: null, ...values };
}
const own = branches.map((branch, index) => project(index + 1, branch));
const ownBaghdad = own.filter(row => row.branch !== 'Najaf');
const team = project(5, 'Karkh', { created_by: otherId, assigned_outdoor_sales_id: teammateId });
const foreignAssigned = project(6, 'Rasafa', { created_by: otherId, assigned_outdoor_sales_id: actorId });
const foreignTeam = project(7, 'Najaf', { created_by: otherId, assigned_outdoor_sales_id: teammateId });
const unrelated = project(8, 'Karkh', { created_by: otherId, assigned_outdoor_sales_id: otherId });
const history = project(9, 'Karkh', { created_by: otherId });
const foreignHistory = project(10, 'Rasafa', { created_by: otherId });
const rows = [...own, team, foreignAssigned, foreignTeam, unrelated, history, foreignHistory];
const load = modules();

for (const branch of ['Karkh', 'Rasafa', 'Governorates']) test(`Outdoor creator retains ${branch} entries independently of current assignee`, () => {
  const access = load('lib/auth/projectBranchAccess');
  assert.equal(access.canAccessProjectRow(actor, own.find(row => row.branch === branch)), true);
  assert.equal(load('lib/measurements/visitHistory').isHistoricalProject(own.find(row => row.branch === branch), actor), false);
});

test('saved Baghdad entries remain accessible while Najaf and creation choices stay restricted', () => {
  const access = load('lib/auth/projectBranchAccess');
  const date = new Date('2026-11-14T08:00:00Z');
  assert.deepEqual(access.projectBranchesForActor(actor), ['Karkh', 'Rasafa', 'Governorates']);
  assert.deepEqual(load('lib/intake/outdoorRotation').outdoorProjectBranches(actor, date), ['Karkh', 'Governorates']);
  assert.equal(access.canAccessProjectBranch(actor, 'Rasafa'), true);
  assert.equal(access.canAccessProjectBranch(actor, 'Najaf'), false);
  for (const branch of ['Rasafa', 'Najaf']) {
    const row = own.find(project => project.branch === branch);
    assert.equal(access.canAccessProjectRow({ ...actor, role: 'Indoor Sales' }, row), false);
    assert.equal(access.canAccessProjectRow({ ...actor, role: 'Sales Manager' }, row), false);
    assert.throws(() => load('lib/intake/outdoorRotation').normalizeOutdoorProjectBranch(actor, branch, date));
  }
  for (const row of [own.find(row => row.branch === 'Najaf'), foreignTeam]) assert.equal(access.canAccessProjectRow(actor, row), false);
  assert.equal(access.canAccessProjectRow(actor, foreignAssigned), true);
});

test('offline creator entries retain queued work, openings, report media and archives across offices', () => {
  const cached = rows.map(row => ({ ...row, project_log_only: [history.id, foreignHistory.id].includes(row.id) }));
  const state = { actor, projects: cached, syncedAt: null,
    openings: cached.map(row => ({ id: `opening-${row.id}`, projectId: row.id, skylight: { photo: `photo-${row.id}` } })),
    queue: cached.map(row => ({ id: `change-${row.id}`, projectId: row.id, action: 'opening', payload: {} })),
    measurementReports: cached.map(row => ({ id: `report-${row.id}`, project_id: row.id, photo: `report-photo-${row.id}` })),
    followUpHistories: Object.fromEntries(cached.map(row => [row.id, { note: `history-${row.id}` }])),
    archivedProjects: cached.map(row => ({ projectId: row.id, project: row, openings: [], changes: [], measurementReports: [] })),
  };
  const before = structuredClone(state), access = load('lib/offline/projectAccess');
  const view = access.visibleFieldState(state), writable = [...ownBaghdad, team, foreignAssigned].map(row => row.id);
  assert.deepEqual(view.projects.map(row => row.id), [...writable, history.id, foreignHistory.id]);
  assert.deepEqual(view.openings.map(row => row.projectId), writable);
  assert.deepEqual(view.queue.map(row => row.projectId), writable);
  assert.deepEqual(view.measurementReports.map(row => row.project_id), writable);
  assert.deepEqual(Object.keys(view.followUpHistories), writable);
  assert.deepEqual(view.archivedProjects.map(row => row.projectId), writable);
  for (const row of [...ownBaghdad, foreignAssigned]) assert.equal(access.canAccessFieldProject(state, row), true);
  for (const row of [own[3], foreignTeam, unrelated, foreignHistory]) assert.equal(access.canAccessFieldProject(state, row), false);
  assert.equal(view.openings.find(row => row.projectId === own[1].id).skylight.photo, `photo-${own[1].id}`);
  assert.deepEqual(state, before, 'Filtering must preserve unsynced raw storage');
  const indoor = access.visibleFieldState({ ...state, actor: { ...actor, role: 'Indoor Sales' } });
  assert.ok(indoor.projects.every(row => ['Karkh', 'Governorates'].includes(row.branch)));
  const unavailable = access.visibleFieldState({ ...state, unavailableProjectIds: [own[1].id] });
  assert.equal(unavailable.projects.some(row => row.id === own[1].id), false, 'A server-confirmed unavailable record remains unavailable');
});

function fixture(role = actor.role) {
  const reads = [], writes = [];
  const tables = {
    projects: structuredClone(rows),
    profiles: [{ ...actor, full_name: actor.name, is_active: true, status: 'Active', role }, { id: teammateId, full_name: 'Teammate', role: 'Outdoor Sales', branch: 'Karkh', is_active: true, status: 'Active' }],
    clients: rows.map(row => ({ id: row.client_id, client_name: 'Client fixture', mobile: '07000000000' })),
    openings: rows.map(row => ({ id: `opening-${row.id}`, project_id: row.id, created_by: actorId, floor: 'GF', room: 'Bedroom', width: 1000, height: 1200, quantity: 2, opening_type: 'Window', opening_direction: 'Sliding' })),
    measurement_completion_reports: [],
    field_sync_receipts: [history, foreignHistory].map((row, index) => ({ operation_id: `receipt-${index}`, project_id: row.id, actor_id: actorId, action: 'finish', recorded_at: timestamp, result: {} })),
  };
  const admin = { from(table) {
    assert.ok(table in tables, `Unexpected table: ${table}`);
    const predicates = []; let fields = '*', from = 0, to = Infinity;
    function result() {
      const selected = tables[table].filter(row => predicates.every(predicate => predicate(row))).slice(from, to + 1);
      reads.push({ table, rows: structuredClone(selected) });
      return { data: selected.map(row => fields === '*' ? { ...row } : Object.fromEntries(fields.split(',').map(field => [field.trim(), row[field.trim()]]))), error: null };
    }
    return { select(value) { fields = value; return this; },
      eq(key, value) { predicates.push(row => row[key] === value); return this; },
      is(key, value) { predicates.push(row => (row[key] ?? null) === value); return this; },
      in(key, values) { predicates.push(row => values.includes(row[key])); return this; },
      or(expression) { const clauses = expression.split(',').map(term => term.split('.eq.')); predicates.push(row => clauses.some(([key, value]) => row[key] === value)); return this; },
      order() { return this; }, range(start, end) { from = start; to = end; return this; },
      maybeSingle: async () => { const value = result(); return { ...value, data: value.data[0] ?? null }; },
      single: async () => { const value = result(); return { ...value, data: value.data[0] ?? null }; },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
  }, rpc: async (name, input) => { writes.push({ name, input }); return { data: { ...rows.find(row => row.id === input.p_project) }, error: null }; } };
  const loadRoute = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, role, user: { id: actorId }, profile: { branch: actor.branch }, outdoorTeamMemberIds: actor.outdoorTeamMemberIds }) },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
  });
  return { admin, load: loadRoute, reads, writes, tables };
}

for (const path of ['workspace', 'offline', 'dashboard']) test(`${path} API returns all own Baghdad entries while isolating Najaf`, async () => {
  const x = fixture();
  const response = await x.load(`app/api/${path}/route`).GET(new Request(`http://localhost:3003/api/${path}`));
  assert.equal(response.status, 200);
  const expected = [...ownBaghdad, team, foreignAssigned, ...(path === 'dashboard' ? [] : [history, foreignHistory])].map(row => row.id);
  assert.deepEqual(response.body.projects.map(row => row.id), expected);
  for (const row of ownBaghdad) assert.equal(response.body.projects.find(project => project.id === row.id)?.project_log_only ?? false, false);
  assert.equal(response.body.projects.some(row => row.branch === 'Najaf'), false);
  for (const table of ['clients', 'openings', 'measurement_completion_reports']) {
    for (const read of x.reads.filter(read => read.table === table)) assert.ok(read.rows.every(row => table === 'clients' ? expected.some(id => rows.find(project => project.id === id).client_id === row.id) : expected.includes(row.project_id)));
  }
  assert.deepEqual(x.writes, []);
});

for (const branch of ['Rasafa', 'Najaf']) test(`direct ${branch} measurement and workflow reads enforce Najaf isolation`, async () => {
  const ownProject = own.find(row => row.branch === branch);
  const denied = branch === 'Rasafa' ? foreignAssigned : foreignTeam;
  for (const row of [ownProject, denied]) {
    const x = fixture();
    const response = await x.load('app/api/initial-measurements/[projectId]/route').GET(new Request(`http://localhost:3003/api/initial-measurements/${row.id}`), { params: Promise.resolve({ projectId: row.id }) });
    const permitted = branch === 'Rasafa';
    assert.equal(response.status, permitted ? 200 : 404);
    assert.equal(x.reads.some(read => read.table === 'openings'), permitted);
    const workflow = await x.load('lib/workflow/access').salesProject(row.id);
    assert.equal(workflow.response?.status ?? 200, permitted ? 200 : 404);
    assert.deepEqual(x.writes, []);
  }
  const indoor = fixture('Indoor Sales');
  const response = await indoor.load('app/api/initial-measurements/[projectId]/route').GET(new Request(`http://localhost:3003/api/initial-measurements/${ownProject.id}`), { params: Promise.resolve({ projectId: ownProject.id }) });
  assert.equal(response.status, 404, 'Creator identity cannot relax Indoor branch rules');
});

for (const branch of ['Rasafa', 'Najaf']) test(`${branch} queued opening replay cannot bypass Najaf isolation`, async () => {
  const ownProject = own.find(row => row.branch === branch), denied = branch === 'Rasafa' ? foreignAssigned : foreignTeam;
  for (const row of [ownProject, denied]) {
    const x = fixture();
    const body = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', userId: actorId, projectId: row.id, action: 'opening', recordedAt: timestamp,
      payload: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', floor: 'GF', room: 'Bedroom', width: 1200, height: 1400, quantity: 2, structuralType: 'Window', openingType: 'Sliding' } };
    const response = await x.load('app/api/offline/route').POST({ json: async () => body });
    const permitted = branch === 'Rasafa';
    assert.equal(response.status, permitted ? 200 : 404);
    assert.equal(x.writes.length, permitted ? 1 : 0);
    if (permitted) {
      assert.equal(x.writes[0].input.p_actor, actorId);
      assert.equal(x.writes[0].input.p_project, row.id);
      assert.equal(x.writes[0].input.p_payload.quantity, 2);
    }
  }
});

for (const [path, type, column, key] of [
  ['curtain-wall-capture', 'Curtain Wall', 'curtain_wall_capture', 'curtainWall'],
  ['skylight-capture', 'Skylight', 'skylight_capture', 'skylight'],
]) test(`${path} media stays readable for own foreign entries without exposing assigned-only entries`, async () => {
  for (const row of [own[1], own[3], foreignAssigned, foreignTeam]) {
    const x = fixture(), openingId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const capture = { photo: 'private-fixture-photo', note: 'Creator fixture', sections: [] };
    Object.assign(x.tables.openings.find(opening => opening.project_id === row.id), { id: openingId, opening_type: type, [column]: capture });
    const response = await x.load(`app/api/${path}/[projectId]/[openingId]/route`).GET(new Request(`http://localhost:3003/api/${path}/${row.id}/${openingId}`), { params: Promise.resolve({ projectId: row.id, openingId }) });
    const permitted = row.branch !== 'Najaf';
    assert.equal(response.status, permitted ? 200 : 404);
    if (permitted) assert.deepEqual(response.body[key], capture);
    assert.equal(x.reads.some(read => read.table === 'openings'), permitted);
    assert.deepEqual(x.writes, []);
  }
});
