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
      assert.ok(name.startsWith('@/') || name.startsWith('.'), `Unexpected dependency: ${name}`);
      return load(name.startsWith('@/') ? new URL(`../src/${name.slice(2)}.ts`, import.meta.url) : new URL(`${name}.ts`, url));
    }, exports);
    return exports;
  }
  return path => load(new URL(`../src/${path}.ts`, import.meta.url));
}
const { offlineQuotationOperation, offlineQuotationFailure } = modules()('lib/offline/quotationSyncServer');
const { offlineQuotationFlow } = modules()('lib/offline/quotationSnapshots');
const { priceQuotation } = modules()('lib/workflow/pricing');
const actorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const otherActor = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const operationId = '11111111-1111-4111-8111-111111111111';
const recordedAt = '2026-11-23T10:00:00.000Z';
const opening = { id: '22222222-2222-4222-8222-222222222222', floor: 'Ground', room: 'Office',
  width: 120, height: 150, quantity: 1, opening_type: 'Window', opening_direction: 'Sliding', has_arch: false, has_roller_shutter: false };
const catalog = [{ id: '33333333-3333-4333-8333-333333333333', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 265000, is_active: true }];
const choice = { openingId: opening.id, systemId: catalog[0].id, systemRate: 270000, extras: [] };
const normalRequest = { action: 'save', revision: 1, choices: [choice], newOpenings: [], additionalItems: [], discountPercent: 0 };
const headers = (extra = {}) => ({ 'Content-Type': 'application/json', 'X-Alumex-Offline-Operation': operationId,
  'X-Alumex-Offline-Recorded-At': recordedAt, 'X-Alumex-Offline-Actor': actorId, ...extra });
const response = { json: (data, init = {}) => new Response(JSON.stringify(data), { ...init,
  headers: { 'Content-Type': 'application/json', ...init.headers } }) };

test('offline headers bind an operation to its original actor and timestamp', () => {
  assert.equal(offlineQuotationOperation(new Headers()), null);
  assert.deepEqual(offlineQuotationOperation(new Headers(headers())), { id: operationId, actorId, recordedAt });
  for (const patch of [{ 'X-Alumex-Offline-Actor': '' }, { 'X-Alumex-Offline-Operation': '' },
    { 'X-Alumex-Offline-Recorded-At': 'yesterday' }, { 'X-Alumex-Offline-Actor': 'not-a-user' }]) {
    assert.throws(() => offlineQuotationOperation(new Headers(headers(patch))), /Invalid offline/);
  }
});
test('offline failures distinguish access, conflict, immutable-operation, lock and availability errors', () => {
  for (const [error, status, code] of [
    [{ code: '42501', message: 'denied' }, 403, 'OFFLINE_QUOTATION_ACCESS_REVOKED'],
    [{ code: '40001', message: 'changed' }, 409, 'OFFLINE_QUOTATION_CONFLICT'],
    [{ code: '22023', message: 'Offline quotation operation was already used for different work.' }, 409, 'OFFLINE_QUOTATION_OPERATION_MISMATCH'],
    [{ code: '40001', message: 'Signed contracts cannot be changed.' }, 409, 'OFFLINE_QUOTATION_LOCKED'],
    [{ code: 'PGRST202', message: 'missing' }, 503, 'OFFLINE_QUOTATION_SYNC_UNAVAILABLE'],
  ]) assert.deepEqual(offlineQuotationFailure(error), { status, code });
});
test('offline snapshots preserve lock markers without evidence, signatures or contract documents', () => {
  const safe = offlineQuotationFlow({ project_id: projectId, revision: 1, stage: 'signed', quotation: { total: 1 },
    contract: { privateContract: 'contract-private' }, evidence: { signature: 'signature-private', path: 'private-path', signer: 'Private signer' },
    signed_at: recordedAt, accepted_at: null, accepted_by: null, approved_at: null, approved_by: null, updated_at: recordedAt });
  assert.equal(safe.contract, null);
  assert.deepEqual(safe.evidence, { recorded: true });
  assert.equal(safe.signed_at, recordedAt);
  assert.doesNotMatch(JSON.stringify(safe), /signature-private|private-path|Private signer|contract-private/);
});

function fixture({ prices = false, revision = 1, accessStatus = null, syncError = null } = {}) {
  const calls = [], reads = [], receipts = new Map();
  const project = { id: projectId, client_id: 'client', project_name: 'Offline quote', project_number: 'PRJ-OFFLINE',
    branch: prices ? 'Rasafa' : 'Karkh', governorate: null, building_type: 'residential_building', sales_status: 'quotation_in_progress', additional_openings_state: null };
  const flow = { project_id: projectId, revision, stage: 'quotation', quotation: priceQuotation([opening], [choice], catalog, 'original'),
    contract: null, evidence: null, signed_at: null, accepted_at: null, accepted_by: null };
  const tables = { sales_workflows: [flow], openings: [{ ...structuredClone(opening), project_id: projectId }], product_price_settings: structuredClone(catalog) };
  const admin = {
    from(table) {
      const filters = [];
      const read = single => {
        reads.push(table);
        const rows = tables[table].filter(row => filters.every(predicate => predicate(row)));
        return { data: single ? rows[0] ?? null : rows, error: null };
      };
      return { select() { return this; }, order() { return this; },
        eq(key, value) { filters.push(row => row[key] === value); return this; },
        maybeSingle() { return Promise.resolve(read(true)); },
        then(resolve, reject) { return Promise.resolve(read(false)).then(resolve, reject); } };
    },
    async rpc(name, args) {
      calls.push({ name, args: structuredClone(args) });
      if (name === 'replay_offline_quotation') {
        const receipt = receipts.get(args.p_operation);
        if (!receipt) return { data: null, error: null };
        if (JSON.stringify(receipt.request) !== JSON.stringify(args.p_request)) return { data: null,
          error: { code: '22023', message: 'Offline quotation operation was already used for different work.' } };
        return { data: { ...structuredClone(receipt.result), replayed: true }, error: null };
      }
      if (syncError) return { data: null, error: syncError };
      if (name === 'sync_offline_quotation') {
        flow.revision += 1; flow.quotation = args.p_payload;
        const result = { ok: true, operationId: args.p_operation, revision: flow.revision, flow: structuredClone(flow), replayed: false };
        receipts.set(args.p_operation, { request: structuredClone(args.p_request), result: structuredClone(result) });
        return { data: result, error: null };
      }
      return { data: { ...flow, revision: flow.revision + 1, quotation: args.p_payload }, error: null };
    },
  };
  const compiled = modules({ 'next/server': { NextResponse: response },
    '@/lib/contracts/uploadedTerms': { uploadedContractTerms: () => [] },
    '@/lib/workflow/access': { salesProject: async () => accessStatus
      ? { response: response.json({ error: 'Project not found.' }, { status: accessStatus }) }
      : { admin, auth: { user: { id: actorId }, role: 'Indoor Sales' }, project, quotationAccess: prices ? 'prices' : 'full' } } });
  const route = compiled('app/api/sales-flow/[projectId]/route');
  return { calls, reads, receipts, flow, project, post: (body = normalRequest, requestHeaders = headers()) => route.POST(
    new Request(`http://localhost:3003/api/sales-flow/${projectId}`, { method: 'POST', headers: requestHeaders, body: JSON.stringify(body) }),
    { params: Promise.resolve({ projectId }) }) };
}

test('fresh offline saves use the durable transaction and retries replay before stale revision/pricing checks', async () => {
  const x = fixture();
  const raw = { ...normalRequest, pricingPolicy: { curtainWallMinimumRate: 1 } };
  const first = await x.post(raw);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).revision, 2);
  assert.deepEqual(x.calls.map(call => call.name), ['replay_offline_quotation', 'sync_offline_quotation']);
  assert.deepEqual(x.calls[1].args.p_request, raw, 'Original client request is immutable receipt identity');
  assert.equal(x.calls[1].args.p_actor, actorId);
  assert.equal(Object.hasOwn(x.calls[1].args.p_payload, 'pricingPolicy'), false, 'Browser cannot create pricing authorization');
  const readCount = x.reads.length;
  x.project.sales_status = 'closed'; x.flow.stage = 'signed'; x.flow.signed_at = recordedAt;
  const retry = await x.post(raw);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).replayed, true);
  assert.equal(x.flow.revision, 2, 'Lost-response retry must not save another revision');
  assert.equal(x.reads.length, readCount, 'Receipt replay precedes current workflow/pricing reads');
});
test('same operation with a changed original request is a conflict and never another save', async () => {
  const x = fixture();
  assert.equal((await x.post()).status, 200);
  const changed = await x.post({ ...normalRequest, discountPercent: 5 });
  assert.equal(changed.status, 409);
  assert.equal((await changed.json()).code, 'OFFLINE_QUOTATION_OPERATION_MISMATCH');
  assert.equal(x.calls.filter(call => call.name === 'sync_offline_quotation').length, 1);
});
test('a changed cookie account is rejected before receipts or pricing are read', async () => {
  const x = fixture();
  const result = await x.post(normalRequest, headers({ 'X-Alumex-Offline-Actor': otherActor }));
  assert.equal(result.status, 403);
  assert.equal((await result.json()).code, 'OFFLINE_QUOTATION_ACCOUNT_MISMATCH');
  assert.equal(x.calls.length, 0); assert.equal(x.reads.length, 0);
});
test('revoked grants and expired sessions cannot replay an old receipt', async () => {
  for (const status of [404, 403, 401]) {
    const x = fixture({ accessStatus: status });
    const result = await x.post();
    assert.equal(result.status, status === 401 ? 401 : 403);
    assert.equal((await result.json()).code, status === 401 ? 'OFFLINE_QUOTATION_AUTH_REQUIRED' : 'OFFLINE_QUOTATION_ACCESS_REVOKED');
    assert.equal(x.calls.length, 0);
  }
});
test('stale fresh drafts conflict without discarding or writing their request', async () => {
  const x = fixture({ revision: 4 });
  const result = await x.post();
  assert.equal(result.status, 409);
  assert.equal((await result.json()).code, 'OFFLINE_QUOTATION_CONFLICT');
  assert.deepEqual(x.calls.map(call => call.name), ['replay_offline_quotation']);
});
test('shared-price drafts retain their action, immutable request and trusted snapshot calculation', async () => {
  const x = fixture({ prices: true });
  const request = { action: 'save-shared-prices', revision: 1,
    systemRates: [{ openingId: opening.id, rate: 280000 }], additionalRates: [] };
  const result = await x.post(request);
  assert.equal(result.status, 200);
  const synced = x.calls.find(call => call.name === 'sync_offline_quotation').args;
  assert.deepEqual(synced.p_request, request);
  assert.equal(synced.p_payload.lines[0].system.rate, 280000);
  assert.equal(synced.p_payload.branch, undefined, 'Sharing does not create or transfer a project branch');
});
test('database access revocation and unavailable sync schema preserve explicit recoverable errors', async () => {
  for (const [error, status, code] of [
    [{ code: '42501', message: 'Project is no longer available to this employee.' }, 403, 'OFFLINE_QUOTATION_ACCESS_REVOKED'],
    [{ code: 'PGRST202', message: 'Missing offline RPC' }, 503, 'OFFLINE_QUOTATION_SYNC_UNAVAILABLE'],
  ]) {
    const x = fixture({ syncError: error });
    const result = await x.post();
    assert.equal(result.status, status); assert.equal((await result.json()).code, code);
  }
});
test('offline approval/signing cannot enter a save transaction and ordinary online clients retain their path', async () => {
  for (const action of ['approve', 'contract', 'sign', 'update-prices']) {
    const x = fixture();
    assert.equal((await x.post({ ...normalRequest, action })).status, 400);
    assert.equal(x.calls.length, 0);
  }
  const x = fixture();
  const result = await x.post(normalRequest, { 'Content-Type': 'application/json' });
  assert.equal(result.status, 200);
  assert.deepEqual(x.calls.map(call => call.name), ['advance_sales_flow']);
  assert.ok((await result.json()).flow);
});

function snapshotFixture({ role = 'Indoor Sales', grants = ['00000000-0000-4000-8000-000000000002'], many = false, grantError = false } = {}) {
  const makeProject = (id, branch, extra = {}) => ({ id, branch, governorate: null, governorate_office: null,
    project_number: `PRJ-${id}`, project_name: 'Snapshot project', client_id: 'client', archived_at: null,
    created_by: actorId, assigned_outdoor_sales_id: null, sales_status: 'quotation_in_progress', ...extra });
  const fullId = '00000000-0000-4000-8000-000000000001';
  const sharedId = '00000000-0000-4000-8000-000000000002';
  const tables = {
    projects: many ? Array.from({ length: 51 }, (_, index) => makeProject(`00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, 'Karkh'))
      : [makeProject(fullId, 'Karkh'), makeProject(sharedId, 'Rasafa'),
        makeProject('00000000-0000-4000-8000-000000000003', 'Rasafa'),
        makeProject('00000000-0000-4000-8000-000000000004', 'Governorates', { governorate: 'النجف' }),
        makeProject('00000000-0000-4000-8000-000000000005', 'Governorates', { governorate: 'النجف', governorate_office: 'Karkh' })],
    project_quotation_price_access: grants.map(project_id => ({ project_id, employee_id: actorId, revoked_at: null })),
    sales_workflows: [{ project_id: fullId, revision: 1, stage: 'signed', quotation: { total: 10 },
      contract: { number: 'private-document' }, evidence: { signature: 'private-signature', path: 'private-path' }, signed_at: recordedAt }],
    openings: [], clients: [{ id: 'client', name: 'Authorized client', mobile: '0000', client_type: 'individual' }],
    product_price_settings: catalog,
  };
  const admin = {
    from(table) {
      const filters = []; let start = 0, finish = Infinity;
      return { select() { return this; }, order() { return this; },
        eq(key, value) { filters.push(row => row[key] === value); return this; },
        is(key, value) { filters.push(row => value === null ? row[key] == null : row[key] === value); return this; },
        in(key, values) { filters.push(row => values.includes(row[key])); return this; },
        range(first, last) { start = first; finish = last + 1; return this; },
        then(resolve, reject) { return Promise.resolve({ data: tables[table].filter(row => filters.every(filter => filter(row))).slice(start, finish), error: null }).then(resolve, reject); } };
    },
    async rpc(_name, args) { return { data: grants.includes(args.p_project), error: grantError ? { message: 'unavailable' } : null }; },
  };
  const compiled = modules({ 'next/server': { NextResponse: response }, '@/lib/auth/adminServer': {
    requireRole: async allowed => allowed.includes(role) ? { ok: true, user: { id: actorId }, role,
      profile: { branch: 'Karkh', full_name: 'Employee', username: 'employee' } } : { ok: false, status: 403, error: 'Denied' },
  }, '@/lib/supabase/admin': { createAdminClient: () => admin }, '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true } });
  const route = compiled('app/api/offline/quotations/route');
  return { get: (cursor = '') => route.GET(new Request(`http://localhost:3003/api/offline/quotations${cursor ? `?cursor=${cursor}` : ''}`)) };
}
test('snapshot collection applies branch/Najaf rules and isolates explicit shared quotes from CRM data', async () => {
  const result = await snapshotFixture().get();
  assert.equal(result.status, 200); assert.equal(result.headers.get('X-Alumex-Actor'), actorId);
  const data = await result.json();
  assert.equal(data.actor.id, actorId); assert.equal(data.complete, true); assert.equal(data.nextCursor, null);
  assert.equal(data.quotations.length, 3);
  assert.deepEqual(data.quotations.map(row => row.data.quotationAccess), ['full', 'prices', 'full']);
  assert.equal(data.catalog.length, 1);
  for (const row of data.quotations) {
    assert.equal(row.data.catalog, undefined); assert.deepEqual(row.data.history, []);
    assert.equal(row.data.flow?.contract ?? null, null);
  }
  const shared = data.quotations.find(row => row.data.quotationAccess === 'prices').data.project;
  assert.equal(shared.branch, 'Rasafa'); assert.equal(shared.follow_up_owner_id, undefined); assert.equal(shared.project_notes, undefined);
  assert.doesNotMatch(JSON.stringify(data), /private-document|private-signature|private-path/);
});
test('snapshot pagination is bounded and complete only after the final same-actor page', async () => {
  const x = snapshotFixture({ many: true, grants: [] });
  const first = await (await x.get()).json();
  assert.equal(first.quotations.length, 50); assert.equal(first.complete, false); assert.ok(first.nextCursor);
  const last = await (await x.get(first.nextCursor)).json();
  assert.equal(last.quotations.length, 1); assert.equal(last.complete, true); assert.equal(last.nextCursor, null);
  assert.equal(new Set([...first.quotations, ...last.quotations].map(row => row.projectId)).size, 51);
});
test('revoked grants disappear, grant verification errors fail closed and nonsales roles cannot download', async () => {
  const noGrant = await (await snapshotFixture({ grants: [] }).get()).json();
  assert.ok(noGrant.quotations.every(row => row.data.quotationAccess === 'full'));
  assert.equal((await snapshotFixture({ grantError: true }).get()).status, 503);
  for (const role of ['Outdoor Sales', 'HR', 'Operations Manager']) assert.equal((await snapshotFixture({ role }).get()).status, 403);
});
