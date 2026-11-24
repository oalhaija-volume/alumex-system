import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';

const now = Date.parse('2026-11-24T09:00:00Z');
const ehab = { id: 'ehab', name: 'Ehab', branch: 'Rasafa', outdoorRotationStartBranch: 'Rasafa' };
const ali = { id: 'ali', name: 'Ali', branch: 'Rasafa', outdoorRotationStartBranch: 'Karkh' };
const actor = { id: 'indoor', name: 'Indoor', role: 'Indoor Sales', branch: 'Karkh' };
const project = { id: 'project', branch: 'Karkh', measurement_branch: 'Rasafa',
  project_number: 'QA-1', project_name: 'Fixture', created_by: actor.id, registeredBy: actor.name,
  original_creator_role: 'Indoor Sales', structure_readiness: 'ready', sales_status: 'new_lead',
  assigned_outdoor_sales_id: ali.id, assignedOutdoorSales: ali.name, updated_at: 'version',
  created_at: '2026-11-01T09:00:00Z', address: 'Fictional site', phone: null };
const messages = Object.fromEntries(['en', 'ar'].map(locale => [locale,
  JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8')).terms]));
function translations(locale) {
  return { term: value => messages[locale][value] ?? value, formatDateTime: () => '24/11/2026',
    formatNumber: String };
}
function harness(locale = 'en', values = {}) {
  const cache = new Map();
  const states = [];
  let cursor = 0;
  const data = { actor, outdoorSales: [ehab, ali], indoorSales: [], projects: [project], ...values };
  const requests = [];
  const hooks = { ...React, useEffect() {}, useState(initial) {
    const index = cursor++;
    if (!(index in states)) states[index] = initial === false ? true : initial;
    return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
  } };
  const blank = () => null;
  const link = ({ children, ...props }) => React.createElement('a', props, children);
  const dependencies = {
    react: hooks, 'react/jsx-runtime': jsxRuntime, 'next/link': link,
    '@/components/i18n/I18nProvider': { useI18n: () => translations(locale) },
    './ui': { button: '', card: '', Notice: blank, Workspace: ({ children }) => children,
      useNow: () => now, useResource: () => ({ data, setData() {}, error: '', setError() {}, loading: false, reload: async () => {} }),
      api: async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); return {}; } },
    './MiniCRM': { MiniCRM: blank },
    './FollowUpFields': { FollowUpFields: blank, followUpFormValues: () => ({ note: 'follow-up fixture' }) },
    './ProjectFollowUps': { ProjectFollowUps: blank }, './ReactivateProject': { ReactivateProject: blank },
    './ProjectNameEditor': { ProjectNameEditor: blank }, './ClientNameEditor': { ClientNameEditor: blank },
    './SharedQuotationProjects': { SharedQuotationProjects: blank },
    './useOutdoorSalesProjectFilters': { useOutdoorSalesProjectFilters: () => ({ filteredProjects: data.projects }) },
    './OutdoorSalesProjectFilter': { OutdoorSalesProjectFilter: blank },
    './useProjectRegistrationFilters': { useProjectRegistrationFilters: projects => ({ filteredProjects: projects, reset() {} }) },
    './DashboardProjectFilters': { DashboardProjectFilters: blank },
    '@/components/measurements/MeasurementDelayNotice': { MeasurementDelayNotice: blank },
    '@/components/measurements/ClientCancellation': { ClientCancellation: blank },
    '@/lib/offline/client': { deleteOnlineProject: blank, updateSavedClientName: blank },
  };
  class FixtureFormData {
    constructor(form) { this.values = form.values; }
    has(name) { return Object.hasOwn(this.values, name); }
    get(name) { return this.values[name] ?? null; }
  }
  function load(url, exposeCRM = false) {
    const key = `${url.href}:${exposeCRM}`;
    if (cache.has(key)) return cache.get(key);
    const exports = {};
    cache.set(key, exports);
    const source = readFileSync(url, 'utf8') + (exposeCRM ? '\nexport { CRMProject };\n' : '');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    new Function('require', 'exports', 'FormData', code)(name => {
      if (name in dependencies) return dependencies[name];
      if (name.startsWith('@/lib/')) return load(new URL(`../src/${name.slice(2)}.ts`, import.meta.url));
      if (name.startsWith('.')) return load(new URL(`${name}.ts`, url));
      throw new Error(`Unexpected dependency: ${name}`);
    }, exports, FixtureFormData);
    return exports;
  }
  const renderCRM = row => { cursor = 0; return load(new URL('../src/components/workflow/MiniCRM.tsx', import.meta.url), true)
    .CRMProject({ project: row, data, now, busy: '', canDelete: false, onUpdate: async () => {}, onDelete: async () => {} }); };
  return { data, requests, renderCRM, renderWorkspace(role = actor.role) {
    cursor = 0; data.actor = { ...actor, role };
    return load(new URL('../src/components/workflow/ProjectWorkspace.tsx', import.meta.url)).ProjectWorkspace({ followUps: true });
  }, component(name) { return load(new URL(`../src/components/workflow/${name}.tsx`, import.meta.url))[name]; } };
}
function all(node, predicate, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (Array.isArray(node)) { node.forEach(child => all(child, predicate, result)); return result; }
  if (predicate(node)) result.push(node);
  all(node.props?.children, predicate, result);
  return result;
}
const select = (tree, name) => all(tree, node => node.type === 'select' && node.props.name === name)[0];
const options = node => all(node, child => child.type === 'option').map(child => child.props.value);

for (const locale of ['en', 'ar']) test(`${locale}: assignment shows physical area independently of office and filters verified collectors`, () => {
  const x = harness(locale);
  const before = structuredClone(project);
  let tree = x.renderCRM(project);
  const area = select(tree, 'measurementBranch');
  assert.ok(area, 'The existing assignment form contains the new area selector');
  assert.equal(area.props.value, 'Rasafa');
  assert.deepEqual(options(area), ['Karkh', 'Rasafa']);
  assert.deepEqual(options(select(tree, 'assignedOutdoorSalesId')), ['', ali.id]);
  assert.ok(renderToStaticMarkup(tree).includes(messages[locale]['Measurement area']));
  area.props.onChange({ target: { value: 'Karkh' } });
  tree = x.renderCRM(project);
  assert.equal(select(tree, 'measurementBranch').props.value, 'Karkh');
  assert.deepEqual(options(select(tree, 'assignedOutdoorSalesId')), ['', ehab.id]);
  assert.equal(select(tree, 'assignedOutdoorSalesId').props.defaultValue, ehab.id);
  assert.deepEqual(project, before, 'Choosing an area must not change office, ownership or saved assignment');
});

test('area defaults to office when no override and follows the latest saved area after reload', () => {
  const x = harness();
  const original = { ...project, measurement_branch: null };
  assert.equal(select(x.renderCRM(original), 'measurementBranch').props.value, 'Karkh');
  select(x.renderCRM(original), 'measurementBranch').props.onChange({ target: { value: 'Rasafa' } });
  assert.equal(select(x.renderCRM(original), 'measurementBranch').props.value, 'Rasafa');
  assert.equal(select(x.renderCRM({ ...original, measurement_branch: 'Rasafa' }), 'measurementBranch').props.value, 'Rasafa');
});

test('Province, Najaf, mark-ready and additional-opening forms preserve the existing assignment shape', () => {
  for (const row of [
    { ...project, branch: 'Governorates', governorate: 'البصرة' }, { ...project, branch: 'Najaf' }, { ...project, branch: undefined },
    { ...project, structure_readiness: 'not_ready' }, { ...project, sales_status: 'ready_for_quotation' },
  ]) assert.equal(select(harness().renderCRM(row), 'measurementBranch'), undefined, JSON.stringify(row));
});

test('legacy directory entries without verified metadata remain available for server validation', () => {
  const unknown = { id: 'legacy', name: 'Legacy directory fixture', branch: 'Karkh' };
  const invalid = { ...ehab, id: 'invalid', outdoorRotationStartBranch: 'unknown' };
  const x = harness('en', { outdoorSales: [ehab, ali, unknown, invalid] });
  assert.deepEqual(options(select(x.renderCRM(project), 'assignedOutdoorSalesId')), ['', ali.id, unknown.id]);
});

test('only assign-measurements includes the selected physical area in the actual workspace PATCH', async () => {
  for (const action of ['assign-measurements', 'ready', 'request-openings']) {
    const x = harness();
    const before = structuredClone(project);
    await x.renderWorkspace().props.onUpdate(project, action, { values: { assignedOutdoorSalesId: ehab.id, measurementBranch: 'Karkh' } });
    assert.deepEqual(x.requests, [{ url: '/api/workspace', body: { projectId: project.id, action,
      assignedOutdoorSalesId: ehab.id, ...(action === 'assign-measurements' ? { measurementBranch: 'Karkh' } : {}) } }]);
    assert.deepEqual(project, before);
  }
  const x = harness();
  await x.renderWorkspace().props.onUpdate(project, 'assign-measurements', { values: { assignedOutdoorSalesId: ehab.id } });
  assert.equal(Object.hasOwn(x.requests[0].body, 'measurementBranch'), false, 'Old assignments without the field remain compatible');
});

test('Outdoor Sales cannot reach the CRM assignment form', () => {
  const x = harness();
  const tree = x.renderWorkspace('Outdoor Sales');
  assert.equal(tree.props.onUpdate, undefined);
  assert.match(tree.props.error, /CRM access is limited/);
});

for (const locale of ['en', 'ar']) test(`${locale}: actual task cards select and label physical area while retaining office branch`, () => {
  const visible = { ...project, id: 'visible', project_number: 'QA-PHYSICAL-KARKH', branch: 'Rasafa', measurement_branch: 'Karkh', assigned_outdoor_sales_id: ehab.id };
  const hidden = { ...project, id: 'hidden', project_number: 'QA-PHYSICAL-RASAFA', branch: 'Karkh', measurement_branch: 'Rasafa', assigned_outdoor_sales_id: ehab.id };
  const data = { actor: { ...ehab, role: 'Outdoor Sales' }, projects: [visible, hidden] };
  const x = harness(locale, data);
  for (const name of ['OutdoorMobileWorkspace', 'SalesTaskPanel']) {
    const Component = x.component(name);
    const html = renderToStaticMarkup(Component({ data: x.data, now }));
    assert.ok(html.includes(visible.project_number), name);
    assert.ok(!html.includes(hidden.project_number), name);
    assert.match(html, new RegExp(`${messages[locale]['Measurement area']}: <bdi[^>]*>${messages[locale].Karkh}</bdi>`));
    assert.match(html, new RegExp(`${messages[locale]['Project branch']}: <bdi>${messages[locale].Rasafa}</bdi>`));
  }
});
