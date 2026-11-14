import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const projectId = '11111111-1111-4111-8111-111111111111';
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const updatedAt = '2026-11-11T09:00:00.123456+00:00';
const input = { followUpOwnerId: ownerId, expectedUpdatedAt: updatedAt };
const project = { id: projectId, branch: 'Karkh', updated_at: updatedAt, follow_up_owner_id: null };
const owner = { id: ownerId, role: 'Indoor Sales', branch: 'Karkh', full_name: 'Rana', username: 'rana', is_active: true, status: 'Active' };

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

test('standalone Indoor Sales assignment preserves existing leadership-only reassignment grants', () => {
  const { canAssignIndoorSales } = modules()('lib/workflow/indoorSalesAssignment');
  for (const role of ['Admin', 'CEO', 'Company Owner', 'Sales Director']) {
    assert.equal(canAssignIndoorSales(project, { role }), true);
    assert.equal(canAssignIndoorSales({ ...project, project_log_only: true }, { role }), false);
  }
  for (const role of ['Indoor Sales', 'Sales Manager', 'Outdoor Sales', 'HR', '', 'Sales Rep']) {
    assert.equal(canAssignIndoorSales(project, { role }), false);
  }
});

test('assignment validates an employee UUID and retains timestamp precision, ignoring unrelated fields', () => {
  const { normalizeIndoorSalesAssignment } = modules()('lib/workflow/indoorSalesAssignment');
  assert.deepEqual(normalizeIndoorSalesAssignment({ ...input, nextFollowUp: 'forged', note: 'forged', actorId: 'forged', branch: 'Rasafa' }), input);
  for (const followUpOwnerId of [null, undefined, 123, '', 'not-a-uuid', `${ownerId} `]) {
    assert.throws(() => normalizeIndoorSalesAssignment({ ...input, followUpOwnerId }));
  }
  for (const expectedUpdatedAt of [null, undefined, 123, '', 'invalid', '2026-11-11', '2026-11-11T09:00:00', '2026-13-11T09:00:00Z']) {
    assert.throws(() => normalizeIndoorSalesAssignment({ ...input, expectedUpdatedAt }));
  }
});

function endpoint({ role = 'Admin', currentProject = project, targetOwner = owner, accessStatus, profileError = null, updateError = null, stale = false } = {}) {
  const calls = [], scopes = [];
  const saved = { id: projectId, follow_up_owner_id: ownerId, updated_at: '2026-11-11T10:00:00.123456+00:00' };
  const admin = {
    from(table) {
      const call = { table, filters: [] };
      calls.push(call);
      const query = {
        select(columns) { call.select = columns; return query; },
        eq(column, value) { call.filters.push(['eq', column, value]); return query; },
        in(column, value) { call.filters.push(['in', column, value]); return query; },
        is(column, value) { call.filters.push(['is', column, value]); return query; },
        update(value) { call.update = value; return query; },
        async maybeSingle() {
          if (table !== 'profiles') return { data: stale ? null : saved, error: updateError };
          const matches = targetOwner && call.filters.every(([kind, column, value]) => kind === 'in'
            ? value.includes(targetOwner[column]) : targetOwner[column] === value);
          return { data: matches ? targetOwner : null, error: profileError };
        },
      };
      return query;
    },
  };
  const api = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/workflow/access': {
      salesProject: async (id, scope) => {
        assert.equal(id, projectId); scopes.push(scope);
        if (accessStatus) return { response: { status: accessStatus, body: { error: 'Access denied' } } };
        return { auth: { role, user: { id: actorId } }, project: currentProject, admin };
      },
    },
  })('app/api/projects/[projectId]/indoor-sales/route');
  return { calls, scopes, saved, patch: (body = input, id = projectId) => api.PATCH({ json: async () => body }, { params: Promise.resolve({ projectId: id }) }) };
}

test('assignment writes only the follow-up owner under project, timestamp and branch conditions', async () => {
  const x = endpoint();
  const response = await x.patch({ ...input, actorId: 'forged', projectName: 'forged', nextFollowUp: 'forged', note: 'forged', branch: 'Rasafa', follow_up_owner_id: 'forged' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, project: { ...x.saved, followUpOwner: 'Rana' } });
  assert.deepEqual(x.scopes, [true]);
  assert.deepEqual(x.calls, [
    { table: 'profiles', select: 'id,full_name,username,role,branch', filters: [['eq', 'id', ownerId], ['in', 'role', ['Indoor Sales', 'Sales Manager']], ['eq', 'is_active', true], ['eq', 'status', 'Active']] },
    { table: 'projects', update: { follow_up_owner_id: ownerId }, select: 'id,follow_up_owner_id,updated_at', filters: [['eq', 'id', projectId], ['eq', 'updated_at', updatedAt], ['eq', 'branch', 'Karkh']] },
  ]);
});

test('ordinary employees, read-only project logs and unavailable projects cannot be reassigned', async () => {
  for (const role of ['Indoor Sales', 'Sales Manager', 'Outdoor Sales', 'HR']) {
    const x = endpoint({ role }); assert.equal((await x.patch()).status, 403); assert.deepEqual(x.calls, []);
  }
  const historical = endpoint({ currentProject: { ...project, project_log_only: true } });
  assert.equal((await historical.patch()).status, 403); assert.deepEqual(historical.calls, []);
  for (const accessStatus of [401, 403, 404, 503]) {
    const x = endpoint({ accessStatus }); assert.equal((await x.patch()).status, accessStatus); assert.deepEqual(x.calls, []);
  }
});

test('malformed project IDs, bodies and missing versions cannot reach a database write', async () => {
  const badId = endpoint(); assert.equal((await badId.patch(input, 'bad-id')).status, 400); assert.deepEqual(badId.scopes, []);
  for (const body of [null, [], {}, { ...input, followUpOwnerId: '' }, { followUpOwnerId: ownerId }, { ...input, expectedUpdatedAt: 'invalid' }]) {
    const x = endpoint(); assert.equal((await x.patch(body)).status, 400); assert.deepEqual(x.calls, []);
  }
});

test('inactive, missing and cross-branch employees are rejected before any project update', async () => {
  for (const options of [
    { targetOwner: null },
    { targetOwner: { ...owner, is_active: false } },
    { targetOwner: { ...owner, status: 'Inactive' } },
    { targetOwner: { ...owner, role: 'Outdoor Sales' } },
    { targetOwner: { ...owner, branch: 'Rasafa' } },
    { currentProject: { ...project, branch: 'Governorates' }, targetOwner: { ...owner, branch: 'Rasafa' } },
    { targetOwner: { ...owner, branch: null } },
  ]) {
    const x = endpoint(options); assert.equal((await x.patch()).status, 400); assert.equal(x.calls.length, 1);
  }
});

test('Karkh Governorates and Sales Manager assignments remain eligible', async () => {
  for (const options of [
    { currentProject: { ...project, branch: 'Governorates' } },
    { currentProject: { ...project, branch: 'Governorates' }, targetOwner: { ...owner, role: 'Sales Manager', branch: 'Karkh' } },
    { currentProject: { ...project, branch: 'Najaf' }, targetOwner: { ...owner, role: 'Sales Manager', branch: 'Najaf' } },
  ]) {
    const x = endpoint(options); assert.equal((await x.patch()).status, 200); assert.equal(x.calls.length, 2);
    if (options.currentProject.branch === null) assert.deepEqual(x.calls[1].filters.at(-1), ['is', 'branch', null]);
  }
});

test('a stale conditional update returns conflict and never overwrites the changed project', async () => {
  const x = endpoint({ stale: true });
  const response = await x.patch();
  assert.equal(response.status, 409);
  assert.match(response.body.error, /changed on another device/);
  assert.deepEqual(x.calls[1].update, { follow_up_owner_id: ownerId });
  assert.ok(x.calls[1].filters.some(filter => filter[1] === 'updated_at' && filter[2] === updatedAt));
});

test('profile lookup and database constraint failures return failures without fabricating follow-ups', async () => {
  const read = endpoint({ profileError: { code: 'DB' } });
  assert.equal((await read.patch()).status, 500); assert.equal(read.calls.length, 1);
  for (const [code, status] of [['42501', 403], ['40001', 409], ['23514', 409]]) {
    const x = endpoint({ updateError: { code } });
    assert.equal((await x.patch()).status, status);
    assert.deepEqual(x.calls.map(call => call.table), ['profiles', 'projects']);
  }
});

test('reassigning to the same owner still checks the current timestamp', async () => {
  const x = endpoint({ currentProject: { ...project, follow_up_owner_id: ownerId }, stale: true });
  assert.equal((await x.patch()).status, 409);
  assert.equal(x.calls[1].update.follow_up_owner_id, ownerId);
});
