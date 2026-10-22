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
const actor = outdoorRotationStartBranch => ({ role: 'Outdoor Sales', outdoorRotationStartBranch });
const startBranchError = 'Ask Admin to assign your monthly Outdoor Sales rotation before creating a Karkh or Rasafa project.';
const restrictedBranchError = 'You can only create projects for your assigned branch or Governorates during this half of the month.';

for (const starter of ['Karkh', 'Rasafa']) {
  const secondBranch = starter === 'Karkh' ? 'Rasafa' : 'Karkh';
  for (const [instant, expected] of [
    ['2026-10-01T00:00:00+03:00', starter],
    ['2026-10-15T23:59:59.999+03:00', starter],
    ['2026-10-16T00:00:00+03:00', secondBranch],
    ['2026-10-31T23:59:59.999+03:00', secondBranch],
    ['2026-11-01T00:00:00+03:00', starter],
  ]) {
    test(`${starter} starters use ${expected} at Baghdad time ${instant}`, () => {
      const date = new Date(instant);
      assert.equal(outdoorSalesBranch(actor(starter), date), expected);
      assert.deepEqual(outdoorProjectBranches(actor(starter), date), [expected, 'Governorates']);
      assert.equal(normalizeOutdoorProjectBranch(actor(starter), expected, date), expected);
      assert.throws(() => normalizeOutdoorProjectBranch(actor(starter), expected === 'Karkh' ? 'Rasafa' : 'Karkh', date), { message: restrictedBranchError });
      assert.equal(normalizeOutdoorProjectBranch(actor(starter), 'Governorates', date), 'Governorates');
    });
  }
}

test('the rotation switches with Baghdad midnight while the UTC calendar still shows the previous day', () => {
  const outdoor = actor('Karkh');
  assert.equal(outdoorSalesBranch(outdoor, new Date('2026-10-15T20:59:59.999Z')), 'Karkh');
  assert.equal(outdoorSalesBranch(outdoor, new Date('2026-10-15T21:00:00.000Z')), 'Rasafa');
  assert.equal(outdoorSalesBranch(outdoor, new Date('2026-10-31T20:59:59.999Z')), 'Rasafa');
  assert.equal(outdoorSalesBranch(outdoor, new Date('2026-10-31T21:00:00.000Z')), 'Karkh');
});

for (const [lastDay, nextMonth] of [
  ['2026-02-28', '2026-03-01'],
  ['2028-02-29', '2028-03-01'],
  ['2026-04-30', '2026-05-01'],
  ['2026-12-31', '2027-01-01'],
]) {
  test(`the last day ${lastDay} rotates back on ${nextMonth}`, () => {
    for (const starter of ['Karkh', 'Rasafa']) {
      assert.equal(outdoorSalesBranch(actor(starter), new Date(`${lastDay}T23:59:59.999+03:00`)), starter === 'Karkh' ? 'Rasafa' : 'Karkh');
      assert.equal(outdoorSalesBranch(actor(starter), new Date(`${nextMonth}T00:00:00.000+03:00`)), starter);
    }
  });
}

test('every other application role retains the existing project branch choices', () => {
  for (const role of appRoles.filter(role => role !== 'Outdoor Sales')) {
    const employee = { role, branch: 'Karkh', outdoorRotationStartBranch: 'Rasafa' };
    assert.equal(outdoorSalesBranch(employee, new Date('2026-10-22T12:00:00+03:00')), null);
    assert.deepEqual(outdoorProjectBranches(employee, new Date('2026-10-22T12:00:00+03:00')), ['Karkh', 'Rasafa', 'Governorates']);
    for (const branch of ['Karkh', 'Rasafa', 'Governorates']) assert.equal(normalizeOutdoorProjectBranch(employee, branch), branch);
  }
});

test('missing or invalid Outdoor Sales rotation assignments allow only Governorates', () => {
  for (const starter of [undefined, null, '', 'karkh', 'Other', 'Governorates', 7]) {
    const employee = { ...actor(starter), branch: 'Karkh', name: 'Mohammad' };
    assert.equal(outdoorSalesBranch(employee), null);
    assert.deepEqual(outdoorProjectBranches(employee), ['Governorates']);
    assert.equal(normalizeOutdoorProjectBranch(employee, 'Governorates'), 'Governorates');
    for (const branch of ['Karkh', 'Rasafa']) assert.throws(() => normalizeOutdoorProjectBranch(employee, branch), { message: startBranchError });
  }
});

test('an invalid device clock never grants a Baghdad branch', () => {
  const date = new Date('invalid');
  for (const starter of ['Karkh', 'Rasafa']) {
    assert.equal(outdoorSalesBranch(actor(starter), date), null);
    assert.deepEqual(outdoorProjectBranches(actor(starter), date), ['Governorates']);
    assert.equal(normalizeOutdoorProjectBranch(actor(starter), 'Governorates', date), 'Governorates');
    for (const branch of ['Karkh', 'Rasafa']) assert.throws(() => normalizeOutdoorProjectBranch(actor(starter), branch, date));
  }
});

test('rotation validation keeps rejecting omitted, misspelled and forged project branches', () => {
  for (const value of [undefined, null, '', 'karkh', 'Rasafa ', 'Other', 3, {}, ['Karkh']]) {
    for (const employee of [actor('Karkh'), { role: 'Admin' }]) {
      assert.throws(() => normalizeOutdoorProjectBranch(employee, value), /project branch/);
    }
  }
});
