import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const actorId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const operationId = '33333333-3333-4333-8333-333333333333';
const projects = ['Karkh', 'Rasafa', null].map((branch, index) => ({
  id: `${index + 4}${'4'.repeat(7)}-4444-4444-8444-444444444444`,
  branch, project_name: `${branch ?? 'Unassigned'} project`, project_number: `PRJ-${index}`,
  client_id: `client-${index}`, created_by: otherId, assigned_outdoor_sales_id: actorId,
  follow_up_owner_id: actorId, structure_readiness: 'ready', sales_status: 'new_lead',
  archived_at: null, created_at: '2026-10-20T08:00:00Z', updated_at: '2026-10-20T08:00:00Z',
}));

// Execute the real TypeScript route and shared access modules; only replace
// authentication, HTTP serialization and the database transport.
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
      if (name.startsWith('./') && name.endsWith('.json')) {
        return JSON.parse(readFileSync(new URL(name, new URL(`../${path}.ts`, import.meta.url)), 'utf8'));
      }
      if (name.startsWith('./')) return load(`${path.slice(0, path.lastIndexOf('/'))}/${name.slice(2)}`);
      assert.ok(name.startsWith('@/'), `Unexpected external dependency: ${name}`);
      return load(`src/${name.slice(2)}`);
    }, exports);
    return exports;
  };
}

function fixture({ role = 'Indoor Sales', branch = 'Karkh', profileBranch = branch,
  projectRows = projects, rpcError = null, projectError = null, deletedBranch, outdoorRotationStartBranch } = {}) {
  const reads = [], writes = [], rpcCalls = [];
  const tables = {
    projects: structuredClone(projectRows),
    field_sync_receipts: [],
    profiles: [
      { id: actorId, full_name: 'Employee', role, branch: profileBranch, outdoor_rotation_start_branch: outdoorRotationStartBranch, is_active: true, status: 'Active' },
      { id: otherId, full_name: 'Creator', role: 'Outdoor Sales', is_active: true, status: 'Active' },
    ],
    clients: projects.map(p => ({ id: p.client_id, mobile: `phone-${p.branch}` })),
    openings: projects.map(p => ({ id: `opening-${p.id}`, project_id: p.id,
      floor: 'Ground', room: 'Kitchen', width: 120, height: 150, quantity: 1 })),
    measurement_completion_reports: projects.map(p => ({ id: `report-${p.id}`, project_id: p.id, note: p.project_name })),
    audit_events: deletedBranch === undefined ? [] : [{ id: 'deletion', action: 'project_deleted',
      entity_type: 'project', entity_id: projects[0].id, previous_value: { branch: deletedBranch } }],
  };
  function value(row, key) {
    const [column, property] = key.split('->>');
    return property ? row[column]?.[property] : row[column];
  }
  const admin = {
    from(table) {
      assert.ok(table in tables, `Unexpected table: ${table}`);
      const predicates = [];
      let mutation, fields, max = Infinity;
      const query = {
        select(selected) { fields = selected; return this; },
        eq(key, expected) { predicates.push(row => value(row, key) === expected); return this; },
        is(key, expected) { predicates.push(row => value(row, key) === expected); return this; },
        in(key, expected) { predicates.push(row => expected.includes(value(row, key))); return this; },
        or(expression) {
          const alternatives = expression.split(',').map(part => part.split('.eq.'));
          predicates.push(row => alternatives.some(([key, expected]) => value(row, key) === expected));
          return this;
        },
        order() { return this; },
        range() { return this; },
        limit(count) { max = count; return this; },
        insert(payload) { mutation = { action: 'insert', payload }; return this; },
        update(payload) { mutation = { action: 'update', payload }; return this; },
        then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); },
        single() { return Promise.resolve(result(true)); },
        maybeSingle() { return Promise.resolve(result(true)); },
      };
      function result(single) {
        const rows = tables[table].filter(row => predicates.every(predicate => predicate(row))).slice(0, max);
        if (mutation) writes.push({ table, ...mutation, ids: rows.map(row => row.id) });
        else reads.push({ table, fields, rows });
        return { data: single ? rows[0] ?? null : rows, error: table === 'projects' ? projectError : null };
      }
      return query;
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      return { data: tables.projects.find(p => p.id === args.p_project) ?? null, error: rpcError };
    },
  };
  const load = moduleLoader({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200, headers: options?.headers }) } },
    '@/lib/auth/adminServer': { requireRole: async allowed => {
      assert.ok(allowed.includes(role), role);
      return { ok: true, role, user: { id: actorId }, profile: { branch } };
    } },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
  });
  return { load, reads, writes, rpcCalls };
}

const context = projectId => ({ params: Promise.resolve({ projectId, openingId: operationId }) });
const request = body => ({ url: 'http://localhost:3003/api/offline', json: async () => body });
const offlineChange = (projectId, action = 'finish') => ({
  id: operationId, userId: actorId, projectId, action, recordedAt: '2026-10-20T08:00:00Z',
  payload: action === 'register'
    ? { client: { clientName: 'Example', mobile: '07700000000', clientType: 'individual' },
      project: { address: 'Baghdad', locationLatitude: 33.3, locationLongitude: 44.4,
        structureReadiness: 'ready', assignedOutdoorSalesId: actorId } }
    : {},
});
const assertHidden = response => {
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: 'Project not found.' });
};

for (const branch of ['Karkh', 'Rasafa', null, 'unknown']) {
  for (const path of ['dashboard', 'workspace', 'offline']) {
    test(`${path}: Indoor Sales ${branch ?? 'unassigned'} sees only its branch and related data`, async () => {
      const x = fixture({ branch });
      const response = await x.load(`src/app/api/${path}/route`).GET(request());
      assert.equal(response.status, 200);
      const allowed = projects.filter(p => p.branch === branch && ['Karkh', 'Rasafa'].includes(branch));
      assert.deepEqual(response.body.projects.map(p => p.id), allowed.map(p => p.id));
      for (const read of x.reads) {
        if (['openings', 'measurement_completion_reports'].includes(read.table)) {
          assert.ok(read.rows.every(row => allowed.some(p => p.id === row.project_id)));
        }
        if (read.table === 'clients') assert.ok(read.rows.every(row => allowed.some(p => p.client_id === row.id)));
      }
      assert.match(response.headers['Cache-Control'], /no-store/);
    });
  }
}

for (const role of ['Admin', 'Sales Director', 'CEO', 'Company Owner', 'Sales Manager', 'Outdoor Sales']) {
  test(`${role} keeps existing project visibility across branches`, async () => {
    for (const path of ['dashboard', 'workspace', 'offline']) {
      const response = await fixture({ role }).load(`src/app/api/${path}/route`).GET(request());
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.projects.map(p => p.id), projects.map(p => p.id));
    }
    for (const project of projects) {
      const x = fixture({ role });
      assert.equal((await x.load('src/lib/workflow/access').salesProject(project.id)).response, undefined);
      assert.equal((await x.load('src/app/api/initial-measurements/[projectId]/route').GET(request(), context(project.id))).status, 200);
    }
  });
}

for (const branch of ['Karkh', 'Rasafa', null]) {
  test(`shared project access and measurements enforce ${branch ?? 'unassigned'} branch even for creator or assignee`, async () => {
    for (const project of projects) {
      const own = branch !== null && project.branch === branch;
      for (const scope of [false, true, 'commercial']) {
        const x = fixture({ branch, projectRows: [{ ...project, created_by: actorId }] });
        const result = await x.load('src/lib/workflow/access').salesProject(project.id, scope);
        if (own) assert.equal(result.project.id, project.id);
        else assertHidden(result.response);
      }
      for (const method of ['GET', 'POST', 'PATCH']) {
        const x = fixture({ branch, projectRows: [{ ...project, created_by: actorId }] });
        const route = x.load('src/app/api/initial-measurements/[projectId]/route');
        const body = method === 'PATCH' ? { action: 'reopen' } : {
          id: operationId, floor: 'Ground', room: 'Kitchen', width: 120, height: 150,
          structuralType: 'Window', openingType: 'Sliding',
        };
        const response = await route[method](request(body), context(project.id));
        if (own) assert.equal(response.status, method === 'POST' ? 201 : 200);
        else {
          assertHidden(response);
          assert.deepEqual(x.reads.map(read => read.table), ['projects']);
          assert.equal(x.writes.length + x.rpcCalls.length, 0);
        }
      }
    }
  });
}

for (const path of [
  'sales-flow/[projectId]',
  'measurement-reports/[projectId]',
  'skylight-capture/[projectId]/[openingId]',
  'curtain-wall-capture/[projectId]/[openingId]',
  'projects/[projectId]/follow-ups',
]) {
  test(`${path} refuses cross-branch reads before loading sensitive records`, async () => {
    const x = fixture();
    const response = await x.load(`src/app/api/${path}/route`).GET(request(), context(projects[1].id));
    assertHidden(response);
    assert.deepEqual(x.reads.map(read => read.table), ['projects']);
  });
}

test('workspace and quotation mutations cannot bypass branch access', async () => {
  for (const branch of ['Karkh', 'Rasafa']) {
    const otherProject = projects.find(project => project.branch !== branch && project.branch !== null);
    const x = fixture({ branch });
    for (const action of ['ready', 'follow-up', 'cancel-project', 'reactivate-project']) {
      assertHidden(await x.load('src/app/api/workspace/route').PATCH(request({ projectId: otherProject.id, action })));
    }
    assertHidden(await x.load('src/app/api/sales-flow/[projectId]/route').POST(request({ action: 'save' }), context(otherProject.id)));
    assert.equal(x.writes.length + x.rpcCalls.length, 0);
    assert.ok(x.reads.every(read => read.table === 'projects'));
  }
});

test('Outdoor Sales still needs project creation or assignment regardless of branch', async () => {
  const projectRows = projects.map(project => ({ ...project, assigned_outdoor_sales_id: otherId }));
  for (const path of ['dashboard', 'workspace', 'offline']) {
    const response = await fixture({ role: 'Outdoor Sales', projectRows }).load(`src/app/api/${path}/route`).GET(request());
    assert.deepEqual(response.body.projects, []);
  }
  const x = fixture({ role: 'Outdoor Sales', projectRows });
  assertHidden((await x.load('src/lib/workflow/access').salesProject(projects[0].id)).response);
  assertHidden(await x.load('src/app/api/initial-measurements/[projectId]/route').GET(request(), context(projects[0].id)));
});

for (const action of ['finish', 'register']) {
  for (const branch of ['Karkh', 'Rasafa', null]) {
    test(`offline ${action} rejects cross-branch changes and replayed registrations for ${branch ?? 'unassigned'} employee`, async () => {
      for (const project of projects) {
        const x = fixture({ branch });
        const response = await x.load('src/app/api/offline/route').POST(request(offlineChange(project.id, action)));
        if (branch !== null && project.branch === branch) {
          assert.equal(response.status, 200);
          assert.equal(x.rpcCalls.length, 1);
        } else {
          assertHidden(response);
          assert.equal(x.rpcCalls.length, 0);
        }
      }
    });
  }
}

test('offline preflight database failures do not send writes or disclose project information', async () => {
  const x = fixture({ projectError: { message: 'Private database details' } });
  const response = await x.load('src/app/api/offline/route').POST(request(offlineChange(projects[0].id)));
  assert.equal(response.status, 503);
  assert.equal(x.rpcCalls.length, 0);
  assert.equal(JSON.stringify(response.body).includes('Private database details'), false);
});

for (const deletedBranch of ['Karkh', 'Rasafa', null]) {
  test(`deleted project disclosure is limited to the same branch: ${deletedBranch ?? 'unassigned'}`, async () => {
    const x = fixture({ projectRows: [], deletedBranch, rpcError: { message: 'Project is not available to this employee' } });
    const response = await x.load('src/app/api/offline/route').POST(request(offlineChange(projects[0].id)));
    assert.equal(response.status, deletedBranch === 'Karkh' ? 410 : 409);
    assert.equal(response.body.code, deletedBranch === 'Karkh' ? 'project_deleted' : undefined);
  });
}

test('a branch transfer during offline refresh cannot return projects from the former branch', async () => {
  const x = fixture({ branch: 'Karkh', profileBranch: 'Rasafa' });
  const response = await x.load('src/app/api/offline/route').GET(request());
  assert.equal(response.status, 200);
  assert.equal(response.body.actor.branch, 'Rasafa');
  assert.ok(response.body.projects.every(project => project.branch === 'Rasafa'));
  assert.deepEqual(response.body.openings, []);
  assert.deepEqual(response.body.measurementReports, []);
});

for(const [path,session] of [['workspace',false],['offline',false],['offline',true]]) {
  for(const starter of ['Karkh','Rasafa',null,undefined]) {
    test(`${path}${session?' session':''} carries the current Outdoor monthly rotation seed ${String(starter)}`,async()=>{
      const x=fixture({role:'Outdoor Sales',branch:'Karkh',outdoorRotationStartBranch:starter});
      const response=await x.load(`src/app/api/${path}/route`).GET({...request(),url:`http://localhost:3003/api/${path}${session?'?session=1':''}`});
      assert.equal(response.status,200);
      assert.equal(response.body.actor.outdoorRotationStartBranch,starter??null);
      assert.equal(response.body.actor.branch,null,'A legacy fixed branch must not determine the Outdoor rotation');
      assert.ok(x.reads.some(read=>read.table==='profiles'&&read.fields.includes('outdoor_rotation_start_branch')));
      if(!session)assert.deepEqual(response.body.projects.map(project=>project.id),projects.map(project=>project.id),'Monthly project creation restrictions preserve access to existing assigned projects');
    });
  }
}

test('Indoor branch snapshots do not apply an unrelated Outdoor rotation field',async()=>{
  for(const path of ['workspace','offline']){
    const x=fixture({branch:'Karkh',outdoorRotationStartBranch:'Rasafa'});
    const response=await x.load(`src/app/api/${path}/route`).GET(request());
    assert.equal(response.status,200);
    assert.equal(response.body.actor.branch,'Karkh');
    assert.equal(response.body.actor.outdoorRotationStartBranch,null);
  }
});
