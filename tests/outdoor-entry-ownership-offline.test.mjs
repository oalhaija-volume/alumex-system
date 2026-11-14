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

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const teammateId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const projectId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const actor = { id: actorId, name: 'Outdoor employee', role: 'Outdoor Sales', branch: 'Najaf', outdoorTeamMemberIds: [actorId, teammateId] };
const project = {
  id: projectId, branch: 'Najaf', project_name: 'Shared measurement task', project_number: 'PRJ-OWN-ENTRY', created_by: teammateId,
  registeredBy: 'Teammate', assigned_outdoor_sales_id: teammateId, assignedOutdoorSales: 'Teammate',
  structure_readiness: 'ready', sales_status: 'new_lead', address: 'Baghdad', phone: null,
  next_follow_up_at: null, project_notes: 'Preserved project note',
  created_at: '2026-11-04T08:00:00Z', updated_at: '2026-11-04T08:00:00Z',
};
const opening = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', projectId, floor: 'GF', room: 'Kitchen', otherRoom: '',
  width: 140, height: 180, quantity: 2, structuralType: 'Window', openingType: 'Sliding',
  hasArch: false, hasRollerShutter: false, createdBy: actorId,
};

function setup(t, patch = {}) {
  const descriptors = new Map(['window', 'navigator', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  let state = structuredClone({ actor, projects: [project], openings: [opening], queue: [], syncedAt: null, ...patch });
  globalThis.window = { location: { pathname: '/offline' }, dispatchEvent() {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  const access = modules()('lib/offline/projectAccess');
  const store = {
    activeFieldUser: () => state.actor.id,
    setFieldUser() {},
    readStoredFieldState: async () => structuredClone(state),
    readFieldState: async () => access.visibleFieldState(structuredClone(state)),
    updateFieldState: async (id, update) => {
      assert.equal(id, state.actor.id);
      state = update(structuredClone(state));
      return access.visibleFieldState(structuredClone(state));
    },
  };
  return {
    client: modules({ './store': store, './device': { isOfflineDevice: () => true } })('lib/offline/client'),
    get raw() { return structuredClone(state); },
  };
}

test('a shared task permits editing an opening recorded by the current Outdoor employee', async t => {
  const x = setup(t);
  await x.client.saveFieldChange('edit-opening', projectId, { previous: opening, opening: { ...opening, width: 155, createdBy: teammateId } });
  assert.equal(x.raw.openings[0].width, 155);
  assert.equal(x.raw.openings[0].createdBy, actorId, 'Editing must preserve the stored author');
  assert.equal(x.raw.projects[0].assigned_outdoor_sales_id, teammateId);
  assert.equal(x.raw.queue.length, 1);
  assert.equal(x.raw.queue[0].payload.opening.createdBy, undefined, 'The durable edit payload must not set ownership');
});

for (const createdBy of [teammateId, null, undefined]) test(`a shared task denies another or unknown opening author: ${String(createdBy)}`, async t => {
  const stored = { ...opening, createdBy };
  const x = setup(t, { openings: [stored] });
  const before = x.raw;
  await assert.rejects(x.client.saveFieldChange('edit-opening', projectId, {
    previous: { ...stored, createdBy: actorId }, opening: { ...stored, width: 155, createdBy: actorId },
  }), /You can edit only openings you recorded\./);
  assert.deepEqual(x.raw, before, 'Denied edits must change neither measurements nor the durable queue');
});

test('registering the project does not grant permission to edit somebody else’s openings', async t => {
  const stored = { ...opening, createdBy: teammateId };
  const x = setup(t, { projects: [{ ...project, created_by: actorId }], openings: [stored] });
  await assert.rejects(x.client.saveFieldChange('edit-opening', projectId, { previous: stored, opening: { ...stored, height: 190 } }), /only openings you recorded/);
  assert.equal(x.raw.queue.length, 0);
  assert.equal(x.raw.openings[0].height, 180);
});

test('a teammate can add a new owned opening, then edit it without forging its stored author', async t => {
  const x = setup(t, { openings: [] });
  const forged = { ...opening, createdBy: teammateId };
  await x.client.saveFieldChange('opening', projectId, forged);
  const recorded = x.raw.openings[0];
  assert.equal(recorded.createdBy, actorId);
  assert.equal(x.raw.queue[0].payload.createdBy, undefined);
  await x.client.saveFieldChange('edit-opening', projectId, { previous: recorded, opening: { ...recorded, width: 165, createdBy: teammateId } });
  assert.equal(x.raw.openings[0].width, 165);
  assert.equal(x.raw.openings[0].createdBy, actorId);
  assert.deepEqual(x.raw.queue.map(change => change.action), ['opening', 'edit-opening']);
});

test('measurement task workflow remains shared while project-name editing stays with its creator', async t => {
  const x = setup(t, { projects: [{ ...project, sales_status: 'ready_for_quotation' }] });
  await x.client.saveFieldChange('reopen', projectId, {});
  await x.client.saveFieldChange('finish', projectId, {});
  await assert.rejects(x.client.saveFieldChange('rename-project', projectId, { projectName: 'Teammate cannot rename this' }), /Only|only/);
  assert.deepEqual(x.raw.queue.map(change => change.action), ['reopen', 'finish']);
  assert.equal(x.raw.projects[0].project_name, project.project_name);
});

test('Indoor Sales keeps its existing permission to edit an opening with unknown original ownership', async t => {
  const old = { ...opening, createdBy: null };
  const x = setup(t, { actor: { ...actor, role: 'Indoor Sales', branch: 'Karkh' }, projects: [{ ...project, branch: 'Karkh' }], openings: [old] });
  await x.client.saveFieldChange('edit-opening', projectId, { previous: old, opening: { ...old, width: 155 } });
  assert.equal(x.raw.openings[0].width, 155);
  assert.equal(x.raw.openings[0].createdBy, null);
});
