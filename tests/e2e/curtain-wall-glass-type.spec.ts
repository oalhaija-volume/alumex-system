import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { priceQuotation, type AdditionalChoice, type CatalogItem, type MeasuredOpening, type OpeningChoice, type QuoteSnapshot } from '../../src/lib/workflow/pricing';
import type { QuotationRevision } from '../../src/lib/workflow/types';

// Browser plugin unavailable. Exercise the actual editor with isolated fixture
// APIs, without signing in or changing any business record.
const output = resolve('.next/cache/qa-curtain-wall-glass-type');
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
const projectId = '11111111-1111-4111-8111-111111111111';
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'Indoor Sales', name: 'Indoor employee', branch: 'Karkh' };
const openings: MeasuredOpening[] = [
  { id: 'curtain-front', floor: 'GF', room: 'Hall', width: 200, height: 300, quantity: 2, opening_type: 'Curtain Wall', opening_direction: null },
  { id: 'curtain-side', floor: 'F1', room: 'Office', width: 100, height: 200, quantity: 3, opening_type: 'Curtain Wall', opening_direction: null },
  { id: 'window', floor: 'GF', room: 'Kitchen', width: 100, height: 100, quantity: 1, opening_type: 'Window', opening_direction: 'Sliding' },
];
const catalog: CatalogItem[] = [
  { id: 'curtain-wall', name: 'Curtain Wall', category: 'facade_service', unit: 'sqm', unit_price: 100000, is_active: true },
  { id: 'system', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true },
  { id: 'glass', name: 'Low-E Glass', category: 'glass_option', unit: 'sqm', unit_price: 20000, is_active: true },
  { id: 'film', name: 'Glass film shades', category: 'addon', unit: 'sqm', unit_price: 8000, is_active: true },
  { id: 'cladding', name: 'Cladding', category: 'facade_service', unit: 'sqm', unit_price: 70000, is_active: true },
];
const choices: OpeningChoice[] = [
  { openingId: 'curtain-front', systemId: 'curtain-wall', systemRate: 270000, glassId: 'glass', extras: [{ id: 'film', quantity: 12 }] },
  { openingId: 'curtain-side', systemId: 'curtain-wall', systemRate: 280000, glassId: '', extras: [] },
  { openingId: 'window', systemId: 'system', systemRate: 265000, glassId: 'glass', extras: [] },
];
const additional: AdditionalChoice[] = [
  { id: 'curtain-wall', quantity: 12, unitRate: 275000, measurements: [{ label: 'Front elevation', width: 2, height: 3, quantity: 2 }], extras: [{ id: 'film', quantity: 12 }] },
  { id: 'cladding', quantity: 6, measurements: [{ label: 'Side elevation', width: 3, height: 2, quantity: 1 }], extras: [] },
];
const project = { id: projectId, project_name: 'Curtain glass fixture', project_number: 'PRJ-GLASS', address: 'Baghdad', branch: 'Karkh', sales_status: 'quotation_in_progress', structure_readiness: 'ready', created_by: actor.id, registeredBy: actor.name, created_at: '2026-11-16T08:00:00Z', updated_at: '2026-11-16T08:00:00Z' };

test.beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'browser-entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {QuotationWorkspace} from '@/components/workflow/QuotationWorkspace';createRoot(document.getElementById('root')!).render(<I18nProvider><QuotationWorkspace projectId="${projectId}"/></I18nProvider>);`);
  writeFileSync(resolve(output, 'typescript-loader.cjs'), `const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,removeComments:true}}).outputText;};`);
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({
    mode: 'production', target: 'web', context: process.cwd(), devtool: false,
    entry: resolve(output, 'browser-entry.tsx'), output: { path: output, filename: 'workspace.bundle.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [resolve(output, 'typescript-loader.cjs')] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: Indoor Sales saves and revises each curtain wall glass type independently`, async ({ page, context, request }) => {
  const messages = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8'));
  const term = (value: string) => messages.terms[value] ?? value;
  const money = (amount: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(amount) + (locale === 'ar' ? ' د.ع' : ' IQD');
  const initial: QuoteSnapshot = { ...priceQuotation(openings, choices, catalog, actor.id, additional), version: 1 };
  let saved = structuredClone(initial), revision = 1;
  const history: QuotationRevision[] = [];
  const posts: { choices: OpeningChoice[]; additionalItems: AdditionalChoice[] }[] = [];
  const errors: string[] = [], unexpected: string[] = [];
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Alumex Quotation System</title></head><body><div id="root"></div><script src="/qa/curtain-wall-glass-type.bundle.js"></script></body></html>`;
  await context.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (url.hostname !== 'localhost') { unexpected.push(req.method() + ' ' + url.hostname); return route.abort('blockedbyclient'); }
    if (path === `/api/sales-flow/${projectId}` && req.method() === 'POST') {
      try {
        const body = req.postDataJSON();
        assert.equal(body.action, 'save'); assert.equal(body.revision, revision);
        assert.deepEqual(body.newOpenings, []); assert.deepEqual(body.excludedOpeningIds, []);
        const next = priceQuotation(openings, body.choices, catalog, actor.id, body.additionalItems, body.discountPercent);
        history.unshift({ version: saved.version!, quotation: structuredClone(saved), contract: null, previous_stage: 'quotation', superseded_at: '2026-11-16T11:00:00Z' });
        saved = { ...next, version: saved.version! + 1 }; revision++; posts.push(body);
        return route.fulfill({ json: { flow: { quotation: saved, revision } } });
      } catch (error) { errors.push((error as Error).message); return route.fulfill({ status: 400, json: { error: (error as Error).message } }); }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(req.method() + ' ' + path); return route.fulfill({ status: 405, json: { error: 'Unexpected write blocked' } }); }
    if (path === `/quotation/${projectId}` && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (path === '/qa/curtain-wall-glass-type.bundle.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, 'workspace.bundle.js')) });
    if (path === `/api/sales-flow/${projectId}`) return route.fulfill({ json: { project, client: { name: 'Fixture client', mobile: '07000000000' }, openings, catalog, history, flow: { project_id: projectId, revision, stage: 'quotation', signed_at: null, quotation: saved, contract: null, evidence: null } } });
    if (path.startsWith('/api/measurement-reports/')) return route.fulfill({ json: { reports: [] } });
    if (path.startsWith('/api/')) return route.fulfill({ json: { actor, projects: [project], openings: [], queue: [], syncedAt: null } });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const edit = () => page.getByRole('button', { name: term('Edit quotation'), exact: true });
  const save = () => page.getByRole('button', { name: term('Save revised quotation'), exact: true });
  const cancel = () => page.getByRole('button', { name: term('Cancel changes'), exact: true });
  const card = (id: string) => page.locator(`[data-opening-id="${id}"]`);
  const select = (id: string) => card(id).getByRole('combobox', { name: term('Curtain Wall glass type'), exact: true });
  const service = () => page.getByRole('region', { name: term('Curtain Wall'), exact: true });
  const serviceSelect = () => service().getByRole('combobox', { name: term('Curtain Wall glass type'), exact: true });
  const schedule = () => page.locator('.document-schedule');

  await page.goto(`/quotation/${projectId}`);
  await expect(edit()).toBeVisible();
  await expect(schedule()).not.toContainText(term('Single Glass'));
  await expect(schedule()).not.toContainText(term('Double Glass'));
  await edit().click();
  await expect(page.getByRole('combobox', { name: term('Curtain Wall glass type'), exact: true })).toHaveCount(3);
  await expect(card('window').getByRole('combobox', { name: term('Curtain Wall glass type'), exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: term('Cladding'), exact: true }).getByRole('combobox', { name: term('Curtain Wall glass type'), exact: true })).toHaveCount(0);
  await expect(select('curtain-front')).toHaveValue('');
  await expect(select('curtain-side')).toHaveValue('');
  await expect(serviceSelect()).toHaveValue('');
  await expect(select('curtain-front').locator('option')).toHaveText([term('Not specified'), term('Single Glass'), term('Double Glass')]);
  await select('curtain-front').selectOption('single');
  await cancel().click(); await expect(edit()).toBeVisible(); expect(posts).toHaveLength(0);

  await edit().click(); await expect(select('curtain-front')).toHaveValue('');
  await select('curtain-front').selectOption('single');
  await select('curtain-side').selectOption('double');
  await serviceSelect().selectOption('double');
  await expect(page.getByLabel(term('Draft total'), { exact: true })).toHaveText(money(initial.total));
  await expect(card('curtain-front').getByRole('combobox', { name: term('Glass'), exact: true })).toHaveValue('glass');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`${locale}-curtain-wall-glass-editor.png`), fullPage: true });
  await save().click(); await expect(edit()).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0].choices).toEqual(choices.map((choice, index) => index < 2 ? { ...choice, curtainWallGlassType: index === 0 ? 'single' : 'double' } : choice));
  expect(posts[0].additionalItems).toEqual(additional.map(item => item.id === 'curtain-wall' ? { ...item, curtainWallGlassType: 'double' } : item));
  expect(saved.total).toBe(initial.total);
  expect(saved.lines.map(line => line.curtainWallGlassType)).toEqual(['single', 'double', undefined]);
  expect(saved.additionalItems![0].curtainWallGlassType).toBe('double');
  await expect(schedule().getByText(term('Single Glass'), { exact: true })).toHaveCount(1);
  await expect(schedule().getByText(term('Double Glass'), { exact: true })).toHaveCount(2);
  expect(history[0].quotation).toEqual(initial);

  await page.reload(); await edit().click();
  await expect(select('curtain-front')).toHaveValue('single');
  await expect(select('curtain-side')).toHaveValue('double');
  await expect(serviceSelect()).toHaveValue('double');
  await select('curtain-front').selectOption('double');
  await select('curtain-side').selectOption('');
  await serviceSelect().selectOption('single');
  await save().click(); await expect(edit()).toBeVisible();
  expect(posts).toHaveLength(2); expect(saved.version).toBe(3); expect(saved.total).toBe(initial.total);
  expect(posts[1].choices).toEqual(choices.map((choice, index) => index === 0 ? { ...choice, curtainWallGlassType: 'double' } : choice));
  expect(posts[1].additionalItems).toEqual(additional.map(item => item.id === 'curtain-wall' ? { ...item, curtainWallGlassType: 'single' } : item));
  await expect(schedule().getByText(term('Single Glass'), { exact: true })).toHaveCount(1);
  await expect(schedule().getByText(term('Double Glass'), { exact: true })).toHaveCount(1);
  await page.getByRole('combobox', { name: term('Quotation version'), exact: true }).selectOption('1');
  await expect(schedule()).not.toContainText(term('Single Glass'));
  await expect(schedule()).not.toContainText(term('Double Glass'));
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});
