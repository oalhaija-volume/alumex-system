import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { localizedMoney, localizedNumber } from '../../src/lib/i18nFormatting';
import { priceQuotation, type CatalogItem, type MeasuredOpening, type OpeningChoice, type QuoteSnapshot } from '../../src/lib/workflow/pricing';
import type { QuotationRevision } from '../../src/lib/workflow/types';

// Use the repository-local browser and actual quotation components with fixture
// APIs. No authentication or real business record is changed.
const output = resolve('.next/cache/qa-louver-billing');
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
const projectId = '11111111-1111-4111-8111-111111111111';
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'Indoor Sales', name: 'Indoor fixture', branch: 'Rasafa' };
const openings: MeasuredOpening[] = [
  { id: 'louver', floor: 'GF', room: 'Store', width: 80, height: 150, quantity: 2, opening_type: 'Louver', opening_direction: 'Hinged' },
  { id: 'window-louver', floor: 'GF', room: 'Office', width: 80, height: 120, quantity: 1, opening_type: 'Window', opening_direction: 'Hinged' },
  { id: 'window', floor: 'GF', room: 'Kitchen', width: 50, height: 100, quantity: 1, opening_type: 'Window', opening_direction: 'Sliding' },
];
const catalog: CatalogItem[] = [
  { id: 'louver-product', name: 'Louver', category: 'opening_product', unit: 'sqm', unit_price: 100000, is_active: true },
  { id: 'system', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true },
];
const choices: OpeningChoice[] = [
  { openingId: 'louver', systemId: 'louver-product', extras: [] },
  { openingId: 'window-louver', systemId: 'louver-product', extras: [] },
  { openingId: 'window', systemId: 'system', extras: [] },
];
const note = 'Louver pricing uses a minimum of 100 cm for each dimension. Actual dimensions are unchanged.';
const project = { id: projectId, project_name: 'Louver billing fixture', project_number: 'PRJ-LOUVER', address: 'Baghdad', branch: 'Rasafa', sales_status: 'quotation_in_progress', structure_readiness: 'ready', created_by: actor.id, registeredBy: actor.name, created_at: '2026-11-18T08:00:00Z', updated_at: '2026-11-18T08:00:00Z' };

test.beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'browser-entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {QuotationWorkspace} from '@/components/workflow/QuotationWorkspace';createRoot(document.getElementById('root')!).render(<I18nProvider><QuotationWorkspace projectId="${projectId}"/></I18nProvider>);`);
  writeFileSync(resolve(output, 'typescript-loader.cjs'), "const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,removeComments:true}}).outputText;};");
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

for (const locale of ['en', 'ar'] as const) test(`${locale}: louver pricing minimum changes billed area while preserving measured sizes and history`, async ({ page, context, request }, testInfo) => {
  const messages = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8'));
  const term = (value: string) => messages.terms[value] ?? value;
  const expected = { ...priceQuotation(openings, choices, catalog, actor.id), version: 2 };
  expect(expected.total).toBe(670000);
  const initial: QuoteSnapshot = { ...structuredClone(expected), version: 1 };
  for (const line of initial.lines.filter(line => line.system.id === 'louver-product')) {
    line.system.quantity = line.opening.opening_type === 'Window' ? Math.max(line.area, 1) : line.area;
    line.system.total = Math.round(line.system.quantity * line.system.rate);
    line.total = line.system.total;
  }
  initial.total = initial.lines.reduce((sum, line) => sum + line.total, 0);
  expect(initial.lines[1].area).toBe(0.96);
  expect(initial.lines[1].system.quantity).toBe(1);
  expect(expected.lines[1].system.quantity).toBe(1.2);
  let saved = structuredClone(initial), revision = 1;
  const history: QuotationRevision[] = [], errors: string[] = [], unexpected: string[] = [];
  const posts: Record<string, unknown>[] = [];
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Alumex Quotation System</title></head><body><div id="root"></div><script src="/qa/louver-billing.bundle.js"></script></body></html>`;
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
        assert.deepEqual(next.lines.map(line => line.opening), openings);
        history.unshift({ version: saved.version!, quotation: structuredClone(saved), contract: null, previous_stage: 'quotation', superseded_at: '2026-11-18T09:00:00Z' });
        saved = { ...next, version: saved.version! + 1 }; revision++; posts.push(body);
        return route.fulfill({ json: { flow: { quotation: saved, revision } } });
      } catch (error) { errors.push((error as Error).message); return route.fulfill({ status: 400, json: { error: (error as Error).message } }); }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(req.method() + ' ' + path); return route.fulfill({ status: 405, json: { error: 'Unexpected write blocked' } }); }
    if (path === `/quotation/${projectId}` && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (path === '/qa/louver-billing.bundle.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, 'workspace.bundle.js')) });
    if (path === `/api/sales-flow/${projectId}`) return route.fulfill({ json: { project, client: { name: 'Fixture client', mobile: '07000000000' }, openings, catalog, history, flow: { project_id: projectId, revision, stage: 'quotation', signed_at: null, quotation: saved, contract: null, evidence: null } } });
    if (path.startsWith('/api/measurement-reports/')) return route.fulfill({ json: { reports: [] } });
    if (path.startsWith('/api/')) return route.fulfill({ json: { actor, projects: [project], openings: [], queue: [], syncedAt: null } });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const schedule = page.locator('.document-schedule');
  const card = (id: string) => page.locator(`[data-opening-id="${id}"]`);
  await page.goto(`/quotation/${projectId}`);
  const edit = page.getByRole('button', { name: term('Edit quotation'), exact: true });
  await expect(edit).toBeVisible();
  await expect(schedule.getByText(term(note), { exact: true })).toHaveCount(0);
  await expect(schedule).toContainText('80 × 150');
  await edit.click();
  await expect(card('louver')).toContainText('80 × 150');
  await expect(card('louver')).toContainText(term(note));
  await expect(card('louver')).toContainText(term('Billable area: {area} m²').replace('{area}', localizedNumber(locale, 3)));
  await expect(card('window-louver')).toContainText('80 × 120');
  await expect(card('window-louver')).toContainText(term(note));
  await expect(card('window')).toContainText(term('Minimum billable area: 1 m² per window.'));
  await expect(card('window')).not.toContainText(term(note));
  await expect(page.getByLabel(term('Draft total'), { exact: true })).toHaveText(localizedMoney(locale, 670000));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`${locale}-louver-pricing-editor.png`), fullPage: true });
  await page.getByRole('button', { name: term('Save revised quotation'), exact: true }).click();
  await expect(edit).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(saved.total).toBe(670000);
  expect(saved.lines[0].area).toBe(2.4);
  expect(saved.lines[0].system.quantity).toBe(3);
  expect(saved.lines[0].system.total).toBe(300000);
  expect(saved.lines.map(line => line.opening)).toEqual(openings);
  expect(history[0].quotation).toEqual(initial);
  await expect(schedule.getByText(term(note), { exact: true })).toHaveCount(2);
  await expect(schedule).toContainText('80 × 150');
  await expect(schedule).toContainText(localizedNumber(locale, 2.4));
  await expect(schedule.locator('[data-item-group="louver"]')).toContainText(localizedNumber(locale, 300000));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`${locale}-louver-pricing-document.png`), fullPage: true });
  await page.getByRole('combobox', { name: term('Quotation version'), exact: true }).selectOption('1');
  await expect(schedule.getByText(term(note), { exact: true })).toHaveCount(0);
  await expect(schedule).toContainText('80 × 150');
  expect(posts).toHaveLength(1);
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
});
