import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const date = new Date('2026-11-24T09:00:00Z');
const employeeId = '11111111-1111-4111-8111-111111111111';
const teammateId = '22222222-2222-4222-8222-222222222222';
const assignmentId = '33333333-3333-4333-8333-333333333333';
const nextAssignmentId = '44444444-4444-4444-8444-444444444444';
const projectId = '0474aaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actor = { id: employeeId, name: 'Ehab fixture', role: 'Outdoor Sales', branch: 'Rasafa',
  outdoorRotationStartBranch: 'Rasafa', outdoorTeamMemberIds: [employeeId, teammateId] };
const project = { id: projectId, project_number: 'PRJ-202611-0474', project_name: 'Exact exceptional task',
  branch: 'Rasafa', measurement_branch: 'Rasafa', governorate: null, governorate_office: null,
  created_by: 'indoor', registeredBy: 'Indoor fixture', follow_up_owner_id: 'original-indoor-owner',
  assigned_outdoor_sales_id: employeeId, assignedOutdoorSales: actor.name, measurement_assignment_id: assignmentId,
  measurement_exception_employee_id: employeeId, measurement_exception_assignment_id: assignmentId,
  measurement_exception_reason: 'Explicit instruction to retain Ehab on this measurement assignment.',
  structure_readiness: 'ready', sales_status: 'new_lead', archived_at: null,
  address: 'Rasafa site', created_at: '2026-11-24T08:00:00Z', updated_at: '2026-11-24T08:00:00Z',
  next_follow_up_at: null, project_notes: null };
const currentTask = { ...project, id: 'current-task', project_number: 'PRJ-CURRENT', project_name: 'Ordinary Karkh task',
  branch: 'Karkh', measurement_branch: null, assigned_outdoor_sales_id: teammateId,
  measurement_exception_employee_id: null, measurement_exception_assignment_id: null, measurement_exception_reason: null };
const otherRasafa = { ...project, id: 'other-rasafa', project_number: 'PRJ-OTHER-RASAFA', project_name: 'Ordinary hidden Rasafa task',
  measurement_exception_employee_id: null, measurement_exception_assignment_id: null, measurement_exception_reason: null };

function modules(dependencies = {}) {
  const cache = new Map();
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {};
    cache.set(url.href, exports);
    const source = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('require', 'exports', source)(name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.startsWith('@/')) return load(new URL(`../src/${name.slice(2)}.ts`, import.meta.url));
      if (name.startsWith('.')) return load(new URL(`${name}.${name.includes('components/') ? 'tsx' : 'ts'}`, url));
      throw new Error(`Unexpected dependency: ${name}`);
    }, exports);
    return exports;
  }
  return name => load(new URL(`../src/${name}`, import.meta.url));
}

const load = modules();
const { hasMeasurementRotationException, canAccessProjectRow, effectiveMeasurementBranch } = load('lib/auth/projectBranchAccess.ts');
const { measurementTasks, measurementAreaForActor } = load('lib/workflow/salesTasks.ts');

test('only the exact issued 0474 assignment joins Ehab’s ordinary current-area tasks', () => {
  const rows = [project, otherRasafa, currentTask];
  const before = structuredClone({ actor, rows });
  assert.equal(measurementAreaForActor(actor, date), 'Karkh');
  assert.equal(effectiveMeasurementBranch(project), 'Rasafa');
  assert.equal(hasMeasurementRotationException(project, actor), true);
  assert.equal(canAccessProjectRow(actor, project, date), true);
  assert.deepEqual(measurementTasks(rows, actor, date).map(row => row.id), [projectId, currentTask.id]);
  assert.deepEqual({ actor, rows }, before, 'Viewing an exception cannot change its area, assignee, origin or Indoor owner');
});

test('Sajjad and another team member cannot inherit Ehab’s cross-area exception', () => {
  for (const id of [teammateId, '55555555-5555-4555-8555-555555555555']) {
    const teammate = { ...actor, id, outdoorTeamMemberIds: [employeeId, teammateId, id] };
    assert.equal(hasMeasurementRotationException(project, teammate), false);
    assert.equal(canAccessProjectRow(teammate, project, date), false);
    assert.deepEqual(measurementTasks([project], teammate, date), []);
  }
});

test('other roles and Najaf or missing offices never satisfy the named Outdoor predicate', () => {
  for (const role of ['Indoor Sales', 'Sales Manager', 'Admin', 'Sales Director', 'CEO', 'Company Owner', 'HR']) {
    assert.equal(hasMeasurementRotationException(project, { ...actor, role }), false, role);
  }
  for (const branch of ['Najaf', 'Governorates', null, undefined, '', 'rasafa']) {
    const foreign = { ...actor, branch };
    assert.equal(hasMeasurementRotationException(project, foreign), false, String(branch));
    assert.deepEqual(measurementTasks([project], foreign, date), []);
  }
  assert.equal(canAccessProjectRow({ ...actor, role: 'Indoor Sales', branch: 'Rasafa' }, project, date), true,
    'Existing Indoor office access remains independent of the Outdoor exception');
});

for (const [name, patch] of [
  ['missing employee', { measurement_exception_employee_id: undefined }],
  ['cleared employee', { measurement_exception_employee_id: null }],
  ['another employee', { measurement_exception_employee_id: teammateId }],
  ['another assignee', { assigned_outdoor_sales_id: teammateId }],
  ['unassigned', { assigned_outdoor_sales_id: null }],
  ['missing current assignment', { measurement_assignment_id: undefined }],
  ['empty current assignment', { measurement_assignment_id: '' }],
  ['new assignment', { measurement_assignment_id: nextAssignmentId }],
  ['missing exception assignment', { measurement_exception_assignment_id: undefined }],
  ['cleared exception assignment', { measurement_exception_assignment_id: null }],
  ['different exception assignment', { measurement_exception_assignment_id: nextAssignmentId }],
  ['missing reason', { measurement_exception_reason: undefined }],
  ['cleared reason', { measurement_exception_reason: null }],
  ['empty reason', { measurement_exception_reason: '' }],
  ['whitespace reason', { measurement_exception_reason: ' \n\t ' }],
  ['nontext reason', { measurement_exception_reason: 7 }],
  ['overlong reason', { measurement_exception_reason: 'x'.repeat(1001) }],
]) test(`${name} invalidates the exception without exposing the opposite area`, () => {
  const row = { ...project, ...patch };
  assert.equal(hasMeasurementRotationException(row, actor), false);
  assert.equal(canAccessProjectRow(actor, row, date), false);
  assert.deepEqual(measurementTasks([row], actor, date), []);
});

test('a maximum-length nonempty reason remains valid', () => {
  assert.equal(hasMeasurementRotationException({ ...project, measurement_exception_reason: 'x'.repeat(1000) }, actor), true);
});

test('completed, closed, archived and not-ready rows cannot retain measurement access through old fields', () => {
  for (const patch of [
    ...['not_ready', 'partially_ready', 'unknown'].map(structure_readiness => ({ structure_readiness })),
    ...['ready_for_quotation', 'quotation_in_progress', 'quotation_approved', 'contract_generated', 'contract_signed',
      'transferred_to_operations', 'cancelled', 'lost', 'closed'].map(sales_status => ({ sales_status })),
    { archived_at: '2026-11-24T10:00:00Z' },
  ]) {
    const row = { ...project, ...patch };
    assert.equal(hasMeasurementRotationException(row, actor), false, JSON.stringify(patch));
    assert.equal(canAccessProjectRow(actor, row, date), false);
    assert.deepEqual(measurementTasks([row], actor, date), []);
  }
});

test('an optimistic pending finish keeps its exact queue readable until acknowledgement but leaves the task list', () => {
  const pending = { ...project, sales_status: 'ready_for_quotation', pending: true };
  assert.equal(hasMeasurementRotationException(pending, actor), true);
  assert.equal(canAccessProjectRow(actor, pending, date), true);
  assert.deepEqual(measurementTasks([pending], actor, date), []);
  for (const row of [
    { ...pending, pending: false },
    { ...pending, measurement_exception_employee_id: null, measurement_exception_assignment_id: null, measurement_exception_reason: null },
    { ...pending, measurement_assignment_id: nextAssignmentId },
    { ...pending, sales_status: 'contract_signed' },
  ]) {
    assert.equal(hasMeasurementRotationException(row, actor), false);
    assert.equal(canAccessProjectRow(actor, row, date), false);
  }
});

test('reassigning an operation revokes the old binding for both the old and the new assignee', () => {
  const reassigned = { ...project, assigned_outdoor_sales_id: teammateId, measurement_assignment_id: nextAssignmentId };
  for (const employee of [actor, { ...actor, id: teammateId }]) {
    assert.equal(hasMeasurementRotationException(reassigned, employee), false);
    assert.deepEqual(measurementTasks([reassigned], employee, date), []);
  }
});

test('exception metadata cannot cross Province or Najaf privacy boundaries or create unassigned tasks', () => {
  const najaf = { ...project, branch: 'Najaf', measurement_branch: 'Rasafa' };
  const legacyNajaf = { ...project, branch: 'Governorates', governorate: 'النجف' };
  for (const row of [najaf, legacyNajaf]) {
    assert.equal(hasMeasurementRotationException(row, actor), false);
    assert.equal(canAccessProjectRow(actor, row, date), false);
    assert.deepEqual(measurementTasks([row], actor, date), []);
  }
  const province = { ...project, branch: 'Governorates', governorate: 'البصرة' };
  assert.equal(hasMeasurementRotationException(province, actor), false);
  assert.equal(measurementTasks([province], actor, date).length, 1, 'Ordinary Province assignments keep their existing access');
  assert.equal(measurementTasks([najaf], { ...actor, branch: 'Najaf' }, date).length, 1, 'Ordinary Najaf assignments remain within Najaf');
  assert.deepEqual(measurementTasks([{ ...project, project_log_only: true }], actor, date), []);
  assert.deepEqual(measurementTasks([{ ...project, measurement_delayed: true }], actor, date), []);
});

test('same-area ordinary team tasks remain shared without granting a rotation exception', () => {
  assert.equal(hasMeasurementRotationException(currentTask, actor), false);
  assert.deepEqual(measurementTasks([currentTask], actor, date), [currentTask]);
  const sameAreaTeammate = { ...actor, id: teammateId, outdoorRotationStartBranch: 'Karkh' };
  assert.equal(hasMeasurementRotationException(project, sameAreaTeammate), false);
  assert.deepEqual(measurementTasks([project], sameAreaTeammate, date), [project], 'Normal current-area team policy stays separate from the named exception');
});

function markup(component, employee, rows) {
  const data = { actor: employee, projects: rows, indoorSales: [] };
  const Link = ({ href, children }) => React.createElement('a', { href }, children);
  const components = modules({
    react: React, 'react/jsx-runtime': jsxRuntime, 'next/link': { default: Link },
    '@/components/i18n/I18nProvider': { useI18n: () => ({ term: value => value, formatNumber: String, formatDateTime: value => value }) },
    '@/components/measurements/MeasurementDelayNotice': { MeasurementDelayNotice: () => null },
    './useProjectRegistrationFilters': { useProjectRegistrationFilters: projects => ({ filteredProjects: projects }) },
    './DashboardProjectFilters': { DashboardProjectFilters: () => null },
    './ui': { card: 'card', button: 'button', useNow: () => date.getTime(), useResource: () => ({ data, error: '', loading: false }),
      Notice: () => null, Workspace: ({ children }) => React.createElement('section', null, children) },
  });
  const { [component]: View } = components(`components/workflow/${component}.tsx`);
  return renderToStaticMarkup(React.createElement(View, { data, now: date.getTime() }));
}

for (const component of ['OutdoorMobileWorkspace', 'SalesTaskPanel']) test(`${component} labels only the active named exception and keeps both physical/current areas accurate`, () => {
  const html = markup(component, actor, [project, otherRasafa, currentTask]);
  assert.equal((html.match(/Rotation exception/g) ?? []).length, 1);
  assert.match(html, /PRJ-202611-0474/);
  assert.doesNotMatch(html, /PRJ-OTHER-RASAFA/);
  const text = html.replace(/<[^>]*>/g, '');
  assert.match(text, /Measurement area: Karkh/);
  assert.match(text, /Measurement area: Rasafa/);
  const teammateHtml = markup(component, { ...actor, id: teammateId }, [project, currentTask]);
  assert.doesNotMatch(teammateHtml, /Rotation exception|PRJ-202611-0474/);
  if (component === 'SalesTaskPanel') assert.doesNotMatch(markup(component, { ...actor, role: 'Admin' }, [project]), /Rotation exception/);
});
