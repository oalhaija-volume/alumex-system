import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const globalRoles = ['Admin', 'Sales Director', 'Company Owner'];
const offices = ['Karkh', 'Rasafa', 'Najaf'];
const timestamp = '2026-11-14T08:00:00Z';
const branches = [...offices, 'Governorates', null];
const projectRows = branches.map((branch, index) => ({
  id: `${index + 1}1111111-1111-4111-8111-111111111111`, branch, project_number: `PRJ-${index}`,
  project_name: `${branch ?? 'Unassigned'} private project`, address: `private address ${index}`,
  created_by: 'other-creator', assigned_outdoor_sales_id: actorId, client_id: `client-${index}`,
  structure_readiness: 'ready', sales_status: 'contract_signed', status: 'Production',
  created_at: timestamp, updated_at: timestamp, archived_at: null,
}));

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

function fixture(role, branch, overrides = {}) {
  const reads = [], writes = [];
  const tables = {
    projects: structuredClone(projectRows),
    sales_workflows: projectRows.map(project => ({ project_id: project.id, stage: 'signed', revision: 1,
      signed_at: timestamp, accepted_at: null, contract: { private: 'PRIVATE_CONTRACT' }, quotation: { lines: [], total: 99999 } })),
    contracts: [],
    clients: projectRows.map(project => ({ id: project.client_id, client_name: `${project.branch} private client`, mobile: `private-phone-${project.id}` })),
    openings: projectRows.map(project => ({ id: `opening-${project.id}`, project_id: project.id, width: 100, height: 150, quantity: 1 })),
    profiles: [{ id: actorId, full_name: 'Employee', role, branch }],
    field_sync_receipts: [],
    ...overrides,
  };
  const admin = {
    from(table) {
      assert.ok(table in tables, `Unexpected table ${table}`);
      const predicates = [];
      let fields = '*', from = 0, to = Infinity;
      const result = () => {
        const rows = tables[table].filter(row => predicates.every(predicate => predicate(row))).slice(from, to + 1);
        reads.push({ table, fields, rows: structuredClone(rows) });
        return { data: rows.map(row => fields === '*' ? structuredClone(row) : Object.fromEntries(fields.split(',').map(field => {
          const [name, source = name] = field.trim().split(':');
          return [name, row[source]];
        }))), error: null };
      };
      return {
        select(value) { fields = value; return this; },
        eq(key, value) { predicates.push(row => row[key] === value); return this; },
        is(key, value) { predicates.push(row => (row[key] ?? null) === value); return this; },
        in(key, values) { predicates.push(row => values.includes(row[key])); return this; },
        not(key, operator, value) { assert.equal(operator, 'is'); predicates.push(row => row[key] != null || value !== null); return this; },
        neq(key, value) { predicates.push(row => row[key] !== (value === 'null' ? null : value)); return this; },
        or(expression) {
          const alternatives = expression.split(',').map(term => term.split('.eq.'));
          predicates.push(row => alternatives.some(([key, expected]) => row[key] === expected));
          return this;
        },
        order() { return this; },
        range(start, end) { from = start; to = end; return this; },
        maybeSingle: async () => { const answer = result(); return { ...answer, data: answer.data[0] ?? null }; },
        single: async () => { const answer = result(); return { ...answer, data: answer.data[0] ?? null }; },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
    },
    async rpc(name, input) { writes.push({ name, input }); return { data: { revision: input.p_revision + 1 }, error: null }; },
  };
  const load = moduleLoader({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200, headers: options?.headers }) } },
    '@/lib/auth/adminServer': { requireRole: async allowed => allowed.includes(role)
      ? { ok: true, role, user: { id: actorId }, profile: { branch } }
      : { ok: false, status: 403, error: 'Access denied.' } },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
  });
  return { admin, reads, writes, load, get: path => load(`src/app/api/${path}/route`).GET() };
}

const allowedRows = (role, branch) => projectRows.filter(project => globalRoles.includes(role)
  || offices.includes(branch) && (role === 'Outdoor Sales' && branch !== 'Najaf'
    ? ['Karkh', 'Rasafa', 'Governorates'].includes(project.branch)
    : project.branch === branch || branch === 'Karkh' && project.branch === 'Governorates'));

const { appRoles } = moduleLoader({})('src/lib/auth/roles');

for (const role of appRoles) test(`dashboard service-role response enforces ${role} office isolation`, async () => {
  for (const branch of [...offices, null]) {
    const x = fixture(role, branch), response = await x.get('dashboard');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.projects.map(project => project.id), allowedRows(role, branch).map(project => project.id));
    for (const project of projectRows.filter(project => !allowedRows(role, branch).some(row => row.id === project.id))) {
      assert.equal(JSON.stringify(response.body).includes(project.project_name), false);
    }
  }
});

for (const role of [...globalRoles, 'CEO', 'Operations Manager', 'Project Manager']) {
  test(`operations service-role response restricts ${role} projects, contacts and openings by office`, async () => {
    for (const branch of [...offices, null]) {
      const x = fixture(role, branch), response = await x.get('operations');
      const allowed = allowedRows(role, branch), ids = allowed.map(project => project.id);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.projects.map(project => project.id), ids);
      assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE_CONTRACT|99999/);
      const clientIds = allowed.map(project => project.client_id);
      for (const read of x.reads.filter(read => read.table === 'clients')) assert.ok(read.rows.every(row => clientIds.includes(row.id)));
      for (const read of x.reads.filter(read => read.table === 'openings')) assert.ok(read.rows.every(row => ids.includes(row.project_id)));
      for (const project of response.body.projects) {
        assert.ok(project.openings.every(opening => opening.project_id === project.id));
        assert.equal(project.client.id, allowed.find(row => row.id === project.id).client_id);
      }
    }
  });
}

for (const role of ['CEO', 'Operations Manager']) test(`${role} cannot accept another branch's operation through a direct project ID`, async () => {
  for (const branch of [...offices, null]) {
    for (const project of projectRows) {
      const x = fixture(role, branch);
      const response = await x.load('src/app/api/operations/route').POST(new Request('http://localhost:3003/api/operations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, revision: 1 }),
      }));
      const allowed = allowedRows(role, branch).some(row => row.id === project.id);
      assert.equal(response.status, allowed ? 200 : 404);
      assert.equal(x.writes.length, allowed ? 1 : 0, 'Foreign office writes must fail before the service-role RPC');
    }
  }
});

for (const role of ['Admin', 'Company Owner']) test(`${role} retains its existing global operations acceptance permission`, async () => {
  for (const project of projectRows) {
    const x = fixture(role, null);
    const response = await x.load('src/app/api/operations/route').POST(new Request('http://localhost:3003/api/operations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, revision: 1 }),
    }));
    assert.equal(response.status, 200);
    assert.equal(x.writes.length, 1);
  }
});

test('Outdoor Sales historical visit logs cannot restore a project from another office', async () => {
  const current = projectRows.find(project => project.branch === 'Najaf');
  const foreign = { ...projectRows.find(project => project.branch === 'Karkh'), created_by: 'someone-else', assigned_outdoor_sales_id: 'someone-else' };
  const x = fixture('Outdoor Sales', 'Najaf', {
    projects: [current, foreign],
    field_sync_receipts: [{ operation_id: 'receipt', project_id: foreign.id, actor_id: actorId, action: 'finish', recorded_at: timestamp }],
  });
  const { data, error } = await x.load('src/lib/measurements/visitHistory').loadWorkspaceProjects(x.admin, { id: actorId, role: 'Outdoor Sales', branch: 'Najaf' });
  assert.equal(error, null);
  assert.deepEqual(data.map(project => project.id), [current.id]);
});

for (const branch of ['Rasafa', 'Najaf']) for (const history of ['legacy', 'measurement']) {
  test(`${branch} Governorates registration access does not expose another employee's ${history} entry`, async () => {
    const current = projectRows.find(project => project.branch === branch);
    const unrelated = { ...projectRows.find(project => project.branch === 'Governorates'),
      created_by: 'someone-else', assigned_outdoor_sales_id: 'someone-else',
      ...(history === 'legacy' ? { legacy_outdoor_sales_id: actorId } : {}),
    };
    const x = fixture('Outdoor Sales', branch, {
      projects: [current, unrelated],
      field_sync_receipts: history === 'measurement'
        ? [{ operation_id: 'receipt', project_id: unrelated.id, actor_id: actorId, action: 'finish', recorded_at: timestamp }]
        : [],
    });
    const { data, error } = await x.load('src/lib/measurements/visitHistory').loadWorkspaceProjects(x.admin,
      { id: actorId, role: 'Outdoor Sales', branch, outdoorTeamMemberIds: [actorId] });
    assert.equal(error, null);
    assert.deepEqual(data.map(project => project.id), [current.id]);
  });
}
