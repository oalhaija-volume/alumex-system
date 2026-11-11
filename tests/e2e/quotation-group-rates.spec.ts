import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { priceQuotation, type AdditionalChoice, type CatalogItem, type MeasuredOpening, type OpeningChoice, type QuoteSnapshot } from '../../src/lib/workflow/pricing';
import type { QuotationRevision } from '../../src/lib/workflow/types';

// Exercise the actual quotation editor with isolated fixture APIs and no account.
const output = resolve('.next/cache/qa-quotation-minimum');
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
const projectId = '11111111-1111-4111-8111-111111111111';
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'Indoor Sales', name: 'Indoor employee', branch: 'Karkh' };
const openings: MeasuredOpening[] = [
  { id: 'sliding', floor: 'GF', room: 'Office', width: 50, height: 100, quantity: 2, opening_type: 'Window', opening_direction: 'Sliding' },
  { id: 'removed-sliding', floor: 'GF', room: 'Living', width: 100, height: 200, quantity: 1, opening_type: 'Window', opening_direction: 'Sliding' },
  { id: 'hinged', floor: 'F1', room: 'Bedroom', width: 100, height: 150, quantity: 3, opening_type: 'Window', opening_direction: 'Hinged' },
  { id: 'door', floor: 'GF', room: 'Hall', width: 100, height: 200, quantity: 1, opening_type: 'Door', opening_direction: 'Sliding' },
  { id: 'louver', floor: 'GF', room: 'Store', width: 100, height: 100, quantity: 2, opening_type: 'Louver', opening_direction: 'Hinged' },
  { id: 'other-system', floor: 'F1', room: 'Office', width: 100, height: 200, quantity: 1, opening_type: 'Window', opening_direction: 'Sliding' },
  { id: 'curtain', floor: 'GF', room: 'Hall', width: 200, height: 300, quantity: 2, opening_type: 'Curtain Wall', opening_direction: null },
];
const catalog: CatalogItem[] = [
  { id: 'alumex', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true },
  { id: 'other', name: 'Other System', category: 'aluminum_system', unit: 'sqm', unit_price: 290000, is_active: true },
  { id: 'curtain-wall', name: 'Curtain Wall', category: 'facade_service', unit: 'sqm', unit_price: 100000, is_active: true },
  { id: 'louver-system', name: 'Louver', category: 'opening_product', unit: 'sqm', unit_price: 80000, is_active: true },
  { id: 'glass', name: 'Low-E Glass', category: 'glass_option', unit: 'sqm', unit_price: 20000, is_active: true },
  { id: 'handle', name: 'Handle', category: 'addon', unit: 'item', unit_price: 5000, is_active: true },
  { id: 'bars', name: 'Georgian bars', category: 'addon', unit: 'meter', unit_price: 6000, is_active: true },
  { id: 'film', name: 'Glass film shades', category: 'addon', unit: 'sqm', unit_price: 8000, is_active: true },
  { id: 'cladding', name: 'Cladding', category: 'facade_service', unit: 'sqm', unit_price: 70000, is_active: true },
  { id: 'standalone-door', name: 'Photocell Door', category: 'standalone_product', unit: 'item', unit_price: 450000, is_active: true },
  { id: 'pushout', name: 'Curtain Wall Pushout', category: 'addon', unit: 'item', unit_price: 30000, is_active: true },
];
const choices: OpeningChoice[] = [
  { openingId: 'sliding', systemId: 'alumex', systemRate: 270000, glassId: 'glass', extras: [{ id: 'handle', quantity: 2 }, { id: 'bars', quantity: 1.5 }] },
  { openingId: 'removed-sliding', systemId: 'alumex', systemRate: 280000, glassId: '', extras: [] },
  { openingId: 'hinged', systemId: 'alumex', systemRate: 275000, glassId: 'glass', extras: [{ id: 'handle', quantity: 3 }] },
  { openingId: 'door', systemId: 'alumex', systemRate: 310000, glassId: 'glass', extras: [{ id: 'handle', quantity: 1 }] },
  { openingId: 'louver', systemId: 'louver-system', glassId: '', extras: [] },
  { openingId: 'other-system', systemId: 'other', glassId: 'glass', extras: [{ id: 'handle', quantity: 2 }] },
  { openingId: 'curtain', systemId: 'curtain-wall', glassId: 'glass', extras: [{ id: 'film', quantity: 1 }] },
];
const additional: AdditionalChoice[] = [
  { id: 'curtain-wall', quantity: 1, measurements: [{ label: 'Front elevation', width: 2, height: 3, quantity: 2 }], extras: [{ id: 'film', quantity: 1 }] },
  { id: 'cladding', quantity: 1, measurements: [{ label: 'Side elevation', width: 3, height: 2, quantity: 1 }], extras: [] },
  { id: 'standalone-door', quantity: 2, extras: [] },
  { id: 'pushout', quantity: 4, extras: [] },
];
const project = { id: projectId, project_name: 'Group prices fixture', project_number: 'PRJ-GROUP', address: 'Baghdad', branch: 'Karkh', sales_status: 'quotation_in_progress', structure_readiness: 'ready', created_by: actor.id, registeredBy: actor.name, created_at: '2026-11-08T08:00:00Z', updated_at: '2026-11-08T08:00:00Z' };

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

for (const locale of ['en', 'ar'] as const) test(`${locale}: group rates edit only eligible draft charges, preserve specifications, and save a revision`, async ({ page, context, request }) => {
  test.setTimeout(60000);
  const messages = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8'));
  const term = (value: string, replacements: Record<string, string | number> = {}) => {
    let result: string = messages.terms[value] ?? value;
    for (const [key, replacement] of Object.entries(replacements)) result = result.replaceAll(`{${key}}`, String(replacement));
    return result;
  };
  const money = (amount: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(amount) + (locale === 'ar' ? ' د.ع' : ' IQD');
  const initial: QuoteSnapshot = { ...priceQuotation(openings, choices, catalog, actor.id, additional), version: 1 };
  const originalCatalog = structuredClone(catalog);
  let saved = structuredClone(initial), revision = 1, signed = false;
  const history: QuotationRevision[] = [];
  const posts: { choices: OpeningChoice[]; excludedOpeningIds: string[]; additionalItems: AdditionalChoice[]; discountPercent: number }[] = [];
  const errors: string[] = [], unexpected: string[] = [];
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Alumex Quotation System</title></head><body><div id="root"></div><script src="/qa/quotation-group-rates.bundle.js"></script></body></html>`;
  await context.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (url.hostname !== 'localhost') { unexpected.push(req.method() + ' ' + url.hostname); return route.abort('blockedbyclient'); }
    if (path === `/api/sales-flow/${projectId}` && req.method() === 'POST') {
      try {
        const body = req.postDataJSON();
        assert.equal(body.action, 'save'); assert.equal(body.revision, revision); assert.equal(signed, false);
        assert.deepEqual(body.newOpenings, []);
        const excluded = body.excludedOpeningIds as string[];
        const measured = openings.filter(opening => !excluded.includes(opening.id));
        const next = priceQuotation(measured, body.choices, catalog, actor.id, body.additionalItems, body.discountPercent);
        history.unshift({ version: saved.version!, quotation: structuredClone(saved), contract: null, previous_stage: 'quotation', superseded_at: '2026-11-08T11:00:00Z' });
        saved = { ...next, excludedOpeningIds: excluded, version: saved.version! + 1 }; revision++; posts.push(body);
        return route.fulfill({ json: { flow: { quotation: saved, revision } } });
      } catch (error) { errors.push((error as Error).message); return route.fulfill({ status: 400, json: { error: (error as Error).message } }); }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(req.method() + ' ' + path); return route.fulfill({ status: 405, json: { error: 'Unexpected write blocked' } }); }
    if (path === `/quotation/${projectId}` && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (path === '/qa/quotation-group-rates.bundle.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, 'workspace.bundle.js')) });
    if (path === `/api/sales-flow/${projectId}`) return route.fulfill({ json: { project: { ...project, sales_status: signed ? 'contract_signed' : project.sales_status }, client: { name: 'Fixture client', mobile: '07000000000' }, openings, catalog, history, flow: { project_id: projectId, revision, stage: signed ? 'contract' : 'quotation', signed_at: signed ? '2026-11-08T12:00:00Z' : null, quotation: saved, contract: null, evidence: null } } });
    if (path.startsWith('/api/measurement-reports/')) return route.fulfill({ json: { reports: [] } });
    if (path.startsWith('/api/')) return route.fulfill({ json: { actor, projects: [project], openings: [], queue: [], syncedAt: null } });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const edit = () => page.getByRole('button', { name: term('Edit quotation'), exact: true });
  const card = (id: string) => page.locator(`[data-opening-id="${id}"]`);
  const openingRate = (id: string) => card(id).getByRole('spinbutton', { name: term('Quotation system rate (IQD / m²)'), exact: true });
  const group = () => page.getByRole('region', { name: term('Group prices'), exact: true });
  const groupRate = (name: string) => group().getByRole('spinbutton', { name: term(name), exact: true });
  const apply = (name: string) => group().getByRole('button', { name: term(name), exact: true });
  const total = () => page.getByLabel(term('Draft total'), { exact: true });
  const save = () => page.getByRole('button', { name: term('Save revised quotation'), exact: true });
  const cancel = () => page.getByRole('button', { name: term('Cancel changes'), exact: true });
  const remove = () => page.getByRole('button', { name: term('Remove opening {number} from quotation', { number: 2 }), exact: true });
  const restore = () => page.getByRole('button', { name: term('Restore opening {number}', { number: 2 }), exact: true });
  const withoutRemoved = openings.filter(opening => opening.id !== 'removed-sliding');
  const draftChoices = (sliding = 270000, hinged = 275000, curtain?: number) => choices.filter(choice => choice.openingId !== 'removed-sliding').map(choice => ({ ...choice, ...(choice.openingId === 'sliding' ? { systemRate: sliding } : choice.openingId === 'hinged' ? { systemRate: hinged } : choice.openingId === 'curtain' && curtain !== undefined ? { systemRate: curtain } : {}) }));
  const draftItems = (curtain?: number): AdditionalChoice[] => additional.map(item => ({ ...item, ...(item.id === 'curtain-wall' && curtain !== undefined ? { unitRate: curtain } : {}) }));
  const expected = (sliding: number, hinged: number, curtain?: number, discount = 0) => priceQuotation(withoutRemoved, draftChoices(sliding, hinged, curtain), catalog, actor.id, draftItems(curtain), discount);

  await page.goto(`/quotation/${projectId}`);
  await expect(page).toHaveURL(`http://localhost:3003/quotation/${projectId}`);
  await expect(page).toHaveTitle(messages.app.title);
  await expect(edit()).toBeVisible();
  await expect(group()).toHaveCount(0);
  await edit().click();
  await expect(group()).toBeVisible();
  await expect(save()).toBeEnabled();
  const slidingInput = groupRate('Sliding windows (IQD / m²)');
  const hingedInput = groupRate('Hinged windows (IQD / m²)');
  const curtainInput = groupRate('Curtain Wall (IQD / m²)');
  const slidingApply = apply('Apply sliding windows price');
  const hingedApply = apply('Apply hinged windows price');
  const curtainApply = apply('Apply curtain wall price');
  await slidingInput.fill(''); await hingedInput.fill(''); await curtainInput.fill('');
  for (const [input, applyButton] of [[slidingInput, slidingApply], [hingedInput, hingedApply], [curtainInput, curtainApply]]) {
    await expect(input).toHaveAttribute('min', '250000');
    await expect(input).toHaveAttribute('step', '1');
    for (const rate of ['240000', '249999', '250000.5']) {
      await input.fill(rate);
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(applyButton).toBeDisabled();
      await expect(save()).toBeDisabled();
      expect(posts).toHaveLength(0);
    }
    await input.fill('250000');
    await expect(input).toHaveAttribute('aria-invalid', 'false');
    await expect(applyButton).toBeEnabled();
    await expect(save()).toBeDisabled();
    await applyButton.click();
    await expect(save()).toBeEnabled();
    expect(posts).toHaveLength(0);
  }
  await expect(openingRate('sliding')).toHaveAttribute('min', '250000');
  await expect(openingRate('hinged')).toHaveAttribute('min', '250000');
  await expect(openingRate('sliding')).toHaveValue('250000');
  await expect(openingRate('hinged')).toHaveValue('250000');
  const measuredCurtainRate = card('curtain').getByRole('spinbutton', { name: term('Curtain Wall rate (IQD / m²)'), exact: true });
  const standaloneCurtainRate = page.getByRole('spinbutton', { name: term('Curtain Wall service rate (IQD / m²)'), exact: true });
  await expect(measuredCurtainRate).toHaveAttribute('min', '250000');
  await expect(standaloneCurtainRate).toHaveAttribute('min', '250000');
  await expect(measuredCurtainRate).toHaveValue('250000');
  await expect(standaloneCurtainRate).toHaveValue('250000');
  for (const input of [openingRate('sliding'), openingRate('hinged'), measuredCurtainRate, standaloneCurtainRate]) {
    for (const rate of ['240000', '249999', '250000.5']) {
      await input.fill(rate);
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(save()).toBeDisabled();
      expect(posts).toHaveLength(0);
    }
    await input.fill('250000');
    await expect(input).toHaveAttribute('aria-invalid', 'false');
    await expect(save()).toBeEnabled();
  }
  await group().screenshot({ path: test.info().outputPath(`${locale}-all-groups-minimum-250000.png`) });
  await cancel().click();
  await expect(edit()).toBeVisible(); expect(posts).toHaveLength(0); expect(saved).toEqual(initial);
  await edit().click();
  await slidingInput.fill(''); await hingedInput.fill(''); await curtainInput.fill('');
  await expect(slidingApply).toBeDisabled(); await expect(hingedApply).toBeDisabled(); await expect(curtainApply).toBeDisabled();
  for (const value of ['240000', '249999', '250000.5', '-1', '']) {
    await slidingInput.fill(value); await expect(slidingApply).toBeDisabled();
    if (value) await expect(save()).toBeDisabled(); else await expect(save()).toBeEnabled();
  }
  for (const value of ['240000', '249999', '250000.5', '0', '1.5', '']) {
    await curtainInput.fill(value); await expect(curtainApply).toBeDisabled();
    if (value) await expect(save()).toBeDisabled(); else await expect(save()).toBeEnabled();
  }
  await hingedInput.fill('335000');
  await expect(save()).toBeDisabled();
  await expect(page.getByText(term('Apply the group prices or clear those fields before saving.'), { exact: true })).toBeVisible();
  await hingedInput.fill('');
  await expect(save()).toBeEnabled();
  await remove().click();
  await slidingInput.fill('300000'); await expect(save()).toBeDisabled();
  await slidingApply.click(); await expect(save()).toBeEnabled();
  await expect(openingRate('sliding')).toHaveValue('300000');
  await expect(openingRate('hinged')).toHaveValue('275000');
  await expect(openingRate('door')).toHaveValue('310000');
  await expect(total()).toHaveText(money(expected(300000, 275000).total));
  expect(posts).toHaveLength(0); expect(saved).toEqual(initial);
  await cancel().click();
  await expect(edit()).toBeVisible(); expect(posts).toHaveLength(0);
  await edit().click();
  await expect(openingRate('sliding')).toHaveValue('270000');
  await expect(openingRate('removed-sliding')).toHaveValue('280000');
  await remove().click();
  await slidingInput.fill('300000'); await expect(save()).toBeDisabled();
  await slidingApply.click(); await expect(save()).toBeEnabled();
  await hingedInput.fill('330000'); await expect(save()).toBeDisabled();
  await hingedApply.click(); await expect(save()).toBeEnabled();
  await expect(openingRate('sliding')).toHaveValue('300000');
  await expect(openingRate('hinged')).toHaveValue('330000');
  await expect(openingRate('door')).toHaveValue('310000');
  await expect(card('louver').getByRole('combobox', { name: term('System / product'), exact: true })).toHaveValue('louver-system');
  await expect(card('other-system').getByRole('combobox', { name: term('System / product'), exact: true })).toHaveValue('other');
  await expect(total()).toHaveText(money(expected(300000, 330000).total));
  await curtainInput.fill('275000'); await expect(save()).toBeDisabled();
  await curtainApply.click(); await expect(save()).toBeEnabled();
  await expect(total()).toHaveText(money(expected(300000, 330000, 275000).total));
  await restore().click();
  await expect(openingRate('removed-sliding')).toHaveValue('280000');
  await remove().click();
  await page.getByRole('checkbox', { name: term('Apply 5% discount'), exact: true }).check();
  await expect(total()).toHaveText(money(expected(300000, 330000, 275000, 5).total));
  expect(posts).toHaveLength(0); expect(saved).toEqual(initial); expect(catalog).toEqual(originalCatalog);
  await group().screenshot({ path: test.info().outputPath(`${locale}-group-prices.png`) });
  await save().click();
  await expect(edit()).toBeVisible(); expect(posts).toHaveLength(1);
  expect(posts[0].excludedOpeningIds).toEqual(['removed-sliding']);
  expect(posts[0].discountPercent).toBe(5);
  expect(posts[0].additionalItems.find(item => item.id === 'curtain-wall')).toHaveProperty('unitRate', 275000);
  expect(saved.total).toBe(expected(300000, 330000, 275000, 5).total);
  expect(saved.discount?.amount).toBe(Math.round(saved.discount!.subtotal / 20));
  for (const line of saved.lines) {
    const previous = initial.lines.find(original => original.opening.id === line.opening.id)!;
    expect(line.opening).toEqual(previous.opening);
    expect(line.glass).toEqual(previous.glass); expect(line.extras).toEqual(previous.extras);
    if (['door', 'louver', 'other-system'].includes(line.opening.id)) expect(line).toEqual(previous);
  }
  expect(saved.lines.find(line => line.opening.id === 'curtain')!.system.rate).toBe(275000);
  expect(saved.additionalItems!.find(item => item.id === 'curtain-wall')!.rate).toBe(275000);
  for (const id of ['cladding', 'standalone-door', 'pushout']) expect(saved.additionalItems!.find(item => item.id === id)).toEqual(initial.additionalItems!.find(item => item.id === id));
  expect(history[0].quotation).toEqual(initial); expect(catalog).toEqual(originalCatalog);
  await page.reload(); await edit().click();
  await expect(openingRate('sliding')).toHaveValue('300000');
  await expect(openingRate('hinged')).toHaveValue('330000');
  await expect(card('removed-sliding')).toHaveCount(0);
  await expect(card('curtain').getByRole('spinbutton', { name: term('Curtain Wall rate (IQD / m²)'), exact: true })).toHaveValue('275000');
  await expect(page.getByRole('spinbutton', { name: term('Curtain Wall service rate (IQD / m²)'), exact: true })).toHaveValue('275000');
  await expect(total()).toHaveText(money(saved.total));
  await save().click();
  await expect(edit()).toBeVisible(); expect(posts).toHaveLength(2);
  expect(posts[1].additionalItems.find(item => item.id === 'curtain-wall')).toHaveProperty('unitRate', 275000);
  expect(saved.lines.find(line => line.opening.id === 'curtain')!.system.rate).toBe(275000);
  await page.getByRole('combobox', { name: term('Quotation version'), exact: true }).selectOption('1');
  await expect(page.locator('.document-total strong')).toHaveText(money(initial.total));
  await expect(group()).toHaveCount(0);
  signed = true; await page.reload();
  await expect(edit()).toHaveCount(0); await expect(group()).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: term('Sliding windows (IQD / m²)'), exact: true })).toHaveCount(0);
  expect(posts).toHaveLength(2); expect(catalog).toEqual(originalCatalog);
  signed = false; await page.reload(); await edit().click();
  for (const [input, applyButton] of [[slidingInput, slidingApply], [hingedInput, hingedApply], [curtainInput, curtainApply]]) {
    await input.fill('250000'); await applyButton.click();
  }
  await expect(save()).toBeEnabled(); await save().click();
  await expect(edit()).toBeVisible(); expect(posts).toHaveLength(3);
  for (const id of ['sliding', 'hinged', 'curtain']) expect(saved.lines.find(line => line.opening.id === id)!.system.rate).toBe(250000);
  expect(saved.additionalItems!.find(item => item.id === 'curtain-wall')!.rate).toBe(250000);
  expect(saved.total).toBe(expected(250000, 250000, 250000, 5).total);
  await page.reload(); await edit().click();
  for (const input of [openingRate('sliding'), openingRate('hinged'), measuredCurtainRate, standaloneCurtainRate]) await expect(input).toHaveValue('250000');
  await expect(save()).toBeEnabled();
  await group().screenshot({ path: test.info().outputPath(`${locale}-saved-minimum-250000.png`) });
  await cancel().click(); expect(posts).toHaveLength(3); expect(catalog).toEqual(originalCatalog);
  await expect(page.locator('nextjs-portal')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});
