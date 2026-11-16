import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import { priceQuotation, repriceQuotation, quotationPriceKey, type AdditionalChoice, type CatalogItem, type MeasuredOpening, type OpeningChoice, type QuoteSnapshot } from '../../src/lib/workflow/pricing';
import type { AlumexSystemModel } from '../../src/lib/workflow/alumexModels';
import type { QuotationRevision } from '../../src/lib/workflow/types';

// Browser connector tools are unavailable. Exercise the actual local quotation
// component with isolated fixture APIs; no employee account or project is changed.
const output = resolve('.next/cache/qa-quotation-system-models');
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
const projectId = '11111111-1111-4111-8111-111111111111';
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Indoor employee', role: 'Indoor Sales', branch: 'Karkh' };
const openings: MeasuredOpening[] = [
  { id: 'sliding-window', floor: 'GF', room: 'Office', width: 50, height: 100, quantity: 2, opening_type: 'Window', opening_direction: 'Sliding', has_roller_shutter: true },
  { id: 'sliding-door', floor: 'GF', room: 'Hall', width: 100, height: 200, quantity: 2, opening_type: 'Door', opening_direction: 'Sliding' },
  { id: 'hinged-window', floor: 'F1', room: 'Bedroom', width: 100, height: 150, quantity: 3, opening_type: 'Window', opening_direction: 'Hinged' },
  { id: 'hinged-door', floor: 'GF', room: 'Hall', width: 100, height: 200, quantity: 2, opening_type: 'Door', opening_direction: 'Hinged' },
  { id: 'curtain', floor: 'GF', room: 'Hall', width: 200, height: 300, quantity: 2, opening_type: 'Curtain Wall', opening_direction: null },
  { id: 'louver', floor: 'GF', room: 'Store', width: 100, height: 100, quantity: 1, opening_type: 'Louver', opening_direction: 'Hinged' },
  { id: 'other-system', floor: 'F1', room: 'Office', width: 100, height: 200, quantity: 1, opening_type: 'Window', opening_direction: 'Sliding' },
  { id: 'no-direction', floor: 'F1', room: 'Office', width: 100, height: 100, quantity: 1, opening_type: 'Window', opening_direction: null },
];
const catalog: CatalogItem[] = [
  { id: 'alumex', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true },
  { id: 'alumex-alternate', name: 'Alumex Alternate System', category: 'aluminum_system', unit: 'sqm', unit_price: 275000, is_active: true },
  { id: 'other', name: 'Other System', category: 'aluminum_system', unit: 'sqm', unit_price: 260000, is_active: true },
  { id: 'curtain-wall', name: 'Curtain Wall', category: 'facade_service', unit: 'sqm', unit_price: 100000, is_active: true },
  { id: 'louver-system', name: 'Louver', category: 'opening_product', unit: 'sqm', unit_price: 80000, is_active: true },
  { id: 'glass', name: 'Low-E Glass', category: 'glass_option', unit: 'sqm', unit_price: 20000, is_active: true },
  { id: 'handle', name: 'Handle', category: 'addon', unit: 'item', unit_price: 5000, is_active: true },
  { id: 'bars', name: 'Georgian bars', category: 'addon', unit: 'meter', unit_price: 6000, is_active: true },
  { id: 'film', name: 'Glass film shades', category: 'addon', unit: 'sqm', unit_price: 8000, is_active: true },
  { id: 'shutter', name: 'Roller shutters', category: 'addon', unit: 'item', unit_price: 30000, is_active: true },
  { id: 'box', name: 'Shutter box', category: 'addon', unit: 'item', unit_price: 10000, is_active: true },
];
const choices: OpeningChoice[] = [
  { openingId: 'sliding-window', systemId: 'alumex', systemRate: 270000, glassId: 'glass', extras: [{ id: 'shutter', quantity: 1, motorPrice: 50000 }, { id: 'box', quantity: 1 }, { id: 'handle', quantity: 2 }, { id: 'bars', quantity: 1.5 }] },
  { openingId: 'sliding-door', systemId: 'alumex', systemRate: 280000, glassId: 'glass', extras: [{ id: 'handle', quantity: 1 }] },
  { openingId: 'hinged-window', systemId: 'alumex', systemRate: 275000, glassId: 'glass', extras: [{ id: 'handle', quantity: 1 }] },
  { openingId: 'hinged-door', systemId: 'alumex', systemRate: 305000, glassId: 'glass', extras: [{ id: 'handle', quantity: 2 }] },
  { openingId: 'curtain', systemId: 'curtain-wall', glassId: 'glass', curtainWallGlassType: 'double', extras: [{ id: 'film', quantity: 12 }] },
  { openingId: 'louver', systemId: 'louver-system', glassId: '', extras: [] },
  { openingId: 'other-system', systemId: 'other', glassId: 'glass', extras: [{ id: 'handle', quantity: 1 }] },
  { openingId: 'no-direction', systemId: 'alumex', glassId: '', extras: [] },
];
const additional: AdditionalChoice[] = [{ id: 'curtain-wall', quantity: 6, measurements: [{ label: 'Front elevation', width: 2, height: 3, quantity: 1 }], extras: [{ id: 'film', quantity: 6 }], curtainWallGlassType: 'single' }];
const selectedModels: Record<string, AlumexSystemModel> = { 'sliding-window': 'A16 Pro+', 'sliding-door': 'A16 Pro', 'hinged-window': '4500 Pro', 'hinged-door': '4500' };
const project = { id: projectId, project_name: 'Model selection fixture', project_number: 'PRJ-MODELS', address: 'Baghdad', branch: 'Karkh', sales_status: 'quotation_in_progress', structure_readiness: 'ready', created_by: actor.id, registeredBy: actor.name, created_at: '2026-11-16T08:00:00Z', updated_at: '2026-11-16T08:00:00Z' };

test.beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {QuotationWorkspace} from '@/components/workflow/QuotationWorkspace';createRoot(document.getElementById('root')!).render(<I18nProvider><QuotationWorkspace projectId="${projectId}"/></I18nProvider>);`);
  writeFileSync(resolve(output, 'typescript-loader.cjs'), `const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};`);
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({ mode: 'production', target: 'web', context: process.cwd(), devtool: false, entry: resolve(output, 'entry.tsx'), output: { path: output, filename: 'component.js' }, resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [resolve(output, 'typescript-loader.cjs')] }] }, plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })], optimization: { minimize: false }, performance: { hints: false } }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: Alumex models preserve opening specifications, manual and group prices, and saved revisions`, async ({ page, context, request }) => {
  const messages = locale === 'en' ? en : ar;
  const term = (key: string) => (messages.terms as Record<string, string>)[key] ?? key;
  const money = (amount: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(amount) + (locale === 'ar' ? ' د.ع' : ' IQD');
  const initial: QuoteSnapshot = { ...priceQuotation(openings, choices, catalog, actor.id, additional), version: 2 };
  let saved = structuredClone(initial), revision = 3, signed = false;
  const history: QuotationRevision[] = [];
  const saves: { choices: OpeningChoice[]; additionalItems: AdditionalChoice[] }[] = [];
  const actions: string[] = [], errors: string[] = [], unexpected: string[] = [];
  const archive = () => history.unshift({ version: saved.version!, quotation: structuredClone(saved), contract: null, previous_stage: 'quotation', superseded_at: '2026-11-16T11:00:00Z' });
  const login = await request.get('/login'); expect(login.status()).toBe(200);
  const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/qa/quotation-system-models.js"></script></body></html>`;
  await context.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== 'http://localhost:3003') { unexpected.push(req.method() + ' ' + url.origin); return route.abort('blockedbyclient'); }
    if (url.pathname === `/quotation/${projectId}` && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/qa/quotation-system-models.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, 'component.js')) });
    if (url.pathname === `/api/sales-flow/${projectId}` && req.method() === 'POST') {
      const body = req.postDataJSON(); assert.equal(signed, false); assert.equal(body.revision, revision); actions.push(body.action);
      if (body.action === 'save') {
        assert.deepEqual(body.newOpenings, []); assert.deepEqual(body.excludedOpeningIds, []);
        const next = priceQuotation(openings, body.choices, catalog, actor.id, body.additionalItems, body.discountPercent);
        archive(); saved = { ...next, version: saved.version! + 1 }; revision++; saves.push(body);
        return route.fulfill({ json: { flow: { quotation: saved, revision } } });
      }
      const next = repriceQuotation(saved, catalog, actor.id), priceKey = quotationPriceKey(next);
      if (body.action === 'preview-prices') return route.fulfill({ json: { quotation: next, priceKey, revision } });
      assert.equal(body.action, 'update-prices'); assert.equal(body.priceKey, priceKey); assert.equal(body.confirmed, true);
      archive(); saved = { ...next, version: saved.version! + 1 }; revision++;
      return route.fulfill({ json: { flow: { quotation: saved, revision } } });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(req.method() + ' ' + url.pathname); return route.fulfill({ status: 405, json: { error: 'Unexpected business write blocked' } }); }
    if (url.pathname === `/api/sales-flow/${projectId}`) return route.fulfill({ json: { project: { ...project, sales_status: signed ? 'contract_signed' : project.sales_status }, client: { name: 'Fixture client', mobile: '07700000000', client_type: 'individual' }, openings, catalog, history, flow: { project_id: projectId, revision, stage: signed ? 'signed' : 'quotation', signed_at: signed ? '2026-11-16T12:00:00Z' : null, quotation: saved, contract: null, evidence: null } } });
    if (url.pathname.startsWith('/api/measurement-reports/')) return route.fulfill({ json: { reports: [] } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { actor, projects: [project], queue: [], openings: [], indoorSales: [], outdoorSales: [], syncedAt: null } });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const edit = () => page.getByRole('button', { name: term('Edit quotation'), exact: true });
  const cancel = () => page.getByRole('button', { name: term('Cancel changes'), exact: true });
  const save = () => page.getByRole('button', { name: term('Save revised quotation'), exact: true });
  const card = (id: string) => page.locator(`[data-opening-id="${id}"]`);
  const model = (id: string) => card(id).getByRole('combobox', { name: term('Alumex model'), exact: true });
  const system = (id: string) => card(id).getByRole('combobox', { name: term('System / product'), exact: true });
  const rate = (id: string) => card(id).getByRole('spinbutton', { name: term('Quotation system rate (IQD / m²)'), exact: true });
  const total = () => page.getByLabel(term('Draft total'), { exact: true });
  const group = () => page.getByRole('region', { name: term('Group prices'), exact: true });

  await page.goto(`/quotation/${projectId}`); await edit().click();
  await expect(page.getByRole('combobox', { name: term('Alumex model'), exact: true })).toHaveCount(4);
  for (const id of ['curtain', 'louver', 'other-system', 'no-direction']) await expect(model(id)).toHaveCount(0);
  for (const id of Object.keys(selectedModels)) await expect(model(id)).toHaveValue('');
  // The base system keeps its existing reset behavior, and must never carry a
  // model into an incompatible product. Compatible base choices retain it.
  await model('sliding-door').selectOption('A16 Pro');
  await system('sliding-door').selectOption('alumex-alternate'); await expect(model('sliding-door')).toHaveValue('A16 Pro');
  await system('sliding-door').selectOption('other'); await expect(model('sliding-door')).toHaveCount(0);
  await system('sliding-door').selectOption('alumex'); await expect(model('sliding-door')).toHaveValue('');
  await cancel().click(); await edit().click(); expect(saves).toHaveLength(0);

  for (const id of Object.keys(selectedModels)) {
    const options = id.startsWith('sliding') ? ['A16', 'A16 Pro', 'A16 Pro+'] : ['4500', '4500 Pro'];
    await expect(model(id).locator('option')).toHaveText([term('Not specified'), ...options]);
    const original = choices.find(choice => choice.openingId === id)!;
    for (const value of options) {
      await model(id).selectOption(value);
      await expect(rate(id)).toHaveValue(String(original.systemRate));
      await expect(card(id).getByRole('combobox', { name: term('Glass'), exact: true })).toHaveValue(original.glassId!);
      await expect(total()).toHaveText(money(initial.total));
    }
    await model(id).selectOption(selectedModels[id]);
  }
  await card('sliding-window').screenshot({ path: test.info().outputPath(`${locale}-sliding-a16-pro-plus.png`) });
  await expect(card('sliding-window').getByRole('spinbutton', { name: term('Motor price (IQD per motor)'), exact: true })).toHaveValue('50000');
  await group().getByRole('spinbutton', { name: term('Sliding system (windows & doors) (IQD / m²)'), exact: true }).fill('260000');
  await group().getByRole('button', { name: term('Apply sliding system price'), exact: true }).click();
  await group().getByRole('spinbutton', { name: term('Hinged system (windows & doors) (IQD / m²)'), exact: true }).fill('290000');
  await group().getByRole('button', { name: term('Apply hinged system price'), exact: true }).click();
  for (const id of Object.keys(selectedModels)) {
    await expect(model(id)).toHaveValue(selectedModels[id]);
    await expect(rate(id)).toHaveValue(id.startsWith('sliding') ? '260000' : '290000');
  }
  // Changing only a model keeps an already applied group rate intact.
  await model('sliding-window').selectOption('A16'); await model('hinged-window').selectOption('4500');
  await expect(group().getByRole('button', { name: term('Apply sliding system price'), exact: true })).toHaveText(term('Applied to draft'));
  await expect(group().getByRole('button', { name: term('Apply hinged system price'), exact: true })).toHaveText(term('Applied to draft'));
  await model('hinged-window').selectOption('4500 Pro');
  await rate('sliding-door').fill('281000'); await model('sliding-door').selectOption('A16 Pro+');
  await expect(rate('sliding-door')).toHaveValue('281000');
  const finalModels: Record<string, AlumexSystemModel> = { 'sliding-window': 'A16', 'sliding-door': 'A16 Pro+', 'hinged-window': '4500 Pro', 'hinged-door': '4500' };
  const expectedChoices = choices.map(choice => finalModels[choice.openingId] ? { ...choice, systemModel: finalModels[choice.openingId], systemRate: choice.openingId === 'sliding-door' ? 281000 : choice.openingId.startsWith('sliding') ? 260000 : 290000 } : choice);
  const expected = priceQuotation(openings, expectedChoices, catalog, actor.id, additional);
  await expect(total()).toHaveText(money(expected.total));
  await card('sliding-window').screenshot({ path: test.info().outputPath(`${locale}-model-preserves-shutter-motor.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await save().click(); await expect(edit()).toBeVisible();
  expect(saves[0].choices).toEqual(expectedChoices); expect(saves[0].additionalItems).toEqual(additional);
  expect(saved.lines).toEqual(expected.lines); expect(saved.total).toBe(expected.total);
  expect(history[0].quotation).toEqual(initial);
  await expect(page.locator('.document-schedule')).toContainText('A16 Pro+');
  await expect(page.locator('.document-schedule')).toContainText('4500');

  await page.reload(); await edit().click();
  for (const id of Object.keys(finalModels)) await expect(model(id)).toHaveValue(finalModels[id]);
  await expect(card('sliding-window').getByRole('spinbutton', { name: term('Motor price (IQD per motor)'), exact: true })).toHaveValue('50000');
  await model('sliding-window').selectOption(''); await expect(total()).toHaveText(money(expected.total));
  await save().click(); await expect(edit()).toBeVisible();
  expect(Object.hasOwn(saved.lines[0], 'systemModel')).toBe(false); expect(saved.lines[1].systemModel).toBe('A16 Pro+');
  const beforeRefresh = structuredClone(saved);
  await page.getByRole('button', { name: term('Update prices'), exact: true }).click();
  await page.getByRole('button', { name: term('Save updated prices'), exact: true }).click(); await expect(edit()).toBeVisible();
  expect(saved.lines).toEqual(beforeRefresh.lines); expect(saved.additionalItems).toEqual(beforeRefresh.additionalItems);
  expect(saved.total).toBe(beforeRefresh.total); expect(actions).toEqual(['save', 'save', 'preview-prices', 'update-prices']);
  await page.getByRole('combobox', { name: term('Quotation version'), exact: true }).selectOption('2');
  await expect(page.locator('.document-schedule')).not.toContainText('A16');
  await expect(page.locator('.document-schedule')).not.toContainText('4500');
  signed = true; await page.reload(); await expect(edit()).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: term('Alumex model'), exact: true })).toHaveCount(0);
  await expect(page.locator('.document-schedule')).toContainText('A16 Pro+');
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});
