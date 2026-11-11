import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectId = '11111111-1111-4111-8111-111111111111';
const originalVersion = '2026-11-11T09:00:00.123456+00:00';
const savedVersion = '2026-11-11T10:00:00.123456+00:00';
const assignment = { id: projectId, follow_up_owner_id: 'new-owner', followUpOwner: 'New owner', updated_at: savedVersion };

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

function fixture({ target = {}, queue = [], beforeWrite } = {}) {
  let state = {
    actor: { id: actorId, role: 'Admin' },
    projects: [{
      id: projectId, project_number: 'PRJ-CACHE', project_name: 'Existing project', client_name: 'Original client',
      created_by: 'original-creator', assigned_outdoor_sales_id: 'measurement-owner', branch: 'Karkh',
      sales_status: 'quotation_in_progress', next_follow_up_at: '2026-11-12T09:00:00Z',
      follow_up_type: 'call', project_notes: 'Saved customer conversation',
      follow_up_owner_id: 'old-owner', followUpOwner: 'Old owner',
      updated_at: originalVersion, serverUpdatedAt: originalVersion, pending: false, ...target,
    }, { id: 'unrelated-project', project_name: 'Other project', pending: true }],
    queue, openings: [{ id: 'opening-fixture', projectId, width: 125 }],
    followUpHistories: { [projectId]: [{ note: 'Previous history entry' }] }, syncedAt: null,
  };
  const original = state;
  let writes = 0;
  const store = {
    activeFieldUser: () => actorId,
    readStoredFieldState: async id => { assert.equal(id, actorId); return state; },
    updateFieldState: async (id, change) => {
      assert.equal(id, actorId); writes++;
      if (beforeWrite) state = beforeWrite(state);
      state = change(state);
    },
  };
  const { updateSavedIndoorSales } = modules({ './store': store })('lib/offline/client');
  return { original, get state() { return state; }, get writes() { return writes; }, save: () => updateSavedIndoorSales(actorId, assignment) };
}

test('a saved assignment updates only its cached metadata and version, retaining all workflow data', async () => {
  const queuedOtherProject = [{ id: 'other-work', projectId: 'unrelated-project', action: 'opening', payload: { width: 100 } }];
  const f = fixture({ queue: queuedOtherProject });
  await f.save();
  assert.equal(f.writes, 1);
  assert.deepEqual(f.state, {
    ...f.original,
    projects: [{ ...f.original.projects[0], ...assignment, serverUpdatedAt: savedVersion }, f.original.projects[1]],
  });
  assert.strictEqual(f.state.projects[1], f.original.projects[1]);
  assert.strictEqual(f.state.queue, queuedOtherProject);
  assert.strictEqual(f.state.openings, f.original.openings);
  assert.strictEqual(f.state.followUpHistories, f.original.followUpHistories);
});

test('pending projects retain their exact local row and original server version', async () => {
  const f = fixture({ target: { pending: true, project_notes: 'Unsynced conversation', follow_up_owner_id: 'local-owner' } });
  await f.save();
  assert.strictEqual(f.state.projects[0], f.original.projects[0]);
  assert.equal(f.state.projects[0].serverUpdatedAt, originalVersion);
  assert.equal(f.state.projects[0].follow_up_owner_id, 'local-owner');
});

test('queued work blocks cache rebasing even before the pending flag is set', async () => {
  const queue = [{ id: 'queued-follow-up', projectId, action: 'follow-up', payload: { followUpOwnerId: 'old-owner', nextFollowUp: '2026-11-13T09:00:00Z', note: 'Unsynced conversation' } }];
  const f = fixture({ queue });
  await f.save();
  assert.strictEqual(f.state.projects[0], f.original.projects[0]);
  assert.strictEqual(f.state.queue, queue);
  assert.equal(f.state.projects[0].serverUpdatedAt, originalVersion);
});

test('work queued while the cache update is awaiting storage retains its original conflict version', async () => {
  const queue = [{ id: 'late-follow-up', projectId, action: 'follow-up', payload: { followUpOwnerId: 'old-owner' } }];
  const f = fixture({ beforeWrite: state => ({ ...state, queue }) });
  await f.save();
  assert.strictEqual(f.state.projects[0], f.original.projects[0]);
  assert.strictEqual(f.state.queue, queue);
  assert.equal(f.state.projects[0].serverUpdatedAt, originalVersion);
});

test('a response older than the cached server snapshot cannot replace a later assignment', async () => {
  const future = '2026-11-11T11:00:00.123456+00:00';
  for (const target of [
    { serverUpdatedAt: future, updated_at: originalVersion },
    { serverUpdatedAt: undefined, updated_at: future },
  ]) {
    const f = fixture({ target: { ...target, follow_up_owner_id: 'newer-owner', followUpOwner: 'Newer owner' } });
    await f.save();
    assert.strictEqual(f.state.projects[0], f.original.projects[0]);
    assert.equal(f.state.projects[0].follow_up_owner_id, 'newer-owner');
  }
});

test('assignment cache updates do not create snapshots or modify an unrelated active account', async () => {
  for (const [active, stored] of [['different-account', {}], [null, {}], [actorId, null]]) {
    const store = {
      activeFieldUser: () => active,
      readStoredFieldState: async id => { assert.equal(id, actorId); return stored; },
      updateFieldState: async () => assert.fail('An absent or different account must not be updated'),
    };
    const { updateSavedIndoorSales } = modules({ './store': store })('lib/offline/client');
    await updateSavedIndoorSales(actorId, assignment);
  }
});
