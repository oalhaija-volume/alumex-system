import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function modules(dependencies = {}) {
  const cache = new Map();
  return function load(path) {
    if (cache.has(path)) return cache.get(path);
    const exports = {};
    cache.set(path, exports);
    const code = ts.transpileModule(readFileSync(new URL(`../${path}.ts`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'exports', code)(name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}`);
      throw new Error(`Unexpected dependency: ${name}`);
    }, exports);
    return exports;
  };
}

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const timestamp = '2026-11-17T08:00:00Z';
function row(branch, id = branch, governorate = null) {
  return {
    project_id: `project-${id}`, revision: 4, signed_at: timestamp, stage: 'signed',
    contract_number: `CT-${id}`, contract_total: '1250000', contract_currency: 'IQD',
    signer: 'Original signer', method: 'hard_copy',
    contract: { client: { name: 'Original signed client' }, private: 'PRIVATE_SNAPSHOT' },
    evidence: { path: 'PRIVATE_STORAGE_PATH', signature: 'PRIVATE_SIGNATURE' },
    project: {
      id: `project-${id}`, client_id: `client-${id}`, branch, governorate,
      project_number: `PRJ-${id}`, project_name: `Project ${id}`, address: 'Baghdad',
      structure_readiness: 'ready', sales_status: 'transferred_to_operations', status: 'Contract',
      next_follow_up_at: null, project_notes: null, created_at: timestamp,
      created_by: 'outdoor-employee', updated_at: timestamp,
    },
  };
}

const rows = [
  row('Karkh'), row('Rasafa'), row('Najaf'), row('Governorates', 'basra', 'البصرة'),
  row('Governorates', 'historic-najaf', 'النجف'), row(null, 'unassigned'),
];

function fixture({ role = 'Indoor Sales', branch = 'Karkh', workflowRows = rows,
  errorTable, serviceAvailable = true, authStatus, ignoreBranchFilter = false,
} = {}) {
  const reads = [];
  const clients = workflowRows.filter(item => item.project).map(item => ({
    id: item.project.client_id, client_name: `Current client ${item.project.id}`, mobile: '07700000000',
  }));
  const admin = {
    from(table) {
      const predicates = [];
      let start = 0, end = Infinity, fields;
      const query = {
        select(value) { fields = value; return this; },
        not(key, operator, value) {
          assert.equal(operator, 'is'); assert.equal(value, null);
          predicates.push(item => item[key] !== null && item[key] !== undefined);
          return this;
        },
        neq(key, value) { predicates.push(item => item[key] !== value); return this; },
        order() { return this; },
        range(from, to) { start = from; end = to; return this; },
        in(key, values) {
          if (key !== 'project.branch' || !ignoreBranchFilter) predicates.push(item => values.includes(key === 'project.branch' ? item.project?.branch : item[key]));
          return this;
        },
        then(resolve, reject) {
          const source = table === 'sales_workflows' ? workflowRows : clients;
          const data = source.filter(item => predicates.every(predicate => predicate(item))).slice(start, end + 1);
          reads.push({ table, start, end, fields, data: structuredClone(data) });
          return Promise.resolve({ data, error: table === errorTable ? { message: 'Private database detail' } : null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const load = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200, headers: options?.headers }) } },
    '@/lib/auth/adminServer': { requireRole: async allowed => {
      if (authStatus) return { ok: false, status: authStatus, error: 'Access denied.' };
      return allowed.includes(role) ? { ok: true, role, user: { id: actorId }, profile: { branch, full_name: 'Indoor employee' } }
        : { ok: false, status: 403, error: 'Access denied.' };
    } },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => serviceAvailable },
  });
  return { reads, load, get: () => load('src/app/api/signed-contracts/route').GET() };
}

test('Indoor Sales and Sales Managers see only their branch, including historic Najaf isolation', async () => {
  for (const role of ['Indoor Sales', 'Sales Manager']) for (const branch of ['Karkh', 'Rasafa', 'Najaf', null, 'unknown']) {
    const x = fixture({ role, branch, ignoreBranchFilter: true });
    const response = await x.get();
    assert.equal(response.status, 200);
    const expected = branch === 'Karkh' ? ['Karkh', 'basra'] : branch === 'Najaf' ? ['Najaf', 'historic-najaf'] : branch === 'Rasafa' ? ['Rasafa'] : [];
    assert.deepEqual(response.body.records.map(item => item.contractNumber), expected.map(id => `CT-${id}`), `${role} ${branch}`);
    const visibleClients = new Set(response.body.records.map(item => item.project.client_id));
    for (const read of x.reads.filter(read => read.table === 'clients')) assert.ok(read.data.every(client => visibleClients.has(client.id)));
    if (!expected.length) assert.equal(x.reads.length, 0, 'Missing branch must fail closed before service-role queries');
  }
});

test('leadership follows existing global and CEO branch permissions', async () => {
  for (const role of ['Admin', 'Sales Director', 'Company Owner']) {
    const response = await fixture({ role, branch: null }).get();
    assert.equal(response.status, 200);
    assert.equal(response.body.records.length, rows.length);
    assert.deepEqual(response.body.branches, ['Karkh', 'Rasafa', 'Najaf', 'Governorates']);
  }
  const response = await fixture({ role: 'CEO', branch: 'Rasafa' }).get();
  assert.deepEqual(response.body.records.map(item => item.contractNumber), ['CT-Rasafa']);
});

test('the API denies unrelated roles and authentication failures before reading records', async () => {
  for (const role of ['Outdoor Sales', 'Operations Manager', 'Project Manager', 'HR']) {
    const x = fixture({ role });
    assert.equal((await x.get()).status, 403);
    assert.equal(x.reads.length, 0);
  }
  for (const authStatus of [401, 403, 500]) {
    const x = fixture({ authStatus });
    assert.equal((await x.get()).status, authStatus);
    assert.equal(x.reads.length, 0);
  }
});

test('only signed contracts are listed and records persist after Operations acceptance', async () => {
  const unsigned = { ...row('Karkh', 'unsigned'), signed_at: null, stage: 'contract' };
  const noContract = { ...row('Karkh', 'no-contract'), contract: null };
  const jsonNull = { ...row('Karkh', 'json-null'), contract: 'null' };
  const accepted = { ...row('Karkh', 'accepted'), stage: 'operations', accepted_at: timestamp };
  const response = await fixture({ workflowRows: [row('Karkh'), unsigned, noContract, jsonNull, accepted] }).get();
  assert.deepEqual(response.body.records.map(item => item.contractNumber), ['CT-Karkh', 'CT-accepted']);
});

test('summary records use the shared current client name and never expose signing or contract payloads', async () => {
  const x = fixture();
  const response = await x.get();
  const record = response.body.records[0];
  assert.equal(record.project.client_name, 'Current client project-Karkh');
  assert.equal(record.signer, 'Original signer');
  assert.equal(record.method, 'hard_copy');
  assert.equal(record.total, 1250000);
  assert.equal(record.currency, 'IQD');
  assert.equal(record.project.project_name, 'Project Karkh');
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE_|Original signed client|evidence/);
  const fields = x.reads.find(read => read.table === 'sales_workflows').fields;
  assert.doesNotMatch(fields, /\*|signature|path/);
  assert.match(fields, /contract_number:contract->>number/);
});

test('database errors fail the whole request without returning partial rows or database details', async () => {
  for (const errorTable of ['sales_workflows', 'clients']) {
    const response = await fixture({ errorTable }).get();
    assert.equal(response.status, 500);
    assert.equal(response.body.records, undefined);
    assert.doesNotMatch(JSON.stringify(response.body), /Private database detail/);
  }
  const x = fixture({ serviceAvailable: false });
  assert.equal((await x.get()).status, 503);
  assert.equal(x.reads.length, 0);
});

test('all signed records load beyond the default Supabase row cap with bounded queries', async () => {
  const workflowRows = Array.from({ length: 1205 }, (_, index) => row('Karkh', index));
  const x = fixture({ workflowRows });
  const response = await x.get();
  assert.equal(response.body.records.length, workflowRows.length);
  assert.equal(new Set(response.body.records.map(item => item.project.id)).size, workflowRows.length);
  const workflowReads = x.reads.filter(read => read.table === 'sales_workflows');
  assert.deepEqual(workflowReads.map(read => read.start), [0, 200, 400, 600, 800, 1000, 1200]);
  assert.ok(x.reads.every(read => read.data.length <= 200));
});

test('summary normalization fails closed for absent clients and rejects malformed totals and methods', () => {
  const { signedContractRecord } = modules()('src/lib/contracts/signedContracts');
  const actor = { id: actorId, role: 'Indoor Sales', branch: 'Karkh', name: 'Employee' };
  const client = { client_name: 'Current client', mobile: null };
  assert.equal(signedContractRecord(row('Karkh'), actor, undefined), null);
  assert.equal(signedContractRecord(row('Najaf'), actor, client), null);
  for (const contract_total of [null, '', ' ', 'NaN', Infinity, -1, {}]) {
    const record = signedContractRecord({ ...row('Karkh'), contract_total, method: 'unknown' }, actor, client);
    assert.equal(record.total, null);
    assert.equal(record.method, null);
  }
  assert.equal(signedContractRecord({ ...row('Karkh'), contract_total: '0' }, actor, client).total, 0);
});
