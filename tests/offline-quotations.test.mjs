import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

function modules(dependencies = {}) {
  const cache = new Map();
  const load = url => {
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {}; cache.set(url.href, exports);
    const code = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function('require', 'exports', code)(name => Object.hasOwn(dependencies, name) ? dependencies[name] : load(name.startsWith('@/') ? new URL(`../src/${name.slice(2)}.ts`, import.meta.url) : new URL(`${name}.ts`, url)), exports);
    return exports;
  };
  return path => load(new URL(`../src/${path}.${path.startsWith('components/') ? 'tsx' : 'ts'}`, import.meta.url));
}
const pricing = modules()('lib/workflow/pricing');
const actor = { id: 'b1527c5b-dfee-4336-ae1b-88acf76a5060', role: 'Indoor Sales', name: 'Fixture indoor', branch: 'Karkh' };
const projectId = '11111111-1111-4111-8111-111111111111';
const otherProjectId = '22222222-2222-4222-8222-222222222222';
const catalog = [{ id: 'system', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true }];
const opening = { id: 'window', width: 100, height: 100, quantity: 1, floor: 'GF', room: 'Office', opening_type: 'Window', opening_direction: 'Sliding' };
const body = (rate = 280000, revision = 1) => ({ action: 'save', revision, choices: [{ openingId: 'window', systemId: 'system', systemRate: rate, extras: [] }], newOpenings: [], excludedOpeningIds: [], additionalItems: [], discountPercent: 0 });
const priceBody = (rate = 280000, revision = 1) => ({ action: 'save-shared-prices', revision, systemRates: [{ openingId: 'window', rate }], additionalRates: [] });

function quotationData({ shared = false, id = projectId, revision = 1, rate = 250000 } = {}) {
  const quotation = pricing.priceQuotation([opening], [{ openingId: 'window', systemId: 'system', systemRate: rate, extras: [] }], catalog, 'original-author');
  quotation.version = revision;
  quotation.createdAt = '2026-11-23T08:00:00Z';
  return { quotationAccess: shared ? 'prices' : 'full', project: { id, branch: shared ? 'Rasafa' : 'Karkh', project_number: `PRJ-${id.slice(0, 4)}`, project_name: 'Quotation fixture', address: 'Baghdad', sales_status: 'quotation_in_progress' }, client: { name: 'Fixture client', mobile: '07000000000' }, openings: [opening], catalog, flow: { project_id: id, revision, stage: 'quotation', quotation, contract: null, evidence: null, signed_at: null, accepted_at: null, accepted_by: null }, history: [] };
}

function fixture({ shared = false, role = 'Indoor Sales', cached = true } = {}) {
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  let active = actor.id;
  const data = quotationData({ shared });
  const records = new Map([[actor.id, { actor: { ...actor, role }, projects: [], openings: [], queue: [], syncedAt: null, quotations: { entries: cached ? [{ projectId, data, available: true, downloadedAt: '2026-11-23T08:00:00Z' }] : [], queue: [], archived: [], downloadedAt: null } }]]);
  let failStorage = false, holdSave;
  const writes = [];
  const store = {
    activeFieldUser: () => active,
    readStoredFieldState: async (id = active) => structuredClone(records.get(id) ?? null),
    updateFieldState: async (id, change) => {
      if (failStorage) throw new Error('Device storage is full. Your changes have not been saved.');
      const next = change(structuredClone(records.get(id) ?? null));
      if (holdSave) await holdSave;
      records.set(id, structuredClone(next)); writes.push(id); events.dispatchEvent(new Event('field-change'));
      return structuredClone(next);
    },
  };
  const client = modules({ './store': store })('lib/offline/quotations');
  let handler = () => { throw new Error('Network unavailable'); };
  const requests = [];
  globalThis.fetch = async (url, init = {}) => { requests.push({ url, init }); return handler(String(url), init); };
  return {
    client, data, records, writes, requests, store,
    get state() { return structuredClone(records.get(actor.id)); },
    get operation() { return structuredClone(records.get(actor.id).quotations.queue[0]); },
    online(value = true) { navigator.onLine = value; },
    network(callback) { handler = callback; },
    storageFailure(value = true) { failStorage = value; },
    hold(value) { holdSave = value; },
    switchAccount(id) {
      active = id;
      if (id && !records.has(id)) records.set(id, { ...structuredClone(records.get(actor.id)), actor: { ...actor, id }, quotations: { entries: [], queue: [], archived: [], downloadedAt: null } });
      const event = new Event('field-change'); event.detail = { source: 'account', userId: id }; events.dispatchEvent(event);
    },
    post: request => client.quotationFetch(`/api/sales-flow/${projectId}`, { method: 'POST', body: JSON.stringify(request), headers: { 'Content-Type': 'application/json' } }),
    get: () => client.quotationFetch(`/api/sales-flow/${projectId}`),
  };
}
const response = data => Response.json(data, { headers: { 'X-Alumex-Actor': actor.id } });
const session = () => response({ actor });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('offline Save returns only after durable storage and serves a pending local projection', async () => {
  const x = fixture(); let release, completed = false;
  x.hold(new Promise(resolve => { release = resolve; }));
  const saving = x.post(body()).then(result => { completed = true; return result; });
  await tick(); assert.equal(completed, false); assert.equal(x.state.quotations.queue.length, 0);
  release(); const result = await saving;
  assert.equal(result.status, 200); assert.equal((await result.json()).pending, true);
  assert.equal(x.state.quotations.queue.length, 1);
  const saved = await (await x.get()).json();
  assert.equal(saved.flow.quotation.total, 280000); assert.equal(saved.flow.revision, 1);
  assert.equal(saved.offlineQuotation.pending, true); assert.equal(x.requests.length, 0);
});

test('failed device storage never reports a saved quotation or sends a network write', async () => {
  const x = fixture(); x.storageFailure();
  assert.equal((await x.post(body())).status, 409);
  assert.equal(x.state.quotations.queue.length, 0); assert.equal(x.requests.length, 0);
});

test('unattempted saves coalesce without changing original base revision or unrelated records', async () => {
  const x = fixture(); const before = x.state;
  await x.post(body()); const first = x.operation;
  await x.post(body(300000));
  assert.equal(x.state.quotations.queue.length, 1); assert.equal(x.operation.id, first.id);
  assert.equal(x.operation.body.revision, 1); assert.equal(x.operation.draft.flow.quotation.total, 300000);
  assert.deepEqual(x.operation.base, first.base); assert.deepEqual(x.state.projects, before.projects);
});

test('shared grants have their own offline discovery and cannot queue full quotation edits', async () => {
  const x = fixture({ shared: true });
  assert.equal((await x.post(body())).status, 409);
  assert.equal((await x.post(priceBody())).status, 200);
  const data = await (await x.get()).json(); assert.equal(data.project.branch, 'Rasafa'); assert.equal(data.quotationAccess, 'prices');
  assert.deepEqual(data.flow.quotation.lines[0].opening, x.data.flow.quotation.lines[0].opening);
  const list = await (await x.client.quotationFetch('/api/shared-quotations')).json(); assert.equal(list.projects[0].id, projectId);
  assert.equal(x.state.projects.length, 0, 'Shared commercial access does not join generic branch-scoped projects');
});

test('offline approval, signatures, catalog refresh and contract generation cannot be queued', async () => {
  const x = fixture();
  for (const action of ['approve', 'sign', 'contract', 'preview-prices', 'update-prices', 'set-discount', 'save-contract-details']) assert.equal((await x.post({ action, revision: 1 })).status, 409);
  assert.equal(x.state.quotations.queue.length, 0); assert.equal(x.requests.length, 0);
});

test('cached locks, price minimums, field queues and ordinary branch restrictions remain enforced', async () => {
  const x = fixture();
  assert.equal((await x.post(body(239999))).status, 409);
  x.records.get(actor.id).queue.push({ projectId, id: 'measurement', action: 'finish' });
  assert.equal((await x.post(body())).status, 409); x.records.get(actor.id).queue = [];
  x.records.get(actor.id).quotations.entries[0].data.flow.signed_at = '2026-11-23T10:00:00Z';
  assert.equal((await x.post(body())).status, 409);
  x.records.get(actor.id).quotations.entries[0].data = quotationData({ shared: true });
  x.records.get(actor.id).quotations.entries[0].data.quotationAccess = 'full';
  assert.equal((await x.get()).status, 404); assert.equal((await x.post(body())).status, 409);
  assert.equal(x.state.quotations.queue.length, 0);
});

test('lost response and continued local editing preserve immutable retry body then chain a fresh revision', async () => {
  const x = fixture({ shared: true }); await x.post(priceBody(280000));
  let unavailable = false, firstResponseLost = true, remote = x.data;
  const receipts = new Map(), posts = [];
  x.network((url, init) => {
    if (unavailable) throw new Error('Connection reset');
    if (url.includes('session=1')) return session();
    if (init.method === 'POST') {
      const id = init.headers['X-Alumex-Offline-Operation']; const value = JSON.parse(init.body);
      assert.equal(init.headers['X-Alumex-Offline-Actor'], actor.id); posts.push({ id, value });
      if (!receipts.has(id)) {
        assert.equal(value.revision, remote.flow.revision);
        remote = quotationData({ shared: true, revision: remote.flow.revision + 1, rate: value.systemRates[0].rate });
        receipts.set(id, { ok: true, flow: remote.flow, revision: remote.flow.revision, operationId: id });
      } else assert.deepEqual(value, posts[0].value, 'Exact retry cannot replace the original request');
      if (firstResponseLost) { firstResponseLost = false; unavailable = true; throw new Error('Response lost after commit'); }
      return response(receipts.get(id));
    }
    return response(remote);
  });
  x.online(); await x.client.syncOfflineQuotations();
  const original = x.operation; assert.ok(original.attemptedAt);
  await x.post(priceBody(300000)); await x.client.syncOfflineQuotations();
  assert.deepEqual(x.operation.body, original.body); assert.equal(x.operation.id, original.id);
  assert.equal(x.operation.successor.draft.flow.quotation.total, 300000);
  const visible = await (await x.get()).json(); assert.equal(visible.flow.quotation.total, 300000);
  unavailable = false; await x.client.syncOfflineQuotations();
  assert.equal(x.state.quotations.queue.length, 0); assert.equal(x.state.quotations.entries[0].data.flow.quotation.total, 300000);
  assert.equal(posts.length, 3); assert.equal(posts[0].id, posts[1].id); assert.notEqual(posts[1].id, posts[2].id);
  assert.equal(posts[2].value.revision, 2); assert.equal(posts[2].value.systemRates[0].rate, 300000);
});

test('server conflicts retain local drafts and explicit review archives them before rebasing', async () => {
  const x = fixture({ shared: true }); await x.post(priceBody());
  const latest = quotationData({ shared: true, revision: 3, rate: 290000 });
  let denySave = true;
  x.network((url, init) => url.includes('session=1') ? session() : init.method === 'POST'
    ? Response.json({ error: 'This project changed. Reload and try again.' }, { status: 409 }) : response(latest));
  x.online(); await x.client.syncOfflineQuotations();
  assert.equal(x.operation.conflict, true); const oldId = x.operation.id;
  await x.post(priceBody(300000));
  const review = await x.client.reviewOfflineQuotation(projectId); assert.equal(review.canRebase, true); assert.equal(review.localTotal, 300000);
  x.network((url, init) => url.includes('session=1') && denySave ? Promise.reject(new Error('Network unavailable')) : init.method === 'POST' ? Response.json({ error: 'Conflict' }, { status: 409 }) : response(latest));
  await x.client.resolveOfflineQuotation(review, 'rebase'); await tick();
  assert.notEqual(x.operation.id, oldId); assert.equal(x.operation.body.revision, 3); assert.equal(x.operation.body.systemRates[0].rate, 300000);
  assert.equal(x.state.quotations.archived.length, 1); assert.equal(x.state.quotations.archived[0].operation.successor.draft.flow.quotation.total, 300000);
  denySave = false;
});

test('a changed server specification cannot be silently rebased over the newer quotation', async () => {
  const x = fixture({ shared: true }); await x.post(priceBody());
  const latest = quotationData({ shared: true, revision: 2 }); latest.flow.quotation.lines[0].opening.width = 120;
  x.online(); x.network(() => response(latest));
  const review = await x.client.reviewOfflineQuotation(projectId); assert.equal(review.canRebase, false);
  await assert.rejects(x.client.resolveOfflineQuotation(review, 'rebase'), /specifications changed/);
  await x.client.resolveOfflineQuotation(review, 'server');
  assert.equal(x.state.quotations.queue.length, 0); assert.equal(x.state.quotations.archived.length, 1);
  assert.equal(x.state.quotations.entries[0].data.flow.quotation.lines[0].opening.width, 120);
});

test('complete authoritative refresh hides revoked pending content while preserving its operation', async () => {
  const x = fixture({ shared: true }); await x.post(priceBody()); const original = x.operation;
  x.online(); x.network(() => response({ actor, quotations: [], catalog, complete: true }));
  await x.client.prepareOfflineQuotations(); x.online(false);
  assert.equal((await x.get()).status, 404); assert.deepEqual((await (await x.client.quotationFetch('/api/shared-quotations')).json()).projects, []);
  assert.equal(x.state.quotations.entries[0].available, false); assert.equal(x.operation.id, original.id);
  assert.equal(x.client.quotationSyncStatus(x.state).pending, 1); assert.match(x.operation.error, /access changed/);
});

test('a full-to-prices entitlement change archives every saved edit and serves only the price editor', async () => {
  const x = fixture(); await x.post(body());
  x.records.get(actor.id).quotations.queue[0].attemptedAt = '2026-11-23T09:00:00Z';
  await x.post(body(300000));
  const original = x.operation;
  const latest = quotationData({ shared: true, revision: 3, rate: 260000 });
  x.online(); x.network(() => response({ actor, quotations: [{ projectId, data: latest }], catalog, complete: true }));
  await x.client.prepareOfflineQuotations(); x.online(false);
  assert.equal(x.state.quotations.queue.length, 0);
  assert.deepEqual(x.state.quotations.archived[0].operation, original, 'Original attempted UUID/body and newer successor are retained exactly');
  assert.equal(x.client.canAccessOfflineQuotationDraft(x.state, original), false);
  const visible = await (await x.get()).json();
  assert.equal(visible.quotationAccess, 'prices'); assert.equal(visible.flow.quotation.total, 260000);
  assert.equal(visible.offlineQuotation, undefined);
  assert.equal((await x.post(body(310000, 3))).status, 409, 'Narrowed scope cannot queue full editor actions');
  assert.equal((await x.post(priceBody(290000, 3))).status, 200, 'Allowed price-only work can continue without rewriting the old draft');
  assert.equal(x.operation.body.action, 'save-shared-prices'); assert.notEqual(x.operation.id, original.id);
  assert.equal(x.state.quotations.archived[0].operation.successor.draft.flow.quotation.total, 300000);
});

test('an already narrowed cache cannot expose, transmit, or extend an old full pending draft', async () => {
  const x = fixture(); await x.post(body()); const original = x.operation;
  x.records.get(actor.id).quotations.entries[0].data = quotationData({ shared: true });
  const visible = await (await x.get()).json();
  assert.equal(visible.quotationAccess, 'prices'); assert.equal(visible.flow.quotation.total, 250000);
  assert.equal((await x.post(body(300000))).status, 409);
  x.online(); x.network(url => { assert.match(url, /session=1/); return session(); });
  await x.client.syncOfflineQuotations();
  assert.deepEqual(x.operation, original); assert.equal(x.requests.length, 1, 'Only the session check runs; no full-scope request is sent');
});

test('paginated snapshots commit only after every page and share the catalog reference', async () => {
  const x = fixture(); let pages = 0;
  const second = quotationData({ id: otherProjectId });
  x.online(); x.network(url => {
    pages++;
    const data = url.includes('cursor=') ? second : x.data; const id = url.includes('cursor=') ? otherProjectId : projectId;
    const { catalog: ignored, ...snapshot } = data; void ignored;
    return response({ actor, quotations: [{ projectId: id, data: snapshot }], catalog, nextCursor: url.includes('cursor=') ? null : projectId });
  });
  await x.client.prepareOfflineQuotations();
  assert.equal(pages, 2); assert.equal(x.state.quotations.entries.length, 2); assert.equal(x.writes.length, 1);
  const saved = x.records.get(actor.id).quotations.entries;
  assert.equal(saved[0].data.catalog, saved[1].data.catalog);
});

test('an interrupted paginated refresh cannot purge prior snapshots or queued work', async () => {
  const x = fixture(); await x.post(body()); const before = x.state;
  x.online(); x.network(url => {
    if (url.includes('cursor=')) throw new Error('Connection reset');
    return response({ actor, quotations: [], catalog, nextCursor: otherProjectId });
  });
  await assert.rejects(x.client.prepareOfflineQuotations());
  assert.deepEqual(x.state, before);
});

test('account changes invalidate an in-flight snapshot and stop old-user synchronization', async () => {
  const x = fixture(); let finish;
  x.online(); x.network(() => new Promise(resolve => { finish = resolve; }));
  const downloading = x.client.prepareOfflineQuotations(); await tick();
  const other = '33333333-3333-4333-8333-333333333333'; x.switchAccount(other);
  finish(response({ actor, quotations: [{ projectId, data: x.data }], catalog }));
  await assert.rejects(downloading, /employee who saved/);
  assert.equal(x.records.get(other).quotations.entries.length, 0);
  assert.equal(x.writes.length, 0);
});

test('a committed employee scope change discards a quotation response begun under the old scope', async () => {
  const x = fixture(); let finish;
  x.online(); x.network(() => new Promise(resolve => { finish = resolve; }));
  const fetching = x.get(); await tick();
  x.records.get(actor.id).actor.branch = 'Rasafa';
  const event = new Event('field-change'); event.detail = { source: 'snapshot', userId: actor.id, actorScopeChanged: true };
  window.dispatchEvent(event);
  finish(response(x.data));
  await assert.rejects(fetching, /employee who saved/);
  assert.equal(x.writes.length, 0, 'A pre-change response cannot overwrite the committed account snapshot');
  x.online(false); assert.equal((await x.get()).status, 404);
});

test('an authoritative revocation invalidates older in-flight GETs without repeatedly invalidating unchanged snapshots', async () => {
  const x = fixture(); let finish;
  x.online(); x.network(url => url.startsWith('/api/offline/quotations')
    ? response({ actor, quotations: [], catalog, complete: true })
    : new Promise(resolve => { finish = resolve; }));
  const fetching = x.get(); await tick();
  await x.client.prepareOfflineQuotations();
  finish(response(x.data));
  await assert.rejects(fetching, /employee who saved/);
  assert.equal(x.state.quotations.entries.length, 0, 'The revoked entry cannot be reintroduced by an older authorized GET');
  await x.client.prepareOfflineQuotations();
  assert.equal(x.state.quotations.entries.length, 0, 'An unchanged empty snapshot completes normally');
});

test('outdoor actors do not download or synchronize commercial data', async () => {
  const x = fixture({ role: 'Outdoor Sales' }); x.online();
  await x.client.prepareOfflineQuotations(); await x.client.syncOfflineQuotations();
  assert.equal(x.requests.length, 0); assert.equal((await x.post(body())).status, 409);
});

test('cache writes require the response actor header to match the cached employee', async () => {
  const x = fixture({ cached: false }); x.online();
  x.network(() => Response.json(quotationData(), { headers: { 'X-Alumex-Actor': 'another-employee' } }));
  assert.equal((await x.get()).status, 401); assert.equal(x.state.quotations.entries.length, 0);
});

test('online signed-file uploads pass through unchanged only after pending quotations synchronize', async () => {
  const x = fixture(); x.online(); const upload = new FormData(); upload.set('file', new Blob(['signed fixture']), 'signed.pdf');
  x.network((_url, init) => { assert.equal(init.body, upload); return response({ ok: true }); });
  assert.equal((await x.client.quotationFetch(`/api/sales-flow/${projectId}`, { method: 'POST', body: upload })).status, 200);
  x.online(false); assert.equal((await x.client.quotationFetch(`/api/sales-flow/${projectId}`, { method: 'POST', body: upload })).status, 409);
  await x.post(body()); x.online();
  assert.equal((await x.client.quotationFetch(`/api/sales-flow/${projectId}`, { method: 'POST', body: upload })).status, 409);
});

test('malformed success responses never acknowledge or erase a saved operation', async () => {
  for (const invalid of [null, {}, { ok: true }, { ok: true, operationId: 'different', revision: 2, flow: quotationData({ revision: 2 }).flow }]) {
    const x = fixture(); await x.post(body());
    x.online(); x.network((url, init) => url.includes('session=1') ? session() : init.method === 'POST' ? Response.json(invalid) : response(x.data));
    await x.client.syncOfflineQuotations();
    assert.equal(x.state.quotations.queue.length, 1); assert.equal(x.operation.status, 503);
  }
});

test('opportunistic caches redact contracts, signatures and quote history but preserve locks', async () => {
  const x = fixture({ cached: false }); const data = quotationData();
  data.project.project_notes = 'Private CRM note outside the quotation cache';
  data.flow.contract = { secret: 'contract contents' }; data.flow.evidence = { method: 'digital', signer: 'Client', signature: 'private-signature' };
  data.history = [{ version: 0, quotation: data.flow.quotation, contract: { secret: true } }];
  x.online(); x.network(() => response(data)); await x.get();
  const cached = x.state.quotations.entries[0].data;
  assert.equal(cached.flow.contract, null); assert.deepEqual(cached.history, []);
  assert.equal(cached.project.project_notes, undefined);
  assert.deepEqual(cached.flow.evidence, { method: 'digital', signer: '' });
  assert.equal((await x.post(body())).status, 409);
});

test('authorization failures keep saved drafts and cannot acknowledge them under another account', async () => {
  for (const status of [401, 403]) {
    const x = fixture(); await x.post(body()); const id = x.operation.id;
    x.online(); x.network((url, init) => url.includes('session=1') ? session() : init.method === 'POST' ? Response.json({ error: 'Denied' }, { status }) : response(x.data));
    await x.client.syncOfflineQuotations();
    assert.equal(x.operation.id, id); assert.equal(x.operation.status, status); assert.equal(x.state.quotations.queue.length, 1);
    if (status === 403) { x.online(false); assert.equal((await x.get()).status, 404); }
  }
  const x = fixture(); await x.post(body());
  x.online(); x.network((url, init) => {
    if (url.includes('session=1')) return session();
    if (init.method === 'POST') {
      x.switchAccount('33333333-3333-4333-8333-333333333333');
      return response({ ok: true, operationId: init.headers['X-Alumex-Offline-Operation'], revision: 2, flow: quotationData({ revision: 2 }).flow });
    }
    return response(x.data);
  });
  await assert.rejects(x.client.syncOfflineQuotations(), /employee who saved/);
  assert.equal(x.state.quotations.queue.length, 1);
  assert.equal(x.records.get('33333333-3333-4333-8333-333333333333').quotations.queue.length, 0);
});

test('archived drafts remain recoverable after conflict resolution and disappear from UI after revoked access', async () => {
  const x = fixture(); await x.post(body());
  const snapshot = x.state;
  snapshot.quotations.archived.push({ operation: x.operation, archivedAt: '2026-11-23T11:00:00Z', reason: 'Kept latest server quotation after review.' });
  snapshot.quotations.queue = [];
  const { QuotationSyncConflicts } = modules({
    react: React, 'react/jsx-runtime': jsxRuntime,
    '@/components/i18n/I18nProvider': { useI18n: () => ({ term: value => value, formatMoney: value => `${value} IQD`, formatDateTime: value => value }) },
    './useFieldState': { useFieldState: () => snapshot },
    '@/lib/offline/quotations': x.client,
  })('components/offline/QuotationSyncConflicts');
  const render = () => renderToStaticMarkup(React.createElement(QuotationSyncConflicts));
  const html = render();
  assert.match(html, /Archived quotation drafts/); assert.match(html, /Download archived quotation draft/);
  assert.match(html, /280000 IQD/); assert.match(html, /Quotation fixture/);
  snapshot.quotations.entries[0].available = false;
  assert.equal(render(), '', 'Revoked archives do not disclose their titles or exports');
  snapshot.quotations.entries[0].available = true; snapshot.actor.role = 'Outdoor Sales';
  assert.equal(render(), '', 'A role downgrade removes commercial archive access');
  snapshot.actor.role = 'Indoor Sales'; snapshot.quotations.entries[0].data = quotationData({ shared: true });
  assert.equal(render(), '', 'A price-only grant does not reveal a formerly full-scope draft archive');
  snapshot.quotations.entries[0].data = quotationData();
  assert.match(render(), /Download archived quotation draft/, 'Restored full access permits recovery of the preserved archive');
});
