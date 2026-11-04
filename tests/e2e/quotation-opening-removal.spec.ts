import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { priceQuotation, type CatalogItem, type MeasuredOpening, type OpeningChoice, type QuoteSnapshot } from '../../src/lib/workflow/pricing';
import type { QuotationRevision } from '../../src/lib/workflow/types';

// Browser plugin unavailable. Mount the real quotation component with local
// fixture APIs; this test never signs in or changes a business record.
const output = resolve('artifacts/quotation-opening-removal-20261104');
const projectId = '11111111-1111-4111-8111-111111111111';
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'Indoor Sales', name: 'Indoor employee', branch: 'Karkh' };
const openings: MeasuredOpening[] = [
  { id: '22222222-2222-4222-8222-222222222222', floor: 'GF', room: 'Office', width: 100, height: 100, quantity: 1, opening_type: 'Window', opening_direction: 'Sliding' },
  { id: '33333333-3333-4333-8333-333333333333', floor: 'F1', room: 'Kitchen', width: 100, height: 200, quantity: 1, opening_type: 'Window', opening_direction: 'Sliding' },
  { id: '44444444-4444-4444-8444-444444444444', floor: 'F2', room: 'Bedroom', width: 200, height: 100, quantity: 1, opening_type: 'Window', opening_direction: 'Sliding' },
];
const catalog: CatalogItem[] = [
  { id: 'system', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true },
  { id: 'glass', name: 'Double Glass', category: 'glass_option', unit: 'sqm', unit_price: 10000, is_active: true },
  { id: 'handle', name: 'Handle', category: 'addon', unit: 'item', unit_price: 5000, is_active: true },
];
const choices: OpeningChoice[] = openings.map((opening, index) => ({ openingId: opening.id, systemId: 'system', systemRate: [245000, 260000, 280000][index], glassId: index === 1 ? 'glass' : '', extras: [{ id: 'handle', quantity: index + 1 }] }));
const project = { id: projectId, project_name: 'Quotation removal fixture', project_number: 'PRJ-REMOVE', address: 'Baghdad', branch: 'Karkh', sales_status: 'quotation_in_progress', structure_readiness: 'ready', created_by: actor.id, registeredBy: actor.name, created_at: '2026-11-04T08:00:00Z', updated_at: '2026-11-04T08:00:00Z' };

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

for (const locale of ['en', 'ar'] as const) test(`${locale}: removing existing openings keeps surviving specifications, saves exclusions, and restores safely`, async ({ page, context, request }) => {
  const messages = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8'));
  const term = (value: string, replacements: Record<string, string | number> = {}) => {
    let result: string = messages.terms[value] ?? value;
    for (const [key, replacement] of Object.entries(replacements)) result = result.replaceAll(`{${key}}`, String(replacement));
    return result;
  };
  const money = (amount: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(amount) + (locale === 'ar' ? ' د.ع' : ' IQD');
  const initial: QuoteSnapshot = { ...priceQuotation(openings, choices, catalog, actor.id), version: 1 };
  let saved = structuredClone(initial), revision = 1;
  let mode: 'saved' | 'signed' | 'draft' = 'saved';
  const history: QuotationRevision[] = [];
  const posts: { choices: OpeningChoice[]; excludedOpeningIds: string[]; newOpenings: unknown[] }[] = [];
  const errors: string[] = [], unexpected: string[] = [];
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Alumex Quotation System</title></head><body><div id="root"></div><script src="/qa/quotation-removal.bundle.js"></script></body></html>`;
  await context.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (url.hostname !== 'localhost') { unexpected.push(req.method() + ' ' + url.hostname); return route.abort('blockedbyclient'); }
    if (path === `/api/sales-flow/${projectId}` && req.method() === 'POST') {
      try {
        const body = req.postDataJSON();
        assert.equal(body.action, 'save'); assert.equal(body.revision, revision); assert.equal(mode, 'saved');
        assert.deepEqual(body.newOpenings, []);
        const excluded = body.excludedOpeningIds as string[];
        const measured = openings.filter(opening => !excluded.includes(opening.id));
        assert.deepEqual(body.choices.map((choice: OpeningChoice) => choice.openingId), measured.map(opening => opening.id));
        const next = priceQuotation(measured, body.choices, catalog, actor.id, body.additionalItems, body.discountPercent);
        history.unshift({ version: saved.version!, quotation: structuredClone(saved), contract: null, previous_stage: 'quotation', superseded_at: '2026-11-04T11:00:00Z' });
        saved = { ...next, excludedOpeningIds: excluded, version: saved.version! + 1 }; revision++; posts.push(body);
        return route.fulfill({ json: { flow: { quotation: saved, revision } } });
      } catch (error) { errors.push((error as Error).message); return route.fulfill({ status: 400, json: { error: (error as Error).message } }); }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(req.method() + ' ' + path); return route.fulfill({ status: 405, json: { error: 'Unexpected write blocked' } }); }
    if (path === `/quotation/${projectId}` && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (path === '/qa/quotation-removal.bundle.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, 'workspace.bundle.js')) });
    if (path === `/api/sales-flow/${projectId}`) return route.fulfill({ json: { project: { ...project, sales_status: mode === 'signed' ? 'contract_signed' : mode === 'draft' ? 'ready_for_quotation' : project.sales_status }, client: { name: 'Fixture client', mobile: '07000000000' }, openings, catalog, history, flow: mode === 'draft' ? null : { project_id: projectId, revision, stage: mode === 'signed' ? 'contract' : 'quotation', signed_at: mode === 'signed' ? '2026-11-04T12:00:00Z' : null, quotation: saved, contract: null, evidence: null } } });
    if (path.startsWith('/api/measurement-reports/')) return route.fulfill({ json: { reports: [] } });
    if (path.startsWith('/api/')) return route.fulfill({ json: { actor, projects: [project], openings: [], queue: [], syncedAt: null } });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const edit = () => page.getByRole('button', { name: term('Edit quotation'), exact: true });
  const card = (index: number) => page.locator(`[data-opening-id="${openings[index].id}"]`);
  const rate = (index: number) => card(index).getByRole('spinbutton', { name: term('Quotation system rate (IQD / m²)'), exact: true });
  const remove = (index: number) => page.getByRole('button', { name: term('Remove opening {number} from quotation', { number: index + 1 }), exact: true });
  const restore = (index: number) => page.getByRole('button', { name: term('Restore opening {number}', { number: index + 1 }), exact: true });
  const total = () => page.getByLabel(term('Draft total'), { exact: true });
  const save = () => page.getByRole('button', { name: term('Save revised quotation'), exact: true });
  const cancel = () => page.getByRole('button', { name: term('Cancel changes'), exact: true });
  const expected = (indices: number[], source = choices) => priceQuotation(openings.filter((_, index) => indices.includes(index)), source.filter(choice => indices.some(index => openings[index].id === choice.openingId)), catalog, actor.id).total;

  await page.goto(`/quotation/${projectId}`);
  await expect(page).toHaveTitle(messages.app.title);
  await expect(page.getByRole('heading', { name: term('Quotation'), exact: true, level: 1 })).toBeVisible();
  await edit().click();
  await remove(0).click();
  await expect(card(0)).toHaveCount(0);
  await expect(rate(1)).toHaveValue('260000'); await expect(rate(2)).toHaveValue('280000');
  await rate(1).fill('265000');
  const changed = choices.map((choice, index) => index === 1 ? { ...choice, systemRate: 265000 } : choice);
  await expect(total()).toHaveText(money(expected([1, 2], changed)));
  await restore(0).click();
  await expect(rate(0)).toHaveValue('245000'); await expect(rate(1)).toHaveValue('265000');
  await remove(1).click();
  await expect(rate(2)).toHaveValue('280000');
  await expect(total()).toHaveText(money(expected([0, 2], changed)));
  await cancel().click();
  await expect(edit()).toBeVisible(); expect(posts).toHaveLength(0); expect(saved).toEqual(initial);

  await edit().click(); await expect(rate(1)).toHaveValue('260000');
  await remove(1).click(); await expect(total()).toHaveText(money(expected([0, 2])));
  await page.screenshot({ path: test.info().outputPath(`${locale}-opening-removed.png`), fullPage: true });
  await save().click();
  await expect(edit()).toBeVisible(); expect(posts).toHaveLength(1);
  expect(posts[0].excludedOpeningIds).toEqual([openings[1].id]);
  expect(posts[0].choices).toEqual([choices[0], choices[2]]);
  expect(saved.lines.map(line => line.opening.id)).toEqual([openings[0].id, openings[2].id]);
  expect(history[0].quotation).toEqual(initial); expect(openings).toHaveLength(3);
  await page.reload(); await edit().click();
  await expect(card(1)).toHaveCount(0); await expect(restore(1)).toBeVisible();
  await restore(1).click(); await expect(card(1)).toBeVisible();
  await cancel().click(); await edit().click(); await expect(card(1)).toHaveCount(0);
  await restore(1).click(); await save().click();
  await expect(edit()).toBeVisible(); expect(posts[1].excludedOpeningIds).toEqual([]);
  expect(saved.lines).toHaveLength(3); expect(history[1].quotation).toEqual(initial);
  await page.getByRole('combobox', { name: term('Quotation version'), exact: true }).selectOption('1');
  await expect(page.locator('.document-total strong')).toHaveText(money(initial.total));

  mode = 'signed'; await page.reload();
  await expect(edit()).toHaveCount(0); await expect(page.getByRole('button', { name: /Remove opening|حذف الفتحة/ })).toHaveCount(0);
  mode = 'draft'; await page.reload();
  for (const index of [0, 1, 2]) await remove(index).click();
  await expect(page.getByRole('button', { name: term('Generate quotation'), exact: true })).toBeDisabled();
  await restore(0).click();
  await expect(page.getByRole('button', { name: term('Generate quotation'), exact: true })).toBeEnabled();
  expect(posts).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('nextjs-portal').filter({ hasText: /Runtime Error|Build Error/ })).toHaveCount(0);
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});
