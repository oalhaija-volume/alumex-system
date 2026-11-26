import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';

function load(path, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

const permissions = load('../src/lib/auth/permissions.ts');
const stages = load('../src/lib/workflow/stages.ts');
const scope = load('../src/lib/systemScope.ts');
const rotation = load('../src/lib/intake/outdoorRotationSchedule.ts');
const branches = load('../src/lib/auth/projectBranchAccess.ts', { '@/lib/intake/outdoorRotationSchedule': rotation });
const timestamp = '2026-11-20T08:00:00Z';
const progress = [
  ['site', { structure_readiness: 'not_ready' }, '/mini-crm#project-'],
  ['measurement', {}, '/initial-measurements/'],
  ['quote', { sales_status: 'quotation_in_progress' }, '/quotation/'],
  ['contract', { sales_status: 'contract_generated' }, '/contract/'],
  ['handoff', { sales_status: 'contract_signed' }, '/operations'],
  ['operations', { sales_status: 'transferred_to_operations', status: 'Production' }, '/operations'],
];
const projects = progress.map(([name, overrides], index) => ({
  id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
  project_name: `${name} project`, project_number: `PRJ-${index + 1}`, branch: 'Karkh',
  structure_readiness: 'ready', sales_status: 'new_lead', status: 'Draft',
  created_at: timestamp, updated_at: timestamp, created_by: 'outdoor', registeredBy: 'Employee',
  ...overrides,
}));

function dashboardDependencies(role, locale, rows = projects) {
  const terms = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8')).terms;
  const term = (value, replacements = {}) => (terms[value] ?? value)
    .replace(/\{(\w+)\}/g, (match, key) => replacements[key] ?? match);
  const data = { actor: { role, id: 'actor' }, projects: rows, outdoorSales: [] };
  const dependencies = {
    react: React, 'react/jsx-runtime': jsxRuntime,
    'next/link': ({ children, prefetch, ...props }) => {
      if (/^\/projects\/[0-9a-f-]{36}$/.test(props.href)) assert.equal(prefetch, false);
      return React.createElement('a', props, children);
    },
    'next/font/google': { Noto_Sans_Arabic: () => ({ variable: 'dashboard-font' }) },
    './LeadershipDashboard.module.css': { dashboard: 'dashboard' },
    '@/lib/auth/permissions': permissions,
    '@/lib/workflow/stages': stages,
    '@/lib/workflow/projectList': { projectListPageSize: 25 },
    '@/lib/intake/projectBranch': { projectBranchLabels: { Karkh: 'Karkh' } },
    '@/lib/dashboard/projectSearch': { matchesProjectSearch: () => true },
    '@/lib/dashboard/outdoorProjectFilters': { projectOutdoorSalesOrigin: () => null },
    '@/components/i18n/I18nProvider': { useI18n: () => ({ term, t: term,
      formatNumber: value => String(value), formatDateTime: value => value, locale }) },
    '@/components/measurements/MeasurementDelayNotice': { MeasurementDelayNotice: () => null },
    './useProjectRegistrationFilters': { useProjectRegistrationFilters: rows => ({
      filteredProjects: rows, month: '', creator: '', months: [], creators: [], reset: () => {},
    }) },
    './useOutdoorSalesProjectFilters': { useOutdoorSalesProjectFilters: rows => ({ filteredProjects: rows }) },
    './OutdoorSalesProjectFilter': { OutdoorSalesProjectFilter: () => null },
    './DashboardProjectFilters': { DashboardProjectFilters: () => null },
    './ProjectFollowUps': { ProjectFollowUps: () => null },
    './SalesTaskPanel': { SalesTaskPanel: () => null },
    './OutdoorSalesCoverage': { OutdoorSalesCoverage: () => null },
    './ClientNameEditor': { ClientNameEditor: () => null },
    './ProjectNameEditor': { ProjectNameEditor: () => null },
    './IndoorSalesEditor': { IndoorSalesEditor: () => null },
    './ui': {
      button: 'button', secondary: 'secondary', card: 'card', field: 'field', Notice: () => null,
      Workspace: ({ children }) => React.createElement('section', null, children),
      useResource: url => {
        assert.equal(url, '/api/dashboard', 'Branch managers keep the scoped status-only list API');
        return { data: { projects: rows }, loading: false, error: '' };
      },
    },
  };
  return { dependencies, data, term };
}

for (const locale of ['en', 'ar']) for (const role of permissions.leadershipRoles) {
  test(`${locale}: ${role} titles open each project while stage actions keep their own destinations`, () => {
    const { dependencies, data, term } = dashboardDependencies(role, locale);
    const { LeadershipDashboard } = load('../src/components/workflow/LeadershipDashboard.tsx', dependencies);
    const markup = renderToStaticMarkup(React.createElement(LeadershipDashboard, { data, error: '', now: 0 }));
    const articles = [...markup.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(match => match[0]);
    for (const [index, project] of projects.entries()) {
      const article = articles.find(value => value.includes(`aria-labelledby="project-name-${project.id}"`));
      assert.ok(article);
      const heading = article.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/)?.[1];
      assert.ok(heading?.includes(`href="/projects/${project.id}"`));
      assert.ok(article.includes(`href="/projects/${project.id}"`) && article.includes(term('Open project →')));
      const destination = progress[index][2] === '/operations' ? '/operations' : `${progress[index][2]}${project.id}`;
      assert.ok(article.includes(`href="${destination}" title=`), 'The primary workflow action remains available');
    }
  });
}

for (const locale of ['en', 'ar']) test(`${locale}: Branch Manager can open project records from the company dashboard`, () => {
  const { dependencies, term } = dashboardDependencies('Branch Manager', locale);
  const { CompanyDashboard } = load('../src/components/workflow/CompanyDashboard.tsx', dependencies);
  const markup = renderToStaticMarkup(React.createElement(CompanyDashboard, { role: 'Branch Manager' }));
  for (const project of projects) assert.ok(markup.includes(`href="/projects/${project.id}"`));
  assert.ok(markup.includes(term('Open project →')));
  assert.equal(markup.includes('href="/mini-crm'), false);
  assert.equal(markup.includes('href="/intake'), false);
});

for (const leadership of [true, false]) test(`${leadership ? 'Leadership' : 'Company'} dashboard bounds rendered cards while retaining all-project counts`, () => {
  const rows = Array.from({ length: 60 }, (_, index) => ({ ...projects[1],
    id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`,
    project_name: `Project ${index + 1}`, project_number: `PRJ-PAGED-${index + 1}` }));
  const { dependencies, data } = dashboardDependencies(leadership ? 'Admin' : 'Branch Manager', 'en', rows);
  const component = load(`../src/components/workflow/${leadership ? 'LeadershipDashboard' : 'CompanyDashboard'}.tsx`, dependencies);
  const markup = renderToStaticMarkup(leadership
    ? React.createElement(component.LeadershipDashboard, { data, error: '', now: 0 })
    : React.createElement(component.CompanyDashboard, { role: 'Branch Manager' }));
  assert.equal([...markup.matchAll(/<article\b/g)].length, 25);
  assert.ok(markup.includes('60'), 'Overview totals retain every accessible record');
  assert.ok(markup.includes('Page 1 of 3'));
  assert.equal(markup.includes('PRJ-PAGED-60<'), false, 'Later page cards do not mount early');
});

test('unrelated employee dashboards do not receive project record links', () => {
  const { dependencies } = dashboardDependencies('HR', 'en');
  const { CompanyDashboard } = load('../src/components/workflow/CompanyDashboard.tsx', dependencies);
  const markup = renderToStaticMarkup(React.createElement(CompanyDashboard, { role: 'HR' }));
  assert.ok(markup.includes('site project'));
  assert.equal(markup.includes('href="/projects/'), false);
});

test('unsynced project titles retain their current workflow route until a server record exists', () => {
  const { dependencies, data } = dashboardDependencies('Admin', 'en');
  const pending = { ...projects[1], pending: true };
  const { LeadershipDashboard } = load('../src/components/workflow/LeadershipDashboard.tsx', dependencies);
  const markup = renderToStaticMarkup(React.createElement(LeadershipDashboard, { data: { ...data, projects: [pending] }, error: '', now: 0 }));
  assert.ok(markup.includes(`href="/initial-measurements/${pending.id}"`));
  assert.equal(markup.includes(`href="/projects/${pending.id}"`), false);
  assert.ok(markup.includes('Saved on device'));
});

test('Branch Manager overview access does not grant sales workflow or leadership privileges', () => {
  assert.equal(permissions.canViewProjectOverview('Branch Manager'), true);
  assert.equal(permissions.canAccessRoute(`/projects/${projects[0].id}`, 'Branch Manager'), true);
  assert.equal(permissions.isLeadershipRole('Branch Manager'), false);
  assert.equal(permissions.canAccessCRM('Branch Manager'), false);
  assert.equal(permissions.canPrepareQuotation('Branch Manager'), false);
  for (const route of ['/intake', '/mini-crm', '/catalog', '/hr', '/operations',
    `/quotation/${projects[0].id}`, `/contract/${projects[0].id}`, `/projects/${projects[0].id}/follow-ups`]) {
    assert.equal(permissions.canAccessRoute(route, 'Branch Manager'), false, route);
  }
  for (const role of ['Indoor Sales', 'Sales Manager', 'Outdoor Sales', 'HR', null]) {
    assert.equal(permissions.canViewProjectOverview(role), false, String(role));
    assert.equal(permissions.canAccessRoute(`/projects/${projects[0].id}`, role), false, String(role));
  }
});

test('project overview routes require a UUID-shaped project identifier', () => {
  assert.equal(scope.isActiveSystemRoute(`/projects/${projects[0].id}`), true);
  assert.equal(scope.isActiveSystemRoute(`/projects/${projects[0].id}/follow-ups`), true);
  for (const route of ['/projects/arbitrary-project', '/projects/admin', `/projects/${projects[0].id}/edit`]) {
    assert.equal(scope.isActiveSystemRoute(route), false, route);
    assert.equal(permissions.canAccessRoute(route, 'Branch Manager'), false, route);
  }
});

test('Branch Manager overview links retain existing branch boundaries', () => {
  const actor = { role: 'Branch Manager', branch: 'Rasafa' };
  assert.equal(branches.canAccessProjectRow(actor, { branch: 'Rasafa' }), true);
  for (const branch of ['Karkh', 'Najaf', 'Governorates']) {
    assert.equal(branches.canAccessProjectRow(actor, { branch }), false, branch);
  }
  assert.equal(branches.canAccessProjectRow({ ...actor, branch: 'Karkh' }, { branch: 'Governorates', governorate: 'بابل' }), true);
  assert.equal(branches.canAccessProjectRow({ ...actor, branch: 'Karkh' }, { branch: 'Governorates', governorate: 'النجف' }), false);
  assert.equal(branches.canAccessProjectRow({ ...actor, branch: 'Najaf' }, { branch: 'Governorates', governorate: 'النجف' }), true);
  assert.equal(branches.canAccessProjectRow({ ...actor, branch: null }, { branch: 'Rasafa' }), false);
});
