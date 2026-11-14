import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(name => {
    if (name.startsWith('@/lib/') && !Object.hasOwn(dependencies, name)) return load(`../src/${name.slice(2)}.ts`, dependencies);
    assert.ok(Object.hasOwn(dependencies, name), name);
    return dependencies[name];
  }, exports);
  return exports;
}

const id = '11111111-1111-4111-8111-111111111111';
const users = [
  { id, username: 'najaf.employee', role: 'Indoor Sales', branch: 'Najaf' },
  { id: 'second-najaf', username: 'najaf.outdoor', role: 'Outdoor Sales', branch: 'Najaf' },
  { id: 'karkh', username: 'karkh.employee', role: 'Indoor Sales', branch: 'Karkh' },
  { id: 'rasafa', username: 'rasafa.employee', role: 'Indoor Sales', branch: 'Rasafa' },
  { id: 'admin', username: 'admin', role: 'Admin', branch: null },
];
const create = { fullName: 'New Najaf Employee', username: 'new.employee', password: 'fixture-password', role: 'Indoor Sales', branch: 'Najaf' };
const update = { id, action: 'update-profile', updatedAt: '2026-11-14T10:00:00Z', fullName: 'Najaf Employee', username: 'najaf.employee', role: 'Outdoor Sales', isActive: true, branch: 'Najaf' };
const request = body => ({ json: async () => body });

function fixture({ role = 'Admin', branch = 'Najaf', missingUsername = false } = {}) {
  const writes = [], queries = [];
  let usernameFailure = missingUsername;
  const api = load('../src/app/api/admin/users/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } },
    '@/lib/auth/adminServer': { requireRole: async allowed => allowed.includes(role)
      ? { ok: true, role, user: { id: 'actor' }, profile: { branch } }
      : { ok: false, status: 403, error: 'Denied' } },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
    '@/lib/supabase/admin': { createAdminClient: () => ({
      from(table) {
        const filters = [], query = { table, columns: '' }; queries.push(query);
        return {
          select(columns) { query.columns = columns; return this; },
          order() { return this; },
          eq(column, value) { filters.push([column, value]); query.filters = [...filters]; return this; },
          maybeSingle: async () => ({ data: users.find(user => filters.every(([column, value]) => user[column] === value)) ?? null, error: null }),
          upsert: async profile => { writes.push({ kind: 'profile', profile }); return { error: null }; },
          then(resolve) {
            if (usernameFailure && query.columns.includes('username')) { usernameFailure = false; return Promise.resolve({ error: { code: '42703' } }).then(resolve); }
            return Promise.resolve({ data: users.filter(user => filters.every(([column, value]) => user[column] === value)), error: null }).then(resolve);
          },
        };
      },
      rpc: async (name, args) => {
        if (name.endsWith('_ready')) return { data: true, error: null };
        writes.push({ kind: 'rpc', name, args }); return { data: { id, branch: args.p_branch }, error: null };
      },
      auth: { admin: {
        createUser: async attributes => { writes.push({ kind: 'auth', attributes }); return { data: { user: { id } }, error: null }; },
      } },
    }) },
  });
  return { api, writes, queries };
}

for (const role of ['Indoor Sales', 'Outdoor Sales', 'Sales Manager', 'CEO', 'HR', 'Operations Manager', 'Project Manager']) test(`Admin creates ${role} in Najaf without discarding the office assignment`, async () => {
  const x = fixture(); const result = await x.api.POST(request({ ...create, role }));
  assert.equal(result.status, 201);
  assert.equal(result.body.user.branch, 'Najaf');
  assert.equal(x.writes.find(write => write.kind === 'auth').attributes.user_metadata.branch, 'Najaf');
  assert.equal(x.writes.find(write => write.kind === 'profile').profile.branch, 'Najaf');
});

for (const branch of [undefined, null, '', 'Governorates', 'Baghdad', {}, 3]) test(`a branch-scoped account rejects invalid or missing office ${JSON.stringify(branch)}`, async () => {
  const x = fixture(); assert.equal((await x.api.POST(request({ ...create, branch }))).status, 400);
  assert.deepEqual(x.writes, []);
});

for (const role of ['Admin', 'Sales Director', 'Company Owner']) test(`${role} account creation permits all-branch access without an office`, async () => {
  const x = fixture(); const result = await x.api.POST(request({ ...create, role, branch: undefined }));
  assert.equal(result.status, 201); assert.equal(result.body.user.branch, null);
});

test('Najaf HR creates employees only in its own office, including a missing branch field from an older form', async () => {
  const x = fixture({ role: 'HR' });
  assert.equal((await x.api.POST(request({ ...create, branch: undefined }))).status, 201);
  assert.equal(x.writes.find(write => write.kind === 'profile').profile.branch, 'Najaf');
  for (const branch of ['Karkh', 'Rasafa']) {
    const other = fixture({ role: 'HR' });
    assert.equal((await other.api.POST(request({ ...create, branch }))).status, 403);
    assert.deepEqual(other.writes, []);
  }
});

test('unassigned HR cannot create an account with unscoped project access', async () => {
  const x = fixture({ role: 'HR', branch: null });
  assert.equal((await x.api.POST(request({ ...create, branch: undefined }))).status, 400);
  assert.deepEqual(x.writes, []);
});

for (const role of ['Admin', 'Sales Director', 'Company Owner']) test(`HR cannot create or assign the global ${role} role`, async () => {
  const x = fixture({ role: 'HR' });
  assert.equal((await x.api.POST(request({ ...create, role }))).status, 403);
  assert.equal((await x.api.PATCH(request({ ...update, role, branch: undefined }))).status, 403);
  assert.deepEqual(x.writes, []);
});

test('Najaf assignment is saved atomically with the versioned employee profile', async () => {
  const x = fixture();
  assert.equal((await x.api.PATCH(request(update))).status, 200);
  assert.deepEqual(x.writes, [{ kind: 'rpc', name: 'update_employee_profile_with_branch', args: {
    p_actor: 'actor', p_employee: id, p_expected_updated_at: update.updatedAt,
    p_full_name: update.fullName, p_username: update.username, p_role: 'Outdoor Sales', p_is_active: true, p_branch: 'Najaf',
  } }]);
});

for (const role of ['HR', 'CEO']) for (const missingUsername of [false, true]) test(`${role} directory hides other offices even in username compatibility fallback: ${missingUsername}`, async () => {
  const x = fixture({ role, missingUsername }); const result = await x.api.GET();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.users.map(user => user.id), [id, 'second-najaf']);
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  assert.ok(x.queries.every(query => query.filters.some(([column, value]) => column === 'branch' && value === 'Najaf')));
});

for (const role of ['Admin', 'Sales Director', 'Company Owner']) test(`${role} can view employees across all offices`, async () => {
  const x = fixture({ role }); const result = await x.api.GET();
  assert.equal(result.status, 200); assert.equal(result.body.users.length, users.length);
});

test('unassigned HR receives an empty directory rather than all employees', async () => {
  const x = fixture({ role: 'HR', branch: null }); const result = await x.api.GET();
  assert.equal(result.status, 200); assert.deepEqual(result.body.users, []); assert.deepEqual(x.queries, []);
});
