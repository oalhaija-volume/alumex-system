import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function modules(dependencies = {}) {
  const loaded = new Map();
  function load(url) {
    if (loaded.has(url.href)) return loaded.get(url.href);
    const exports = {};
    loaded.set(url.href, exports);
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

const employeeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const teammateId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const otherTeamId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const projectId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const actor = { id: employeeId, name: 'Outdoor employee', role: 'Outdoor Sales', outdoorTeamMemberIds: [employeeId, teammateId] };
const project = {
  id: projectId, project_name: 'Shared site', project_number: 'PRJ-TEAM', created_by: 'indoor',
  registeredBy: 'Indoor employee', assigned_outdoor_sales_id: teammateId, assignedOutdoorSales: 'Teammate',
  assignedToYou: false, assignedToTeam: true, structure_readiness: 'ready', sales_status: 'new_lead',
  project_notes: 'Keep this note', next_follow_up_at: null, address: 'Baghdad', phone: null,
  created_at: '2026-11-04T08:00:00Z', updated_at: '2026-11-04T08:00:00Z', serverUpdatedAt: '2026-11-04T08:00:00Z',
};
const opening = {
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', projectId, floor: 'GF', room: 'Kitchen', otherRoom: '',
  createdBy: employeeId, width: 100, height: 200, quantity: 1, structuralType: 'Window', openingType: 'Sliding', hasArch: false,
};

function setup(t, overrides = {}) {
  const previous = new Map(['window', 'navigator', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  let state = structuredClone({ actor, projects: [project], openings: [opening], queue: [], syncedAt: null, ...overrides });
  let active = state.actor.id;
  const access = modules()('lib/offline/projectAccess');
  globalThis.window = { location: { pathname: '/offline' }, dispatchEvent() {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  const store = {
    activeFieldUser: () => active,
    setFieldUser: id => { active = id; },
    readStoredFieldState: async () => structuredClone(state),
    readFieldState: async () => access.visibleFieldState(structuredClone(state)),
    updateFieldState: async (id, change) => {
      assert.equal(id, employeeId);
      state = change(structuredClone(state));
      return access.visibleFieldState(structuredClone(state));
    },
  };
  const client = modules({ './store': store, './device': { isOfflineDevice: () => true } })('lib/offline/client');
  return { client, store, get raw() { return structuredClone(state); } };
}

test('the offline workspace shares current team assignments while keeping another team’s data hidden', async t => {
  const privateProject = { ...project, id: 'other-project', assigned_outdoor_sales_id: otherTeamId };
  const reference = { ...privateProject, id: 'reference-project', project_log_only: true };
  const all = [project, privateProject, reference];
  const x = setup(t, {
    projects: all,
    openings: all.map(p => ({ ...opening, projectId: p.id })),
    queue: all.map(p => ({ id: p.id, userId: employeeId, projectId: p.id, action: 'reopen', payload: {}, recordedAt: project.updated_at })),
    measurementReports: all.map(p => ({ id: p.id, project_id: p.id, photo: 'saved-photo' })),
    archivedProjects: all.map(p => ({ projectId: p.id, project: p, changes: [], openings: [], measurementReports: [] })),
  });
  const before = x.raw;
  const visible = await x.store.readFieldState();
  assert.deepEqual(visible.projects.map(p => p.id), [projectId, reference.id]);
  assert.deepEqual(visible.openings.map(o => o.projectId), [projectId]);
  assert.deepEqual(visible.queue.map(c => c.projectId), [projectId]);
  assert.deepEqual(visible.measurementReports.map(r => r.project_id), [projectId]);
  assert.deepEqual(visible.archivedProjects.map(a => a.projectId), [projectId]);
  assert.equal((await x.client.fieldFetch(`/api/initial-measurements/${reference.id}`)).status, 403);
  assert.deepEqual(x.raw, before, 'Permission filtering must not delete retained device data');
});

test('missing team membership stays self-only and never shares projects only created by a teammate', async t => {
  const own = { ...project, id: 'own-project', assigned_outdoor_sales_id: employeeId };
  const registered = { ...project, id: 'registered-project', created_by: employeeId, assigned_outdoor_sales_id: otherTeamId };
  const teammateCreated = { ...project, id: 'teammate-created', created_by: teammateId, assigned_outdoor_sales_id: otherTeamId };
  const x = setup(t, { actor: { ...actor, outdoorTeamMemberIds: undefined }, projects: [project, own, registered, teammateCreated] });
  assert.deepEqual((await x.store.readFieldState()).projects.map(p => p.id), [own.id, registered.id]);
  await assert.rejects(x.client.saveFieldChange('reopen', projectId, {}), /not available/);
  assert.equal(x.raw.queue.length, 0);
});

test('a teammate can reopen, edit their own entries and finish shared measurements but cannot rename the project', async t => {
  const x = setup(t, { projects: [{ ...project, sales_status: 'ready_for_quotation' }] });
  await x.client.saveFieldChange('reopen', projectId, {});
  await x.client.saveFieldChange('edit-opening', projectId, { previous: opening, opening: { ...opening, width: 125 } });
  await x.client.saveFieldChange('finish', projectId, {});
  await assert.rejects(x.client.saveFieldChange('rename-project', projectId, { projectName: 'Renamed shared site', expectedUpdatedAt: project.updated_at }), /Indoor Sales/);
  assert.deepEqual(x.raw.queue.map(c => c.action), ['reopen', 'edit-opening', 'finish']);
  assert.equal(x.raw.openings[0].width, 125);
  assert.equal(x.raw.projects[0].sales_status, 'ready_for_quotation');
  assert.equal(x.raw.projects[0].assigned_outdoor_sales_id, teammateId);
  assert.equal(x.raw.projects[0].assignedToYou, false);
  assert.equal(x.raw.projects[0].project_name, project.project_name);
});

test('shared additional-opening assignments retain the original measurements and permit teammate completion', async t => {
  const newOpening = { ...opening, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', width: 150 };
  const x = setup(t, { projects: [{ ...project, additional_openings_state: 'requested', additional_openings_original_ids: [opening.id] }] });
  await assert.rejects(x.client.saveFieldChange('edit-opening', projectId, { previous: opening, opening: { ...opening, width: 125 } }), /Existing measurements/);
  await x.client.saveFieldChange('opening', projectId, newOpening);
  await x.client.saveFieldChange('finish', projectId, {});
  assert.equal(x.raw.openings[0].width, opening.width);
  assert.equal(x.raw.projects[0].additional_openings_state, 'submitted');
});

test('pending local changes cannot retain a previous team after a server reassignment', async t => {
  const x = setup(t);
  await x.client.saveFieldChange('edit-opening', projectId, { previous: opening, opening: { ...opening, width: 125 } });
  const queued = x.raw.queue[0];
  const remote = { ...project, assigned_outdoor_sales_id: otherTeamId, assignedOutdoorSales: 'Other team', assignedToTeam: false, project_log_only: true };
  navigator.onLine = true;
  globalThis.fetch = async () => Response.json({ actor, projects: [remote], openings: [], queue: [] });
  const visible = await x.client.prepareOffline();
  assert.equal(visible.projects[0].project_name, project.project_name);
  assert.equal(visible.projects[0].project_log_only, true);
  assert.deepEqual(visible.openings, []);
  assert.deepEqual(visible.queue, []);
  assert.equal(x.raw.projects[0].assigned_outdoor_sales_id, otherTeamId);
  assert.equal(x.raw.projects[0].assignedToTeam, false);
  assert.deepEqual(x.raw.queue, [queued]);
  assert.deepEqual(x.raw.openings, [{ ...opening, width: 125, workArea: undefined, facadeNumber: undefined }]);
  navigator.onLine = false;
  await assert.rejects(x.client.saveFieldChange('reopen', projectId, {}), /reference only/);
});

test('a pending project removed from the server stays durable but unavailable until access is restored', async t => {
  const x = setup(t);
  await x.client.saveFieldChange('edit-opening', projectId, { previous: opening, opening: { ...opening, width: 125 } });
  const queued = x.raw.queue;
  navigator.onLine = true;
  globalThis.fetch = async () => Response.json({ actor, projects: [], openings: [], queue: [] });
  const hidden = await x.client.prepareOffline();
  assert.deepEqual(hidden.projects, []);
  assert.deepEqual(hidden.openings, []);
  assert.deepEqual(hidden.queue, []);
  assert.deepEqual(x.raw.queue, queued);
  assert.equal(x.raw.projects.length, 1);
  await assert.rejects(x.client.saveFieldChange('reopen', projectId, {}), /not available/);
  globalThis.fetch = async () => Response.json({ actor, projects: [project], openings: [opening], queue: [] });
  const restored = await x.client.prepareOffline();
  assert.equal(restored.projects[0].project_name, project.project_name);
  assert.equal(restored.openings[0].width, 125);
  assert.deepEqual(restored.queue, queued);
});

test('a refreshed team identity hides former team data while reconciling already-recorded operations safely', async t => {
  const x = setup(t);
  await x.client.saveFieldChange('edit-opening', projectId, { previous: opening, opening: { ...opening, width: 125 } });
  const operation = x.raw.queue[0];
  const freshActor = { ...actor, outdoorTeamMemberIds: [employeeId] };
  const posts = [];
  let committed = false;
  navigator.onLine = true;
  globalThis.fetch = async (url, init) => {
    if (!init?.method) return Response.json({ actor: freshActor });
    posts.push(JSON.parse(init.body));
    return committed ? Response.json({ project })
      : Response.json({ error: 'Project is not available to this employee' }, { status: 409 });
  };
  await x.client.syncFieldChanges();
  assert.deepEqual((await x.store.readFieldState()).projects, []);
  assert.deepEqual((await x.store.readFieldState()).openings, []);
  assert.equal(x.raw.queue.length, 1);
  assert.equal(x.raw.queue[0].id, operation.id);
  await assert.rejects(x.client.saveFieldChange('reopen', projectId, {}), /not available/);
  committed = true;
  await x.client.syncFieldChanges();
  assert.equal(x.raw.queue.length, 0, 'An already-committed receipt must still clear its retained queue entry');
  assert.deepEqual(posts.map(c => c.id), [operation.id, operation.id]);
  assert.deepEqual((await x.store.readFieldState()).openings, []);
});

test('reviewing a former team project preserves read-only history while rejecting media and retry access', async t => {
  const x = setup(t);
  const reference = { ...project, assigned_outdoor_sales_id: otherTeamId, assignedToTeam: false, project_log_only: true };
  globalThis.fetch = async () => Response.json({ actor, projects: [reference], openings: [opening], queue: [] });
  await assert.rejects(x.client.reviewServerProject(projectId), /no longer available/);
  const visible = await x.store.readFieldState();
  assert.equal(visible.projects[0].project_log_only, true);
  assert.deepEqual(visible.openings, []);
  await assert.rejects(x.client.retryReviewedProject(projectId, 'new-version'), /not available/);
  await assert.rejects(x.client.keepReviewedServerVersion({ project: reference, openings: [opening], measurementReports: [] }), /not available/);
  assert.deepEqual(x.raw.openings, [opening]);
});
