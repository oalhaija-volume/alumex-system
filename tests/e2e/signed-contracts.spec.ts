import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import type { SignedContractRecord } from '@/lib/contracts/signedContracts';
import type { FieldProject } from '@/lib/offline/types';

// Exercise the real component against isolated API fixtures. All requests stay
// on the repository's local server; no production contract or client is edited.
const output = resolve('.next/cache/qa-signed-contracts');
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });

test.beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'entry.tsx'), `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {I18nProvider} from '@/components/i18n/I18nProvider';
    import {SignedContractsWorkspace} from '@/components/workflow/SignedContractsWorkspace';
    createRoot(document.getElementById('root')!).render(<I18nProvider><SignedContractsWorkspace/></I18nProvider>);
  `);
  writeFileSync(resolve(output, 'typescript-loader.cjs'), `const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,removeComments:true}}).outputText;};`);
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({
    mode: 'production', target: 'web', context: process.cwd(), devtool: false,
    entry: resolve(output, 'entry.tsx'), output: { path: output, filename: 'signed-contracts.bundle.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [resolve(output, 'typescript-loader.cjs')] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
});

const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'Indoor Sales', name: 'Indoor employee', branch: 'Karkh' };

function fixtureRecords(): SignedContractRecord[] {
  const base: Omit<FieldProject, 'id' | 'project_number' | 'project_name'> = {
    client_id: 'shared-client', client_name: 'Original shared client', branch: 'Karkh', governorate: null,
    created_by: 'outdoor-employee', registeredBy: 'Outdoor employee', structure_readiness: 'ready',
    sales_status: 'transferred_to_operations', address: 'Baghdad, Mansour', phone: '07700000000',
    next_follow_up_at: null, project_notes: null, created_at: '2026-11-10T08:00:00Z', updated_at: '2026-11-10T08:00:00Z',
  };
  return [
    { project: { ...base, id: firstId, project_number: 'PRJ-SIGNED-ONE', project_name: 'First signed project' }, contractNumber: 'ALX-CONTRACT-001', signedAt: '2026-11-16T08:00:00Z', signer: 'Original signer', method: 'hard_copy', revision: 1, total: 1500000, currency: 'IQD' },
    { project: { ...base, id: secondId, project_number: 'PRJ-SIGNED-TWO', project_name: 'Second signed project' }, contractNumber: 'ALX-CONTRACT-002', signedAt: '2026-11-15T08:00:00Z', signer: 'Original signer', method: 'upload', revision: 2, total: 2500000, currency: 'IQD' },
    { project: { ...base, id: '33333333-3333-4333-8333-333333333333', client_id: 'governorate-client', client_name: 'Governorate client', branch: 'Governorates', governorate: 'الحلة', project_number: 'PRJ-GOVERNORATE', project_name: 'Governorate signed project' }, contractNumber: 'ALX-CONTRACT-003', signedAt: '2026-11-14T08:00:00Z', signer: 'Governorate signer', method: 'digital', revision: 1, total: 3500000, currency: 'IQD' },
  ];
}

type SetupOptions = { empty?: boolean; rejectInitialLoad?: boolean; additionalKarkhRecords?: number };
async function mount(page: Page, context: BrowserContext, request: APIRequestContext, locale: 'en' | 'ar', options: SetupOptions = {}) {
  const messages = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8'));
  const term = (value: string) => messages.terms[value] ?? value;
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Alumex Quotation System</title></head><body><div id="root"></div><script src="/qa/signed-contracts.bundle.js"></script></body></html>`;
  const records = options.empty ? [] : fixtureRecords();
  for (let index = 1; index <= (options.additionalKarkhRecords ?? 0); index++) {
    records.push({
      ...records[0], contractNumber: `ALX-EXTRA-${index}`,
      project: { ...records[0].project, id: `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`, project_number: `PRJ-EXTRA-${index}`, project_name: `Generated signed project ${index}` },
    });
  }
  const errors: string[] = [], unexpected: string[] = [], saves: unknown[] = [];
  let loadCount = 0, rejectNextSave = false;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/status of (409|500)/.test(message.text())) errors.push(message.text());
  });
  await context.addInitScript(value => {
    localStorage.setItem('alumex_locale', value);
    Reflect.deleteProperty(Navigator.prototype, 'serviceWorker');
  }, locale);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname !== 'localhost') { unexpected.push(`${req.method()} ${url.hostname}`); return route.abort('blockedbyclient'); }
    if (url.pathname === '/signed-contracts' && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/qa/signed-contracts.bundle.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, 'signed-contracts.bundle.js')) });
    if (url.pathname === '/api/signed-contracts' && req.method() === 'GET') {
      loadCount++;
      if (options.rejectInitialLoad && loadCount === 1) return route.fulfill({ status: 500, json: { error: 'Unable to load signed contracts.' } });
      return route.fulfill({ json: { actor, branches: ['Karkh', 'Governorates'], records } });
    }
    if (url.pathname === `/api/projects/${firstId}/client` && req.method() === 'PATCH') {
      const body = req.postDataJSON();
      saves.push(body);
      if (rejectNextSave) { rejectNextSave = false; return route.fulfill({ status: 409, json: { error: 'This client changed on another device. Reload the projects before changing its name.' } }); }
      assert.deepEqual(Object.keys(body).sort(), ['clientName', 'expectedClientName']);
      assert.equal(body.expectedClientName, records[0].project.client_name);
      for (const record of records) if (record.project.client_id === 'shared-client') record.project.client_name = body.clientName;
      return route.fulfill({ json: { ok: true, client: { id: 'shared-client', client_name: body.clientName } } });
    }
    if (url.pathname.startsWith('/api/') || !['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
      unexpected.push(`${req.method()} ${url.pathname}`);
      return route.fulfill({ status: 405, json: { error: 'Unexpected API request' } });
    }
    return route.continue();
  });
  await page.goto('/signed-contracts');
  await expect(page).toHaveURL('http://localhost:3003/signed-contracts');
  await expect(page.getByRole('heading', { name: term('Signed contracts'), exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  return { term, messages, records, errors, unexpected, saves, loadCount: () => loadCount, rejectNextSave: () => { rejectNextSave = true; } };
}

for (const locale of ['en', 'ar'] as const) test(`${locale}: branch records, search and shared-client edits work together`, async ({ page, context, request }) => {
  const fixture = await mount(page, context, request, locale);
  const { term, messages } = fixture;
  const branch = page.getByRole('combobox', { name: term('Branch'), exact: true });
  const search = page.getByRole('searchbox', { name: term('Search signed contracts'), exact: true });
  await branch.selectOption('Karkh');
  const first = page.locator('article').filter({ has: page.getByRole('heading', { name: 'First signed project', exact: true }) });
  const second = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Second signed project', exact: true }) });
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Governorate signed project', exact: true })).toHaveCount(0);
  await expect(branch.locator('option[value="Rasafa"]')).toHaveCount(0);
  await expect(branch.locator('option[value="Najaf"]')).toHaveCount(0);
  await expect(first.getByRole('link', { name: term('View signed contract →'), exact: true })).toHaveAttribute('href', `/contract/${firstId}`);

  await search.fill('ALX-CONTRACT-002');
  await expect(second).toBeVisible();
  await expect(first).toHaveCount(0);
  await search.fill('no-signed-contract-matches');
  await expect(page.locator('article')).toHaveCount(0);
  await page.getByRole('button', { name: term('Clear filters'), exact: true }).click();
  await expect(search).toHaveValue('');
  await branch.selectOption('Governorates');
  await expect(page.getByRole('heading', { name: 'Governorate signed project', exact: true })).toBeVisible();
  await expect(first).toHaveCount(0);
  await branch.selectOption('Karkh');

  await first.getByRole('button', { name: term('Edit client name'), exact: true }).click();
  const input = first.getByRole('textbox', { name: term('Client name'), exact: true });
  await expect(input).toHaveValue('Original shared client');
  const corrected = locale === 'ar' ? 'اسم العميل المصحح' : 'Corrected shared client';
  await input.fill(`  ${corrected}  `);
  fixture.rejectNextSave();
  await first.getByRole('button', { name: messages.common.saveChanges, exact: true }).click();
  await expect(first.getByRole('alert')).toBeVisible();
  await expect(input).toHaveValue(`  ${corrected}  `);
  await expect(second.getByText('Original shared client', { exact: true })).toBeVisible();
  await first.getByRole('button', { name: messages.common.saveChanges, exact: true }).click();
  await expect(first.getByRole('status')).toHaveText(term('Client name updated.'));
  await expect(first.getByText(corrected, { exact: true })).toBeVisible();
  await expect(second.getByText(corrected, { exact: true })).toBeVisible();
  expect(fixture.saves).toEqual([
    { clientName: corrected, expectedClientName: 'Original shared client' },
    { clientName: corrected, expectedClientName: 'Original shared client' },
  ]);
  await expect(first.getByRole('heading', { name: 'First signed project', exact: true })).toBeVisible();
  await expect(first.getByText('ALX-CONTRACT-001', { exact: true })).toBeVisible();
  await expect(first.getByText('Original signer', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: term('Refresh records'), exact: true }).click();
  await expect(second.getByText(corrected, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`${locale}-signed-contracts.png`), fullPage: true });
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

test('failed signed-record load can be retried without losing the page', async ({ page, context, request }) => {
  const fixture = await mount(page, context, request, 'en', { rejectInitialLoad: true });
  await expect(page.getByRole('alert')).toHaveText('Unable to load signed contracts.');
  await page.getByRole('button', { name: 'Refresh records', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'First signed project', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(fixture.loadCount()).toBe(2);
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

test('an empty branch has a clear records state and no editing controls', async ({ page, context, request }) => {
  const fixture = await mount(page, context, request, 'en', { empty: true });
  await expect(page.getByText('No signed contracts in this branch yet. Contracts appear here once signing is recorded.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit client name', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View signed contract →', exact: true })).toHaveCount(0);
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

test('pagination retains every branch record and search resets the current page', async ({ page, context, request }) => {
  const fixture = await mount(page, context, request, 'en', { additionalKarkhRecords: 24 });
  const pagination = page.getByRole('navigation', { name: 'Signed contracts pages', exact: true });
  await expect(page.locator('article')).toHaveCount(25);
  await expect(pagination.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await pagination.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Generated signed project 24', exact: true })).toBeVisible();
  await expect(pagination.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.getByRole('searchbox', { name: 'Search signed contracts', exact: true }).fill('ALX-CONTRACT-001');
  await expect(page.getByRole('heading', { name: 'First signed project', exact: true })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(1);
  await expect(pagination).toHaveCount(0);
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
