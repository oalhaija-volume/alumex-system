import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

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

const load = modules();
const access = load('lib/auth/projectBranchAccess');
const rotation = load('lib/intake/outdoorRotation');
const geography = load('lib/intake/projectBranch');
const offlineAccess = load('lib/offline/projectAccess');
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const teammateId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const actor = { id: actorId, role: 'Outdoor Sales', branch: 'Rasafa', name: 'Outdoor fixture', outdoorTeamMemberIds: [actorId, teammateId] };
const governorates = ['البصرة', 'الرمادي', 'صلاح الدين', 'ديالى', 'الحلة', 'كربلاء', 'الديوانية', 'الكوت', 'العمارة', 'الناصرية', 'السماوة'];

for (const branch of ['Karkh', 'Rasafa']) test(`${branch} Outdoor Sales can register Governorates while Najaf stays separate`, () => {
  const employee = { ...actor, branch };
  const date = new Date('2026-11-10T08:00:00Z');
  assert.deepEqual(rotation.outdoorProjectBranches(employee, date), ['Karkh', 'Governorates']);
  assert.equal(rotation.outdoorSalesBranch(employee, date), 'Karkh', 'Both Baghdad employees follow the same calendar');
  assert.equal(rotation.normalizeOutdoorProjectBranch(employee, 'Governorates', date), 'Governorates');
  assert.equal(access.canAccessProjectBranch(employee, 'Governorates'), true);
  for (const forbidden of ['Najaf', null, '', 'Other']) {
    assert.equal(access.canAccessProjectBranch(employee, forbidden), false);
    assert.throws(() => rotation.normalizeOutdoorProjectBranch(employee, forbidden, date));
  }
  assert.equal(access.canAccessProjectBranch(employee, 'Rasafa'), true, 'Saved work remains accessible in either Baghdad area');
  assert.throws(() => rotation.normalizeOutdoorProjectBranch(employee, 'Rasafa', date));
});

test('Najaf Outdoor cannot create or access other Governorates projects', () => {
  const employee = { ...actor, branch: 'Najaf' };
  assert.deepEqual(rotation.outdoorProjectBranches(employee), ['Najaf']);
  assert.throws(() => rotation.normalizeOutdoorProjectBranch(employee, 'Governorates'));
  assert.equal(access.canAccessProjectBranch(employee, 'Governorates'), false);
});

test('Outdoor employees without a valid office cannot register Governorates', () => {
  for (const branch of [null, undefined, '', 'Governorates']) {
    assert.equal(access.canAccessProjectBranch({ ...actor, branch }, 'Governorates'), false);
    assert.throws(() => rotation.normalizeOutdoorProjectBranch({ ...actor, branch }, 'Governorates'));
  }
});

test('eleven governorates are available for new entries and geographic Najaf is excluded', () => {
  assert.deepEqual(geography.projectGovernorates, governorates);
  assert.equal(geography.projectGovernorates.length, 11);
  for (const governorate of governorates) assert.equal(geography.normalizeProjectGovernorate('Governorates', governorate), governorate);
  for (const invalid of [undefined, null, '', 'النجف', 'Baghdad', 3, ['البصرة']]) assert.throws(() => geography.normalizeProjectGovernorate('Governorates', invalid));
  assert.equal(geography.normalizeProjectGovernorate('Rasafa', 'البصرة'), null);
});

test('Governorates follow-up remains with Karkh Indoor Sales and Sales Managers', () => {
  for (const role of ['Indoor Sales', 'Sales Manager']) {
    assert.equal(access.canOwnProjectFollowUp({ role, branch: 'Karkh' }, 'Governorates'), true);
    for (const branch of ['Rasafa', 'Najaf', null]) assert.equal(access.canOwnProjectFollowUp({ role, branch }, 'Governorates'), false);
    assert.deepEqual(access.projectBranchesForActor({ role, branch: 'Rasafa' }), ['Rasafa']);
  }
  assert.equal(access.canOwnProjectFollowUp(actor, 'Governorates'), false);
});

for (const branch of ['Karkh', 'Rasafa']) test(`${branch} Governorates access preserves creator and team restrictions in cached work`, () => {
  const employee = { ...actor, branch };
  const project = { id: 'own', branch: 'Governorates', governorate: 'البصرة', created_by: actorId, assigned_outdoor_sales_id: actorId };
  const own = { ...project };
  const assigned = { ...project, id: 'team', created_by: 'other', assigned_outdoor_sales_id: teammateId };
  const unrelated = { ...project, id: 'unrelated', created_by: 'other', assigned_outdoor_sales_id: 'other' };
  const foreign = { ...project, id: 'foreign-office', branch: 'Najaf', created_by: actorId };
  const historical = { ...unrelated, id: 'historical-unrelated' };
  const projects = [own, assigned, unrelated, foreign, historical];
  const state = { actor: employee, projects, openings: projects.map(row => ({ id: `opening-${row.id}`, projectId: row.id })), queue: [], syncedAt: null };
  assert.deepEqual(offlineAccess.visibleFieldState(state).projects.map(row => row.id), ['own', 'team']);
  assert.equal(offlineAccess.visibleFieldState(state).projects[0].governorate, 'البصرة');
  assert.equal(offlineAccess.canAccessFieldProject(state, unrelated), false);
  assert.equal(offlineAccess.canAccessFieldProject(state, foreign), false);
  assert.equal(offlineAccess.canAccessFieldProject(state, historical), false);
  assert.deepEqual(state.projects, projects, 'Read filtering must preserve the stored records');
});

function endpoint(path, role = actor.role, branch = actor.branch) {
  const writes = [];
  const loadRoute = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, role, profile: { branch }, user: { id: actorId } }) },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
    '@/lib/supabase/admin': { createAdminClient: () => ({
      from(table) {
        assert.ok(['projects', 'field_sync_receipts'].includes(table));
        return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }) };
      },
      rpc: async (name, input) => { writes.push({ name, input }); return { data: { projectId: actorId }, error: null }; },
    }) },
  });
  return {
    writes,
    async post(project) {
      const payload = { client: { clientName: 'Governorates fixture', mobile: '07000000000', clientType: 'individual' }, project: {
        branch: 'Governorates', governorate: 'البصرة', buildingType: 'villa_house', structureReadiness: 'ready',
        locationLatitude: 33.3, locationLongitude: 44.4,
        ...(['Indoor Sales', 'Sales Manager'].includes(role) ? { assignedOutdoorSalesId: actorId } : {}), ...project,
      } };
      const body = path === 'offline' ? { id: actorId, userId: actorId, projectId: actorId, action: 'register', recordedAt: '2026-11-14T08:00:00Z', payload } : payload;
      return loadRoute(`app/api/${path}/route`).POST({ json: async () => body });
    },
  };
}

for (const path of ['sales-intake', 'offline']) {
  for (const governorate of governorates) test(`${path}: Rasafa Outdoor registration sends Governorates and ${governorate}`, async () => {
    const x = endpoint(path), response = await x.post({ governorate });
    assert.equal(response.status, path === 'sales-intake' ? 201 : 200);
    assert.equal(x.writes.length, 1);
    assert.equal(x.writes[0].input.p_actor, actorId);
    assert.equal(x.writes[0].input.p_payload.project.branch, 'Governorates');
    assert.equal(x.writes[0].input.p_payload.project.governorate, governorate);
  });
  test(`${path}: missing governorate and forged Najaf branch never reach the registration write`, async () => {
    for (const project of [{ governorate: '' }, { governorate: undefined }, { governorate: 'النجف' }, { branch: 'Najaf' }]) {
      const x = endpoint(path), response = await x.post(project);
      assert.equal(response.status, 400); assert.equal(x.writes.length, 0);
    }
  });
  test(`${path}: Rasafa Indoor Sales cannot take the Governorates follow-up route`, async () => {
    const x = endpoint(path, 'Indoor Sales'), response = await x.post({});
    assert.equal(response.status, 400); assert.equal(x.writes.length, 0);
  });
}
