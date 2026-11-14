import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const operationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const otherId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const saved = { projectId, id: projectId, branch: 'Governorates', governorate: 'النجف', project_number: 'PRJ-LEGACY' };
const receipt = { operation_id: operationId, actor_id: actorId, project_id: projectId, action: 'register' };
const recordedAt = '2026-11-13T08:00:00Z';

function fixture(options = {}) {
  const reads = [], calls = [];
  let createdProjects = 0;
  const records = options.receipts ?? [receipt];
  const admin = {
    from(table) {
      assert.ok(['projects', 'field_sync_receipts'].includes(table), `Unexpected read: ${table}`);
      const filters = [];
      return {
        select(fields) {
          if (table === 'field_sync_receipts') assert.equal(fields, 'operation_id');
          return this;
        },
        eq(key, value) { filters.push([key, value]); return this; },
        async maybeSingle() {
          reads.push({ table, filters: structuredClone(filters) });
          if (table === 'field_sync_receipts') return {
            data: records.find(record => filters.every(([key, value]) => record[key] === value)) ?? null,
            error: options.receiptError ?? null,
          };
          return { data: { id: projectId, branch: 'Governorates', created_by: actorId, assigned_outdoor_sales_id: actorId }, error: null };
        },
      };
    },
    async rpc(name, input) {
      assert.equal(name, 'sync_field_change');
      calls.push(input);
      if (options.rpcError) return { data: null, error: options.rpcError };
      if (!records.some(record => record.operation_id === input.p_operation)) createdProjects++;
      return { data: saved, error: null };
    },
  };
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/auth/adminServer': { requireRole: async () => options.denied
      ? { ok: false, status: 403, error: 'Account is inactive.' }
      : { ok: true, role: 'Outdoor Sales', user: { id: actorId }, profile: { branch: options.branch ?? 'Rasafa' }, outdoorTeamMemberIds: [actorId] } },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
  };
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const exports = {};
    cache.set(path, exports);
    const url = new URL(`../src/${path}.ts`, import.meta.url);
    const source = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'exports', source)(name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.startsWith('@/')) return load(name.slice(2));
      if (name.startsWith('.')) return load(new URL(`${name}.ts`, url).pathname.split('/src/')[1].slice(0, -3));
      throw new Error(`Unexpected dependency: ${name}`);
    }, exports);
    return exports;
  }
  const route = load('app/api/offline/route');
  return { reads, calls, get createdProjects() { return createdProjects; },
    post: body => route.POST({ json: async () => body }),
  };
}

function request(project = {}) {
  return { id: operationId, userId: actorId, projectId, action: 'register', recordedAt,
    payload: { client: { clientName: '  Legacy Governorate  ', mobile: ' 07700000000 ', clientType: 'individual' },
      project: { branch: 'Governorates', governorate: 'النجف', buildingType: 'villa_house', structureReadiness: 'ready',
        address: ' Legacy street ', locationLatitude: 33.3, locationLongitude: 44.4, ...project } },
  };
}

for (const branch of ['Karkh', 'Rasafa', 'Najaf']) test(`${branch} can acknowledge an existing retired-province registration receipt`, async () => {
  const x = fixture({ branch }), response = await x.post(request());
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { project: saved });
  assert.equal(x.calls.length, 1);
  assert.deepEqual(x.calls[0], {
    p_operation: operationId, p_actor: actorId, p_project: projectId, p_action: 'register', p_recorded_at: recordedAt, p_expected_updated_at: null,
    p_payload: { client: { clientName: 'Legacy Governorate', mobile: '07700000000', clientType: 'individual', locationLatitude: null, locationLongitude: null },
      project: { branch: 'Governorates', governorate: 'النجف', buildingType: 'villa_house', address: 'Legacy street',
        locationLatitude: 33.3, locationLongitude: 44.4, structureReadiness: 'ready', readinessNote: null } },
  }, 'SQL receives the same normalized payload used by the original registration');
  assert.deepEqual(x.reads.find(read => read.table === 'field_sync_receipts').filters, [
    ['operation_id', operationId], ['actor_id', actorId], ['project_id', projectId], ['action', 'register'],
  ]);
  assert.equal(x.createdProjects, 0);
});

for (const [name, records] of [
  ['fresh registration', []],
  ['different operation', [{ ...receipt, operation_id: otherId }]],
  ['different employee', [{ ...receipt, actor_id: otherId }]],
  ['different project', [{ ...receipt, project_id: otherId }]],
  ['different action', [{ ...receipt, action: 'opening' }]],
]) test(`retired province rejects ${name} before the synchronization RPC`, async () => {
  const x = fixture({ receipts: records }), response = await x.post(request());
  assert.equal(response.status, 400);
  assert.match(response.body.error, /governorate/);
  assert.equal(x.calls.length, 0);
  assert.equal(x.createdProjects, 0);
});

test('receipt lookup failure returns a retryable error without exposing database details', async () => {
  const x = fixture({ receiptError: { message: 'PRIVATE DATABASE DETAIL' } }), response = await x.post(request());
  assert.equal(response.status, 503);
  assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE DATABASE DETAIL/);
  assert.equal(x.calls.length, 0);
  assert.equal(x.createdProjects, 0);
});

test('an existing operation with a changed payload remains a SQL fingerprint conflict', async () => {
  const x = fixture({ rpcError: { message: 'Operation ID already used for different work' } });
  const response = await x.post(request({ address: 'Changed after the original registration' }));
  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'Operation ID already used for different work');
  assert.equal(x.calls.length, 1);
  assert.equal(x.calls[0].p_operation, operationId, 'The server must never replace a conflicting operation ID');
  assert.equal(x.calls[0].p_payload.project.address, 'Changed after the original registration');
  assert.equal(x.createdProjects, 0);
});

test('a saved receipt cannot bypass the current office registration boundary', async () => {
  const x = fixture(), response = await x.post(request({ branch: 'Najaf' }));
  assert.equal(response.status, 400);
  assert.match(response.body.error, /project from your branch/);
  assert.equal(x.reads.length, 0);
  assert.equal(x.calls.length, 0);
});

test('an inactive account and a forged saved-change account cannot look up receipts', async () => {
  const inactive = fixture({ denied: true });
  assert.equal((await inactive.post(request())).status, 403);
  assert.equal(inactive.reads.length, 0);
  const forged = fixture();
  assert.equal((await forged.post({ ...request(), userId: otherId })).status, 400);
  assert.equal(forged.reads.length, 0);
  assert.equal(forged.calls.length, 0);
});

test('a listed new province continues to register without a legacy receipt lookup', async () => {
  const x = fixture({ receipts: [] }), response = await x.post(request({ governorate: 'البصرة' }));
  assert.equal(response.status, 200);
  assert.equal(x.reads.some(read => read.table === 'field_sync_receipts'), false);
  assert.equal(x.calls.length, 1);
  assert.equal(x.calls[0].p_payload.project.governorate, 'البصرة');
});
