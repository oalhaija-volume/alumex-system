import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../src/lib/offline/store.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const actor = { id: 'employee', role: 'Outdoor Sales' };
const original = { actor, projects: [], openings: [], queue: [], syncedAt: null };
const flush = () => new Promise(resolve => setImmediate(resolve));

function storage() {
  const records = new Map([[actor.id, structuredClone(original)]]);
  const settings = new Map([['alumex-field-active', actor.id]]);
  const timers = new Map();
  const opens = [];
  const transactions = [];
  const events = [];
  let nextTimer = 0;
  let closes = 0;
  const db = {
    close() { closes++; },
    transaction(_name, mode) {
      const pending = [];
      const tx = {
        mode,
        aborted: false,
        abort() { tx.aborted = true; pending.length = 0; tx.onabort?.(); },
        objectStore() {
          return {
            get(id) { tx.read = { id }; return tx.read; },
            put(value, id) { pending.push([id, structuredClone(value)]); },
          };
        },
        readSuccess() {
          tx.read.result = structuredClone(records.get(tx.read.id));
          tx.read.onsuccess();
        },
        commit() {
          assert.equal(tx.aborted, false);
          for (const [id, value] of pending) records.set(id, value);
          tx.oncomplete();
        },
      };
      transactions.push(tx);
      return tx;
    },
  };
  const exports = {};
  new Function('require', 'exports', 'indexedDB', 'localStorage', 'window', 'setTimeout', 'clearTimeout', 'Event', 'CustomEvent', compiled)(
    name => { assert.equal(name, './projectAccess'); return { visibleFieldState: state => state }; },
    exports,
    { open() { const request = {}; opens.push(request); return request; } },
    { getItem: key => settings.get(key) ?? null, setItem: (key, value) => settings.set(key, value), removeItem: key => settings.delete(key) },
    { dispatchEvent: event => events.push(event) },
    (callback, delay) => { assert.equal(delay, 5000); timers.set(++nextTimer, callback); return nextTimer; },
    id => timers.delete(id),
    Event,
    class extends Event { constructor(type, options) { super(type); this.detail = options.detail; } },
  );
  return {
    store: exports, records, opens, transactions, events, db,
    get closes() { return closes; },
    get active() { return settings.get('alumex-field-active'); },
    get timerCount() { return timers.size; },
    expire() { for (const callback of [...timers.values()]) callback(); },
    async open(index=opens.length-1) { const request = opens[index]; request.result = db; request.onsuccess(); await flush(); return transactions.at(-1); },
  };
}

for (const operation of ['read', 'write']) {
  test(`${operation} rejects a hung database open and closes a late connection`, async () => {
    const x = storage();
    const pending = operation === 'read' ? x.store.readStoredFieldState() : x.store.updateFieldState(actor.id, () => assert.fail('A failed open must not write'));
    const rejected = assert.rejects(pending, /storage.*unavailable/i);
    x.expire();
    await rejected;
    await x.open();
    assert.equal(x.closes, 1);
    assert.equal(x.transactions.length, 0);
    assert.equal(x.active, actor.id);
    assert.deepEqual(x.records.get(actor.id), original);
    assert.equal(x.timerCount, 0);
  });

  test(`${operation} rejects a hung transaction without changing stored work or the account`, async () => {
    const x = storage();
    const pending = operation === 'read' ? x.store.readStoredFieldState() : x.store.updateFieldState(actor.id, state => ({ ...state, queue: [{ id: 'saved-opening' }] }));
    const rejected = assert.rejects(pending, /storage.*unavailable/i);
    const tx = await x.open();
    if (operation === 'write') tx.readSuccess();
    x.expire();
    await rejected;
    assert.equal(tx.aborted, true);
    assert.deepEqual(x.records.get(actor.id), original);
    assert.equal(x.events.length, 0);
    assert.equal(x.active, actor.id);
    assert.equal(x.closes, 1);
    assert.equal(x.timerCount, 0);
  });
}

test('blocked database opens reject and a later upgrade cannot change the database', async () => {
  const x = storage();
  const pending = x.store.readStoredFieldState();
  const rejected = assert.rejects(pending, /storage.*unavailable/i);
  const request = x.opens[0];
  request.onblocked();
  await rejected;
  let aborted = false;
  request.transaction = { abort() { aborted = true; } };
  request.onupgradeneeded();
  assert.equal(aborted, true);
  await x.open();
  assert.equal(x.closes, 1);
  assert.equal(x.timerCount, 0);
});

test('a read succeeds only when its transaction completes and closes on version changes', async () => {
  const x = storage();
  let finished = false;
  const pending = x.store.readStoredFieldState().then(value => { finished = true; return value; });
  const tx = await x.open();
  tx.readSuccess();
  await flush();
  assert.equal(finished, false);
  x.db.onversionchange();
  assert.equal(x.closes, 1);
  tx.commit();
  assert.deepEqual(await pending, original);
  assert.equal(x.timerCount, 0);
});

test('an aborted first opening save rejects; retry reports success only after durable completion', async () => {
  const x = storage();
  const opening = { id: 'first-opening', projectId: 'project', width: 100, height: 150 };
  const change = state => ({ ...state, openings: [opening], queue: [{ id: 'change', action: 'opening', projectId: opening.projectId, payload: opening }] });
  const pending = x.store.updateFieldState(actor.id, change);
  const rejected = assert.rejects(pending, /changes have not been saved/i);
  const first = await x.open();
  first.readSuccess();
  first.abort();
  await rejected;
  assert.deepEqual(x.records.get(actor.id), original);
  assert.equal(x.events.length, 0);

  let saved = false;
  const retry = x.store.updateFieldState(actor.id, change, 'snapshot').then(state => { saved = true; return state; });
  const second = await x.open();
  second.readSuccess();
  await flush();
  assert.equal(saved, false);
  assert.equal(x.events.length, 0);
  assert.deepEqual(x.records.get(actor.id), original);
  second.commit();
  const result = await retry;
  assert.deepEqual(result.openings, [opening]);
  assert.deepEqual(x.records.get(actor.id), result);
  assert.equal(x.events.length, 1);
  assert.deepEqual(x.events[0].detail, { source: 'snapshot', userId: actor.id });
  assert.equal(x.active, actor.id);
  assert.equal(x.timerCount, 0);
});

test('a failed storage request rejects instead of waiting for transaction completion', async () => {
  const x = storage();
  const pending = x.store.readStoredFieldState();
  const rejected = assert.rejects(pending, /storage.*unavailable/i);
  const tx = await x.open();
  tx.read.onerror();
  await rejected;
  assert.equal(x.closes, 1);
  assert.equal(x.timerCount, 0);
});

test('a change callback failure preserves its error and aborts the uncommitted write', async () => {
  const x = storage();
  const pending = x.store.updateFieldState(actor.id, () => { throw new Error('Opening details changed.'); });
  const rejected = assert.rejects(pending, /Opening details changed/);
  const tx = await x.open();
  tx.readSuccess();
  await rejected;
  assert.equal(tx.aborted, true);
  assert.deepEqual(x.records.get(actor.id), original);
  assert.equal(x.events.length, 0);
  assert.equal(x.timerCount, 0);
});

test('concurrent account readers share one IndexedDB load without keeping a completed snapshot', async () => {
  const x = storage();
  const pending = [x.store.readStoredFieldState(), x.store.readStoredFieldState(), x.store.readFieldState()];
  assert.equal(x.opens.length, 1);
  const first = await x.open();
  first.readSuccess();first.commit();
  for (const result of await Promise.all(pending)) assert.deepEqual(result, original);
  assert.equal(x.transactions.length, 1);
  const changed = { ...original, syncedAt: 'new-server-snapshot' };
  x.records.set(actor.id, changed);
  const subsequent = x.store.readStoredFieldState();
  assert.equal(x.opens.length, 2, 'A later read must load storage again');
  const second = await x.open();second.readSuccess();second.commit();
  assert.deepEqual(await subsequent, changed);
  assert.equal(x.timerCount, 0);
});

test('concurrent raw reads never share data across employee accounts', async () => {
  const x = storage();
  const other = { ...original, actor: { ...actor, id: 'other-employee' }, queue: [{ id: 'other-private-change' }] };
  x.records.set(other.actor.id, other);
  const firstPending = x.store.readStoredFieldState(actor.id);
  const secondPending = x.store.readStoredFieldState(other.actor.id);
  assert.equal(x.opens.length, 2);
  const first = await x.open(0), second = await x.open(1);
  first.readSuccess();second.readSuccess();second.commit();first.commit();
  assert.deepEqual(await firstPending, original);
  assert.deepEqual(await secondPending, other);
  assert.equal(x.timerCount, 0);
});

test('a write invalidates an older read and coalesces subscribers on the committed record', async () => {
  const x = storage();
  let oldFinished = false, newFinished = false;
  const oldPending = x.store.readStoredFieldState().then(state => { oldFinished = true; return state; });
  const oldRead = await x.open();oldRead.readSuccess();
  const opening = { id: 'first-opening', projectId: 'project', width: 100, height: 150 };
  const saving = x.store.updateFieldState(actor.id, state => ({ ...state, openings: [opening], queue: [{ id: 'pending-opening' }] }));
  const newPending = x.store.readStoredFieldState().then(state => { newFinished = true; return state; });
  assert.equal(x.opens.length, 2, 'Readers arriving during a save wait for its transaction');
  const write = await x.open();write.readSuccess();
  oldRead.commit();await flush();
  assert.equal(oldFinished, false, 'An invalidated read must not deliver its pre-save result');
  assert.equal(newFinished, false);
  write.commit();await saving;await flush();
  assert.equal(x.opens.length, 3, 'All subscribers share a single fresh read after the save');
  const fresh = await x.open();fresh.readSuccess();fresh.commit();
  const [oldResult, newResult] = await Promise.all([oldPending, newPending]);
  assert.deepEqual(oldResult.openings, [opening]);
  assert.deepEqual(newResult, oldResult);
  assert.equal(x.transactions.filter(tx => tx.mode === 'readonly').length, 2);
  assert.equal(x.timerCount, 0);
});

test('a failed shared read rejects every waiter and a retry starts a fresh storage load', async () => {
  const x = storage();
  const one = x.store.readStoredFieldState(), two = x.store.readStoredFieldState();
  const rejected = Promise.all([assert.rejects(one, /storage.*unavailable/i), assert.rejects(two, /storage.*unavailable/i)]);
  const failed = await x.open();failed.abort();await rejected;
  const retry = x.store.readStoredFieldState();
  assert.equal(x.opens.length, 2);
  const fresh = await x.open();fresh.readSuccess();fresh.commit();
  assert.deepEqual(await retry, original);
  assert.equal(x.timerCount, 0);
});

test('switching accounts isolates new reads and prevents an older UI read from returning private data', async () => {
  const x = storage();
  const other = { ...original, actor: { ...actor, id: 'other-employee' } };
  x.records.set(other.actor.id, other);
  const previous = x.store.readFieldState();
  const oldRead = await x.open();oldRead.readSuccess();
  x.store.setFieldUser(other.actor.id);
  const current = x.store.readFieldState();
  assert.equal(x.opens.length, 2);
  const newRead = await x.open();newRead.readSuccess();newRead.commit();
  assert.deepEqual(await current, other);
  oldRead.commit();await flush();
  // The invalidated raw request may reload its explicitly scoped account, but
  // the UI must discard it once that account is no longer signed in.
  const oldRetry = await x.open();oldRetry.readSuccess();oldRetry.commit();
  assert.equal(await previous, null);
  assert.equal(x.active, other.actor.id);
  assert.equal(x.timerCount, 0);
});
