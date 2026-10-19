import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', js)(name => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  }, exports);
  return exports;
}
const roles = load('../src/lib/auth/roles.ts');
const permissions = load('../src/lib/auth/permissions.ts');
const capabilities = load('../src/lib/auth/capabilities.ts');
const statuses = load('../src/lib/workflow/salesStatuses.ts');
const transitions = load('../src/lib/workflow/salesTransitions.ts', { '@/lib/workflow/salesStatuses': statuses });
const prices = load('../src/lib/pricing/discountPolicy.ts', { '@/lib/clientRequestCache': {} });

test('Sales Manager retains its identity and exactly matches Indoor Sales permissions', () => {
  assert.equal(roles.normalizeAppRole('Sales Manager'), 'Sales Manager');
  assert.equal(permissions.isLeadershipRole('Sales Manager'), false);
  const id = '11111111-1111-4111-8111-111111111111';
  for (const path of ['/', '/dashboard', '/intake', '/projects', '/mini-crm', '/hr', '/catalog', '/operations', '/settings', '/unknown',
    `/initial-measurements/${id}`, `/quotation/${id}`, `/contract/${id}`, `/projects/${id}/follow-ups`]) {
    assert.equal(permissions.canAccessRoute(path, 'Sales Manager'), permissions.canAccessRoute(path, 'Indoor Sales'), path);
  }
  for (const capability of ['clients:create', 'clients:update', 'projects:create', 'projects:view-team', 'projects:reassign',
    'measurements:request', 'measurements:record', 'measurements:review', 'quotations:manage', 'contracts:manage',
    'follow-ups:perform', 'audit:view', 'workflow:configure']) {
    assert.equal(capabilities.roleHasCapability('Sales Manager', capability), capabilities.roleHasCapability('Indoor Sales', capability), capability);
    assert.equal(capabilities.rolesForCapability(capability).includes('Sales Manager'), capabilities.rolesForCapability(capability).includes('Indoor Sales'), capability);
  }
  for (const from of statuses.projectSalesStatuses) for (const to of statuses.projectSalesStatuses) {
    assert.equal(transitions.canRoleTransitionProjectSalesStatus('Sales Manager', from, to),
      transitions.canRoleTransitionProjectSalesStatus('Indoor Sales', from, to), `${from} -> ${to}`);
  }
});

test('Sales Manager follows the Indoor Sales discount limit even when legacy policies differ', () => {
  assert.equal(prices.defaultDiscountLimitForRole('Sales Manager'), prices.defaultDiscountLimitForRole('Indoor Sales'));
  for (const policies of [[], [{ role: 'Sales Manager', max_discount_percent: 4 }],
    [{ role: 'Sales Manager', max_discount_percent: 4 }, { role: 'Indoor Sales', max_discount_percent: 1.5 }]]) {
    assert.equal(prices.discountLimitFromPolicies('Sales Manager', policies), prices.discountLimitFromPolicies('Indoor Sales', policies));
  }
});

for (const role of ['Indoor Sales', 'Sales Manager']) test(`${role} registration enforces branch and assignment and permits self measurement`, async () => {
  const actor = '11111111-1111-4111-8111-111111111111';
  let branch = 'Karkh';
  let insertedProject;
  const input = { client: { clientName: 'Example', mobile: '07700000000', clientType: 'individual' },
    project: { address: 'Baghdad', locationLatitude: 33.3, locationLongitude: 44.4, structureReadiness: 'ready', assignedOutdoorSalesId: actor } };
  const admin = { from: table => ({
    select() { return this; }, eq() { return this; },
    like: async () => ({ data: [] }),
    insert(value) { if (table === 'projects') insertedProject = value; return this; },
    single: async () => ({ data: table === 'profiles' ? { branch } : { id: table } }),
  }) };
  const route = load('../src/app/api/sales-intake/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/auth/adminServer': { requireRole: async allowed => {
      assert.ok(allowed.includes(role)); return { ok: true, role, user: { id: actor } };
    } },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
    '@/lib/location/coordinates': load('../src/lib/location/coordinates.ts'),
    '@/lib/projects/numbering': load('../src/lib/projects/numbering.ts'),
    '@/lib/intake/buildingType': load('../src/lib/intake/buildingType.ts'),
    '@/lib/intake/readinessNote': load('../src/lib/intake/readinessNote.ts'),
  });
  const submit = body => route.POST({ json: async () => body });
  assert.equal((await submit({ ...input, project: { ...input.project, assignedOutdoorSalesId: undefined } })).status, 400);
  branch = null;
  assert.equal((await submit(input)).status, 400);
  assert.equal(insertedProject, undefined);
  branch = 'Karkh';
  assert.equal((await submit(input)).status, 201);
  assert.equal(insertedProject.original_creator_role, role);
  assert.equal(insertedProject.assigned_outdoor_sales_id, actor);
});
