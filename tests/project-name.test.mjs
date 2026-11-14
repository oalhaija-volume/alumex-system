import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Indoor employee', role: 'Indoor Sales', branch: 'Karkh' };
const outdoor = { ...actor, name: 'Outdoor employee', role: 'Outdoor Sales', branch: null };
const projectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const operationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const updatedAt = '2026-11-04T09:00:00.000Z';
const project = {
  id: projectId, project_name: 'Original project', project_number: 'PRJ-NAME',
  created_by: actor.id, assigned_outdoor_sales_id: 'another-employee',
  structure_readiness: 'ready', sales_status: 'quotation_approved',
  branch: 'Karkh',
  updated_at: updatedAt, serverUpdatedAt: updatedAt, project_notes: 'Keep this note',
};

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

test('Outdoor Sales cannot rename created, assigned or historical project names', () => {
  const { canRenameProject } = modules()('lib/workflow/projectName');
  assert.equal(canRenameProject(project, outdoor), false);
  assert.equal(canRenameProject({ ...project, created_by: 'indoor', assigned_outdoor_sales_id: outdoor.id }, outdoor), false);
  for (const role of ['Admin', 'CEO', 'Sales Director', 'Company Owner', 'HR']) {
    assert.equal(canRenameProject(project, { ...outdoor, role }), false, role);
  }
  for (const inaccessible of [
    { ...project, created_by: 'indoor', assigned_outdoor_sales_id: 'other' },
    { ...project, created_by: 'indoor', assigned_outdoor_sales_id: 'other', legacy_outdoor_sales_id: actor.id },
    { ...project, project_log_only: true },
  ]) assert.equal(canRenameProject(inaccessible, outdoor), false);
});

test('Indoor Sales can rename accessible project titles without owning the project', () => {
  const { canRenameProject } = modules()('lib/workflow/projectName');
  for (const branch of ['Karkh','Rasafa','Najaf']) {
    const indoor = { ...actor, role: 'Indoor Sales', branch };
    assert.equal(canRenameProject({ ...project, created_by: 'outdoor', branch }, indoor), true);
    assert.equal(canRenameProject({ ...project, branch: 'Governorates' }, indoor), branch === 'Karkh');
    assert.equal(canRenameProject({ ...project, branch: branch === 'Karkh' ? 'Rasafa' : 'Karkh' }, indoor), false);
    assert.equal(canRenameProject({ ...project, branch, project_log_only: true }, indoor), false);
    assert.equal(canRenameProject({ ...project, branch: null }, indoor), false);
  }
  assert.equal(canRenameProject({ ...project, branch: 'Karkh' }, { ...actor, role: 'Indoor Sales', branch: null }), false);
  assert.equal(canRenameProject({ ...project, branch: 'Rasafa' }, { ...actor, role: 'Sales Manager', branch: 'Rasafa' }), true);
});

test('project names accept trimmed Arabic and English and reject empty, oversized or non-string values', () => {
  const { normalizeProjectName } = modules()('lib/workflow/projectName');
  for (const name of ['  New project  ', '  مشروع المنصور  ', 'x'.repeat(150)]) {
    assert.deepEqual(normalizeProjectName({ projectName: name, clientName: 'Forged client' }), { projectName: name.trim() });
  }
  for (const name of [undefined, null, '', ' \n\t ', 123, {}, ['Name'], 'x'.repeat(151)]) {
    assert.throws(() => normalizeProjectName({ projectName: name }));
  }
});

function endpoint(path, { role = actor.role, branch = 'Karkh', currentProject = project, rpcError = null, authenticated = true } = {}) {
  const calls = [], scopes = [];
  const auth = { ok: true, role, user: { id: actor.id }, profile: { branch } };
  const admin = {
    from(table) {
      assert.equal(table, 'projects');
      return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { branch: currentProject.branch }, error: null }) };
    },
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: { ...currentProject, project_name: args.p_payload.projectName }, error: rpcError };
    },
  };
  const api = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/auth/adminServer': { requireRole: async () => authenticated ? auth : { ok: false, error: 'Unauthorized', status: 401 } },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/workflow/access': {
      salesRoles: ['Outdoor Sales', 'Indoor Sales', 'Admin'],
      salesProject: async (id, scope) => {
        assert.equal(id, projectId);
        scopes.push(scope);
        if (!authenticated) return { response: { status: 401, body: { error: 'Unauthorized' } } };
        return { auth, admin, project: currentProject };
      },
    },
  })(`app/api/${path}/route`);
  return { api, calls, scopes };
}

const request = body => ({ json: async () => body });
const rename = { action: 'rename-project', projectId, projectName: '  New project  ', expectedUpdatedAt: updatedAt };

for(const path of ['workspace','offline'])test(`${path} permits Karkh project titles in its branch and Governorates`,async()=>{
  for(const branch of ['Karkh','Governorates']){
    const x=endpoint(path,{role:'Indoor Sales',currentProject:{...project,created_by:'outdoor-creator',branch}});
    const response=path==='workspace'?await x.api.PATCH(request({...rename,clientName:'Must stay unchanged'})):await x.api.POST(request(savedRename));
    assert.equal(response.status,200);
    assert.equal(x.calls.length,1);
    assert.equal(x.calls[0].name,'sync_field_change');
    assert.equal(x.calls[0].args.p_actor,actor.id);
    assert.equal(x.calls[0].args.p_action,'rename-project');
    assert.equal(x.calls[0].args.p_expected_updated_at,updatedAt);
    assert.deepEqual(x.calls[0].args.p_payload,{projectName:path==='workspace'?'New project':'Saved project'});
  }
});

for(const path of ['workspace','offline'])test(`${path} denies Rasafa Indoor project title changes in Governorates before any RPC`,async()=>{
  const x=endpoint(path,{role:'Indoor Sales',branch:'Rasafa',currentProject:{...project,created_by:actor.id,assigned_outdoor_sales_id:actor.id,branch:'Governorates'}});
  const response=path==='workspace'?await x.api.PATCH(request(rename)):await x.api.POST(request(savedRename));
  assert.equal(response.status,path==='workspace'?403:404);
  assert.equal(x.calls.length,0);
});

for(const path of ['workspace','offline'])test(`${path} refuses Indoor title changes outside its branch`,async()=>{
  for(const branch of ['Rasafa',null]){
    const x=endpoint(path,{role:'Indoor Sales',currentProject:{...project,branch}});
    const response=path==='workspace'?await x.api.PATCH(request(rename)):await x.api.POST(request(savedRename));
    assert.equal(response.status,path==='workspace'?403:404);
    assert.equal(x.calls.length,0);
  }
});

for(const path of ['workspace','offline'])test(`${path} permits Sales Manager project titles only in the assigned office`,async()=>{
  const x=endpoint(path,{role:'Sales Manager',branch:'Rasafa',currentProject:{...project,created_by:'outdoor-creator',branch:'Rasafa'}});
  const response=path==='workspace'?await x.api.PATCH(request(rename)):await x.api.POST(request(savedRename));
  assert.equal(response.status,200);
  assert.equal(x.calls.length,1);
});

test('Indoor title changes remain device-first and preserve all other project data',async t=>{
  const employee={...actor,role:'Indoor Sales',branch:'Karkh'};
  const currentProject={...project,created_by:'outdoor-creator',branch:'Karkh',client_id:'unchanged-client'};
  const x=device(t,{employee,currentProject});
  const before=x.state;
  await x.client.saveFieldChange('rename-project',projectId,{projectName:'  عنوان المشروع الجديد  ',clientName:'Must not change'},actor.id);
  const after=x.state;
  assert.equal(after.projects[0].project_name,'عنوان المشروع الجديد');
  assert.deepEqual({...after.projects[0],project_name:before.projects[0].project_name,pending:before.projects[0].pending},{...before.projects[0],pending:before.projects[0].pending});
  assert.equal(after.projects[0].client_id,'unchanged-client');
  assert.deepEqual(after.openings,before.openings);
  assert.equal(after.queue.length,1);
  assert.deepEqual(after.queue[0].payload,{projectName:'عنوان المشروع الجديد'});
});

test('desktop rename uses project access, the signed-in actor and the displayed version, and strips forged fields', async () => {
  const x = endpoint('workspace');
  const response = await x.api.PATCH(request({ ...rename, actor: 'forged', userId: 'forged', sales_status: 'contract_signed', clientName: 'Forged client' }));
  assert.equal(response.status, 200);
  assert.deepEqual(x.scopes, [false]);
  assert.equal(x.calls.length, 1);
  const { name, args } = x.calls[0];
  assert.equal(name, 'sync_field_change');
  assert.equal(args.p_actor, actor.id);
  assert.equal(args.p_project, projectId);
  assert.equal(args.p_action, 'rename-project');
  assert.equal(args.p_expected_updated_at, updatedAt);
  assert.deepEqual(args.p_payload, { projectName: 'New project' });
});

test('other workspace actions keep the existing CRM authorization scope', async () => {
  const x = endpoint('workspace');
  await x.api.PATCH(request({ action: 'unknown-action', projectId }));
  assert.deepEqual(x.scopes, [true]);
  assert.equal(x.calls.length, 0);
});

for (const role of ['Outdoor Sales', 'Admin', 'CEO', 'HR']) test(`desktop rename refuses ${role}`, async () => {
  const x = endpoint('workspace', { role });
  assert.equal((await x.api.PATCH(request(rename))).status, 403);
  assert.equal(x.calls.length, 0);
});

for (const path of ['workspace', 'offline']) test(`${path} rejects Outdoor project creators and assigned employees without calling SQL`, async () => {
  for (const currentProject of [
    project,
    { ...project, created_by: 'another-creator', assigned_outdoor_sales_id: outdoor.id },
  ]) {
    const x = endpoint(path, { role: outdoor.role, currentProject });
    const response = path === 'workspace' ? await x.api.PATCH(request(rename)) : await x.api.POST(request(savedRename));
    assert.equal(response.status, 403);
    assert.match(response.body.error, /Indoor Sales/);
    assert.deepEqual(x.calls, []);
  }
});

test('desktop rename refuses Outdoor access to another employee’s project and malformed names or versions', async () => {
  const foreign = endpoint('workspace', { role: 'Outdoor Sales', currentProject: { ...project, created_by: 'other', assigned_outdoor_sales_id: 'other' } });
  assert.equal((await foreign.api.PATCH(request(rename))).status, 403);
  assert.equal(foreign.calls.length, 0);
  for (const patch of [{ projectName: '' }, { projectName: 123 }, { projectName: 'x'.repeat(151) }, { expectedUpdatedAt: undefined }, { expectedUpdatedAt: 'invalid' }]) {
    const x = endpoint('workspace');
    assert.equal((await x.api.PATCH(request({ ...rename, ...patch }))).status, 400);
    assert.equal(x.calls.length, 0);
  }
});

test('desktop rename preserves database conflict errors instead of reporting success', async () => {
  const x = endpoint('workspace', { rpcError: { message: 'Project changed on another device' } });
  const response = await x.api.PATCH(request(rename));
  assert.equal(response.status, 409);
  assert.match(response.body.error, /another device/);
});

const savedRename = {
  id: operationId, userId: actor.id, projectId, action: 'rename-project',
  recordedAt: updatedAt, expectedUpdatedAt: updatedAt,
  payload: { projectName: '  Saved project  ', sales_status: 'contract_signed', clientName: 'Forged client' },
};

test('offline rename normalizes only the name and keeps operation identity and version for replay', async () => {
  const x = endpoint('offline');
  assert.equal((await x.api.POST(request(savedRename))).status, 200);
  assert.equal(x.calls.length, 1);
  const { args } = x.calls[0];
  assert.equal(args.p_operation, operationId);
  assert.equal(args.p_actor, actor.id);
  assert.equal(args.p_expected_updated_at, updatedAt);
  assert.deepEqual(args.p_payload, { projectName: 'Saved project' });
});

test('offline rename rejects a different account, unrelated roles and invalid names before calling SQL', async () => {
  for (const [options, change, expectedStatus] of [
    [{}, { ...savedRename, userId: 'forged' }, 400],
    [{ role: 'Admin' }, savedRename, 403],
    [{ role: 'Outdoor Sales' }, savedRename, 403],
    [{ role: 'HR' }, savedRename, 403],
    [{}, { ...savedRename, payload: { projectName: '  ' } }, 400],
    [{}, { ...savedRename, payload: { projectName: 'x'.repeat(151) } }, 400],
  ]) {
    const x = endpoint('offline', options);
    assert.equal((await x.api.POST(request(change))).status, expectedStatus);
    assert.equal(x.calls.length, 0);
  }
});

for (const path of ['workspace', 'offline']) test(`${path} rename requires authentication`, async () => {
  const x = endpoint(path, { authenticated: false });
  const response = path === 'workspace' ? await x.api.PATCH(request(rename)) : await x.api.POST(request(savedRename));
  assert.equal(response.status, 401);
  assert.equal(x.calls.length, 0);
});

function device(t, { employee = actor, currentProject = project, initialQueue = [] } = {}) {
  const previous = new Map(['window', 'navigator', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  let state = { actor: employee, projects: [structuredClone(currentProject)], openings: [{ id: 'opening', projectId, width: 100 }], queue: structuredClone(initialQueue), syncedAt: null };
  let active = employee.id;
  globalThis.window = { location: { pathname: '/offline' }, dispatchEvent() {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  const store = {
    activeFieldUser: () => active,
    setFieldUser: id => { active = id; },
    readStoredFieldState: async () => structuredClone(state),
    readFieldState: async () => structuredClone(state),
    updateFieldState: async (id, change) => {
      assert.equal(id, employee.id);
      state = change(structuredClone(state));
      return structuredClone(state);
    },
  };
  const client = modules({ './store': store, './device': { isOfflineDevice: () => true } })('lib/offline/client');
  return { client, get state() { return structuredClone(state); }, get active() { return active; } };
}

test('retained Outdoor rename work is blocked before replay while its queue, local data and account survive', async t => {
  const x = device(t, {
    employee: outdoor,
    currentProject: { ...project, project_name: 'Previously queued name', pending: true },
    initialQueue: [savedRename],
  });
  const before = x.state;
  const writes = [];
  globalThis.fetch = async (url, init) => {
    if (init?.method) {
      writes.push({ url, init });
      throw new Error('Outdoor rename must not be sent to the server');
    }
    return Response.json({ actor: outdoor });
  };
  navigator.onLine = true;
  await x.client.syncFieldChanges();
  assert.deepEqual(writes, []);
  assert.equal(x.active, outdoor.id);
  assert.deepEqual(x.state.projects, before.projects);
  assert.deepEqual(x.state.openings, before.openings);
  assert.equal(x.state.queue.length, 1);
  assert.deepEqual({ ...x.state.queue[0], error: undefined }, { ...before.queue[0], error: undefined });
  assert.match(x.state.queue[0].error, /Only Indoor Sales and Sales Managers/);
});

test('offline rename is durable immediately and preserves measurements, stage, notes and the server version', async t => {
  const x = device(t);
  const before = x.state;
  await x.client.saveFieldChange('rename-project', projectId, { projectName: '  مشروع المنصور  ', sales_status: 'contract_signed' }, actor.id);
  const after = x.state;
  assert.deepEqual(after.projects[0], { ...before.projects[0], project_name: 'مشروع المنصور', pending: true });
  assert.deepEqual(after.openings, before.openings);
  assert.equal(after.queue.length, 1);
  assert.equal(after.queue[0].action, 'rename-project');
  assert.equal(after.queue[0].userId, actor.id);
  assert.deepEqual(after.queue[0].payload, { projectName: 'مشروع المنصور' });
  assert.equal(after.projects[0].serverUpdatedAt, updatedAt);
});

test('offline rename queues no changes for unrelated, read-only, invalid or wrong-role requests', async t => {
  for (const options of [
    { employee: outdoor },
    { employee: outdoor, currentProject: { ...project, created_by: 'other', assigned_outdoor_sales_id: outdoor.id } },
    { employee: outdoor, currentProject: { ...project, created_by: 'other', assigned_outdoor_sales_id: 'other' } },
    { currentProject: { ...project, project_log_only: true } },
    { employee: { ...actor, role: 'Indoor Sales', branch: 'Karkh' }, currentProject: { ...project, branch: 'Rasafa' } },
  ]) {
    const x = device(t, options);
    const before = x.state;
    await assert.rejects(x.client.saveFieldChange('rename-project', projectId, { projectName: 'New name' }, actor.id));
    assert.deepEqual(x.state, before);
  }
  const x = device(t);
  const before = x.state;
  await assert.rejects(x.client.saveFieldChange('rename-project', projectId, { projectName: '  ' }, actor.id));
  assert.deepEqual(x.state, before);
});

test('a mobile editor opened before a background project refresh cannot overwrite the newer name', async t => {
  const refreshedAt = '2026-11-04T10:00:00.000Z';
  const x = device(t, { currentProject: { ...project, project_name: 'Renamed on another device', updated_at: refreshedAt, serverUpdatedAt: refreshedAt } });
  const before = x.state;
  await assert.rejects(x.client.saveFieldChange('rename-project', projectId, { projectName: 'Stale editor name', expectedUpdatedAt: updatedAt }, actor.id), /changed on another device/);
  assert.deepEqual(x.state, before);
  await x.client.saveFieldChange('rename-project', projectId, { projectName: 'Reviewed new name', expectedUpdatedAt: refreshedAt }, actor.id);
  assert.equal(x.state.projects[0].project_name, 'Reviewed new name');
  assert.deepEqual(x.state.queue[0].payload, { projectName: 'Reviewed new name' });
});

test('a new offline registration can be renamed before sync and uses the registration receipt version', async t => {
  const x = device(t);
  const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const registration = {
    client: { clientName: 'Original client name', mobile: '07700000000', clientType: 'individual' },
    project: { assignedOutdoorSalesId: actor.id, buildingType: 'villa_house', address: 'Basra', locationLatitude: 30.5, locationLongitude: 47.8, structureReadiness: 'ready' },
  };
  await x.client.saveFieldChange('register', id, registration, actor.id);
  const saved = x.state.projects.find(item => item.id === id);
  await x.client.saveFieldChange('rename-project', id, { projectName: 'New project name', expectedUpdatedAt: saved.updated_at }, actor.id);
  assert.equal(x.state.projects.find(item => item.id === id).project_name, 'New project name');
  assert.equal(x.state.queue.length, 2);
  assert.equal(x.state.queue[0].payload.client.clientName, 'Original client name');
  const registrationVersion = '2026-11-04T10:00:00.000Z';
  const renameVersion = '2026-11-04T10:01:00.000Z';
  const posts = [];
  globalThis.fetch = async (url, init) => {
    if (!init?.method) return Response.json({ actor });
    const change = JSON.parse(init.body);
    posts.push(change);
    if (change.action === 'register') return Response.json({ project: { ...saved, project_number: 'PRJ-SYNCED', project_name: 'Original client name', updated_at: registrationVersion } });
    assert.equal(change.expectedUpdatedAt, registrationVersion);
    assert.equal(x.state.projects.find(item => item.id === id).project_name, 'New project name');
    return Response.json({ project: { ...saved, project_number: 'PRJ-SYNCED', project_name: change.payload.projectName, updated_at: renameVersion } });
  };
  navigator.onLine = true;
  await x.client.syncFieldChanges();
  assert.deepEqual(posts.map(change => change.action), ['register', 'rename-project']);
  assert.equal(x.state.queue.length, 0);
  assert.equal(x.state.projects.find(item => item.id === id).project_name, 'New project name');
  assert.equal(x.state.projects.find(item => item.id === id).serverUpdatedAt, renameVersion);
});

test('offline rename sync clears the queue only after server acknowledgement and retains conflicts', async t => {
  const x = device(t);
  await x.client.saveFieldChange('rename-project', projectId, { projectName: 'Renamed project' }, actor.id);
  const saved = x.state.queue[0];
  const posts = [];
  let conflict = true;
  globalThis.fetch = async (url, init) => {
    if (!init?.method) return Response.json({ actor });
    const change = JSON.parse(init.body);
    posts.push(change);
    return conflict ? Response.json({ error: 'Project changed on another device' }, { status: 409 }) : Response.json({ project: { ...project, project_name: 'Renamed project', updated_at: '2026-11-04T10:00:00.000Z' } });
  };
  navigator.onLine = true;
  await x.client.syncFieldChanges();
  assert.equal(x.state.queue.length, 1);
  assert.match(x.state.queue[0].error, /another device/);
  assert.equal(x.state.projects[0].project_name, 'Renamed project');
  conflict = false;
  await x.client.syncFieldChanges();
  assert.equal(x.state.queue.length, 0);
  assert.equal(x.state.projects[0].pending, false);
  assert.equal(x.state.projects[0].project_name, 'Renamed project');
  assert.equal(x.state.projects[0].serverUpdatedAt, '2026-11-04T10:00:00.000Z');
  assert.deepEqual(posts.map(change => change.id), [saved.id, saved.id]);
  assert.ok(posts.every(change => change.expectedUpdatedAt === updatedAt));
});
