import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => { if (name === '@/lib/auth/projectBranchAccess') return load('../src/lib/auth/projectBranchAccess.ts'); assert.ok(name in dependencies, name); return dependencies[name]; }, exports);
  return exports;
}
const roles = load('../src/lib/auth/roles.ts');
const permissions = load('../src/lib/auth/permissions.ts');
const response = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };

for (const role of roles.appRoles) test(`${role} lands on an authorized dashboard with appropriately scoped status data`, async () => {
  assert.equal(permissions.defaultRouteForRole(role), '/dashboard');
  assert.equal(permissions.canAccessRoute('/dashboard', role), true);
  let scoped = false;
  let branchScoped = false;
  const route = load('../src/app/api/dashboard/route.ts', {
    'next/server': response,
    '@/lib/auth/roles': roles,
    '@/lib/auth/adminServer': { requireRole: async allowed => { assert.ok(allowed.includes(role)); return { ok: true, role, profile: { branch: 'Rasafa' }, user: { id: 'employee' } }; } },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => {
      assert.equal(table, 'projects');
      return {
        select(columns) {
          assert.deepEqual(columns.split(',').sort(), ['id', 'project_name', 'project_number', 'structure_readiness', 'sales_status', 'status', 'created_at', 'created_by', 'updated_at', 'measurement_delayed', 'client_cancelled_at'].sort());
          return this;
        },
        is(column, value) { assert.equal(column, 'archived_at'); assert.equal(value, null); return this; },
        order() { return this; },
        in(column, values) { assert.equal(column, 'branch'); assert.deepEqual(values, ['Rasafa', 'Governorates']); branchScoped = true; return this; },
        or(filter) { assert.equal(filter, 'created_by.eq.employee,assigned_outdoor_sales_id.eq.employee'); scoped = true; return this; },
        then(resolve) { resolve({ data: [], error: null }); },
      };
    } }) },
  });
  const result = await route.GET();
  assert.equal(result.status, 200);
  assert.equal(scoped, role === 'Outdoor Sales');
  assert.equal(branchScoped, role === 'Indoor Sales');
});

test('an unauthenticated or inactive employee cannot read dashboard data', async () => {
  for (const status of [401, 403]) {
    const route = load('../src/app/api/dashboard/route.ts', {
      'next/server': response, '@/lib/auth/roles': roles,
      '@/lib/auth/adminServer': { requireRole: async () => ({ ok: false, status, error: 'Denied' }) },
      '@/lib/supabase/admin': { createAdminClient: () => { throw Error('Unexpected database read'); } },
    });
    assert.equal((await route.GET()).status, status);
  }
});

test('leadership can open every active workspace; Outdoor Sales cannot open CRM or employee administration', () => {
  for (const role of permissions.leadershipRoles) {
    for (const path of ['/dashboard', '/intake', '/projects', '/mini-crm', '/hr', '/catalog', '/operations']) {
      assert.equal(permissions.canAccessRoute(path, role), true, `${role}: ${path}`);
    }
  }
  for (const path of ['/mini-crm', '/hr', '/catalog', '/operations']) assert.equal(permissions.canAccessRoute(path, 'Outdoor Sales'), false);
});

test('employee dashboard returns creator names only for the visible project creators', async () => {
  const projects = [{ id: 'site', created_by: 'creator', created_at: '2026-10-01T00:00:00Z' }];
  const route = load('../src/app/api/dashboard/route.ts', {
    'next/server': response, '@/lib/auth/roles': roles,
    '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, role: 'HR', user: { id: 'hr' } }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => table === 'projects' ? {
      select() { return this; }, is() { return this; }, order: async () => ({ data: projects, error: null }),
    } : {
      select(columns) { assert.equal(columns, 'id,full_name,username'); return this; },
      in: async (column, ids) => { assert.equal(column, 'id'); assert.deepEqual(ids, ['creator']); return { data: [{ id: 'creator', full_name: 'Project creator', username: 'creator' }], error: null }; },
    } }) },
  });
  const result = await route.GET();
  assert.equal(result.status, 200);
  assert.equal(result.body.projects[0].registeredBy, 'Project creator');
  assert.equal(result.body.projects[0].created_at, projects[0].created_at);
});
