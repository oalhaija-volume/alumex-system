import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

function render(projects) {
  const actor = { id: 'sajjad', role: 'Outdoor Sales', branch: 'Rasafa', outdoorTeamMemberIds: ['sajjad', 'ehab'] };
  const dependencies = {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    '@/components/i18n/I18nProvider': { useI18n: () => ({ term: value => value, formatDateTime: value => value }) },
    './DashboardProjectFilters': { DashboardProjectFilters: () => null },
    './ProjectNameEditor': { ProjectNameEditor: () => null },
    './ui': {
      button: '', card: '', Notice: () => null,
      Workspace: ({ children }) => React.createElement('main', null, children),
      useResource: () => ({ data: { actor, projects }, error: '', loading: false, reload: async () => {} }),
    },
  };
  const modules = new Map();
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    const exports = {};
    modules.set(path, exports);
    const source = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('require', 'exports', source)(name => {
      if (name in dependencies) return dependencies[name];
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
      throw new Error(`Unexpected dependency ${name}`);
    }, exports);
    return exports;
  }
  const { OutdoorProjects } = load('src/components/workflow/OutdoorProjects.tsx');
  return renderToStaticMarkup(React.createElement(OutdoorProjects));
}

const base = {
  branch: 'Rasafa', project_number: 'PRJ-OLD', project_name: 'Old client', created_by: 'indoor',
  registeredBy: 'Indoor entrant', assigned_outdoor_sales_id: 'another-team', assignedOutdoorSales: 'Another team',
  structure_readiness: 'ready', sales_status: 'new_lead', created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-11-16T08:00:00Z',
};

test('My projects keeps credited entries visible as read-only independently of their current measurement assignee', () => {
  const html = render([{ ...base, id: 'credited', legacy_outdoor_sales_id: 'sajjad', legacyOutdoorSalesOwner: 'Sajjad', project_log_only: true }]);
  assert.match(html, /id="project-credited"/);
  assert.match(html, /Original Outdoor Sales owner/);
  assert.match(html, /Sajjad/);
  assert.match(html, /reference only/);
  assert.doesNotMatch(html, /href="\/initial-measurements\//);
});

test('legacy snapshots without a log flag never expose an opening action for credit alone', () => {
  const html = render([{ ...base, id: 'credited', legacy_outdoor_sales_id: 'sajjad' }]);
  assert.match(html, /id="project-credited"/);
  assert.match(html, /reference only/);
  assert.doesNotMatch(html, /Open project/);
});

test('own entries and current team assignments retain their opening action while unrelated credits and historical visits stay in Project log', () => {
  const html = render([
    { ...base, id: 'own', created_by: 'sajjad' },
    { ...base, id: 'team', assigned_outdoor_sales_id: 'ehab' },
    { ...base, id: 'unrelated', legacy_outdoor_sales_id: 'someone-else', project_log_only: true },
    { ...base, id: 'visit', project_log_only: true },
  ]);
  assert.match(html, /href="\/initial-measurements\/own"/);
  assert.match(html, /href="\/initial-measurements\/team"/);
  assert.doesNotMatch(html, /id="project-(unrelated|visit)"/);
});

test('a credited project with an active team assignment keeps the existing measurement action', () => {
  const html = render([{ ...base, id: 'credited-team', legacy_outdoor_sales_id: 'sajjad', assigned_outdoor_sales_id: 'ehab', project_log_only: false }]);
  assert.match(html, /href="\/initial-measurements\/credited-team"/);
  assert.doesNotMatch(html, /reference only/);
});
