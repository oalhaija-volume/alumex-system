import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const projectId = '11111111-1111-4111-8111-111111111111';
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const project = { id: projectId, branch: 'Karkh', created_by: 'outdoor-creator' };

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

test('Indoor Sales can rename clients only through an accessible branch', () => {
  const { canRenameClient } = modules()('lib/clients/name');
  for (const branch of ['Karkh', 'Rasafa']) {
    const actor = { id: actorId, role: 'Indoor Sales', branch };
    assert.equal(canRenameClient({ ...project, branch }, actor), true);
    assert.equal(canRenameClient({ ...project, branch: 'Governorates' }, actor), branch === 'Karkh');
    assert.equal(canRenameClient({ ...project, branch: branch === 'Karkh' ? 'Rasafa' : 'Karkh' }, actor), false);
    assert.equal(canRenameClient({ ...project, branch: null }, actor), false);
    assert.equal(canRenameClient({ ...project, branch, project_log_only: true }, actor), false);
  }
  assert.equal(canRenameClient(project, { role: 'Indoor Sales', branch: null }), false);
  assert.equal(canRenameClient({ ...project, branch: 'Rasafa' }, { role: 'Sales Manager' }), true);
  for (const role of ['Outdoor Sales', 'CEO', 'Sales Director', 'Company Owner', 'HR']) {
    assert.equal(canRenameClient(project, { role, branch: 'Karkh' }), false, role);
  }
});

test('Admin can edit client names across branches while read-only project logs stay protected', () => {
  const { canRenameClient } = modules()('lib/clients/name');
  for (const branch of ['Karkh', 'Rasafa', 'Governorates', null]) {
    assert.equal(canRenameClient({ ...project, branch }, { role: 'Admin', branch: null }), true);
    assert.equal(canRenameClient({ ...project, branch, project_log_only: true }, { role: 'Admin' }), false);
  }
});

test('client names trim Arabic and English, cap length and ignore unrelated fields', () => {
  const { normalizeClientName } = modules()('lib/clients/name');
  for (const clientName of ['  Reviewed client  ', '  اسم العميل الجديد  ', 'x'.repeat(150)]) {
    assert.deepEqual(normalizeClientName({ clientName, mobile: 'forged', projectName: 'forged' }), {
      clientName: clientName.trim(),
    });
  }
  for (const clientName of [undefined, null, '', ' \n\t ', 123, {}, ['Name'], 'x'.repeat(151)]) {
    assert.throws(() => normalizeClientName({ clientName }));
  }
});

function endpoint({ role = 'Indoor Sales', branch = 'Karkh', currentProject = project, accessStatus, rpcError = null } = {}) {
  const calls = [], scopes = [];
  const result = { client_id: 'client-fixture', client_name: 'Reviewed client' };
  const api = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/workflow/access': {
      salesProject: async (id, scope) => {
        assert.equal(id, projectId);
        scopes.push(scope);
        if (accessStatus) return { response: { status: accessStatus, body: { error: 'Access denied' } } };
        return {
          auth: { role, user: { id: actorId }, profile: { branch } },
          project: currentProject,
          admin: { rpc: async (name, args) => { calls.push({ name, args }); return { data: result, error: rpcError }; } },
        };
      },
    },
  })('app/api/projects/[projectId]/client/route');
  return {
    calls, scopes, result,
    patch: body => api.PATCH({ json: async () => body }, { params: Promise.resolve({ projectId }) }),
  };
}

const rename = { clientName: '  Reviewed client  ', expectedClientName: 'Original legal name' };

test('client rename uses the authenticated actor and sends only the client-name fields', async () => {
  const x = endpoint();
  const response = await x.patch({ ...rename, actorId: 'forged', client_id: 'forged', projectName: 'forged', mobile: 'forged', sales_status: 'contract_signed' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, client: x.result });
  assert.deepEqual(x.scopes, [true]);
  assert.deepEqual(x.calls, [{
    name: 'rename_project_client',
    args: { p_project: projectId, p_actor: actorId, p_client_name: 'Reviewed client', p_expected_client_name: rename.expectedClientName },
  }]);
});

test('client rename permits Karkh Governorates and Sales Manager projects', async () => {
  for (const options of [
    { currentProject: { ...project, branch: 'Governorates' } },
    { role: 'Sales Manager', currentProject: { ...project, branch: 'Rasafa' } },
    { role: 'Sales Manager', branch: 'Rasafa', currentProject: { ...project, branch: 'Governorates' } },
  ]) {
    const x = endpoint(options);
    assert.equal((await x.patch(rename)).status, 200);
    assert.equal(x.calls.length, 1);
  }
});

test('Admin saves a client name using its own identity without changing project titles or other fields', async () => {
  for (const branch of ['Karkh', 'Rasafa', 'Governorates', null]) {
    const x = endpoint({ role: 'Admin', branch: null, currentProject: { ...project, branch } });
    const response = await x.patch({ ...rename, actorId: 'forged', projectName: 'Preserve project title', role: 'Indoor Sales' });
    assert.equal(response.status, 200);
    assert.deepEqual(x.calls, [{
      name: 'rename_project_client',
      args: { p_project: projectId, p_actor: actorId, p_client_name: 'Reviewed client', p_expected_client_name: rename.expectedClientName },
    }]);
  }
});

test('client rename denies other roles and inaccessible branches before any write', async () => {
  for (const options of [
    { role: 'Outdoor Sales' }, { role: 'CEO' }, { role: 'Sales Director' }, { role: 'Company Owner' },
    { role: 'Admin', currentProject: { ...project, project_log_only: true } },
    { currentProject: { ...project, branch: 'Rasafa' } },
    { branch: 'Rasafa', currentProject: { ...project, branch: 'Governorates' } },
    { currentProject: { ...project, branch: null } },
    { currentProject: { ...project, project_log_only: true } },
    { branch: null },
  ]) {
    const x = endpoint(options);
    assert.equal((await x.patch(rename)).status, 403);
    assert.equal(x.calls.length, 0);
  }
});

test('client rename propagates authentication and project visibility failures without a write', async () => {
  for (const accessStatus of [401, 403, 404, 503]) {
    const x = endpoint({ accessStatus });
    assert.equal((await x.patch(rename)).status, accessStatus);
    assert.equal(x.calls.length, 0);
  }
});

test('invalid client names, missing expected names and malformed bodies never mutate clients', async () => {
  const invalid = [null, [], {}, { ...rename, clientName: '' }, { ...rename, clientName: ' \n\t ' },
    { ...rename, clientName: 123 }, { ...rename, clientName: 'x'.repeat(151) },
    { clientName: 'New client' }, { ...rename, expectedClientName: null }, { ...rename, expectedClientName: 123 }];
  for (const body of invalid) {
    const x = endpoint();
    assert.equal((await x.patch(body)).status, 400, JSON.stringify(body));
    assert.equal(x.calls.length, 0);
  }
});

test('a concurrent client edit is reported as a conflict', async () => {
  const error = { code: '40001', message: 'This client changed on another device. Reload before changing its name.' };
  const x = endpoint({ rpcError: error });
  const response = await x.patch(rename);
  assert.equal(response.status, 409);
  assert.deepEqual(response.body, { error: error.message });
  assert.equal(x.calls.length, 1);
});

test('database authorization, validation and unavailable migration errors use clear HTTP failures', async () => {
  for (const [code, status] of [['42501', 403], ['22023', 400], ['PGRST202', 503]]) {
    const x = endpoint({ rpcError: { code, message: 'Database rejected this change.' } });
    const response = await x.patch(rename);
    assert.equal(response.status, status, code);
    assert.equal(typeof response.body.error, 'string');
    assert.equal(x.calls.length, 1);
  }
});

test('confirmed client names refresh all linked device projects without changing pending work', async () => {
  let state = {
    actor: { id: actorId, role: 'Indoor Sales', branch: 'Karkh' },
    projects: [
      { ...project, client_id: 'shared-client', client_name: 'Old client', project_name: 'Custom project title', pending: true },
      { ...project, id: 'second-project', client_id: 'shared-client', client_name: 'Old client', project_name: 'Second project' },
      { ...project, id: 'unrelated-project', client_id: 'other-client', client_name: 'Other client' },
    ],
    openings: [{ id: 'opening-fixture', projectId, width: 125 }],
    queue: [{ id: 'pending-opening', projectId, action: 'opening', payload: { width: 125 } }],
    syncedAt: null,
  };
  const before = structuredClone(state);
  const store = {
    activeFieldUser: () => actorId,
    readStoredFieldState: async id => { assert.equal(id, actorId); return structuredClone(state); },
    updateFieldState: async (id, change) => { assert.equal(id, actorId); state = change(structuredClone(state)); },
  };
  const { updateSavedClientName } = modules({ './store': store })('lib/offline/client');
  await updateSavedClientName(actorId, projectId, 'shared-client', 'اسم العميل المصحح');
  assert.deepEqual(state, {
    ...before,
    projects: before.projects.map(row => row.client_id === 'shared-client' ? { ...row, client_name: 'اسم العميل المصحح' } : row),
  });
});

test('client cache updates never create an account snapshot or write into a different active account', async () => {
  for (const [active, stored] of [['another-actor', {}], [actorId, null]]) {
    const store = {
      activeFieldUser: () => active,
      readStoredFieldState: async id => { assert.equal(id, actorId); return stored; },
      updateFieldState: async () => assert.fail('An absent or different account must not be updated'),
    };
    const { updateSavedClientName } = modules({ './store': store })('lib/offline/client');
    await updateSavedClientName(actorId, projectId, 'shared-client', 'Reviewed client');
  }
});
