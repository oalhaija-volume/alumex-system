import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const firstHalf = '2026-11-15T20:59:59.999Z';
const secondHalf = '2026-11-24T09:00:00.000Z';
const employeeId = 'ehab';
const teammateId = 'teammate';
const employee = {
  id: employeeId, name: 'Ehab', role: 'Outdoor Sales', branch: 'Rasafa',
  outdoorRotationStartBranch: 'Rasafa', outdoorTeamMemberIds: [employeeId, teammateId],
};

function modules(at = secondHalf) {
  let now = at;
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return Date.parse(now); }
  }
  const cache = new Map();
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {};
    cache.set(url.href, exports);
    const source = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'exports', 'Date', source)(name => {
      if (name.startsWith('@/')) return load(new URL(`../src/${name.slice(2)}.ts`, import.meta.url));
      if (name.startsWith('.')) return load(new URL(`${name}.ts`, url));
      throw new Error(`Unexpected dependency: ${name}`);
    }, exports, FixedDate);
    return exports;
  }
  return { load: path => load(new URL(`../src/${path}.ts`, import.meta.url)), setNow: value => { now = value; } };
}

function project(id, branch, patch = {}) {
  return {
    id, branch, created_by: 'indoor', assigned_outdoor_sales_id: 'other-employee',
    project_number: `PRJ-${id}`, project_name: `${branch} site`, ...patch,
  };
}

test('static Baghdad branch capability stays available for assignments and original sales attribution', () => {
  const { canAccessProjectBranch, projectBranchesForActor } = modules().load('lib/auth/projectBranchAccess');
  assert.deepEqual(projectBranchesForActor(employee), ['Karkh', 'Rasafa', 'Governorates']);
  for (const branch of ['Karkh', 'Rasafa', 'Governorates']) assert.equal(canAccessProjectBranch(employee, branch), true);
  assert.equal(canAccessProjectBranch(employee, 'Najaf'), false);
});

const associations = {
  creator: { created_by: employeeId },
  assignment: { assigned_outdoor_sales_id: employeeId },
  team: { assigned_outdoor_sales_id: teammateId },
  legacy: { legacy_outdoor_sales_id: employeeId, owner_id: employeeId, sales_engineer_id: employeeId, project_log_only: true },
  combined: { created_by: employeeId, assigned_outdoor_sales_id: teammateId, legacy_outdoor_sales_id: employeeId },
};
for (const [at, current, opposite] of [[secondHalf, 'Karkh', 'Rasafa'], [firstHalf, 'Rasafa', 'Karkh']]) {
  for (const [association, patch] of Object.entries(associations)) {
    test(`${association} cannot bypass Ehab's ${current} visibility at ${at}`, () => {
      const { canAccessProjectRow } = modules().load('lib/auth/projectBranchAccess');
      const date = new Date(at);
      assert.equal(canAccessProjectRow(employee, project('current', current, patch), date), true);
      assert.equal(canAccessProjectRow(employee, project('opposite', opposite, patch), date), false);
    });
  }
}

test('visibility and registration use the same dependency-free calendar and retain the public export', () => {
  const x = modules();
  const rotation = x.load('lib/intake/outdoorRotation');
  const calendar = x.load('lib/intake/outdoorRotationSchedule');
  const { canAccessProjectRow } = x.load('lib/auth/projectBranchAccess');
  assert.equal(rotation.outdoorSalesBranch, calendar.outdoorSalesBranch);
  for (const branch of ['Karkh', 'Rasafa']) for (const seed of ['Karkh', 'Rasafa', null, undefined]) {
    const actor = { ...employee, branch, outdoorRotationStartBranch: seed };
    for (const at of [firstHalf, secondHalf]) {
      const date = new Date(at);
      const current = rotation.outdoorSalesBranch(actor, date);
      assert.deepEqual(rotation.outdoorProjectBranches(actor, date), [current, 'Governorates']);
      for (const area of ['Karkh', 'Rasafa']) {
        assert.equal(canAccessProjectRow(actor, project(area, area, associations.combined), date), area === current);
      }
    }
  }
});

for (const [at, branch] of [
  [firstHalf, 'Rasafa'],
  ['2026-11-15T21:00:00.000Z', 'Karkh'],
  ['2026-11-30T20:59:59.999Z', 'Karkh'],
  ['2026-11-30T21:00:00.000Z', 'Rasafa'],
]) test(`Baghdad midnight gives Ehab only ${branch} at ${at}`, () => {
  const { canAccessProjectRow } = modules().load('lib/auth/projectBranchAccess');
  for (const area of ['Karkh', 'Rasafa']) {
    assert.equal(canAccessProjectRow(employee, project(area, area, associations.creator), new Date(at)), area === branch);
  }
});

for (const [lastDay, nextMonth] of [
  ['2026-02-28', '2026-03-01'],
  ['2028-02-29', '2028-03-01'],
  ['2026-04-30', '2026-05-01'],
  ['2026-12-31', '2027-01-01'],
]) test(`visibility resets at Baghdad midnight after ${lastDay}`, () => {
  const { canAccessProjectRow } = modules().load('lib/auth/projectBranchAccess');
  for (const seed of ['Karkh', 'Rasafa']) {
    const actor = { ...employee, outdoorRotationStartBranch: seed };
    for (const [at, expected] of [
      [`${lastDay}T23:59:59.999+03:00`, seed === 'Karkh' ? 'Rasafa' : 'Karkh'],
      [`${nextMonth}T00:00:00.000+03:00`, seed],
    ]) for (const branch of ['Karkh', 'Rasafa']) {
      assert.equal(canAccessProjectRow(actor, project(branch, branch, associations.creator), new Date(at)), branch === expected);
    }
  }
});

test('Governorates access keeps its existing creator and assignment rules across both halves', () => {
  const { canAccessProjectRow } = modules().load('lib/auth/projectBranchAccess');
  for (const at of [firstHalf, secondHalf]) {
    const date = new Date(at);
    for (const patch of [associations.creator, associations.assignment, associations.team]) {
      assert.equal(canAccessProjectRow(employee, project('province', 'Governorates', { governorate: 'البصرة', ...patch }), date), true);
    }
    assert.equal(canAccessProjectRow(employee, project('unrelated-province', 'Governorates'), date), false);
    assert.equal(canAccessProjectRow({ ...employee, branch: 'Karkh' }, project('unrelated-province', 'Governorates'), date), true);
    assert.equal(canAccessProjectRow(employee, project('najaf-office', 'Governorates', { governorate: 'النجف', ...associations.creator }), date), false);
  }
});

test('Najaf, Indoor Sales and leadership access do not change with the calendar', () => {
  const { canAccessProjectRow } = modules().load('lib/auth/projectBranchAccess');
  for (const at of [firstHalf, secondHalf]) {
    const date = new Date(at);
    const najaf = { ...employee, branch: 'Najaf' };
    assert.equal(canAccessProjectRow(najaf, project('najaf', 'Najaf', associations.team), date), true);
    for (const branch of ['Karkh', 'Rasafa', 'Governorates']) {
      assert.equal(canAccessProjectRow(najaf, project(branch, branch, associations.creator), date), false);
    }
    for (const home of ['Karkh', 'Rasafa', 'Najaf']) for (const branch of ['Karkh', 'Rasafa', 'Najaf', 'Governorates']) {
      const indoor = { ...employee, role: 'Indoor Sales', branch: home };
      assert.equal(canAccessProjectRow(indoor, project(branch, branch, associations.creator), date), branch === home || home === 'Karkh' && branch === 'Governorates');
    }
    for (const role of ['Admin', 'Sales Director', 'Company Owner']) for (const branch of ['Karkh', 'Rasafa', 'Najaf', 'Governorates']) {
      assert.equal(canAccessProjectRow({ ...employee, role }, project(branch, branch), date), true);
    }
  }
});

test('an invalid date cannot authorize either Baghdad area and does not alter other branch boundaries', () => {
  const { canAccessProjectRow } = modules().load('lib/auth/projectBranchAccess');
  const invalid = new Date('invalid');
  for (const branch of ['Karkh', 'Rasafa']) assert.equal(canAccessProjectRow(employee, project(branch, branch, associations.combined), invalid), false);
  assert.equal(canAccessProjectRow(employee, project('province', 'Governorates', associations.creator), invalid), true);
  assert.equal(canAccessProjectRow({ ...employee, branch: 'Najaf' }, project('najaf', 'Najaf'), invalid), true);
  assert.equal(canAccessProjectRow(employee, null, invalid), false);
});

function cachedState() {
  const projects = ['Karkh', 'Rasafa'].flatMap(branch => Object.entries(associations)
    .filter(([association]) => association !== 'combined')
    .map(([association, patch]) => project(`${branch}-${association}`, branch, patch)));
  projects.push(
    project('province-own', 'Governorates', { governorate: 'البصرة', ...associations.creator }),
    project('province-team', 'Governorates', { governorate: 'البصرة', ...associations.team }),
    project('province-unrelated', 'Governorates'),
    project('najaf-own', 'Najaf', associations.creator),
    project('najaf-historical', 'Governorates', { governorate: 'النجف', ...associations.creator }),
    project('unrelated-karkh', 'Karkh'),
  );
  return {
    actor: structuredClone(employee), projects, syncedAt: null,
    openings: projects.map(row => ({ id: `opening-${row.id}`, projectId: row.id, skylight: { photo: `photo-${row.id}` } })),
    queue: projects.map(row => ({ id: `change-${row.id}`, userId: employeeId, projectId: row.id, action: 'opening',
      payload: { note: `saved-work-${row.id}` }, recordedAt: firstHalf })),
    measurementReports: projects.map(row => ({ id: `report-${row.id}`, project_id: row.id, photo: `report-photo-${row.id}` })),
    followUpHistories: Object.fromEntries(projects.map(row => [row.id, { note: `history-${row.id}` }])),
    archivedProjects: projects.map(row => ({ projectId: row.id, project: row, changes: [], openings: [], measurementReports: [] })),
  };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

test('offline views filter opposite-area projects, media, queue, history and archives without changing stored work', () => {
  const x = modules();
  const { visibleFieldState, canAccessFieldProject } = x.load('lib/offline/projectAccess');
  const stored = freeze(cachedState());
  const before = structuredClone(stored);
  for (const [at, area] of [[secondHalf, 'Karkh'], [firstHalf, 'Rasafa'], ['2026-12-01T00:00:00+03:00', 'Rasafa']]) {
    x.setNow(at);
    const view = visibleFieldState(stored);
    const writable = [`${area}-creator`, `${area}-assignment`, `${area}-team`, 'province-own', 'province-team'];
    assert.deepEqual(view.projects.map(row => row.id), [...writable.slice(0, 3), `${area}-legacy`, ...writable.slice(3)]);
    assert.deepEqual(view.openings.map(row => row.projectId), writable);
    assert.deepEqual(view.queue.map(row => row.projectId), writable);
    assert.deepEqual(view.measurementReports.map(row => row.project_id), writable);
    assert.deepEqual(Object.keys(view.followUpHistories), writable);
    assert.deepEqual(view.archivedProjects.map(row => row.projectId), writable);
    assert.equal(view.openings[0].skylight.photo, `photo-${area}-creator`);
    for (const row of stored.projects) assert.equal(canAccessFieldProject(stored, row), writable.includes(row.id), row.id);
    assert.deepEqual(stored, before, 'Calendar filtering must preserve every stored measurement and queued operation');
    assert.equal(stored.queue.length, before.queue.length);
  }
});
