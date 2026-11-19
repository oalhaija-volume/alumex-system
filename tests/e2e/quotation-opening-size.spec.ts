import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import { applyOpeningSizeChanges, normalizeOpeningSizeChanges, priceQuotationWithSizeChanges, type OpeningSizeChange } from '../../src/lib/workflow/openingSizeChanges';
import { priceQuotation, type CatalogItem, type MeasuredOpening, type OpeningChoice, type QuoteSnapshot } from '../../src/lib/workflow/pricing';
import type { QuotationRevision } from '../../src/lib/workflow/types';

// The Browser plugin is unavailable. Exercise the real editor with Playwright
// against local fixture APIs; block external requests and all unplanned writes.
const localHeadless = [
  resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  resolve('artifacts/mini-crm-review-20261015/browser/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
].find(path => existsSync(path));
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath: localHeadless } });
const projectId = '11111111-1111-4111-8111-111111111111';
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'Indoor Sales', name: 'Indoor employee', branch: 'Karkh' };
const sourceId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const originalOpenings: MeasuredOpening[] = [
  { id: sourceId, floor: 'First', room: 'Office', width: 120, height: 150, quantity: 4, opening_type: 'Window', opening_direction: 'Sliding', has_roller_shutter: true },
  { id: otherId, floor: 'Ground', room: 'Kitchen', width: 200, height: 150, quantity: 1, opening_type: 'Window', opening_direction: 'Hinged' },
];
const catalog: CatalogItem[] = [
  { id: 'system', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true },
  { id: 'glass', name: 'Double Glass', category: 'glass_option', unit: 'sqm', unit_price: 15000, is_active: true },
  { id: 'shutter', name: 'Roller Shutter - Foam', category: 'addon', unit: 'item', unit_price: 30000, is_active: true },
  { id: 'handle', name: 'Handle', category: 'addon', unit: 'item', unit_price: 5000, is_active: true },
];
const initialChoices: OpeningChoice[] = [
  { openingId: sourceId, systemId: 'system', systemRate: 300000, glassId: 'glass', extras: [{ id: 'shutter', quantity: 1, motorPrice: 120000 }, { id: 'handle', quantity: 2 }] },
  { openingId: otherId, systemId: 'system', systemRate: 310000, glassId: '', extras: [] },
];
const project = { id: projectId, project_name: 'Quotation size fixture', project_number: 'PRJ-SIZE', address: 'Baghdad', branch: 'Karkh', sales_status: 'quotation_approved', structure_readiness: 'ready', created_by: actor.id, registeredBy: actor.name, created_at: '2026-11-19T08:00:00Z', updated_at: '2026-11-19T08:00:00Z' };
const messages = { en, ar };
let bundle: string;
let stylesheetLinks: string;
type BundleStats = { hasErrors(): boolean; toString(options: Record<string, unknown>): string };
type WebpackRunner = ((configuration: Record<string, unknown>, callback: (error: Error | null, stats?: BundleStats) => void) => void) & { DefinePlugin: new (definitions: Record<string, string>) => unknown };

test.beforeAll(async ({ request }, testInfo) => {
  const output = testInfo.outputPath('quotation-size-component');
  await mkdir(output, { recursive: true });
  const entry = resolve(output, 'entry.tsx'), loader = resolve(output, 'typescript-loader.cjs');
  await writeFile(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {QuotationWorkspace} from '@/components/workflow/QuotationWorkspace';createRoot(document.getElementById('root')!).render(<I18nProvider><QuotationWorkspace projectId="${projectId}"/></I18nProvider>);`);
  await writeFile(loader, "const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};");
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack') as { webpack: WebpackRunner };
  await new Promise<void>((accept, reject) => webpack({
    mode: 'production', target: 'web', context: process.cwd(), entry,
    output: { path: output, filename: 'component.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error, stats) => error ? reject(error) : !stats || stats.hasErrors() ? reject(new Error(stats?.toString({ all: false, errors: true }) ?? 'Unable to bundle quotation editor.')) : accept()));
  bundle = await readFile(resolve(output, 'component.js'), 'utf8');
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  stylesheetLinks = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  expect(stylesheetLinks).toContain('/_next/');
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: quotation size editing previews, cancels, undoes, splits and saves a revision`, async ({ page }, testInfo) => {
  const term = (key: string, replacements: Record<string, string | number> = {}) => {
    let result = (messages[locale].terms as Record<string, string>)[key] ?? key;
    for (const [name, value] of Object.entries(replacements)) result = result.replaceAll(`{${name}}`, String(value));
    return result;
  };
  const money = (amount: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(amount) + (locale === 'ar' ? ' د.ع' : ' IQD');
  let openings = structuredClone(originalOpenings);
  const initial: QuoteSnapshot = { ...priceQuotation(openings, initialChoices, catalog, actor.id), version: 1 };
  let saved = structuredClone(initial), revision = 1;
  let mode: 'approved' | 'quotation' | 'signed' | 'operations' = 'approved';
  const history: QuotationRevision[] = [];
  const posts: { action: string; revision: number; choices: OpeningChoice[]; openingSizeChanges: OpeningSizeChange[]; newOpenings: unknown[]; excludedOpeningIds: string[]; additionalItems: []; discountPercent: 0 }[] = [];
  const errors: string[] = [], unexpected: string[] = [];
  await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (url.origin !== 'http://localhost:3003') { unexpected.push(`${req.method()} ${url.origin}`); return route.abort('blockedbyclient'); }
    if (path === `/api/sales-flow/${projectId}` && req.method() === 'POST') {
      try {
        const body = req.postDataJSON() as typeof posts[number];
        assert.equal(body.action, 'save'); assert.equal(body.revision, revision);
        assert.equal(mode, 'approved'); assert.deepEqual(body.newOpenings, []);
        const edits = normalizeOpeningSizeChanges(openings, body.openingSizeChanges);
        assert.equal(edits.length, 1); assert.equal(edits[0].quantity, 1);
        const nextOpenings = applyOpeningSizeChanges(openings, edits);
        const next = priceQuotationWithSizeChanges(nextOpenings, body.choices, catalog, actor.id, body.additionalItems, body.discountPercent, saved, edits);
        history.unshift({ version: saved.version!, quotation: structuredClone(saved), contract: null, previous_stage: 'approved', superseded_at: '2026-11-19T11:00:00Z' });
        openings = nextOpenings; saved = { ...next, version: saved.version! + 1 }; revision++; mode = 'quotation'; posts.push(body);
        return route.fulfill({ json: { flow: { quotation: saved, revision } } });
      } catch (error) { errors.push((error as Error).message); return route.fulfill({ status: 400, json: { error: (error as Error).message } }); }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(`${req.method()} ${path}`); return route.fulfill({ status: 405, json: { error: 'Unexpected business write blocked.' } }); }
    if (path === `/quotation/${projectId}` && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${stylesheetLinks}</head><body><div id="root"></div><script src="/qa/quotation-size.js"></script></body></html>` });
    if (path === '/qa/quotation-size.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    if (path === `/api/sales-flow/${projectId}`) return route.fulfill({ json: {
      project: { ...project, sales_status: mode === 'signed' ? 'contract_signed' : mode === 'operations' ? 'transferred_to_operations' : mode === 'approved' ? 'quotation_approved' : 'quotation_in_progress' },
      client: { name: 'Fixture client', mobile: '07000000000' }, openings, catalog, history,
      sizeHistory: posts.flatMap(post => post.openingSizeChanges.map(change => ({ id: 'audit-size-1', project_id: projectId, opening_id: change.splitOpeningId ?? change.openingId, source_opening_id: change.openingId, previous_width: change.previousWidth, previous_height: change.previousHeight, previous_quantity: change.previousQuantity, width: change.width, height: change.height, quantity: change.quantity, reason: change.reason, changed_by: actor.id, changed_by_name: actor.name, changed_at: '2026-11-19T11:00:00Z', quotation_version: 2 }))),
      flow: { project_id: projectId, revision, stage: ['signed', 'operations'].includes(mode) ? 'contract' : mode, signed_at: ['signed', 'operations'].includes(mode) ? '2026-11-19T12:00:00Z' : null, quotation: saved, contract: null, evidence: null },
    } });
    if (path.startsWith('/api/measurement-reports/')) return route.fulfill({ json: { reports: [] } });
    if (path.startsWith('/api/')) return route.fulfill({ json: { actor, projects: [project], openings: [], queue: [], syncedAt: null } });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const edit = () => page.getByRole('button', { name: term('Edit quotation'), exact: true });
  const cards = () => page.locator('[data-opening-id]');
  const source = () => page.locator(`[data-opening-id="${sourceId}"]`);
  const form = () => page.getByRole('form', { name: term('Edit opening size'), exact: true });
  const openSizeEditor = () => source().getByRole('button', { name: term('Edit size of opening {number}', { number: 1 }), exact: true }).click();
  const apply = () => form().getByRole('button', { name: term('Apply size to draft'), exact: true });
  const width = () => form().getByRole('spinbutton', { name: term('Width (cm)'), exact: true });
  const height = () => form().getByRole('spinbutton', { name: term('Height (cm)'), exact: true });
  const quantity = () => form().getByRole('spinbutton', { name: term('Number of openings to resize'), exact: true });
  const reason = () => form().getByRole('textbox', { name: term('Reason for size change'), exact: true });
  const total = () => page.getByLabel(term('Draft total'), { exact: true });
  const save = () => page.getByRole('button', { name: term('Save revised quotation'), exact: true });

  await page.goto(`/quotation/${projectId}`);
  await edit().click();
  await expect(cards()).toHaveCount(2); await expect(total()).toHaveText(money(initial.total));
  await openSizeEditor();
  await expect(width()).toHaveValue('120'); await expect(height()).toHaveValue('150'); await expect(quantity()).toHaveValue('4');
  await expect(save()).toBeDisabled();
  await width().fill('130'); await height().fill('160');
  await expect(page.getByLabel(term('Size change quotation total'), { exact: true })).toHaveText(`${money(initial.total)} → ${money(initial.total + 386400)}`);
  await apply().click();
  await expect(form()).toBeVisible(); expect(posts).toHaveLength(0);
  await form().getByRole('button', { name: term('Cancel size edit'), exact: true }).click();
  await expect(form()).toHaveCount(0); await expect(total()).toHaveText(money(initial.total));

  await openSizeEditor(); await width().fill('130'); await height().fill('160');
  await reason().fill('Corrected against the site drawing');
  await apply().click();
  await expect(form()).toHaveCount(0); await expect(cards()).toHaveCount(2);
  await expect(source()).toContainText('130 × 160');
  await expect(source()).toContainText('Corrected against the site drawing');
  await expect(total()).toHaveText(money(initial.total + 386400));
  await source().getByRole('button', { name: term('Undo size change for opening {number}', { number: 1 }), exact: true }).click();
  await expect(source()).toContainText('120 × 150');
  await expect(total()).toHaveText(money(initial.total));

  await openSizeEditor(); await width().fill('130'); await height().fill('160'); await quantity().fill('1');
  await reason().fill('Only one window changed after client review');
  await form().screenshot({ path: testInfo.outputPath(`${locale}-edit-one-size.png`) });
  await apply().click();
  await expect(form()).toHaveCount(0); await expect(cards()).toHaveCount(3);
  await expect(source()).toContainText(`${term('Quantity')}: 3`);
  const split = page.locator(`[data-opening-id]:not([data-opening-id="${sourceId}"]):not([data-opening-id="${otherId}"])`);
  await expect(split).toHaveCount(1);
  await expect(split.getByRole('spinbutton', { name: term('Quotation system rate (IQD / m²)'), exact: true })).toHaveValue('300000');
  await expect(split.getByRole('combobox', { name: term('Glass'), exact: true })).toHaveValue('glass');
  await expect(split.getByRole('spinbutton', { name: term('Motor price (IQD per motor)'), exact: true })).toHaveValue('120000');
  await expect(total()).toHaveText(money(initial.total + 96600));
  expect(posts).toHaveLength(0);
  await save().click(); await expect(edit()).toBeVisible();
  await expect(page.getByRole('region', { name: term('Opening size history'), exact: true })).toContainText('Only one window changed after client review');
  await expect(page.getByRole('region', { name: term('Opening size history'), exact: true })).toContainText(actor.name);
  expect(posts).toHaveLength(1);
  expect(posts[0].openingSizeChanges).toEqual([expect.objectContaining({
    openingId: sourceId, previousWidth: 120, previousHeight: 150, previousQuantity: 4,
    width: 130, height: 160, quantity: 1, reason: 'Only one window changed after client review',
  })]);
  const newId = posts[0].openingSizeChanges[0].splitOpeningId!;
  expect(newId).toMatch(/^[\da-f-]{36}$/i);
  expect(posts[0].choices.find(choice => choice.openingId === newId)).toEqual({ ...initialChoices[0], openingId: newId });
  expect(openings.find(opening => opening.id === sourceId)).toMatchObject({ width: 120, height: 150, quantity: 3 });
  expect(openings.find(opening => opening.id === newId)).toMatchObject({ width: 130, height: 160, quantity: 1, floor: 'First', room: 'Office' });
  expect(history[0].quotation).toEqual(initial); expect(saved.version).toBe(2);
  expect(saved.total).toBe(initial.total + 96600); expect(mode).toBe('quotation');
  await page.reload(); await edit().click();
  await expect(cards()).toHaveCount(3); await expect(total()).toHaveText(money(saved.total));
  await expect(page.locator(`[data-opening-id="${newId}"]`)).toContainText('130 × 160');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`${locale}-saved-size-revision.png`), fullPage: true });
  await page.getByRole('button', { name: term('Cancel changes'), exact: true }).click();
  await page.getByRole('combobox', { name: term('Quotation version'), exact: true }).selectOption('1');
  await expect(page.locator('.document-total strong')).toHaveText(money(initial.total));
  for (const locked of ['signed', 'operations'] as const) {
    mode = locked; await page.reload();
    await expect(edit()).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Edit size|تعديل المقاس|تعديل الحجم/ })).toHaveCount(0);
  }
  expect(posts).toHaveLength(1); expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: size edits display saved catalog-backed rates after catalog prices change`, async ({ page }, testInfo) => {
  const term = (key: string, replacements: Record<string, string | number> = {}) => {
    let result = (messages[locale].terms as Record<string, string>)[key] ?? key;
    for (const [name, value] of Object.entries(replacements)) result = result.replaceAll(`{${name}}`, String(value));
    return result;
  };
  const money = (amount: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(amount) + (locale === 'ar' ? ' د.ع' : ' IQD');
  let openings: MeasuredOpening[] = [structuredClone(originalOpenings[0])];
  const choice: OpeningChoice = { openingId: sourceId, systemId: 'system', glassId: 'glass', extras: [{ id: 'shutter', quantity: 1, motorPrice: 120000 }, { id: 'handle', quantity: 2 }] };
  const updatedCatalog = catalog.map(product => ({ ...product, unit_price: product.unit_price * 2 }));
  let saved: QuoteSnapshot = { ...priceQuotation(openings, [choice], catalog, actor.id), version: 1 };
  const before = structuredClone(saved);
  let posted: { choices: OpeningChoice[]; openingSizeChanges: OpeningSizeChange[] } | undefined;
  const errors: string[] = [], unexpected: string[] = [];
  await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (url.origin !== 'http://localhost:3003') { unexpected.push(`${req.method()} ${url.origin}`); return route.abort('blockedbyclient'); }
    if (path === `/api/sales-flow/${projectId}` && req.method() === 'POST') {
      try {
        const body = req.postDataJSON();
        assert.equal(body.action, 'save'); assert.equal(body.revision, 1);
        assert.equal(body.openingSizeChanges.length, 1); assert.equal(body.openingSizeChanges[0].quantity, 1);
        assert.equal(body.choices.length, 2);
        assert.ok(body.choices.every((selected: OpeningChoice) => selected.systemRate === undefined), 'Showing a retained rate must not turn catalog charges into manual overrides');
        const edits = normalizeOpeningSizeChanges(openings, body.openingSizeChanges);
        const nextOpenings = applyOpeningSizeChanges(openings, edits);
        saved = { ...priceQuotationWithSizeChanges(nextOpenings, body.choices, updatedCatalog, actor.id, [], 0, saved, edits), version: 2 };
        openings = nextOpenings; posted = body;
        return route.fulfill({ json: { flow: { quotation: saved, revision: 2 } } });
      } catch (error) { errors.push((error as Error).message); return route.fulfill({ status: 400, json: { error: (error as Error).message } }); }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(`${req.method()} ${path}`); return route.fulfill({ status: 405, json: { error: 'Unexpected business write blocked.' } }); }
    if (path === `/quotation/${projectId}` && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${stylesheetLinks}</head><body><div id="root"></div><script src="/qa/quotation-size.js"></script></body></html>` });
    if (path === '/qa/quotation-size.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    if (path === `/api/sales-flow/${projectId}`) return route.fulfill({ json: {
      project: { ...project, sales_status: 'quotation_in_progress' }, client: { name: 'Fixture client', mobile: '07000000000' }, openings, catalog: updatedCatalog, history: [], sizeHistory: [],
      flow: { project_id: projectId, revision: posted ? 2 : 1, stage: 'quotation', signed_at: null, quotation: saved, contract: null, evidence: null },
    } });
    if (path.startsWith('/api/measurement-reports/')) return route.fulfill({ json: { reports: [] } });
    if (path.startsWith('/api/')) return route.fulfill({ json: { actor, projects: [project], openings: [], queue: [], syncedAt: null } });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`/quotation/${projectId}`);
  await page.getByRole('button', { name: term('Edit quotation'), exact: true }).click();
  await page.getByRole('button', { name: term('Edit size of opening {number}', { number: 1 }), exact: true }).click();
  const form = page.getByRole('form', { name: term('Edit opening size'), exact: true });
  await form.getByRole('spinbutton', { name: term('Width (cm)'), exact: true }).fill('130');
  await form.getByRole('spinbutton', { name: term('Height (cm)'), exact: true }).fill('160');
  await form.getByRole('spinbutton', { name: term('Number of openings to resize'), exact: true }).fill('1');
  await form.getByRole('textbox', { name: term('Reason for size change'), exact: true }).fill('Confirmed site correction');
  await form.getByRole('button', { name: term('Apply size to draft'), exact: true }).click();
  const cards = page.locator('[data-opening-id]');
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    await expect(card.getByRole('spinbutton', { name: term('Quotation system rate (IQD / m²)'), exact: true })).toHaveValue('250000');
    await expect(card).toHaveAttribute('data-area-band', 'red');
    await expect(card.getByRole('combobox', { name: term('System / product'), exact: true }).locator('option:checked')).toContainText(money(250000));
    await expect(card.getByRole('combobox', { name: term('Glass'), exact: true }).locator('option:checked')).toContainText(money(15000));
    await expect(card.getByRole('combobox', { name: term('Roller shutter type'), exact: true }).locator('option:checked')).toContainText(money(30000));
    const area = await card.getAttribute('data-opening-id') === sourceId ? '5.4' : '2.08';
    await expect(card.getByText(term('Shutter area: {area} m² · {price} per m²', { area, price: money(30000) }), { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('spinbutton', { name: term('Sliding system (windows & doors) (IQD / m²)'), exact: true })).toHaveValue('250000');
  await expect(page.getByLabel(term('Draft total'), { exact: true })).toHaveText(money(2726600));
  await page.screenshot({ path: testInfo.outputPath(`${locale}-retained-catalog-rates.png`), fullPage: true });
  await page.getByRole('button', { name: term('Save revised quotation'), exact: true }).click();
  await expect(page.getByRole('button', { name: term('Edit quotation'), exact: true })).toBeVisible();
  expect(posted).toBeDefined(); expect(before.lines[0].system.rateSource).toBeUndefined();
  expect(saved.lines.map(line => line.system.rate)).toEqual([250000, 250000]);
  expect(saved.lines.every(line => line.system.rateSource === undefined)).toBe(true);
  expect(saved.total).toBe(2726600);
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: approved Curtain Wall pricing stays editable at 210000 during a size revision`, async ({ page }, testInfo) => {
  const term = (key: string, replacements: Record<string, string | number> = {}) => {
    let result = (messages[locale].terms as Record<string, string>)[key] ?? key;
    for (const [name, value] of Object.entries(replacements)) result = result.replaceAll(`{${name}}`, String(value));
    return result;
  };
  const money = (amount: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(amount) + (locale === 'ar' ? ' د.ع' : ' IQD');
  const pricingPolicy = { curtainWallMinimumRate: 210000 };
  const products: CatalogItem[] = [...catalog, { id: 'curtain', name: 'Curtain Wall', category: 'facade_service', unit: 'sqm', unit_price: 240000, is_active: true }];
  let openings: MeasuredOpening[] = [
    { id: sourceId, floor: 'Ground', room: 'Office', width: 300, height: 200, quantity: 1, opening_type: 'Curtain Wall', opening_direction: null, has_roller_shutter: false },
    structuredClone(originalOpenings[1]),
  ];
  const choices: OpeningChoice[] = [{ openingId: sourceId, systemId: 'curtain', systemRate: 210000, extras: [] }, initialChoices[1]];
  const additionalItems = [{ id: 'curtain', quantity: 1, unitRate: 210000, measurements: [{ label: 'Front', width: 2, height: 3, quantity: 1 }], extras: [] }];
  let saved = { ...priceQuotation(openings, choices, products, actor.id, additionalItems, 0, pricingPolicy), version: 4 };
  let posted = false;
  const errors: string[] = [], unexpected: string[] = [];
  await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (url.origin !== 'http://localhost:3003') { unexpected.push(`${req.method()} ${url.origin}`); return route.abort('blockedbyclient'); }
    if (path === `/api/sales-flow/${projectId}` && req.method() === 'POST') {
      try {
        const body = req.postDataJSON();
        assert.equal(body.action, 'save'); assert.equal(body.revision, 4);
        assert.equal(Object.hasOwn(body, 'pricingPolicy'), false, 'Only the stored server policy authorizes the special rate');
        const changes = normalizeOpeningSizeChanges(openings, body.openingSizeChanges);
        assert.equal(changes.length, 1);
        const candidate = applyOpeningSizeChanges(openings, changes);
        const next = priceQuotationWithSizeChanges(candidate, body.choices, products, actor.id, body.additionalItems, body.discountPercent, saved, changes, saved.pricingPolicy);
        assert.deepEqual(next.pricingPolicy, pricingPolicy);
        assert.equal(next.lines[0].system.rate, 210000);
        assert.equal(next.lines[1].system.rate, 310000);
        assert.equal(next.additionalItems?.[0].rate, 210000);
        assert.equal(next.total, 3492000);
        saved = { ...next, version: 5 }; openings = candidate; posted = true;
        return route.fulfill({ json: { flow: { quotation: saved, revision: 5 } } });
      } catch (error) { errors.push((error as Error).message); return route.fulfill({ status: 400, json: { error: (error as Error).message } }); }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(`${req.method()} ${path}`); return route.fulfill({ status: 405, json: { error: 'Unexpected business write blocked.' } }); }
    if (path === `/quotation/${projectId}` && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${stylesheetLinks}</head><body><div id="root"></div><script src="/qa/quotation-size.js"></script></body></html>` });
    if (path === '/qa/quotation-size.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    if (path === `/api/sales-flow/${projectId}`) return route.fulfill({ json: {
      project: { ...project, sales_status: 'quotation_in_progress' }, client: { name: 'Fixture client', mobile: '07000000000' }, openings, catalog: products, history: [], sizeHistory: [],
      flow: { project_id: projectId, revision: posted ? 5 : 4, stage: 'quotation', signed_at: null, quotation: saved, contract: null, evidence: null },
    } });
    if (path.startsWith('/api/measurement-reports/')) return route.fulfill({ json: { reports: [] } });
    if (path.startsWith('/api/')) return route.fulfill({ json: { actor, projects: [project], openings: [], queue: [], syncedAt: null } });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`/quotation/${projectId}`);
  await page.getByRole('button', { name: term('Edit quotation'), exact: true }).click();
  const wall = page.locator(`[data-opening-id="${sourceId}"]`);
  const rate = wall.getByRole('spinbutton', { name: term('Curtain Wall rate (IQD / m²)'), exact: true });
  await expect(rate).toHaveValue('210000'); await expect(rate).toHaveAttribute('min', '210000'); await expect(rate).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByRole('spinbutton', { name: term('Curtain Wall (IQD / m²)'), exact: true })).toHaveAttribute('min', '210000');
  await expect(page.getByRole('spinbutton', { name: term('Curtain Wall service rate (IQD / m²)'), exact: true })).toHaveAttribute('min', '210000');
  await expect(page.locator(`[data-opening-id="${otherId}"]`).getByRole('spinbutton', { name: term('Quotation system rate (IQD / m²)'), exact: true })).toHaveAttribute('min', '240000');
  await wall.getByRole('button', { name: term('Edit size of opening {number}', { number: 1 }), exact: true }).click();
  const form = page.getByRole('form', { name: term('Edit opening size'), exact: true });
  await form.getByRole('spinbutton', { name: term('Width (cm)'), exact: true }).fill('310');
  await form.getByRole('textbox', { name: term('Reason for size change'), exact: true }).fill('Confirmed Curtain Wall size');
  await form.getByRole('button', { name: term('Apply size to draft'), exact: true }).click();
  await expect(page.getByLabel(term('Draft total'), { exact: true })).toHaveText(money(3492000));
  await expect(rate).toHaveValue('210000');
  await wall.screenshot({ path: testInfo.outputPath(`${locale}-approved-curtain-rate.png`) });
  await page.getByRole('button', { name: term('Save revised quotation'), exact: true }).click();
  await expect(page.getByRole('button', { name: term('Edit quotation'), exact: true })).toBeVisible();
  expect(posted).toBe(true); expect(saved.pricingPolicy).toEqual(pricingPolicy);
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});
