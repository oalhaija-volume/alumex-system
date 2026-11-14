import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function modules() {
  const cache = new Map();
  return function load(path) {
    const url = path instanceof URL ? path : new URL(path, import.meta.url);
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {};
    cache.set(url.href, exports);
    const source = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'exports', source)(name => load(name.startsWith('@/')
      ? new URL(`../src/${name.slice(2)}.ts`, import.meta.url)
      : new URL(`${name}.ts`, url)), exports);
    return exports;
  };
}

const load = modules();
const access = load('../src/lib/auth/projectBranchAccess.ts');
const { appRoles } = load('../src/lib/auth/roles.ts');
const globalRoles = ['Admin', 'Sales Director', 'Company Owner'];
const offices = ['Karkh', 'Rasafa', 'Najaf'];
const projectBranches = [...offices, 'Governorates', null, undefined];
const belongsTo = (office, projectBranch, role) => offices.includes(office)
  && (role === 'Outdoor Sales' && office !== 'Najaf'
    ? ['Karkh', 'Rasafa', 'Governorates'].includes(projectBranch)
    : office === projectBranch || office === 'Karkh' && projectBranch === 'Governorates');

test('only Admin, Sales Director and Company Owner have global project visibility', () => {
  for (const role of appRoles) assert.equal(access.hasGlobalProjectAccess(role), globalRoles.includes(role), role);
  for (const role of [null, undefined, '', 'Owner', 'admin', 'General Manager']) assert.equal(access.hasGlobalProjectAccess(role), false);
});

for (const role of globalRoles) test(`${role} can view every branch and unassigned historical projects`, () => {
  for (const branch of [null, undefined, ...offices]) {
    const actor = { role, branch };
    assert.equal(access.projectBranchesForActor(actor), null);
    for (const projectBranch of projectBranches) assert.equal(access.canAccessProjectBranch(actor, projectBranch), true);
  }
});

for (const role of appRoles.filter(role => !globalRoles.includes(role))) {
  test(`${role} is restricted to its assigned office including Najaf`, () => {
    for (const branch of offices) {
      const actor = { role, branch };
      assert.deepEqual(access.projectBranchesForActor(actor), role === 'Outdoor Sales' && branch !== 'Najaf'
        ? ['Karkh', 'Rasafa', 'Governorates'] : branch === 'Karkh' ? [branch, 'Governorates'] : [branch]);
      for (const projectBranch of projectBranches) {
        assert.equal(access.canAccessProjectBranch(actor, projectBranch), belongsTo(branch, projectBranch, role), `${branch} employee / ${projectBranch} project`);
      }
    }
  });
  test(`${role} without a valid office cannot view any projects`, () => {
    for (const branch of [null, undefined, '', 'Governorates', 'najaf', 'Other']) {
      const actor = { role, branch };
      assert.deepEqual(access.projectBranchesForActor(actor), []);
      for (const projectBranch of projectBranches) assert.equal(access.canAccessProjectBranch(actor, projectBranch), false);
    }
  });
}

test('Governorates follow-up stays with Karkh independently of Outdoor registration access', () => {
  assert.deepEqual(access.indoorProjectBranches('Karkh'), ['Karkh', 'Governorates']);
  assert.deepEqual(access.indoorProjectBranches('Rasafa'), ['Rasafa']);
  assert.deepEqual(access.indoorProjectBranches('Najaf'), ['Najaf']);
  assert.deepEqual(access.indoorProjectBranches('Governorates'), []);
});

test('geographic Najaf is isolated even when stored as a legacy Governorates row', () => {
  for (const governorate of ['النجف', 'نجف', 'Najaf', '  nAjAf  ']) {
    const row = { branch: 'Governorates', governorate, created_by: 'creator', assigned_outdoor_sales_id: 'creator' };
    for (const role of appRoles) for (const branch of offices) {
      assert.equal(access.canAccessProjectRow({ id: 'creator', role, branch }, row), globalRoles.includes(role) || branch === 'Najaf', `${role}/${branch}/${governorate}`);
    }
  }
});

test('moving Outdoor employees between Baghdad and Najaf cannot preserve access through creator identity', () => {
  const actor = { id: 'creator', role: 'Outdoor Sales' };
  for (const branch of ['Karkh', 'Rasafa']) assert.equal(access.canAccessProjectRow({ ...actor, branch }, { branch: 'Najaf', created_by: actor.id }), false);
  for (const branch of ['Karkh', 'Rasafa', 'Governorates']) assert.equal(access.canAccessProjectRow({ ...actor, branch: 'Najaf' }, { branch, created_by: actor.id }), false);
});

test('follow-up ownership requires an Indoor Sales or Sales Manager employee from the project office', () => {
  for (const role of ['Indoor Sales', 'Sales Manager']) {
    for (const branch of [...offices, null]) {
      for (const projectBranch of projectBranches) {
        assert.equal(access.canOwnProjectFollowUp({ role, branch }, projectBranch), belongsTo(branch, projectBranch), `${role}/${branch}/${projectBranch}`);
      }
    }
  }
  for (const role of appRoles.filter(role => !['Indoor Sales', 'Sales Manager'].includes(role))) {
    for (const branch of offices) assert.equal(access.canOwnProjectFollowUp({ role, branch }, branch), false, role);
  }
});
