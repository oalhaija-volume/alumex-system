import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function modules() {
  const cache = new Map();
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {};
    cache.set(url.href, exports);
    const source = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'exports', source)(name => {
      if (name.startsWith('@/')) return load(new URL(`../src/${name.slice(2)}.ts`, import.meta.url));
      if (name.startsWith('.')) return load(new URL(`${name}.ts`, url));
      throw new Error(`Unexpected dependency: ${name}`);
    }, exports);
    return exports;
  }
  return name => load(new URL(`../src/${name}.ts`, import.meta.url));
}

const load = modules();
const { measurementTasks, measurementAreaForActor } = load('lib/workflow/salesTasks');
const ehab = { id: 'employee', name: 'Ehab', role: 'Outdoor Sales', branch: 'Rasafa',
  outdoorRotationStartBranch: 'Rasafa', outdoorTeamMemberIds: ['employee', 'teammate'] };
const currentDate = new Date('2026-11-24T09:00:00Z');
function task(id, branch, values = {}) {
  return { id, branch, created_by: 'indoor', assigned_outdoor_sales_id: ehab.id,
    structure_readiness: 'ready', sales_status: 'new_lead', ...values };
}
const mixed = ['Karkh', 'Rasafa'].flatMap(branch => [
  task(`${branch}-self`, branch),
  task(`${branch}-team`, branch, { assigned_outdoor_sales_id: 'teammate' }),
  task(`${branch}-creator`, branch, { created_by: ehab.id, assigned_outdoor_sales_id: 'other' }),
  task(`${branch}-legacy`, branch, { legacy_outdoor_sales_id: ehab.id, project_log_only: true }),
]);

test('Ehab sees only Karkh self/team tasks on November 24 even when supplied both areas', () => {
  const before = structuredClone({ actor: ehab, projects: mixed });
  assert.equal(measurementAreaForActor(ehab, currentDate), 'Karkh');
  assert.deepEqual(measurementTasks(mixed, ehab, currentDate).map(project => project.id), ['Karkh-self', 'Karkh-team']);
  assert.deepEqual({ actor: ehab, projects: mixed }, before, 'Task selection must not change saved assignments, attribution or rows');
});

for (const seed of ['Karkh', 'Rasafa']) for (const office of ['Karkh', 'Rasafa']) {
  test(`${office} office uses its verified ${seed} seed on both sides of Baghdad midnight`, () => {
    const actor = { ...ehab, branch: office, outdoorRotationStartBranch: seed };
    for (const [instant, area] of [
      ['2026-11-15T20:59:59.999Z', seed],
      ['2026-11-15T21:00:00.000Z', seed === 'Karkh' ? 'Rasafa' : 'Karkh'],
      ['2026-11-30T20:59:59.999Z', seed === 'Karkh' ? 'Rasafa' : 'Karkh'],
      ['2026-11-30T21:00:00.000Z', seed],
    ]) {
      const date = new Date(instant);
      assert.equal(measurementAreaForActor(actor, date), area);
      assert.deepEqual(measurementTasks(mixed, actor, date).map(project => project.id), [`${area}-self`, `${area}-team`]);
    }
  });
}

for (const seed of [undefined, '', 'karkh', 'Other', 'Governorates', 0, false, {}]) {
  test(`unverified Baghdad seed ${String(seed)} cannot display either area`, () => {
    const actor = { ...ehab, outdoorRotationStartBranch: seed };
    assert.equal(measurementAreaForActor(actor, currentDate), null);
    assert.deepEqual(measurementTasks(mixed, actor, currentDate), []);
    const ownAssigned = mixed.map(project => ({ ...project, created_by: actor.id, assigned_outdoor_sales_id: actor.id }));
    assert.deepEqual(measurementTasks(ownAssigned, actor, currentDate), [], 'Creator and assignment cannot infer an unknown area');
  });
}

test('an absent legacy seed fails closed while verified explicit null keeps the Karkh-first default', () => {
  const actor = { ...ehab };
  delete actor.outdoorRotationStartBranch;
  assert.deepEqual(measurementTasks(mixed, actor, currentDate), []);
  const verified = { ...actor, outdoorRotationStartBranch: null };
  for (const [instant, area] of [['2026-11-15T20:59:59.999Z', 'Karkh'], ['2026-11-15T21:00:00Z', 'Rasafa']]) {
    const date = new Date(instant);
    assert.equal(measurementAreaForActor(verified, date), area);
    assert.deepEqual(measurementTasks(mixed, verified, date).map(project => project.id), [`${area}-self`, `${area}-team`]);
  }
});

test('Province tasks retain their existing self/team assignment policy without requiring a Baghdad seed', () => {
  const rows = [
    task('province-self', 'Governorates', { governorate: 'البصرة' }),
    task('province-team', 'Governorates', { governorate: 'البصرة', assigned_outdoor_sales_id: 'teammate' }),
    task('province-creator-only', 'Governorates', { governorate: 'البصرة', created_by: ehab.id, assigned_outdoor_sales_id: 'other' }),
    task('province-reference', 'Governorates', { governorate: 'البصرة', legacy_outdoor_sales_id: ehab.id, project_log_only: true }),
    task('legacy-najaf', 'Governorates', { governorate: 'النجف' }),
  ];
  for (const branch of ['Karkh', 'Rasafa']) for (const seed of ['Karkh', 'Rasafa', null, undefined, 'invalid']) {
    assert.deepEqual(measurementTasks(rows, { ...ehab, branch, outdoorRotationStartBranch: seed }, currentDate)
      .map(project => project.id), ['province-self', 'province-team']);
  }
});

test('Najaf remains in Najaf, including legacy geography, independently of Baghdad rotation metadata', () => {
  const rows = [task('najaf', 'Najaf'), task('legacy-najaf', 'Governorates', { governorate: 'النجف' }),
    task('province', 'Governorates', { governorate: 'البصرة' }), ...mixed];
  for (const seed of ['Karkh', 'Rasafa', null, undefined, 'invalid']) {
    const actor = { ...ehab, branch: 'Najaf', outdoorRotationStartBranch: seed };
    assert.equal(measurementAreaForActor(actor, currentDate), 'Najaf');
    assert.deepEqual(measurementTasks(rows, actor, currentDate).map(project => project.id), ['najaf', 'legacy-najaf']);
  }
});

test('missing or invalid home offices cannot infer Baghdad access from a valid seed', () => {
  for (const branch of [null, undefined, '', 'rasafa', 'Governorates', 'Other']) {
    const actor = { ...ehab, branch };
    assert.equal(measurementAreaForActor(actor, currentDate), null);
    assert.deepEqual(measurementTasks(mixed, actor, currentDate), []);
  }
});

test('current-area filtering retains every existing task readiness, assignment and stage restriction', () => {
  const base = task('current', 'Karkh');
  const excluded = [
    { assigned_outdoor_sales_id: null }, { assigned_outdoor_sales_id: undefined }, { assigned_outdoor_sales_id: 'other' },
    { project_log_only: true }, { measurement_delayed: true },
    ...['not_ready', 'partially_ready', 'unknown', ''].map(structure_readiness => ({ structure_readiness })),
    ...['ready_for_quotation', 'quotation_in_progress', 'quotation_approved', 'contract_generated', 'contract_signed',
      'transferred_to_operations', 'cancelled', 'lost', 'closed', 'unexpected'].map(sales_status => ({ sales_status })),
  ];
  assert.deepEqual(measurementTasks([base], ehab, currentDate), [base]);
  assert.equal(measurementTasks([{ ...base, additional_openings_state: 'requested' }], ehab, currentDate).length, 1);
  for (const patch of excluded) assert.deepEqual(measurementTasks([{ ...base, ...patch }], ehab, currentDate), [], JSON.stringify(patch));
  assert.deepEqual(measurementTasks([base], undefined, currentDate), []);
});

test('leadership and Indoor role behavior remains unchanged by Outdoor rotation filtering', () => {
  const rows = ['Karkh', 'Rasafa', 'Governorates', 'Najaf'].map(branch => task(branch, branch));
  for (const role of load('lib/auth/roles').appRoles) {
    if (role === 'Outdoor Sales') continue;
    const actor = { ...ehab, role };
    assert.equal(measurementAreaForActor(actor, currentDate), null);
    assert.deepEqual(measurementTasks(rows, actor, currentDate), ['Admin', 'Sales Director', 'CEO', 'Company Owner'].includes(role) ? rows : []);
  }
});

test('invalid device dates cannot authorize Baghdad tasks and do not alter Province or Najaf scope', () => {
  const invalid = new Date('invalid');
  assert.equal(measurementAreaForActor(ehab, invalid), null);
  assert.deepEqual(measurementTasks(mixed, ehab, invalid), []);
  assert.equal(measurementTasks([task('province', 'Governorates')], ehab, invalid).length, 1);
  const najaf = { ...ehab, branch: 'Najaf' };
  assert.equal(measurementAreaForActor(najaf, invalid), 'Najaf');
  assert.equal(measurementTasks([task('najaf', 'Najaf')], najaf, invalid).length, 1);
});
