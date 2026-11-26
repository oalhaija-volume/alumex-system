import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import { buildAgreement2027Snapshot, emptyAgreement2027Fields } from '../../src/lib/contracts/agreement2027';
import { agreement2027Terms } from '../../src/lib/contracts/agreement2027Content';
import type { QuoteLine, QuoteSnapshot } from '../../src/lib/workflow/pricing';
import type { ContractSnapshot, SalesFlow } from '../../src/lib/workflow/types';

// No Browser connector is available. Exercise the real contract components in
// Playwright with local styles and synthetic data; block every business write.
const projectId = '11111111-1111-4111-8111-111111111130';
const pathname = `/contract/${projectId}`;
const endpoint = `/api/sales-flow/${projectId}`;
const toolsDirectory = resolve('.next/cache/qa-contract-billable-area');
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
let bundle = '', styles = '';

function smallHingedQuotation(): QuoteSnapshot {
 const lines: QuoteLine[] = [[67,39],[57,53],[93,50],[164,73]].map(([width,height],index) => {
  const area = width * height / 10000, quantity = Math.max(area,1), total = Math.round(quantity * 300000);
  return { opening: { id: `small-hinged-${index}`, floor: 'Ground', room: 'Office', width, height, quantity: 1, opening_type: 'Window', opening_direction: 'Hinged' }, area,
   system: { id: 'fixture-hinged-system', name: 'Alumex Hinged Window', unit: 'sqm', rate: 300000, quantity, total }, glass: null, extras: [], total };
 });
 return { lines, additionalItems: [], total: 1259160, currency: 'IQD', version: 4, createdAt: '2026-11-26T08:00:00Z', preparedBy: 'fixture-author' };
}

function fixture(legacy: boolean) {
 const sliding = [[128,159],[193,200],[198,189],[197,239],[260,210],[260,160],[175,175],[155,163]];
 const doors = [[74,234],[89,238],[100,236],[79,222],[100,210],[103,210],[97,225],[76,227],[85,235],[61,280]];
 const windows = [[85,130],[45,130],[75,79],[75,79],[107,210],[107,210],[107,210],[73,160],[60,160],[99,122],[175,190]];
 const lines: QuoteLine[] = [];
 for (const [dimensions, type, direction] of [[sliding,'Window','Sliding'],[doors,'Door','Hinged'],[windows,'Window','Hinged']] as const) {
  for (const [width, height] of dimensions) {
   const area = width * height / 10000;
   const quantity = type === 'Window' ? Math.max(area, 1) : area;
   const total = Math.round(quantity * 270000);
   lines.push({ opening: { id: `fixture-opening-${lines.length}`, floor: 'Ground', room: 'Office', width, height, quantity: 1, opening_type: type, opening_direction: direction }, area,
    system: { id: `fixture-system-${direction}-${type}`, name: direction === 'Sliding' ? 'Alumex System' : `Alumex Hinged ${type}`, unit: 'sqm', rate: 270000, quantity, total, rateSource: 'quotation' }, glass: null, extras: [], total });
  }
 }
 const quotation: QuoteSnapshot = { lines, additionalItems: [], total: 18074151, currency: 'IQD', version: 5, createdAt: '2026-11-15T08:00:00Z', preparedBy: 'fixture-author' };
 assert.equal(lines.reduce((sum, line) => sum + line.total, 0), quotation.total);
 const fields = emptyAgreement2027Fields();
 fields.clientLegalName = 'عميل اختبار المساحة'; fields.ownerName = fields.clientLegalName; fields.stateAtSigning = 'ready';
 const agreement = buildAgreement2027Snapshot(quotation, 'residential', fields);
 // Historical agreements retain OpeningSchedule. New source-PDF layouts have
 // separate coverage in agreement-2027-contract.spec.ts.
 agreement.documentLayout = undefined;
 const contract: ContractSnapshot = { number: legacy ? 'CT-PRJ-202611-0130-5' : 'RA-PRJ-202611-0130-5', branch: 'Rasafa', template: 'residential', createdAt: '2026-11-15T08:30:00Z', quotation,
  client: { name: fields.clientLegalName, mobile: null, client_type: 'individual' }, project: { name: 'مشروع اختبار المساحة', number: 'PRJ-202611-0130', address: 'عنوان اختباري', branch: 'Rasafa' },
  terms: legacy ? [{ title: 'Measurement basis', text: 'فقط القياس مادون المتر المربع يحسب متر مربع.' }] : agreement2027Terms('residential'),
  ...(legacy ? {} : { agreement2027: agreement }) };
 const flow: SalesFlow = { project_id: projectId, revision: 8, stage: legacy ? 'operations' : 'contract', quotation, contract, signed_at: legacy ? '2026-11-15T09:00:00Z' : null,
  evidence: legacy ? { method: 'hard_copy', signer: 'عميل اختباري' } : null, accepted_at: null, accepted_by: null };
 return { flow, project: { id: projectId, project_name: contract.project.name, project_number: contract.project.number, branch: 'Rasafa', sales_status: legacy ? 'transferred_to_operations' : 'contract_generated', additional_openings_state: null, address: 'عنوان اختباري' } };
}

function sourceContractFixture(layout: 'compact' | 'full') {
 const state = fixture(true), quotation = smallHingedQuotation();
 const fields = emptyAgreement2027Fields();
 fields.clientLegalName = 'عميل اختبار جدول الفتحات'; fields.ownerName = fields.clientLegalName; fields.stateAtSigning = 'ready';
 const agreement = buildAgreement2027Snapshot(quotation, 'residential', fields);
 if (layout === 'full') { agreement.compactLayout = undefined; agreement.selectedProductsOnly = undefined; }
 state.flow.contract = { ...state.flow.contract!, quotation, agreement2027: agreement, number: 'RA-PRJ-202611-0130-4', createdAt: '2026-11-26T08:30:00Z' };
 state.flow.signed_at = '2026-11-26T09:00:00Z';
 // A later working quotation must never replace the saved contract's list.
 const current = structuredClone(quotation), line = current.lines[0];
 current.lines = [{ ...line, opening: { ...line.opening, id: 'later-working-opening', width: 300, height: 300 }, area: 9, system: { ...line.system, quantity: 9, total: 2700000 }, total: 2700000 }];
 current.total = 2700000; current.version = 5;
 state.flow.quotation = current;
 return state;
}

test.beforeAll(async ({ request }) => {
 mkdirSync(toolsDirectory, { recursive: true });
 const entry = resolve(toolsDirectory, 'entry.tsx'), loader = resolve(toolsDirectory, 'loader.cjs'), cssLoader = resolve(toolsDirectory, 'css-loader.cjs');
 writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {ContractWorkspace} from '@/components/workflow/ContractWorkspace';import {DocumentPaper,OpeningSchedule} from '@/components/workflow/CommercialDocument';const quotation=${JSON.stringify(smallHingedQuotation())};Object.assign(window,{__qaQuotation:quotation});createRoot(document.getElementById('root')!).render(<I18nProvider>{location.pathname==='/quotation/billable-area-preview'?<DocumentPaper><OpeningSchedule quote={quotation} showAreaColors showOpeningAreaTotal/></DocumentPaper>:<ContractWorkspace projectId="${projectId}"/>}</I18nProvider>);`);
 writeFileSync(loader, "const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};");
 // Use the CSS Modules plugins already bundled with Next to preserve scoped
 // selectors, :global(), print rules, and the component's class-name exports.
 writeFileSync(cssLoader, `const postcss=require('postcss');const local=require('next/dist/compiled/postcss-modules-local-by-default');const scope=require('next/dist/compiled/postcss-modules-scope');module.exports=function(source){const done=this.async();postcss([local(),scope({generateScopedName:name=>'qa_contract_'+name})]).process(source,{from:this.resourcePath}).then(result=>{const names={};result.root.walkRules(':export',rule=>{rule.walkDecls(decl=>{names[decl.prop]=decl.value;});rule.remove();});done(null,'const style=document.createElement("style");style.textContent='+JSON.stringify(result.root.toString())+';document.head.appendChild(style);export default '+JSON.stringify(names)+';');},done);};`);
 const require = createRequire(resolve('package.json'));
 const { webpack } = require('next/dist/compiled/webpack/webpack');
 type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
 await new Promise<void>((accept, reject) => webpack({ mode: 'production', target: 'web', context: process.cwd(), entry, output: { path: toolsDirectory, filename: 'contract.js' },
  resolve: { extensions: ['.tsx','.ts','.js','.json'], alias: { '@': resolve('src') } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }, { test: /\.module\.css$/, use: [cssLoader] }] },
  plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) }), new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })], optimization: { minimize: false }, performance: { hints: false }
 }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
 bundle = readFileSync(resolve(toolsDirectory, 'contract.js'), 'utf8');
 const response = await request.get('/login'); expect(response.status()).toBe(200);
 styles = [...(await response.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
});

for (const locale of ['en','ar'] as const) for (const legacy of [true,false]) test(`${locale}: ${legacy ? 'signed legacy' : 'historical agreement'} contracts show charged area and exact amounts`, async ({ page }, testInfo) => {
 test.setTimeout(120000);
 const state = fixture(legacy), before = structuredClone(state), errors: string[] = [], unexpected: string[] = [];
 const terms = (locale === 'en' ? en : ar).terms as Record<string,string>;
 await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
 page.on('pageerror', error => errors.push(error.message));
 page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
 await page.route('**/*', async route => {
  const req = route.request(), url = new URL(req.url());
  if (url.origin !== 'http://localhost:3003') { unexpected.push(req.method() + ' ' + url.hostname); return route.abort('blockedbyclient'); }
  if (!['GET','HEAD','OPTIONS'].includes(req.method())) { unexpected.push(req.method() + ' ' + url.pathname); return route.fulfill({ status: 405, json: { error: 'Business writes blocked' } }); }
  if (url.pathname === pathname && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Contract billable area</title></head><body><div id="root"></div><script src="/qa/contract-billable-area.js"></script></body></html>` });
  if (url.pathname === '/qa/contract-billable-area.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
  if (url.pathname === endpoint) return route.fulfill({ json: state });
  if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { actor: { id: 'fixture-author', role: 'Indoor Sales' }, projects: [state.project], openings: [], queue: [], indoorSales: [], outdoorSales: [] } });
  return route.continue();
 });
 await page.goto(pathname);
 const paper = page.locator('.commercial-document');
 await expect(paper).toBeVisible();
 const hinged = paper.locator('[data-group-subtotal="hinged"]');
 await expect(hinged).toContainText(terms['Billable area']);
 await expect(hinged).toContainText('37.3866');
 await expect(hinged).toContainText('10,094,382');
 await expect(hinged).not.toContainText('36.12');
 expect(Number(await hinged.locator('[data-area]').getAttribute('data-area'))).toBeCloseTo(37.3866, 8);
 await expect(paper.locator('.document-total')).toContainText('66.9413');
 await expect(paper.locator('.document-total')).toContainText('18,074,151');
 await expect(paper.locator('.document-footer')).toContainText(state.flow.contract!.number);
 await expect(paper.locator('[data-item-group="hinged"]')).toContainText(terms['Minimum billable area: 1 m² per window.']);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await hinged.screenshot({ path: testInfo.outputPath(`${locale}-${legacy ? 'legacy' : 'historical'}-billable-area.png`) });
 await page.emulateMedia({ media: 'print' });
 await expect(hinged).toContainText('37.3866');
 await expect(hinged).toBeVisible();
 if (testInfo.project.name === 'desktop-chromium') {
  const pdf = await page.pdf({ path: testInfo.outputPath(`${locale}-${legacy ? 'legacy' : 'historical'}-contract.pdf`), format: 'A4', printBackground: true });
  expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(0);
 }
 assert.deepEqual(state, before, 'Rendering and printing preserve signed evidence, saved quantities, and prices');
 expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});

for (const locale of ['en','ar'] as const) test(`${locale}: quotation displays only saved billable area for small hinged windows`, async ({ page }, testInfo) => {
 const quote = smallHingedQuotation(), before = structuredClone(quote), errors: string[] = [], unexpected: string[] = [];
 const terms = (locale === 'en' ? en : ar).terms as Record<string,string>;
 await page.setViewportSize({ width: testInfo.project.name === 'mobile-chromium' ? 375 : 1440, height: 900 });
 await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
 page.on('pageerror', error => errors.push(error.message));
 page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
 await page.route('**/*', async route => {
  const req = route.request(), url = new URL(req.url());
  if (url.origin !== 'http://localhost:3003') { unexpected.push(req.method() + ' ' + url.hostname); return route.abort('blockedbyclient'); }
  if (!['GET','HEAD','OPTIONS'].includes(req.method())) { unexpected.push(req.method() + ' ' + url.pathname); return route.fulfill({ status: 405, json: { error: 'Business writes blocked' } }); }
  if (url.pathname === '/quotation/billable-area-preview' && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Quotation area basis</title></head><body><div id="root"></div><script src="/qa/contract-billable-area.js"></script></body></html>` });
  if (url.pathname === '/qa/contract-billable-area.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
  if (url.pathname.startsWith('/api/')) { unexpected.push(req.method() + ' ' + url.pathname); return route.fulfill({ status: 405, json: { error: 'Unexpected API access' } }); }
  return route.continue();
 });
 await page.goto('/quotation/billable-area-preview');
 const paper = page.locator('.commercial-document'), subtotal = paper.locator('[data-group-subtotal="hinged"]'), total = paper.locator('.document-total');
 await expect(paper).toBeVisible();
 for (const summary of [subtotal,total]) {
  await expect(summary.locator('[data-area-basis="billable"]')).toContainText(terms['Billable area']);
  await expect(summary.locator('[data-area-basis="billable"]')).toContainText('4.1972');
  await expect(summary).toContainText('1,259,160');
 }
 await expect(paper.locator('.document-section-heading p')).toContainText('4.1972');
 await expect(paper.locator('.document-section-heading p')).toContainText(terms['Billable area: {area} m²'].replace('{area}','4.1972'));
 await expect(paper.locator('.document-table-detail').filter({ hasText: new RegExp(`^1 ${terms['m²']}$`) })).toHaveCount(3);
 await expect(paper.locator('.document-table-detail').filter({ hasText: new RegExp(`^1\\.1972 ${terms['m²']}$`) })).toHaveCount(1);
 for (const actual of ['2.23','0.2613','0.3021','0.465','0.26','0.3','0.47']) await expect(paper).not.toContainText(actual);
 await expect(paper.locator('.document-opening-group[data-area-band="green"]')).toHaveCount(4);
 await expect(paper.getByText(terms['Minimum billable area: 1 m² per window.'], { exact: true })).toHaveCount(3);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await paper.screenshot({ path: testInfo.outputPath(`${locale}-quotation-billable-area-only.png`) });
 await page.emulateMedia({ media: 'print' });
 await expect(subtotal.locator('[data-area-basis="billable"]')).toContainText('4.1972');
 await expect(total.locator('[data-area-basis="billable"]')).toBeVisible();
 await expect(paper).not.toContainText('2.23');
 if (testInfo.project.name === 'desktop-chromium') {
  const pdf = await page.pdf({ path: testInfo.outputPath(`${locale}-quotation-area-basis.pdf`), format: 'A4', printBackground: true });
  expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(0);
 }
 expect(await page.evaluate(() => (window as unknown as { __qaQuotation: QuoteSnapshot }).__qaQuotation)).toEqual(before);
 expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});

for (const locale of ['en','ar'] as const) for (const layout of ['compact','full'] as const) test(`${locale}: ${layout} source contract appends its saved billable opening list`, async ({ page }, testInfo) => {
 test.setTimeout(120000);
 const state = sourceContractFixture(layout), before = structuredClone(state), errors: string[] = [], unexpected: string[] = [];
 const terms = (locale === 'en' ? en : ar).terms as Record<string,string>;
 await page.setViewportSize({ width: testInfo.project.name === 'mobile-chromium' ? 375 : 1440, height: 900 });
 await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
 page.on('pageerror', error => errors.push(error.message));
 page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
 await page.route('**/*', async route => {
  const req = route.request(), url = new URL(req.url());
  if (url.origin !== 'http://localhost:3003') { unexpected.push(req.method() + ' ' + url.hostname); return route.abort('blockedbyclient'); }
  if (!['GET','HEAD','OPTIONS'].includes(req.method())) { unexpected.push(req.method() + ' ' + url.pathname); return route.fulfill({ status: 405, json: { error: 'Business writes blocked' } }); }
  if (url.pathname === pathname && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Saved contract opening list</title></head><body><div id="root"></div><script src="/qa/contract-billable-area.js"></script></body></html>` });
  if (url.pathname === '/qa/contract-billable-area.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
  if (url.pathname === endpoint) return route.fulfill({ json: state });
  if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { actor: { id: 'fixture-author', role: 'Admin' }, projects: [state.project], openings: [], queue: [], indoorSales: [], outdoorSales: [] } });
  return route.continue();
 });
 await page.goto(pathname);
 const paper = page.locator('.commercial-document'), source = paper.locator('[data-agreement-layout="source-pdf-2027"]');
 const appendix = paper.locator('[data-contract-opening-schedule]');
 await expect(source).toBeVisible();
 await expect(appendix).toHaveCount(1);
 await expect(appendix).toHaveAttribute('data-agreement-section','opening-schedule');
 await expect(paper.locator('.document-schedule')).toHaveCount(1);
 await expect(appendix.locator('.document-opening-group')).toHaveCount(4);
 const sourcePages = await source.locator('[data-agreement-page]').count();
 if (layout === 'full') expect(sourcePages).toBe(7);
 else await expect(source).toHaveAttribute('data-agreement-pagination','compact');
 expect(await appendix.evaluate(element => {
  const source = element.previousElementSibling;
  return source?.getAttribute('data-agreement-layout') === 'source-pdf-2027' && element.getBoundingClientRect().top >= source.getBoundingClientRect().bottom;
 })).toBe(true);
 for (const summary of [appendix.locator('[data-group-subtotal="hinged"]'),appendix.locator('.document-total')]) {
  await expect(summary).toContainText(terms['Billable area']);
  await expect(summary).toContainText('4.1972');
  await expect(summary).toContainText('1,259,160');
 }
 await expect(appendix.locator('.document-section-heading p')).toContainText('4.1972');
 await expect(appendix.locator('.document-table-detail').filter({ hasText: new RegExp(`^1 ${terms['m²']}$`) })).toHaveCount(3);
 await expect(appendix.locator('.document-table-detail').filter({ hasText: new RegExp(`^1\\.1972 ${terms['m²']}$`) })).toHaveCount(1);
 for (const actual of ['2.23','0.2613','0.3021','0.465','0.26','0.3','0.47']) await expect(appendix).not.toContainText(actual);
 await expect(appendix).not.toContainText('300 × 300');
 await expect(appendix).not.toContainText('2,700,000');
 await expect(appendix.locator('.document-footer')).toContainText(state.flow.contract!.number);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await appendix.screenshot({ path: testInfo.outputPath(`${locale}-${layout}-contract-opening-list.png`) });
 await page.emulateMedia({ media: 'print' });
 await expect(appendix).toBeVisible();
 expect(await appendix.evaluate(element => getComputedStyle(element).breakBefore)).toBe('page');
 await expect(appendix.locator('.document-total')).toContainText('4.1972');
 if (testInfo.project.name === 'desktop-chromium') {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.querySelectorAll('.commercial-document img')).map(image => (image as HTMLImageElement).decode())); });
  const pdf = await page.pdf({ path: testInfo.outputPath(`${locale}-${layout}-contract-with-opening-list.pdf`), format: 'A4', preferCSSPageSize: true, printBackground: true });
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(sourcePages + 1);
 }
 await expect(source.locator('[data-agreement-page]')).toHaveCount(sourcePages);
 assert.deepEqual(state,before,'Reading and printing use the frozen contract quotation without changing it or a later working quotation');
 expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});
