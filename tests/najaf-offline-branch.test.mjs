import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function modules() {
  const cache = new Map();
  return function load(path) {
    const url = path instanceof URL ? path : new URL(path, import.meta.url);
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {};
    cache.set(url.href, exports);
    const source = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'exports', source)(name => load(name.startsWith('@/')
      ? new URL(`../src/${name.slice(2)}.ts`, import.meta.url)
      : new URL(`${name}.ts`, url)), exports);
    return exports;
  };
}

const load = modules();
const { visibleFieldState, canAccessFieldProject } = load('../src/lib/offline/projectAccess.ts');
const { appRoles } = load('../src/lib/auth/roles.ts');
const globalRoles = ['Admin', 'Sales Director', 'Company Owner'];
const offices = ['Karkh', 'Rasafa', 'Najaf'];
const employeeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function snapshot(role, branch) {
  const actor = { id: employeeId, name: 'Employee', role, branch };
  const projects = [...offices, 'Governorates', null].map((projectBranch, index) => ({
    id: `project-${index}`, branch: projectBranch, project_name: `${projectBranch ?? 'Unassigned'} private client`,
    phone: `private-phone-${index}`, project_number: `PRJ-${index}`, created_by: employeeId,
    assigned_outdoor_sales_id: employeeId, structure_readiness: 'ready', sales_status: 'new_lead',
    updated_at: '2026-11-14T00:00:00Z', pending: true,
  }));
  return {
    actor, projects, syncedAt: null,
    outdoorSales: [...offices, null].map((office, index) => ({ id: `outdoor-${index}`, name: `${office} employee`, branch: office })),
    indoorSales: [...offices, null].map((office, index) => ({ id: `indoor-${index}`, name: `${office} employee`, role: 'Indoor Sales', branch: office })),
    openings: projects.map(project => ({ id: `opening-${project.id}`, projectId: project.id, skylight: { photo: `private-photo-${project.id}` } })),
    queue: projects.map(project => ({ id: `change-${project.id}`, projectId: project.id, action: 'opening', payload: { note: `private-note-${project.id}` } })),
    measurementReports: projects.map(project => ({ id: `report-${project.id}`, project_id: project.id, photo: `report-photo-${project.id}` })),
    followUpHistories: Object.fromEntries(projects.map(project => [project.id, { note: `private-history-${project.id}` }])),
    archivedProjects: projects.map(project => ({ projectId: project.id, project, changes: [], openings: [], measurementReports: [], archivedAt: '2026-11-14T00:00:00Z' })),
  };
}

for (const role of appRoles) test(`${role} cached reads redact foreign office projects and all associated private data`, () => {
  for (const branch of [...offices, null]) {
    const state = snapshot(role, branch), before = structuredClone(state);
    const expected = state.projects.filter(project => globalRoles.includes(role)
      || offices.includes(branch) && (project.branch === branch || (branch === 'Karkh' || role === 'Outdoor Sales' && branch === 'Rasafa') && project.branch === 'Governorates'));
    const ids = expected.map(project => project.id);
    const view = visibleFieldState(state);
    assert.deepEqual(view.projects.map(project => project.id), ids);
    assert.deepEqual(view.openings.map(opening => opening.projectId), ids);
    assert.deepEqual(view.queue.map(change => change.projectId), ids);
    assert.deepEqual(view.measurementReports.map(report => report.project_id), ids);
    assert.deepEqual(Object.keys(view.followUpHistories), ids);
    assert.deepEqual(view.archivedProjects.map(archive => archive.projectId), ids);
    for (const key of ['outdoorSales', 'indoorSales']) {
      assert.deepEqual(view[key], state[key].filter(employee => globalRoles.includes(role) || offices.includes(branch) && employee.branch === branch));
    }
    for (const project of state.projects) assert.equal(canAccessFieldProject(state, project), ids.includes(project.id));
    assert.equal(canAccessFieldProject(state, undefined), false);
    assert.deepEqual(state, before, 'Access filtering must retain unsynced work in raw storage');
  }
});

test('switching an employee to Najaf immediately redacts the old office snapshot without losing saved edits', () => {
  for (const role of appRoles.filter(role => !globalRoles.includes(role))) {
    const state = snapshot(role, 'Karkh');
    const before = structuredClone(state);
    state.actor = { ...state.actor, branch: 'Najaf' };
    const view = visibleFieldState(state);
    const najaf = state.projects.find(project => project.branch === 'Najaf');
    assert.deepEqual(view.projects.map(project => project.id), [najaf.id]);
    assert.deepEqual(view.queue.map(change => change.projectId), [najaf.id]);
    assert.deepEqual(view.openings.map(opening => opening.projectId), [najaf.id]);
    assert.deepEqual(view.measurementReports.map(report => report.project_id), [najaf.id]);
    assert.deepEqual(Object.keys(view.followUpHistories), [najaf.id]);
    assert.deepEqual(view.archivedProjects.map(archive => archive.projectId), [najaf.id]);
    assert.ok(view.outdoorSales.every(employee => employee.branch === 'Najaf'));
    assert.ok(view.indoorSales.every(employee => employee.branch === 'Najaf'));
    assert.deepEqual(state.projects, before.projects);
    assert.deepEqual(state.queue, before.queue);
    assert.deepEqual(state.openings, before.openings);
  }
});

test('legacy directory entries without office assignments stay hidden until an authorized refresh', () => {
  const state = snapshot('Indoor Sales', 'Najaf');
  state.outdoorSales.push({ id: 'legacy-outdoor', name: 'Legacy cached employee' });
  state.indoorSales.push({ id: 'legacy-indoor', name: 'Legacy cached employee', role: 'Indoor Sales' });
  const view = visibleFieldState(state);
  assert.ok(view.outdoorSales.every(employee => employee.branch === 'Najaf'));
  assert.ok(view.indoorSales.every(employee => employee.branch === 'Najaf'));
  assert.equal(state.outdoorSales.length, 5);
  assert.equal(state.indoorSales.length, 5);
});

test('Outdoor Sales ownership, team assignments and historical visits cannot bypass the office boundary', () => {
  const state = snapshot('Outdoor Sales', 'Najaf');
  state.actor.outdoorTeamMemberIds = ['teammate'];
  state.projects = state.projects.map(project => ({ ...project, assigned_outdoor_sales_id: 'teammate', project_log_only: project.branch !== 'Najaf' }));
  const najaf = state.projects.find(project => project.branch === 'Najaf');
  const view = visibleFieldState(state);
  assert.deepEqual(view.projects.map(project => project.id), [najaf.id]);
  assert.deepEqual(view.queue.map(change => change.projectId), [najaf.id]);
  assert.deepEqual(view.openings.map(opening => opening.projectId), [najaf.id]);
  for (const project of state.projects.filter(project => project.branch !== 'Najaf')) assert.equal(canAccessFieldProject(state, project), false);
});

test('a same-office Outdoor historical visit remains a read-only log without cached media or writable changes', () => {
  const state = snapshot('Outdoor Sales', 'Najaf');
  const najaf = state.projects.find(project => project.branch === 'Najaf');
  Object.assign(najaf, { created_by: 'someone-else', assigned_outdoor_sales_id: 'someone-else', project_log_only: true });
  const view = visibleFieldState(state);
  assert.deepEqual(view.projects.map(project => project.id), [najaf.id]);
  assert.equal(canAccessFieldProject(state, najaf), false);
  for (const key of ['queue', 'openings', 'measurementReports', 'archivedProjects']) assert.deepEqual(view[key], []);
  assert.deepEqual(view.followUpHistories, {});
});

test('server-confirmed unavailable projects do not reappear in any employee cache view', () => {
  for (const role of appRoles) {
    const state = snapshot(role, 'Najaf');
    state.unavailableProjectIds = state.projects.map(project => project.id);
    const view = visibleFieldState(state);
    for (const key of ['projects', 'queue', 'openings', 'measurementReports']) assert.deepEqual(view[key], []);
    assert.deepEqual(view.followUpHistories, {});
    assert.equal(view.unavailableProjectIds, undefined, 'Unavailable foreign identifiers are not exposed to the UI');
  }
});
