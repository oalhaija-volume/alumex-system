import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

function load(path, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(name => {
    if (name in dependencies) return dependencies[name];
    assert.ok(name.startsWith('@/'), `Unexpected dependency: ${name}`);
    return load(`${name.slice(2)}.ts`, dependencies);
  }, exports);
  return exports;
}

const access = load('lib/auth/projectBranchAccess.ts');
const history = load('lib/measurements/visitHistory.ts');
const projects = [
  { id: 'karkh', branch: 'Karkh', governorate: null },
  { id: 'rasafa', branch: 'Rasafa', governorate: null },
  { id: 'basra', branch: 'Governorates', governorate: 'البصرة' },
  { id: 'najaf', branch: 'Governorates', governorate: 'النجف' },
  { id: 'unassigned', branch: null, governorate: null },
].map(project => ({ ...project, archived_at: null, created_by: null, created_at: '2026-10-22T08:00:00Z' }));

for (const branch of ['Karkh', 'Rasafa', null, undefined, 'Governorates', 'invalid']) {
  test(`Indoor Sales ${branch ?? 'without branch'} receives only its eligible Baghdad and governorate projects`, async () => {
    const actor = { id: 'indoor', role: 'Indoor Sales', branch };
    const expected = ['Karkh', 'Rasafa'].includes(branch) ? [branch.toLowerCase(), 'basra', 'najaf'] : [];
    assert.deepEqual(projects.filter(project => access.canAccessProjectBranch(actor, project.branch)).map(project => project.id), expected);
    const admin = fixture();
    const result = await history.loadWorkspaceProjects(admin, actor);
    assert.equal(result.error, null);
    assert.deepEqual(result.data.map(project => project.id), expected);
    assert.deepEqual(result.data.filter(project => project.branch === 'Governorates').map(project => project.governorate), expected.length ? ['البصرة', 'النجف'] : []);
    assert.ok(admin.selected.includes('governorate'));
    assert.deepEqual(admin.tables, ['projects']);
  });
}

function fixture() {
  const result = {
    selected: '', tables: [],
    from(table) {
      result.tables.push(table);
      assert.equal(table, 'projects');
      const filters = [];
      return {
        select(columns) { result.selected = columns; return this; },
        order() { return this; },
        in(key, values) { filters.push(project => values.includes(project[key])); return this; },
        is(key, value) { filters.push(project => project[key] === value); return this; },
        then(resolve) { return Promise.resolve({ data: projects.filter(project => filters.every(filter => filter(project))), error: null }).then(resolve); },
      };
    },
  };
  return result;
}

const response = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
for (const branch of ['Karkh', 'Rasafa', null, 'Governorates']) {
  test(`dashboard applies shared governorate scope for ${branch ?? 'unassigned'} Indoor Sales`, async () => {
    const admin = fixture();
    const route = load('app/api/dashboard/route.ts', {
      'next/server': response,
      '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, role: 'Indoor Sales', user: { id: 'indoor' }, profile: { branch } }) },
      '@/lib/supabase/admin': { createAdminClient: () => admin },
    });
    const result = await route.GET();
    assert.equal(result.status, 200);
    const expected = ['Karkh', 'Rasafa'].includes(branch) ? [branch.toLowerCase(), 'basra', 'najaf'] : [];
    assert.deepEqual(result.body.projects.map(project => project.id), expected);
  });
}

for (const branch of ['Karkh', 'Rasafa', null]) {
  test(`commercial project access handles governorates for ${branch ?? 'unassigned'} Indoor Sales`, async () => {
    const branchAccess = load('lib/workflow/access.ts', {
      'next/server': response,
      '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, role: 'Indoor Sales', user: { id: 'indoor' }, profile: { branch } }) },
      '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
      '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: projects[2], error: null }) }) }) },
    });
    const result = await branchAccess.salesProject('basra', 'commercial');
    if (branch) {
      assert.equal(result.response, undefined);
      assert.equal(result.project.governorate, 'البصرة');
    } else assert.equal(result.response.status, 404);
  });
}

for (const action of ['save', 'contract']) {
  test(`${action} preserves governorate in the commercial snapshot`, async () => {
    let payload;
    const project = { ...projects[2], project_name: 'Basra villa', project_number: 'PRJ-BASRA', address: 'Basra site', sales_status: 'ready_for_quotation' };
    const admin = {
      from(table) {
        return {
          select() { return this; }, eq() { return this; }, order() { return this; },
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: table === 'profiles' ? { branch: 'Karkh' } : { name: 'Client', mobile: '07700000000' }, error: null }),
          then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
        };
      },
      rpc: async (name, args) => { payload = args.p_payload; return { data: {}, error: null }; },
    };
    const route = load('app/api/sales-flow/[projectId]/route.ts', {
      'next/server': response,
      '@/lib/workflow/access': { salesProject: async () => ({ project, admin, auth: { role: 'Indoor Sales', user: { id: 'indoor' } } }) },
      '@/lib/contracts/uploadedTerms': { uploadedContractTerms: () => [] },
      '@/lib/workflow/pricing': { priceQuotation: () => ({ lines: [], total: 100, currency: 'IQD' }) },
      '@/lib/workflow/quotationOpenings': { quotationOpenings: () => [] },
    });
    const result = await route.POST(new Request('http://localhost:3003/api/sales-flow/basra', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, revision: 0, choices: [], template: 'residential' }),
    }), { params: Promise.resolve({ projectId: 'basra' }) });
    assert.equal(result.status, 200);
    if (action === 'save') {
      assert.equal(payload.branch, 'Governorates');
      assert.equal(payload.governorate, 'البصرة');
    } else {
      assert.equal(payload.branch, 'Karkh', 'contract issuing branch remains the authenticated creator branch');
      assert.equal(payload.project.branch, 'Governorates');
      assert.equal(payload.project.governorate, 'البصرة');
    }
  });
}

for (const branch of ['Governorates', 'Karkh']) {
  test(`document displays the selected governorate with ${branch} issuing branch`, () => {
    const { DocumentParties } = load('components/workflow/CommercialDocument.tsx', {
      'react/jsx-runtime': jsxRuntime,
      '@/components/i18n/I18nProvider': { useI18n: () => ({ term: value => value }) },
      '@/lib/quotations/clientPricing': {},
      '@/lib/workflow/pricing': {}, './OpeningAreaIndicator': {},
    });
    const markup = renderToStaticMarkup(React.createElement(DocumentParties, {
      client: { name: 'Client', mobile: '07700000000' },
      project: { number: 'PRJ-BASRA', address: 'Basra site', branch, governorate: 'البصرة' },
    }));
    assert.match(markup, /Governorates/);
    assert.match(markup, /<bdi>البصرة<\/bdi>/);
    assert.doesNotMatch(markup, /From Rasafa/);
    if (branch === 'Karkh') assert.match(markup, /From Karkh/);
  });
}
