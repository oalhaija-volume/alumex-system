import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const actorId = 'operations-manager';
const timestamp = '2026-10-20T08:00:00Z';
const privateContract = { privateTerms: 'CONFIDENTIAL_CONTRACT', total: 12345 };

// Execute the real routes and shared modules; replace only authentication,
// response serialization and the Supabase transport.
function moduleLoader(dependencies) {
  const cache = new Map();
  return function load(path) {
    if (cache.has(path)) return cache.get(path);
    const exports = {};
    cache.set(path, exports);
    const source = ts.transpileModule(readFileSync(new URL(`../${path}.ts`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'exports', source)(name => {
      if (name in dependencies) return dependencies[name];
      if (name.startsWith('./')) return load(`${path.slice(0, path.lastIndexOf('/'))}/${name.slice(2)}`);
      assert.ok(name.startsWith('@/'), `Unexpected external dependency: ${name}`);
      return load(`src/${name.slice(2)}`);
    }, exports);
    return exports;
  };
}

function project(id, overrides = {}) {
  return {
    id, project_number: `PRJ-${id}`, project_name: `Project ${id}`,
    created_by: `creator-${id}`, assigned_outdoor_sales_id: actorId, branch: 'Karkh',
    client_id: `client-${id}`, structure_readiness: 'ready', sales_status: 'new_lead',
    status: 'Draft', archived_at: null, created_at: timestamp, updated_at: timestamp,
    ...overrides,
  };
}

function workflow(projectId, stage, overrides = {}) {
  return {
    project_id: projectId, stage, revision: 1,
    signed_at: ['signed', 'operations'].includes(stage) ? timestamp : null,
    accepted_at: stage === 'operations' ? timestamp : null,
    contract: privateContract, quotation: { lines: [], total: 99999 },
    ...overrides,
  };
}

function fixture({ role = 'Operations Manager', projectRows = [], contractRows = [],
  workflowRows = [], errors = {} } = {}) {
  const reads = [];
  const tables = {
    projects: projectRows,
    contracts: contractRows,
    sales_workflows: workflowRows,
    profiles: projectRows.map(row => ({ id: row.created_by, full_name: `Creator ${row.id}` })),
    clients: projectRows.map(row => ({ id: row.client_id, client_name: `Client ${row.id}`, mobile: '07700000000' })),
    openings: projectRows.map(row => ({ id: `opening-${row.id}`, project_id: row.id, width: 100, height: 150 })),
  };
  const admin = {
    from(table) {
      assert.ok(table in tables, `Unexpected table: ${table}`);
      const predicates = [];
      let fields;
      const query = {
        select(selected) { fields = selected; return this; },
        eq(key, expected) { predicates.push(row => row[key] === expected); return this; },
        is(key, expected) { predicates.push(row => row[key] === expected); return this; },
        in(key, expected) { predicates.push(row => expected.includes(row[key])); return this; },
        not(key, operator, expected) {
          assert.equal(operator, 'is');
          assert.equal(expected, null);
          // Missing contract fields represent SQL NULL; explicit null represents
          // JSON null, which requires the separate PostgREST neq filter.
          predicates.push(row => key === 'contract' ? row[key] !== undefined : row[key] != null);
          return this;
        },
        neq(key, expected) {
          predicates.push(row => row[key] !== undefined && row[key] !== (expected === 'null' ? null : expected));
          return this;
        },
        or(expression) {
          const alternatives = expression.split(',').map(part => part.split('.eq.'));
          predicates.push(row => alternatives.some(([key, expected]) => row[key] === expected));
          return this;
        },
        order() { return this; },
        then(resolve, reject) {
          const rows = tables[table].filter(row => predicates.every(predicate => predicate(row)));
          const selected = rows.map(row => Object.fromEntries(fields.split(',').map(field => {
            const [name, source = name] = field.trim().split(':');
            return [name, row[source]];
          })));
          reads.push({ table, fields, rows: selected });
          return Promise.resolve({ data: errors[table] ? null : selected, error: errors[table] ?? null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const load = moduleLoader({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200, headers: options?.headers }) } },
    '@/lib/auth/adminServer': { requireRole: async allowed => {
      if (!allowed.includes(role)) return { ok: false, status: 403, error: 'Access denied.' };
      return { ok: true, role, user: { id: actorId }, profile: { branch: 'Karkh' } };
    } },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
    '@/lib/contracts/uploadedTerms': { uploadedContractTerms: () => { throw Error('Unexpected contract access'); } },
  });
  return { reads, load, get: path => load(`src/app/api/${path}/route`).GET() };
}

function assertProjectIds(response, expected) {
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.projects.map(row => row.id), expected);
}

test('dashboard hides projects without contracts regardless of status or early workflow records', async () => {
  const x = fixture({
    projectRows: [project('new'), project('misleading', { sales_status: 'contract_generated', status: 'Production' }),
      project('quotation'), project('approved'), project('sql-null'), project('json-null')],
    workflowRows: [workflow('quotation', 'quotation'), workflow('approved', 'approved'),
      workflow('sql-null', 'signed', { contract: undefined }), workflow('json-null', 'operations', { contract: null })],
  });
  assertProjectIds(await x.get('dashboard'), []);
  assert.equal(x.reads.some(read => read.table === 'profiles'), false);
});

test('dashboard includes generated, signed, operations and legacy Draft contracts once, excluding archived projects', async () => {
  const visible = ['generated', 'signed', 'operations', 'legacy', 'both'];
  const x = fixture({
    projectRows: [...visible.map(id => project(id)), project('hidden'), project('archived', { archived_at: timestamp })],
    workflowRows: [workflow('generated', 'contract'), workflow('signed', 'signed'),
      workflow('operations', 'operations'), workflow('both', 'contract'), workflow('archived', 'contract')],
    contractRows: [
      { project_id: 'legacy', status: 'Draft', privateTerms: 'CONFIDENTIAL_CONTRACT' },
      { project_id: 'both', status: 'Draft' }, { project_id: 'both', status: 'Signed' },
      { project_id: 'archived', status: 'Draft' },
    ],
  });
  const response = await x.get('dashboard');
  assertProjectIds(response, visible);
  assert.match(response.headers['Cache-Control'], /no-store/);
  assert.equal(response.body.projects[0].registeredBy, 'Creator generated');
  assert.deepEqual(x.reads.find(read => read.table === 'profiles').rows.map(row => row.id), visible.map(id => `creator-${id}`));
  const contractReads = x.reads.filter(read => ['contracts', 'sales_workflows'].includes(read.table));
  assert.equal(contractReads.length, 2);
  assert.ok(contractReads.every(read => read.fields === 'project_id'));
  assert.ok(contractReads.every(read => read.rows.every(row => row.project_id !== 'archived')));
  assert.equal(JSON.stringify(response.body).includes('CONFIDENTIAL_CONTRACT'), false);
  assert.ok(response.body.projects.every(row => !('contract' in row) && !('quotation' in row)));
});

test('dashboard skips contract and creator lookups when no active projects exist', async () => {
  for (const projectRows of [[], [project('archived', { archived_at: timestamp })]]) {
    const x = fixture({ projectRows, errors: { contracts: { message: 'unavailable' }, sales_workflows: { message: 'unavailable' } } });
    assertProjectIds(await x.get('dashboard'), []);
    assert.deepEqual(x.reads.map(read => read.table), ['projects']);
  }
});

for (const table of ['contracts', 'sales_workflows']) {
  test(`dashboard fails closed when the ${table} contract lookup fails`, async () => {
    const x = fixture({ projectRows: [project('known')],
      contractRows: [{ project_id: 'known', status: 'Draft' }],
      workflowRows: [workflow('known', 'contract')], errors: { [table]: { message: 'PRIVATE_DATABASE_DETAIL' } } });
    const response = await x.get('dashboard');
    assert.equal(response.status, 500);
    assert.equal(response.body.projects, undefined);
    assert.equal(JSON.stringify(response.body).includes('PRIVATE_DATABASE_DETAIL'), false);
    assert.equal(x.reads.some(read => read.table === 'profiles'), false);
  });
}

for (const role of ['Admin', 'CEO', 'Company Owner', 'Sales Director', 'Sales Manager', 'Indoor Sales', 'Outdoor Sales', 'Project Manager']) {
  test(`dashboard preserves ${role} visibility of projects without contracts`, async () => {
    const x = fixture({ role, projectRows: [project('new'), project('approved'), project('archived', { archived_at: timestamp })],
      errors: { contracts: { message: 'unavailable' }, sales_workflows: { message: 'unavailable' } } });
    assertProjectIds(await x.get('dashboard'), ['new', 'approved']);
    assert.equal(x.reads.some(read => ['contracts', 'sales_workflows'].includes(read.table)), false);
  });
}

test('operations requires both a contract and signed handoff before exposing project details', async () => {
  const ids = ['new', 'generated', 'unsigned-signed', 'unsigned-operations', 'sql-null', 'json-null', 'signed', 'operations', 'legacy'];
  const x = fixture({
    projectRows: ids.map(id => project(id)),
    contractRows: [{ project_id: 'legacy', status: 'Draft' }],
    workflowRows: [workflow('generated', 'contract'), workflow('unsigned-signed', 'signed', { signed_at: null }),
      workflow('unsigned-operations', 'operations', { signed_at: null }),
      workflow('sql-null', 'signed', { contract: undefined }), workflow('json-null', 'operations', { contract: null }),
      workflow('signed', 'signed'), workflow('operations', 'operations')],
  });
  const response = await x.get('operations');
  assertProjectIds(response, ['signed', 'operations']);
  assert.equal(response.body.canAccept, true);
  assert.match(response.headers['Cache-Control'], /no-store/);
  for (const read of x.reads.filter(read => ['projects', 'openings', 'clients'].includes(read.table))) {
    const key = read.table === 'openings' ? 'project_id' : 'id';
    const allowed = read.table === 'clients' ? ['client-signed', 'client-operations'] : ['signed', 'operations'];
    assert.ok(read.rows.every(row => allowed.includes(row[key])));
  }
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes('CONFIDENTIAL_CONTRACT'), false);
  assert.equal(serialized.includes('99999'), false);
  assert.ok(response.body.projects.every(row => !('contract' in row.handoff) && !('quotation' in row.handoff)));
});

test('operations returns an empty list without project or contact reads when no signed contract exists', async () => {
  const x = fixture({ projectRows: [project('generated'), project('missing')],
    workflowRows: [workflow('generated', 'contract'), workflow('missing', 'signed', { contract: null })] });
  assertProjectIds(await x.get('operations'), []);
  assert.deepEqual(x.reads.map(read => read.table), ['sales_workflows']);
});

test('operations returns work requirements while stripping nested commercial and contract fields', async () => {
  const confidential = { rate: 123456, total: 987654, terms: 'PRIVATE_TERMS', signature: 'PRIVATE_SIGNATURE' };
  const x = fixture({
    projectRows: [project('requirements')],
    workflowRows: [workflow('requirements', 'signed', {
      evidence: { path: 'PRIVATE_SIGNED_FILE', signer: 'PRIVATE_SIGNER' },
      quotation: {
        ...confidential,
        lines: [{
          ...confidential,
          opening: { id: 'opening-requirements', ...confidential },
          system: { name: 'Alumex Sliding Window', ...confidential },
          glass: { name: 'Low-E Glass', ...confidential },
          extras: [{ name: 'Roller shutter', quantity: 2, unit: 'item', ...confidential }],
        }],
        additionalItems: [{
          name: 'Facade panels', quantity: 12, unit: 'sqm', ...confidential,
          measurements: [{ label: 'Front', width: 2, height: 3, quantity: 2, ...confidential }],
          extras: [{ name: 'Bracket', quantity: 4, unit: 'item', ...confidential }],
        }],
      },
    })],
  });
  const response = await x.get('operations');
  assertProjectIds(response, ['requirements']);
  assert.deepEqual(response.body.projects[0].handoff, {
    project_id: 'requirements', stage: 'signed', revision: 1, signed_at: timestamp, accepted_at: null,
    specifications: [{ openingId: 'opening-requirements', system: 'Alumex Sliding Window', glass: 'Low-E Glass',
      extras: [{ name: 'Roller shutter', quantity: 2, unit: 'item' }] }],
    additionalItems: [{ name: 'Facade panels', quantity: 12, unit: 'sqm',
      measurements: [{ label: 'Front', width: 2, height: 3, quantity: 2 }],
      extras: [{ name: 'Bracket', quantity: 4, unit: 'item' }] }],
  });
  assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE_|CONFIDENTIAL_CONTRACT|123456|987654/);
  assert.ok(x.reads.filter(read => read.table === 'sales_workflows')
    .every(read => !read.fields.split(',').some(field => ['contract', 'evidence'].includes(field))));
});

test('Operations Manager cannot read contracts, download signed copies or modify the commercial workflow', async () => {
  const x = fixture();
  const route = x.load('src/app/api/sales-flow/[projectId]/route');
  const projectId = '11111111-1111-4111-8111-111111111111';
  const context = { params: Promise.resolve({ projectId }) };
  for (const query of ['', '?download=signed']) {
    const response = await route.GET(new Request(`http://localhost:3003/api/sales-flow/${projectId}${query}`), context);
    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: 'Access denied.' });
  }
  const response = await route.POST(new Request(`http://localhost:3003/api/sales-flow/${projectId}`, { method: 'POST' }), context);
  assert.equal(response.status, 403);
  assert.deepEqual(x.reads, []);
  const permissions = x.load('src/lib/auth/permissions');
  assert.equal(permissions.canAccessRoute(`/contract/${projectId}`, 'Operations Manager'), false);
  assert.equal(permissions.canAccessRoute(`/quotation/${projectId}`, 'Operations Manager'), false);
});
