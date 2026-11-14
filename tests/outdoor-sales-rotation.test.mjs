import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path) {
  const url = new URL(path, import.meta.url);
  const source = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(name => load(name.startsWith('@/')
    ? `../src/${name.slice(2)}.ts`
    : new URL(`${name}.ts`, url)), exports);
  return exports;
}

const { outdoorProjectBranches, normalizeOutdoorProjectBranch, outdoorSalesBranch } = load('../src/lib/intake/outdoorRotation.ts');
const { appRoles } = load('../src/lib/auth/roles.ts');
const actor = (branch, outdoorRotationStartBranch = 'Karkh') => ({ role: 'Outdoor Sales', branch, outdoorRotationStartBranch });
const restrictedBranchError = 'Choose a project from your branch.';
const officeProjects = branch => branch === 'Karkh' || branch === 'Rasafa' ? [branch, 'Governorates'] : [branch];

for (const starter of ['Karkh', 'Rasafa', 'Najaf']) {
  for (const [instant, expected] of [
    ['2026-10-01T00:00:00+03:00', starter],
    ['2026-10-15T23:59:59.999+03:00', starter],
    ['2026-10-16T00:00:00+03:00', starter],
    ['2026-10-31T23:59:59.999+03:00', starter],
    ['2026-11-01T00:00:00+03:00', starter],
  ]) {
    test(`${starter} employees keep their office at Baghdad time ${instant}`, () => {
      const date = new Date(instant);
      assert.equal(outdoorSalesBranch(actor(starter), date), expected);
      assert.deepEqual(outdoorProjectBranches(actor(starter), date), officeProjects(starter));
      assert.equal(normalizeOutdoorProjectBranch(actor(starter), expected, date), expected);
      assert.throws(() => normalizeOutdoorProjectBranch(actor(starter), expected === 'Karkh' ? 'Rasafa' : 'Karkh', date), { message: restrictedBranchError });
      if (starter !== 'Najaf') assert.equal(normalizeOutdoorProjectBranch(actor(starter), 'Governorates', date), 'Governorates');
      else assert.throws(() => normalizeOutdoorProjectBranch(actor(starter), 'Governorates', date), { message: restrictedBranchError });
    });
  }
}

test('Baghdad midnight and the legacy rotation seed cannot change the assigned office', () => {
  const outdoor = actor('Karkh');
  assert.equal(outdoorSalesBranch(outdoor, new Date('2026-10-15T20:59:59.999Z')), 'Karkh');
  assert.equal(outdoorSalesBranch(outdoor, new Date('2026-10-15T21:00:00.000Z')), 'Karkh');
  assert.equal(outdoorSalesBranch(outdoor, new Date('2026-10-31T20:59:59.999Z')), 'Karkh');
  assert.equal(outdoorSalesBranch(outdoor, new Date('2026-10-31T21:00:00.000Z')), 'Karkh');
});

for (const [lastDay, nextMonth] of [
  ['2026-02-28', '2026-03-01'],
  ['2028-02-29', '2028-03-01'],
  ['2026-04-30', '2026-05-01'],
  ['2026-12-31', '2027-01-01'],
]) {
  test(`the assigned office stays fixed across ${lastDay} and ${nextMonth}`, () => {
    for (const starter of ['Karkh', 'Rasafa', 'Najaf']) {
      assert.equal(outdoorSalesBranch(actor(starter), new Date(`${lastDay}T23:59:59.999+03:00`)), starter);
      assert.equal(outdoorSalesBranch(actor(starter), new Date(`${nextMonth}T00:00:00.000+03:00`)), starter);
    }
  });
}

test('every role is limited to its office unless explicitly allowed to access all branches', () => {
  for (const role of appRoles.filter(role => role !== 'Outdoor Sales')) {
    const employee = { role, branch: 'Karkh', outdoorRotationStartBranch: 'Rasafa' };
    assert.equal(outdoorSalesBranch(employee, new Date('2026-10-22T12:00:00+03:00')), null);
    const expected = ['Admin', 'Sales Director', 'Company Owner'].includes(role) ? ['Karkh', 'Rasafa', 'Najaf', 'Governorates'] : ['Karkh', 'Governorates'];
    assert.deepEqual(outdoorProjectBranches(employee, new Date('2026-10-22T12:00:00+03:00')), expected);
    for (const branch of expected) assert.equal(normalizeOutdoorProjectBranch(employee, branch), branch);
    for (const branch of ['Karkh', 'Rasafa', 'Najaf', 'Governorates'].filter(branch => !expected.includes(branch))) assert.throws(() => normalizeOutdoorProjectBranch(employee, branch), { message: restrictedBranchError });
  }
});

test('legacy rotation values cannot grant access when the employee office is missing or invalid', () => {
  for (const starter of [undefined, null, '', 'karkh', 'Other', 'Governorates', 7]) {
    const employee = { ...actor(null, starter), name: 'Mohammad' };
    assert.equal(outdoorSalesBranch(employee), null);
    assert.deepEqual(outdoorProjectBranches(employee), []);
    for (const branch of ['Karkh', 'Rasafa', 'Najaf', 'Governorates']) assert.throws(() => normalizeOutdoorProjectBranch(employee, branch), { message: restrictedBranchError });
  }
});

test('an invalid device clock cannot expand access beyond the assigned office', () => {
  const date = new Date('invalid');
  for (const starter of ['Karkh', 'Rasafa', 'Najaf']) {
    assert.equal(outdoorSalesBranch(actor(starter), date), null);
    assert.deepEqual(outdoorProjectBranches(actor(starter), date), officeProjects(starter));
    for (const branch of officeProjects(starter)) assert.equal(normalizeOutdoorProjectBranch(actor(starter), branch, date), branch);
    for (const branch of ['Karkh', 'Rasafa', 'Najaf', 'Governorates'].filter(branch => !officeProjects(starter).includes(branch))) assert.throws(() => normalizeOutdoorProjectBranch(actor(starter), branch, date), { message: restrictedBranchError });
  }
});

test('branch validation keeps rejecting omitted, misspelled and forged project branches', () => {
  for (const value of [undefined, null, '', 'karkh', 'Rasafa ', 'Other', 3, {}, ['Karkh']]) {
    for (const employee of [actor('Karkh'), { role: 'Admin' }]) {
      assert.throws(() => normalizeOutdoorProjectBranch(employee, value), /project branch/);
    }
  }
});
