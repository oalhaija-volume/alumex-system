import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const transpile = path => ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const loaderExports = {};
new Function('exports', transpile('src/lib/workflow/resourceLoader.ts'))(loaderExports);
const { createResourceLoader } = loaderExports;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
};
function loaderFixture() {
  const requests = [], values = [], errors = [];
  let settled = 0;
  const loader = createResourceLoader({
    load(signal) { const request = deferred(); requests.push({ ...request, signal }); return request.promise; },
    onData: value => values.push(value), onError: error => errors.push(error), onSettled: () => settled++,
  });
  return { loader, requests, values, errors, settled: () => settled };
}

test('a fresh explicit reload cannot be overwritten by an older initial request', async () => {
  const f = loaderFixture(), initial = f.loader.refresh(), reloaded = f.loader.refresh(true, true);
  f.requests[1].resolve({ next_follow_up_at: '2026-11-12T09:00:00Z' }); await reloaded;
  f.requests[0].resolve({ next_follow_up_at: '2026-11-10T09:00:00Z' }); await initial;
  assert.deepEqual(f.values, [{ next_follow_up_at: '2026-11-12T09:00:00Z' }]);
  assert.deepEqual(f.errors, []); assert.equal(f.settled(), 1); assert.equal(f.loader.isLoading(), false);
});

test('a mutation invalidates an old poll immediately while the replacement read is debounced', async () => {
  const f = loaderFixture(), initial = f.loader.refresh();
  f.requests[0].resolve('old-overdue-date'); await initial;
  const poll = f.loader.refresh();
  f.loader.invalidate();
  f.requests[1].resolve('old-overdue-date'); await poll;
  assert.deepEqual(f.values, ['old-overdue-date'], 'The invalidated poll must not publish again');
  const refresh = f.loader.refresh(true);
  f.requests[2].resolve('new-future-date'); await refresh;
  assert.deepEqual(f.values, ['old-overdue-date', 'new-future-date']);
});

test('superseded background failures cannot replace a successful reload with an error', async () => {
  const f = loaderFixture(), poll = f.loader.refresh(), fresh = f.loader.refresh(true, true);
  f.requests[1].resolve('future'); await fresh;
  f.requests[0].reject(new Error('Old request failed')); await poll;
  assert.deepEqual(f.values, ['future']); assert.deepEqual(f.errors, []); assert.equal(f.settled(), 1);
});

test('an explicit reload still rejects when the current request fails', async () => {
  const f = loaderFixture(), reload = f.loader.refresh(true, true), failure = new Error('Reload failed');
  const rejected = assert.rejects(reload, failure);
  f.requests[0].reject(failure); await rejected;
  assert.deepEqual(f.errors, [failure]); assert.equal(f.settled(), 1); assert.equal(f.loader.isLoading(), false);
});

test('a superseded explicit reload failure cannot reach the caller after a newer reload succeeds', async () => {
  const f = loaderFixture(), callerErrors = [];
  const old = f.loader.refresh(true, true).catch(error => callerErrors.push(error));
  const current = f.loader.refresh(true, true);
  f.requests[1].resolve('new future date'); await current;
  f.requests[0].reject(new Error('Old explicit reload failed')); await old;
  assert.deepEqual(f.values, ['new future date']); assert.deepEqual(f.errors, []); assert.deepEqual(callerErrors, []);
});

test('background polls share an in-flight read but a forced reload supersedes it', async () => {
  const f = loaderFixture(), initial = f.loader.refresh();
  await f.loader.refresh(); assert.equal(f.requests.length, 1);
  const fresh = f.loader.refresh(true); assert.equal(f.requests.length, 2);
  f.requests[0].resolve('old'); f.requests[1].resolve('new'); await Promise.all([initial, fresh]);
  assert.deepEqual(f.values, ['new']);
});

test('unmount or a URL change aborts the loader and blocks every late state update', async () => {
  const f = loaderFixture(), request = f.loader.refresh();
  f.loader.dispose(); assert.equal(f.requests[0].signal.aborted, true);
  f.requests[0].resolve('old account or URL'); await request;
  await f.loader.refresh(true, true);
  assert.deepEqual(f.values, []); assert.deepEqual(f.errors, []); assert.equal(f.settled(), 0); assert.equal(f.requests.length, 1);
});

test('disposing a manual reload suppresses its late error at the caller as well as the hook', async () => {
  const f = loaderFixture(), callerErrors = [];
  const request = f.loader.refresh(true, true).catch(error => callerErrors.push(error));
  f.loader.dispose(); f.requests[0].reject(new Error('Old account request aborted')); await request;
  assert.deepEqual(f.errors, []); assert.deepEqual(callerErrors, []); assert.equal(f.settled(), 0);
});

test('account invalidation excludes the old account response before the new read completes', async () => {
  const f = loaderFixture(), old = f.loader.refresh();
  f.loader.invalidate(); const current = f.loader.refresh(true);
  f.requests[0].resolve({ actor: { id: 'previous' } }); await old;
  assert.deepEqual(f.values, []);
  f.requests[1].resolve({ actor: { id: 'current' } }); await current;
  assert.deepEqual(f.values, [{ actor: { id: 'current' } }]);
});

const eventSource = transpile('src/lib/workflow/workspaceEvents.ts');
function eventHub({ broadcast = true, blockedStorage = false } = {}) {
  const channels = new Set(), messages = [], stored = [];
  class Channel extends EventTarget {
    constructor(name) { super(); this.name = name; channels.add(this); }
    postMessage(value) {
      messages.push(value);
      for (const channel of channels) if (channel !== this && channel.name === this.name) {
        queueMicrotask(() => { if (channels.has(channel)) channel.dispatchEvent(new MessageEvent('message', { data: value })); });
      }
    }
    close() { channels.delete(this); }
  }
  const windows = [];
  function tab(id) {
    const target = new EventTarget();
    const browser = {
      addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target), dispatchEvent: target.dispatchEvent.bind(target),
      BroadcastChannel: broadcast ? Channel : undefined,
      localStorage: { setItem(key, newValue) {
        if (blockedStorage) throw new Error('Storage unavailable');
        stored.push({ key, newValue });
        for (const other of windows) if (other !== browser) {
          const event = new Event('storage'); Object.assign(event, { key, newValue }); other.dispatchEvent(event);
        }
      } },
    };
    windows.push(browser);
    const exports = {};
    new Function('exports', 'window', 'crypto', eventSource)(exports, browser, { randomUUID: () => id });
    return { ...exports, browser };
  }
  return { tab, messages, stored, channels };
}
const flushMessages = () => new Promise(resolve => queueMicrotask(resolve));

test('a committed mutation refreshes its own window once and another tab without sharing project data', async () => {
  const hub = eventHub(), a = hub.tab('tab-a'), b = hub.tab('tab-b'); let own = 0, other = 0;
  const stopA = a.subscribeWorkspaceChanges(() => own++), stopB = b.subscribeWorkspaceChanges(() => other++);
  a.notifyWorkspaceChanged(); await flushMessages();
  assert.equal(own, 1); assert.equal(other, 1);
  assert.deepEqual(hub.messages, [{ type: 'workspace-changed', source: 'tab-a' }]);
  assert.deepEqual(hub.stored, []);
  stopA(); stopB(); assert.equal(hub.channels.size, 0);
});

test('an offline queued follow-up refreshes local listeners without notifying other tabs of a server save', async () => {
  const hub = eventHub(), a = hub.tab('tab-a'), b = hub.tab('tab-b'); let own = 0, other = 0;
  const stopA = a.subscribeWorkspaceChanges(() => own++), stopB = b.subscribeWorkspaceChanges(() => other++);
  a.notifyWorkspaceChanged(false); await flushMessages();
  assert.equal(own, 1); assert.equal(other, 0); assert.deepEqual(hub.messages, []); assert.deepEqual(hub.stored, []);
  stopA(); stopB();
});

test('storage events refresh other tabs when BroadcastChannel is unavailable', () => {
  const hub = eventHub({ broadcast: false }), a = hub.tab('tab-a'), b = hub.tab('tab-b'); let own = 0, other = 0;
  const stopA = a.subscribeWorkspaceChanges(() => own++), stopB = b.subscribeWorkspaceChanges(() => other++);
  a.notifyWorkspaceChanged(); assert.equal(own, 1); assert.equal(other, 1); assert.equal(hub.stored.length, 1);
  assert.equal(hub.stored[0].key, 'alumex-workspace-change');
  stopA(); stopB();
});

test('blocked storage cannot fail a saved mutation and disposed subscriptions receive no further events', async () => {
  const hub = eventHub({ broadcast: false, blockedStorage: true }), a = hub.tab('tab-a'); let count = 0;
  const stop = a.subscribeWorkspaceChanges(() => count++);
  assert.doesNotThrow(() => a.notifyWorkspaceChanged()); assert.equal(count, 1);
  stop(); a.notifyWorkspaceChanged(); await flushMessages(); assert.equal(count, 1);
});

test('invalid cross-tab messages are ignored', async () => {
  const hub = eventHub(), a = hub.tab('tab-a'); let count = 0;
  const stop = a.subscribeWorkspaceChanges(() => count++), sender = new a.browser.BroadcastChannel('alumex-workspace-changes');
  for (const value of [null, 'workspace-changed', {}, { type: 'wrong', source: 'other' }, { type: 'workspace-changed', source: 'tab-a' }]) sender.postMessage(value);
  await flushMessages(); assert.equal(count, 0); sender.close(); stop();
});

function apiFixture({ response = { ok: true }, status = 200 } = {}) {
  const notices = [], requests = [], exports = {};
  const fetch = async (url, init) => { requests.push({ url, init }); return { ok: status >= 200 && status < 300, json: async () => response }; };
  const dependencies = {
    '@/components/i18n/I18nProvider': {}, '@/lib/offline/client': { fieldFetch: fetch },
    '@/lib/workflow/resourceLoader': loaderExports,
    '@/lib/workflow/workspaceEvents': { notifyWorkspaceChanged: committed => notices.push(committed) },
    'react': {}, 'react/jsx-runtime': {},
  };
  new Function('require', 'exports', 'fetch', transpile('src/components/workflow/ui.tsx'))(name => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, exports, fetch);
  return { api: exports.api, notices, requests };
}

test('only a successful workspace PATCH broadcasts a committed refresh', async () => {
  const f = apiFixture();
  await f.api('/api/workspace', { method: 'PATCH' });
  assert.deepEqual(f.notices, [true]); assert.equal(f.requests.length, 1);
  await f.api('/api/workspace'); await f.api('/api/catalog', { method: 'PATCH' });
  assert.deepEqual(f.notices, [true]);
});

test('failed saves send no workspace notification', async () => {
  const f = apiFixture({ status: 409, response: { error: 'Project changed' } });
  await assert.rejects(f.api('/api/workspace', { method: 'PATCH' }), /Project changed/);
  assert.deepEqual(f.notices, []);
});

test('pending offline saves request local refresh without a committed cross-tab signal', async () => {
  const f = apiFixture({ response: { pending: true } });
  await f.api('/api/workspace', { method: 'PATCH' }); assert.deepEqual(f.notices, [false]);
});
