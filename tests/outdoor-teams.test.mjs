import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

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
      return load(name.startsWith('@/') ? new URL(`../src/${name.slice(2)}.ts`, import.meta.url) : new URL(`${name}.ts`, url));
    }, exports);
    return exports;
  }
  return path => load(new URL(`../src/${path}.ts`, import.meta.url));
}

const employees = [
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', full_name: 'Ahmad', outdoor_team_key: 'ahmad-mohammad' },
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', full_name: 'Mohammad', outdoor_team_key: 'ahmad-mohammad' },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', full_name: 'Sajjad', outdoor_team_key: 'sajjad-ehab' },
  { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', full_name: 'Ehab', outdoor_team_key: 'sajjad-ehab' },
].map(employee => ({ ...employee, username: employee.full_name.toLowerCase(), role: 'Outdoor Sales', branch: employee.outdoor_team_key === 'ahmad-mohammad' ? 'Karkh' : 'Najaf', is_active: true, status: 'Active' }));
const indoorId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const openingId = '99999999-9999-4999-8999-999999999999';
const curtainId = '88888888-8888-4888-8888-888888888888';
const skylightId = '77777777-7777-4777-8777-777777777777';
const version = '2026-11-04T08:00:00Z';
const projects = employees.map((employee, index) => ({
  id: `${index + 1}${'1'.repeat(7)}-1111-4111-8111-111111111111`, project_name: `${employee.full_name} assignment`,
  project_number: `PRJ-TEAM-${index}`, client_id: `client-${index}`, branch: employee.branch,
  created_by: indoorId, assigned_outdoor_sales_id: employee.id, structure_readiness: 'ready', sales_status: 'new_lead',
  archived_at: null, created_at: version, updated_at: version, project_notes: null, next_follow_up_at: null,
}));
const teamIds = employee => employees.filter(member => member.outdoor_team_key === employee.outdoor_team_key).map(member => member.id);
const actorFor = employee => ({ id: employee.id, role: employee.role, branch: employee.branch, outdoorTeamMemberIds: teamIds(employee) });

// Execute the real access policies and route handlers with a row-filtering
// database transport. No account, database or environment is changed.
function transport(tables, { directoryError = null } = {}) {
  const reads = [], writes = [], rpcCalls = [];
  const admin = {
    from(table) {
      assert.ok(table in tables, `Unexpected table: ${table}`);
      const predicates = [];
      let fields, mutation, limit = Infinity;
      const query = {
        select(value) { fields = value; return this; },
        eq(key, value) { predicates.push(row => row[key] === value); return this; },
        is(key, value) { predicates.push(row => row[key] === value); return this; },
        in(key, values) { predicates.push(row => values.includes(row[key])); return this; },
        or(expression) {
          const choices = expression.split(',').map(part => part.split('.eq.'));
          predicates.push(row => choices.some(([key, value]) => row[key] === value));
          return this;
        },
        order() { return this; }, range() { return this; },
        limit(value) { limit = value; return this; },
        insert(payload) { mutation = { action: 'insert', payload }; return this; },
        update(payload) { mutation = { action: 'update', payload }; return this; },
        single() { return Promise.resolve(result(true)); },
        maybeSingle() { return Promise.resolve(result(true)); },
        then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); },
      };
      function result(single) {
        const rows = tables[table].filter(row => predicates.every(predicate => predicate(row))).slice(0, limit);
        if (mutation) writes.push({ table, ...mutation, ids: rows.map(row => row.id) });
        else reads.push({ table, fields, rows });
        return { data: single ? rows[0] ?? null : rows, error: table === 'profiles' && fields === 'id' ? directoryError : null };
      }
      return query;
    },
    async rpc(name, args) { rpcCalls.push({ name, args }); return { data: tables.projects?.find(project => project.id === args.p_project) ?? {}, error: null }; },
  };
  return { admin, reads, writes, rpcCalls };
}

function authentication(employee, { extraProfiles = [], profilePatch = {}, userPatch = {}, directoryError = null } = {}) {
  const profile = { ...employee, ...profilePatch };
  const x = transport({ profiles: employees.map(member => member.id === employee.id ? profile : member).concat(extraProfiles) }, { directoryError });
  const user = { id: employee.id, email: `${employee.username}@example.invalid`, ...userPatch };
  const client = { ...x.admin, auth: { getUser: async () => ({ data: { user }, error: null }) } };
  const load = modules({
    'next/headers': { headers: async () => new Headers({ 'user-agent': 'iPhone' }) },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/supabase/admin': { createAdminClient: () => x.admin },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
  });
  return { ...x, check: () => load('lib/auth/adminServer').requireRole(['Outdoor Sales']) };
}

for (const employee of employees) test(`${employee.full_name}: authentication resolves only active teammates from trusted profiles`, async () => {
  const extraProfiles = [
    { ...employee, id: 'inactive', is_active: false },
    { ...employee, id: 'inactive-status', status: 'Inactive' },
    { ...employee, id: 'wrong-role', role: 'Indoor Sales' },
    { ...employee, id: 'other-team', outdoor_team_key: 'different-team' },
    { ...employee, id: 'other-office-same-team', branch: employee.branch === 'Karkh' ? 'Najaf' : 'Karkh' },
  ];
  const x = authentication(employee, { extraProfiles, userPatch: { user_metadata: { outdoorTeamMemberIds: extraProfiles.map(member => member.id) } } });
  const result = await x.check();
  assert.equal(result.ok, true);
  assert.deepEqual(result.outdoorTeamMemberIds.toSorted(), teamIds(employee).toSorted());
  assert.equal(result.user.id, employee.id);
});

test('team lookup fails closed and does not expose database error details', async () => {
  const x = authentication(employees[0], { directoryError: { message: 'Private database detail' } });
  const result = await x.check();
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(JSON.stringify(result).includes('Private database detail'), false);
});

test('unconfigured or inactive Outdoor accounts cannot invent team membership', async () => {
  const noTeam = authentication(employees[0], {
    profilePatch: { outdoor_team_key: null },
    userPatch: { outdoor_team_key: employees[0].outdoor_team_key, outdoorTeamMemberIds: employees.map(employee => employee.id) },
  });
  assert.deepEqual((await noTeam.check()).outdoorTeamMemberIds, [employees[0].id]);
  assert.equal(noTeam.reads.length, 1, 'Unconfigured accounts must not search for a team');
  const inactive = authentication(employees[0], { profilePatch: { is_active: false } });
  assert.equal((await inactive.check()).status, 403);
  assert.equal(inactive.reads.length, 1, 'Inactive accounts must not resolve any teammate access');
});

test('the team policy shares assignees reciprocally without sharing teammate-created unassigned projects or other roles', () => {
  const load = modules();
  const policy = load('lib/auth/outdoorTeams');
  const { canRenameProject } = load('lib/workflow/projectName');
  const { measurementTasks } = load('lib/workflow/salesTasks');
  for (const employee of employees) {
    const actor = actorFor(employee);
    const allowed = projects.filter(project => teamIds(employee).includes(project.assigned_outdoor_sales_id));
    assert.deepEqual(measurementTasks(projects, actor).map(project => project.id), allowed.map(project => project.id));
    for (const project of projects) {
      const expected = allowed.includes(project);
      assert.equal(policy.isOutdoorAssignmentMember(project, actor), expected);
      assert.equal(policy.canAccessOutdoorProject(project, actor), expected);
      assert.equal(canRenameProject(project, actor), false, 'Shared assignments do not grant project-name ownership');
    }
    const teammate = teamIds(employee).find(id => id !== employee.id);
    assert.equal(policy.canAccessOutdoorProject({ created_by: teammate, assigned_outdoor_sales_id: null }, actor), false);
    assert.equal(policy.canAccessOutdoorProject({ created_by: employee.id, assigned_outdoor_sales_id: null }, actor), true);
    assert.equal(canRenameProject({ created_by: employee.id, assigned_outdoor_sales_id: null }, actor), false);
    assert.equal(canRenameProject({ ...allowed[0], project_log_only: true }, actor), false);
    assert.deepEqual(policy.outdoorAssignmentIds({ ...actor, outdoorTeamMemberIds: [...actor.outdoorTeamMemberIds, employee.id] }).toSorted(), teamIds(employee).toSorted());
    const filter = policy.outdoorProjectFilter(actor);
    assert.ok(filter.includes(`created_by.eq.${employee.id}`));
    assert.ok(filter.includes(`assigned_outdoor_sales_id.eq.${teammate}`));
    assert.ok(!filter.includes(`created_by.eq.${teammate}`));
    assert.ok(!filter.includes('legacy_outdoor_sales_id'));
    assert.ok(policy.outdoorProjectFilter(actor, true).includes(`legacy_outdoor_sales_id.eq.${employee.id}`));
  }
  for (const role of ['Indoor Sales', 'Sales Manager', 'Admin', 'HR']) {
    const actor = { ...actorFor(employees[0]), role };
    assert.equal(policy.isOutdoorAssignmentMember(projects[1], actor), false);
    assert.equal(policy.canAccessOutdoorProject(projects[1], actor), false);
    assert.deepEqual(policy.outdoorAssignmentIds(actor), [employees[0].id]);
  }
  assert.equal(policy.canAccessOutdoorProject(projects[1], { id: employees[0].id, role: 'Outdoor Sales' }), false);
});

function fixture(employee, { projectRows = projects, memberIds = teamIds(employee) } = {}) {
  const tables = {
    projects: structuredClone(projectRows), field_sync_receipts: [],
    profiles: [...employees, { id: indoorId, full_name: 'Indoor employee', role: 'Indoor Sales', branch: 'Karkh', is_active: true, status: 'Active' }],
    clients: projects.map(project => ({ id: project.client_id, mobile: '07700000000' })),
    openings: projects.flatMap(project => [
      { id: openingId, project_id: project.id, created_by: employee.id, width: 100, height: 200, quantity: 1, floor: 'GF', room: 'Kitchen', opening_type: 'Window', opening_direction: 'Sliding' },
      { id: curtainId, project_id: project.id, opening_type: 'Curtain Wall', curtain_wall_capture: { note: `Curtain ${project.id}` } },
      { id: skylightId, project_id: project.id, opening_type: 'Skylight', skylight_capture: { note: `Skylight ${project.id}` } },
    ]),
    measurement_completion_reports: projects.map(project => ({ id: openingId, project_id: project.id, note: `Report ${project.id}`, photo: `Photo ${project.id}` })),
  };
  const x = transport(tables);
  const auth = { ok: true, role: 'Outdoor Sales', user: { id: employee.id }, profile: employee, outdoorTeamMemberIds: memberIds };
  const load = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200, headers: options?.headers }) } },
    '@/lib/auth/adminServer': { requireRole: async () => auth },
    '@/lib/supabase/admin': { createAdminClient: () => x.admin },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
  });
  return { ...x, load, auth };
}
const request = (body = {}) => ({ url: 'http://localhost:3003/api/offline', json: async () => body });
const context = (projectId, id = openingId) => ({ params: Promise.resolve({ projectId, openingId: id }) });
const openingInput = { id: openingId, width: 100, height: 200, quantity: 1, floor: 'GF', room: 'Kitchen', otherRoom: '', structuralType: 'Window', openingType: 'Sliding' };

for (const employee of employees) test(`${employee.full_name}: all workspace snapshots and task metadata include both assignees in the team`, async () => {
  for (const path of ['workspace', 'offline', 'dashboard']) {
    const x = fixture(employee);
    const response = await x.load(`app/api/${path}/route`).GET(request());
    assert.equal(response.status, 200);
    const expected = projects.filter(project => teamIds(employee).includes(project.assigned_outdoor_sales_id));
    assert.deepEqual(response.body.projects.map(project => project.id), expected.map(project => project.id));
    if (path !== 'dashboard') {
      assert.deepEqual(response.body.actor.outdoorTeamMemberIds, teamIds(employee));
      for (const project of response.body.projects) {
        assert.equal(project.project_log_only, false);
        assert.equal(project.assignedToYou, project.assigned_outdoor_sales_id === employee.id);
        assert.equal(project.assignedToTeam, true);
      }
    }
    for (const read of x.reads.filter(read => ['openings', 'measurement_completion_reports'].includes(read.table))) {
      assert.ok(read.rows.every(row => expected.some(project => project.id === row.project_id)));
    }
  }
});

for (const employee of employees) test(`${employee.full_name}: teammate assignment permits own measurement writes and media without granting project-name edits`, async () => {
  const teammateProject = projects.find(project => project.assigned_outdoor_sales_id !== employee.id && teamIds(employee).includes(project.assigned_outdoor_sales_id));
  const x = fixture(employee);
  const measurements = x.load('app/api/initial-measurements/[projectId]/route');
  const response = await measurements.GET(request(), context(teammateProject.id));
  assert.equal(response.status, 200);
  assert.equal(response.body.canDelayMeasurements, true);
  assert.equal(response.body.canCancelProject, false, 'Client cancellation remains with the named assignee');
  assert.equal((await measurements.POST(request(openingInput), context(teammateProject.id))).status, 201);
  assert.equal(x.writes.at(-1).payload.created_by, employee.id);
  const edited = await measurements.PATCH(request({ action: 'edit-opening', operationId: openingId, previous: openingInput, opening: { ...openingInput, width: 125 } }), context(teammateProject.id));
  assert.equal(edited.status, 200);
  assert.equal(x.rpcCalls.at(-1).args.p_actor, employee.id);
  const renamed = await x.load('app/api/workspace/route').PATCH(request({
    projectId: teammateProject.id, action: 'rename-project', projectName: '  Shared new name  ', expectedUpdatedAt: version,
    userId: 'forged', outdoorTeamMemberIds: employees.map(member => member.id), assigned_outdoor_sales_id: employee.id,
  }));
  assert.equal(renamed.status, 403, 'Only the employee who registered the project can rename it');
  assert.equal(x.rpcCalls.length, 1, 'Rejected rename must not call the mutation RPC');
  for (const [path, id] of [['measurement-reports/[projectId]', openingId], ['curtain-wall-capture/[projectId]/[openingId]', curtainId], ['skylight-capture/[projectId]/[openingId]', skylightId]]) {
    assert.equal((await x.load(`app/api/${path}/route`).GET(request(), context(teammateProject.id, id))).status, 200);
  }
  assert.equal(x.writes.some(write => Object.hasOwn(write.payload, 'assigned_outdoor_sales_id')), false);
  assert.equal((await x.load('lib/workflow/access').salesProject(teammateProject.id, 'commercial')).response.status, 403);
  assert.equal((await x.load('lib/workflow/access').salesProject(teammateProject.id, true)).response.status, 403);
});

test('forged request membership cannot grant another team’s project, measurements, rename or media', async () => {
  const employee = employees[0];
  const otherProject = projects[2];
  const forged = { ...openingInput, outdoorTeamMemberIds: employees.map(member => member.id), teamMemberIds: employees.map(member => member.id), userId: employees[2].id };
  for (const method of ['GET', 'POST', 'PATCH']) {
    const x = fixture(employee);
    const route = x.load('app/api/initial-measurements/[projectId]/route');
    const response = await route[method](request({ ...forged, action: 'reopen' }), context(otherProject.id));
    assert.equal(response.status, 404);
    assert.equal(x.writes.length + x.rpcCalls.length, 0);
    assert.ok(x.reads.every(read => read.table === 'projects'));
  }
  const x = fixture(employee);
  assert.equal((await x.load('app/api/workspace/route').PATCH(request({ ...forged, projectId: otherProject.id, action: 'rename-project', projectName: 'Forbidden', expectedUpdatedAt: version }))).status, 404);
  for (const path of ['measurement-reports/[projectId]', 'curtain-wall-capture/[projectId]/[openingId]', 'skylight-capture/[projectId]/[openingId]']) {
    assert.equal((await x.load(`app/api/${path}/route`).GET(request(forged), context(otherProject.id))).status, 404);
  }
  assert.equal(x.writes.length + x.rpcCalls.length, 0);
});

test('server snapshots never infer shared access from a teammate creator or from a missing team', async () => {
  const teammateCreated = { ...projects[0], created_by: employees[1].id, assigned_outdoor_sales_id: null };
  for (const path of ['workspace', 'offline', 'dashboard']) {
    const created = fixture(employees[0], { projectRows: [teammateCreated] });
    assert.deepEqual((await created.load(`app/api/${path}/route`).GET(request())).body.projects, []);
    const unconfigured = fixture(employees[0]);
    unconfigured.auth.outdoorTeamMemberIds = undefined;
    assert.deepEqual((await unconfigured.load(`app/api/${path}/route`).GET(request())).body.projects.map(project => project.id), [projects[0].id]);
  }
});

test('offline session refresh carries trusted membership and never derives it from request JSON', async () => {
  const x = fixture(employees[3]);
  const response = await x.load('app/api/offline/route').GET({ ...request({ outdoorTeamMemberIds: employees.map(employee => employee.id) }), url: 'http://localhost:3003/api/offline?session=1' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.actor.outdoorTeamMemberIds, teamIds(employees[3]));
  assert.equal(x.reads.some(read => read.table === 'projects'), false);
});
