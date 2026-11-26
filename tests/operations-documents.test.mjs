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
const projectId = '11111111-1111-4111-8111-111111111111';
const otherProjectId = '22222222-2222-4222-8222-222222222222';
const projects = [projectId, otherProjectId].map((id, index) => ({
  id, project_number: `PRJ-OPERATIONS-${index + 1}`, project_name: `Operations project ${index + 1}`,
  address: 'Baghdad', client: { name: 'Client', mobile: '07700000000' },
  handoff: { stage: index === 0 ? 'signed' : 'operations', revision: 1, signed_at: '2026-11-20T08:00:00Z' },
  openings: [{ id: `opening-${index}`, floor: 'Ground', room: 'Office', width: 100, height: 150,
    quantity: 2, opening_type: 'Window', opening_direction: 'Hinged' }],
}));

function fixture(role, locale = 'en') {
  const terms = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8')).terms;
  const term = (value, replacements = {}) => (terms[value] ?? value)
    .replace(/\{(\w+)\}/g, (match, key) => replacements[key] ?? match);
  const { OperationsWorkspace } = load('../src/components/workflow/OperationsWorkspace.tsx', {
    react: React, 'react/jsx-runtime': jsxRuntime,
    'next/link': ({ children, prefetch, ...props }) => {
      assert.equal(prefetch, false, 'Operations lists must not prefetch every commercial document');
      return React.createElement('a', props, children);
    },
    '@/components/i18n/I18nProvider': { useI18n: () => ({ term, formatNumber: value => String(value) }) },
    './ui': {
      api: () => { throw new Error('Rendering operations must not mutate a project'); },
      button: 'button', secondary: 'secondary', card: 'card',
      Notice: () => null,
      Workspace: ({ title, children }) => React.createElement('section', null,
        React.createElement('h1', null, title), children),
      useResource: url => {
        assert.equal(url, '/api/operations');
        return { data: { projects, canAccept: role !== 'Project Manager' }, error: '',
          loading: false, setError: () => {}, reload: async () => {} };
      },
    },
  });
  const { default: Page } = load('../src/app/operations/page.tsx', {
    'react/jsx-runtime': jsxRuntime,
    'next/navigation': { redirect: destination => { throw new Error(`Redirect: ${destination}`); } },
    '@/lib/auth/permissions': permissions,
    '@/lib/auth/adminServer': { requireRole: async allowedRoles => allowedRoles.includes(role)
      ? { ok: true, role } : { ok: false } },
    '@/components/intake/RegistrationShell': { RegistrationShell: ({ children }) => children },
    '@/components/workflow/OperationsWorkspace': { OperationsWorkspace },
  });
  return { Page, OperationsWorkspace, term };
}

for (const locale of ['en', 'ar']) {
  for (const role of permissions.leadershipRoles) {
    test(`${locale}: ${role} can open the correct contract and quotation from each operations project`, async () => {
      const { Page, term } = fixture(role, locale);
      const markup = renderToStaticMarkup(await Page());
      const articles = [...markup.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(match => match[0]);
      for (const project of projects) {
        const article = articles.find(value => value.includes(project.project_number));
        assert.ok(article, 'Every operations project has its own document navigation');
        assert.ok(article.includes(project.project_name));
        assert.ok(article.includes(`href="/contract/${project.id}"`));
        assert.ok(article.includes(term('View signed contract →')));
        assert.ok(article.includes(`href="/quotation/${project.id}"`));
        assert.ok(article.includes(term('Open quotation →')));
      }
      assert.ok(markup.includes(term('Start project work')), 'Document navigation keeps the signed handoff action available');
      assert.ok(markup.includes(term('Work started')), 'Accepted operations projects retain document access');
    });
  }
}

for (const role of ['Operations Manager', 'Project Manager']) {
  test(`${role} sees work details without commercial document links`, async () => {
    const { Page, term } = fixture(role);
    const markup = renderToStaticMarkup(await Page());
    assert.ok(markup.includes('Operations project 1'));
    assert.ok(markup.includes('100 × 150'));
    assert.equal(markup.includes('href="/contract/'), false);
    assert.equal(markup.includes('href="/quotation/'), false);
    assert.equal(markup.includes(term('Start project work')), role === 'Operations Manager');
  });
}

test('operations document navigation is hidden unless the server grants access', () => {
  const { OperationsWorkspace } = fixture('Admin');
  const markup = renderToStaticMarkup(React.createElement(OperationsWorkspace));
  assert.ok(markup.includes('Operations project 1'));
  assert.equal(markup.includes('href="/contract/'), false);
  assert.equal(markup.includes('href="/quotation/'), false);
});

test('an employee without operations access is redirected before rendering projects', async () => {
  const { Page } = fixture('Outdoor Sales');
  await assert.rejects(Page(), /Redirect: \/unauthorized/);
});
