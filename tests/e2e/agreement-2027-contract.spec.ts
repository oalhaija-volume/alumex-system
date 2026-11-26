import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import legacyTerms from '../../src/lib/contracts/uploadedTerms.json';
import { emptyAgreement2027Fields, buildAgreement2027Snapshot } from '../../src/lib/contracts/agreement2027';
import { agreement2027Terms } from '../../src/lib/contracts/agreement2027Content';
import type { Agreement2027Fields } from '../../src/lib/contracts/agreement2027Types';
import { priceQuotation, type CatalogItem, type MeasuredOpening, type OpeningChoice } from '../../src/lib/workflow/pricing';
import type { ContractSnapshot, SalesFlow } from '../../src/lib/workflow/types';

// Browser plugin unavailable. Compile the actual online contract component,
// preserve the real local styles, and intercept every business API request.
// No production account, project, signature, or contract is changed by this suite.
let directory = '';
let bundleDirectory = '';
const projectId = '11111111-1111-4111-8111-111111111111';
const pathname = `/contract/${projectId}`;
const endpoint = `/api/sales-flow/${projectId}`;
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
const messages = { en, ar };
type Locale = keyof typeof messages;
type Fixture = {
 project: { id: string; project_name: string; project_number: string; address: string; branch: string; sales_status: string; additional_openings_state: string | null; created_by: string; registeredBy: string; created_at: string; updated_at: string };
 flow: SalesFlow;
};
let bundle = '';
let stylesheetLinks = '';

const additionalArabic: Record<string, string> = { 'Complete contract details': 'استكمال بيانات العقد', 'Save contract details': 'حفظ بيانات العقد' };
const term = (locale: Locale, key: string) => (messages[locale].terms as Record<string, string>)[key] ?? (locale === 'ar' ? additionalArabic[key] : undefined) ?? key;
const number = (value: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value);
const normalized = (value: string) => value.normalize('NFKC').replace(/[\s\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
const catalogue: CatalogItem[] = [
 { id: 'sliding-system', name: 'ALUMEX 16', category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true },
 { id: 'hinged-system', name: 'ALUMEX 4500', category: 'aluminum_system', unit: 'sqm', unit_price: 300000, is_active: true },
 { id: 'glass', name: 'Low-E Glass', category: 'glass_option', unit: 'sqm', unit_price: 20000, is_active: true },
 { id: 'handle', name: 'Handle', category: 'addon', unit: 'item', unit_price: 12345, is_active: true },
];

function fixture({ kind = 'commercial', quantity = 10, legacy = false, signed = false, canonical = false }: { kind?: 'residential' | 'commercial' | 'unified'; quantity?: number; legacy?: boolean; signed?: boolean; canonical?: boolean } = {}): Fixture {
 const openings: MeasuredOpening[] = [
  { id: 'sliding-opening', floor: 'Ground', room: 'Office', width: 200, height: 150, quantity, opening_type: 'Window', opening_direction: 'Sliding' },
  { id: 'hinged-opening', floor: 'First', room: 'Bedroom', width: 150, height: 200, quantity, opening_type: 'Door', opening_direction: 'Hinged' },
 ];
 const choices: OpeningChoice[] = [
  { openingId: openings[0].id, systemId: 'sliding-system', systemRate: 270001, glassId: 'glass', extras: [{ id: 'handle', quantity: 1 }] },
  { openingId: openings[1].id, systemId: 'hinged-system', systemRate: 320003, glassId: '', extras: [] },
 ];
 const quotation = { ...priceQuotation(openings, choices, catalogue, actorId), version: 3, createdAt: '2027-01-12T08:00:00Z' };
 const fields = emptyAgreement2027Fields();
 Object.assign(fields, {
  clientLegalName: 'محمد صاحب المشروع', companyName: 'شركة العميل الأصلية', executingEntity: 'شركة التنفيذ الأصلية', ownerName: 'محمد المالك', ownerPhone: '07700000000', directPhone: '07700000001', whatsapp: '07700000002', email: 'client@example.invalid', consultantName: 'المهندس الاستشاري الأصلي', consultantPhone: '07700000003', contractorName: 'المقاول الأصلي', contractorPhone: '07700000004', salesEngineerName: 'مهندس المبيعات الأصلي', stateAtSigning: 'الموقع جاهز للقياسات', clientClassification: 'شركة', handoverDate: '2027-01-20', handoverReceivedDate: '2027-01-21', projectApprovalDate: '2027-01-22', advancePaidDate: '2027-01-15', samples: ['aluminum', 'glass'], specialInstructions: 'التوجيهات الأصلية محفوظة', agreedCommitments: 'الالتزامات الأصلية محفوظة', followUpNotes: 'متابعة الموقع الأصلي', administrativeNotes: 'التوصيات الإدارية الأصلية', companyRepresentativeName: 'الممثل المخول الأصلي', companyRepresentativeTitle: 'مدير المبيعات',
 });
 fields.approvals.salesEngineer = { name: 'مهندس المبيعات الأصلي', date: '2027-01-15', signature: '' };
 fields.approvals.projectsManager = { name: 'مدير المشاريع الأصلي', date: '2027-01-21', signature: '' };
 fields.phases = [{ technicalMeetingDate: '2027-02-01', measurementReadyDate: '2027-02-02', installationReadyDate: '2027-02-15', notes: 'المرحلة الأصلية' }];
 const agreement = buildAgreement2027Snapshot(quotation, kind, fields, [
  { openingId: openings[0].id, aluminumColor: 'برونزي', glassColor: 'شفاف', bottomFrame: 'عتبة أصلية', notes: 'موضع المقبض الأصلي' },
  { openingId: openings[1].id, aluminumColor: 'أسود', glassColor: '', bottomFrame: 'بدون عتبة', notes: 'تفتح إلى الداخل' },
 ]);
 // Historical snapshots predate the source-PDF layout marker and must keep
 // their saved document presentation when opened or printed again.
 if (!canonical) delete agreement.documentLayout;
 const legacyKind = kind === 'unified' ? 'commercial' : kind;
 const contract: ContractSnapshot = {
  number: 'CT-PRJ-2027-FIXTURE-4', createdAt: '2027-01-15T09:00:00Z', createdBy: actorId, template: legacy ? legacyKind : kind, branch: 'Rasafa',
  client: { name: 'محمد صاحب المشروع', mobile: '07700000000', client_type: 'company' },
  project: { name: 'مشروع العقد المعتمد 2027', number: 'PRJ-2027-FIXTURE', address: 'بغداد / حي البلديات / عنوان المشروع الأصلي', branch: 'Rasafa' },
  quotation: structuredClone(quotation), terms: legacy ? structuredClone(legacyTerms[legacyKind]) : agreement2027Terms(kind),
  ...(legacy ? {} : { agreement2027: agreement }),
 };
 return {
  project: { id: projectId, project_name: contract.project.name, project_number: contract.project.number, address: contract.project.address!, branch: 'Rasafa', sales_status: signed ? 'transferred_to_operations' : 'contract_generated', additional_openings_state: null, created_by: actorId, registeredBy: 'Indoor employee', created_at: '2027-01-12T07:00:00Z', updated_at: '2027-01-15T09:00:00Z' },
  flow: { project_id: projectId, revision: 4, stage: signed ? 'signed' : 'contract', quotation, contract, signed_at: signed ? '2027-01-16T09:00:00Z' : null, evidence: signed ? { method: 'hard_copy', signer: 'صاحب العقد الموقع' } : null, accepted_at: null, accepted_by: null },
 };
}

function selectedFixture(mode: 'one' | 'mixed' | 'unknown' | 'long' = 'one'): Fixture {
 const state = fixture({ kind: 'residential', canonical: true });
 const quote = structuredClone(state.flow.quotation);
 quote.lines = [quote.lines[0]];
 const line = quote.lines[0];
 line.system.name = 'Alumex System'; line.systemModel = 'A16';
 if (mode !== 'mixed') { line.glass = null; line.extras = []; }
 line.total = line.system.total + (line.glass?.total ?? 0) + line.extras.reduce((sum, item) => sum + item.total, 0);
 quote.additionalItems = [];
 if (mode === 'mixed') quote.additionalItems = [
  { id: 'curtain', name: 'ALUMEX CURTAIN WALL C W 60', unit: 'sqm', rate: 312345, quantity: 24, total: 312345 * 24, curtainWallGlassType: 'double', extras: [{ id: 'curtain-wall-arch', name: 'Curtain Wall Arch', unit: 'item', rate: 150000, quantity: 2, total: 300000 }] },
  { id: 'skylight', name: 'ALUMEX SKYLIGHT C W 60', unit: 'sqm', rate: 430987, quantity: 6, total: 430987 * 6, extras: [{ id: 'sub-frame', name: 'Sub Frame', unit: 'meter', rate: 17000, quantity: 8, total: 136000 }] },
  { id: 'standalone-door', name: 'ALUMEX SWING DOOR', unit: 'item', rate: 516789, quantity: 2, total: 1033578 },
 ];
 if (mode === 'long') quote.additionalItems = Array.from({ length: 20 }, (_, index) => ({ id: `bespoke-${index + 1}`, name: `Approved bespoke product ${index + 1}`, unit: 'item', rate: 100001 + index, quantity: 1, total: 100001 + index }));
 if (mode === 'one') quote.additionalItems = [{ id: 'unselected-mirror', name: 'Glass Mirror', unit: 'sqm', rate: 0, quantity: 0, total: 0 }];
 if (mode === 'unknown') { line.system.name = 'BESPOKE NARROW-FRAME X9'; delete line.systemModel; }
 quote.total = quote.lines.reduce((sum, item) => sum + item.total, 0) + quote.additionalItems.reduce((sum, item) => sum + item.total + (item.extras ?? []).reduce((subtotal, extra) => subtotal + extra.total, 0), 0);
 const contract = state.flow.contract!;
 const specifications = contract.agreement2027!.openingSpecifications.filter(item => item.openingId === line.opening.id);
 if (mode === 'unknown') Object.assign(specifications[0], { technicalDescription: 'مواصفة X9 المعتمدة: عمق 77 ملم وسماكة 2.4 ملم', aluminumColor: 'برونزي خاص', notes: 'المقبض حسب المخطط الموقع' });
 const agreement = buildAgreement2027Snapshot(quote, 'residential', contract.agreement2027!.fields, specifications);
 state.flow.quotation = structuredClone(quote);
 state.flow.contract = { ...contract, quotation: structuredClone(quote), agreement2027: agreement };
 return state;
}

// The bundle comes from current source; the live dev server supplies only CSS
// and public brand assets. Server authorization/RPC tests are separate checks.
test.beforeAll(async ({ request }, testInfo) => {
 directory = resolve(testInfo.outputPath('contract-tools'));
 bundleDirectory = resolve(directory, 'component');
 mkdirSync(bundleDirectory, { recursive: true });
 const entry = resolve(bundleDirectory, 'entry.tsx'), loader = resolve(bundleDirectory, 'typescript-loader.cjs'), cssLoader = resolve(bundleDirectory, 'css-module-loader.cjs');
 writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {ContractWorkspace} from '@/components/workflow/ContractWorkspace';createRoot(document.getElementById('root')!).render(<I18nProvider><ContractWorkspace projectId="${projectId}"/></I18nProvider>);`);
 writeFileSync(loader, "const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};");
 // Render the real CSS declarations while bundling outside Next's module pipeline.
 // Class names remain local to this isolated fixture; global selectors retain
 // the same meaning they have in the application stylesheet.
 writeFileSync(cssLoader, "module.exports=function(source){const names=[...source.matchAll(/\\.([a-zA-Z_][\\w-]*)/g)].map(match=>match[1]);const css=source.replace(/:global\\(([^)]+)\\)/g,'$1');return 'const sheet=document.createElement(\"style\");sheet.textContent='+JSON.stringify(css)+';document.head.appendChild(sheet);export default '+JSON.stringify(Object.fromEntries(names.map(name=>[name,name])))+';';};");
 const require = createRequire(resolve('package.json'));
 const { webpack } = require('next/dist/compiled/webpack/webpack') as { webpack: ((config: Record<string, unknown>, callback: (error: Error | null, stats?: { hasErrors(): boolean; toString(options: Record<string, unknown>): string }) => void) => void) & { DefinePlugin: new (values: Record<string, string>) => unknown; optimize: { LimitChunkCountPlugin: new (options: { maxChunks: number }) => unknown } } };
 await new Promise<void>((accept, reject) => webpack({ mode: 'production', target: 'web', context: process.cwd(), entry, output: { path: bundleDirectory, filename: 'contract-component.js' }, resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }, { test: /\.module\.css$/, use: [cssLoader] }] }, plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) }), new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })], optimization: { minimize: false }, performance: { hints: false } }, (error, stats) => error ? reject(error) : !stats || stats.hasErrors() ? reject(new Error(stats?.toString({ all: false, errors: true }) ?? 'Contract component unavailable')) : accept()));
 bundle = readFileSync(resolve(bundleDirectory, 'contract-component.js'), 'utf8');
 const login = await request.get('/login'); expect(login.status()).toBe(200);
 stylesheetLinks = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
 expect(stylesheetLinks).toContain('/_next/');
 writeFileSync(resolve(bundleDirectory, 'extract-pdf.swift'), `import Foundation\nimport PDFKit\nlet url = URL(fileURLWithPath: CommandLine.arguments[1])\nguard let document = PDFDocument(url: url) else { fatalError("Cannot open printed contract") }\nlet result: [String: Any] = ["pages": document.pageCount, "text": document.string ?? ""]\nlet data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])\nprint(String(data: data, encoding: .utf8)!)\n`);
});

async function mount(page: Page, locale: Locale, state: Fixture, mutate?: (route: Route, body: Record<string, unknown>) => Promise<void>) {
 const pageErrors: string[] = [], consoleErrors: string[] = [], unexpected: string[] = [];
 page.on('pageerror', error => pageErrors.push(error.message));
 page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
 await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
 await page.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== 'http://localhost:3003') { unexpected.push(request.method() + ' ' + url.origin); return route.abort('blockedbyclient'); }
  if (url.pathname === pathname && request.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${messages[locale].app.title}</title>${stylesheetLinks}</head><body><div id="root"></div><script src="/qa/agreement-2027-component.js"></script></body></html>` });
  if (url.pathname === '/qa/agreement-2027-component.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
  if (url.pathname === endpoint) {
   if (request.method() === 'GET') return route.fulfill({ json: state });
   if (request.method() === 'POST' && mutate) return mutate(route, request.postDataJSON() as Record<string, unknown>);
  }
  if (url.pathname.startsWith('/api/')) {
   if (request.method() !== 'GET') { unexpected.push(request.method() + ' ' + url.pathname); return route.fulfill({ status: 405, json: { error: 'Business writes are blocked in the contract test.' } }); }
   return route.fulfill({ json: { actor: { id: actorId, role: 'Indoor Sales' }, projects: [state.project], openings: [], queue: [], indoorSales: [], outdoorSales: [] } });
  }
  return route.continue();
 });
 await page.goto(pathname);
 await expect(page).toHaveURL(`http://localhost:3003${pathname}`);
 await expect(page).toHaveTitle(messages[locale].app.title);
 await expect(page.getByRole('heading', { name: term(locale, 'Client contract'), exact: true })).toBeVisible();
 await expect(page.locator('.commercial-document')).toBeVisible();
 await expect(page.locator('nextjs-portal')).toHaveCount(0);
 return { pageErrors, consoleErrors, unexpected };
}

async function noOverflow(page: Page) {
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function readyArtwork(page: Page) {
 await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all([...document.querySelectorAll<HTMLImageElement>('.commercial-document img')].map(image => image.decode()));
 });
}

async function compactLayout(page: Page) {
 const paper = page.locator('.commercial-document');
 await expect(paper.locator('[data-agreement-pagination="compact"]')).toBeVisible();
 const pages = await paper.locator('[data-agreement-page]').evaluateAll(elements => elements.map(element => {
  const pageRect = element.getBoundingClientRect();
  return {
   number: Number(element.getAttribute('data-agreement-page')),
   kind: element.getAttribute('data-agreement-page-kind'),
   used: Number(element.getAttribute('data-agreement-page-used')),
   capacity: Number(element.getAttribute('data-agreement-page-capacity')),
   bands: [...element.querySelectorAll<HTMLElement>('[data-agreement-band]')].map(band => {
    const content = band.getAttribute('data-agreement-band-kind') === 'product' ? band.querySelector<HTMLElement>('[data-agreement-product], [data-agreement-product-continuation]')! : band;
    const rect = content.getBoundingClientRect();
    return {
     id: band.getAttribute('data-agreement-band'), kind: band.getAttribute('data-agreement-band-kind'),
     top: (rect.top - pageRect.top) / pageRect.height * 841.92,
     bottom: (rect.bottom - pageRect.top) / pageRect.height * 841.92,
     expectedTop: Number(band.getAttribute('data-agreement-band-top')),
     expectedHeight: Number(band.getAttribute('data-agreement-band-height')),
     outsideWidth: rect.left < pageRect.left - 0.5 || rect.right > pageRect.right + 0.5,
     overflow: content.scrollHeight > content.clientHeight + 1,
    };
   }),
  };
 }));
 expect(pages.map(sheet => sheet.number)).toEqual(Array.from({ length: pages.length }, (_, index) => index + 1));
 expect(pages[0].kind).toBe('handover'); expect(pages.at(-1)!.kind).toBe('annex');
 const flowPages = pages.filter(sheet => sheet.kind === 'flow');
 expect(flowPages.length).toBeGreaterThan(0);
 for (const sheet of flowPages) {
  expect(sheet.bands.length).toBeGreaterThan(0);
  expect(sheet.used / sheet.capacity, `Page ${sheet.number} must not leave half its body empty`).toBeGreaterThanOrEqual(0.65);
  expect(sheet.used).toBeLessThanOrEqual(sheet.capacity + 0.2);
  for (const [index, band] of sheet.bands.entries()) {
   expect(band.top, `${band.id} clears the source header`).toBeGreaterThanOrEqual(116.8);
   expect(band.bottom, `${band.id} clears the source footer`).toBeLessThanOrEqual(710.2);
   expect(Math.abs(band.top - band.expectedTop), `${band.id} stays at its allocated position`).toBeLessThan(0.6);
   expect(Math.abs(band.bottom - band.top - band.expectedHeight), `${band.id} keeps its complete source height`).toBeLessThan(0.6);
   expect(band.outsideWidth, `${band.id} stays inside the paper`).toBe(false);
   expect(band.overflow, `${band.id} does not clip its contents`).toBe(false);
   if (index) expect(band.top, `${band.id} does not overlap the preceding content`).toBeGreaterThanOrEqual(sheet.bands[index - 1].bottom - 0.2);
  }
 }
 expect(await paper.locator('[data-agreement-clause]').evaluateAll(clauses => clauses.map(clause => Number(clause.getAttribute('data-agreement-clause'))))).toEqual(Array.from({ length: 19 }, (_, index) => index + 1));
 const sequence = pages.flatMap(sheet => sheet.bands.map(band => band.id!));
 const specificationHeading = sequence.indexOf('clause-4-heading');
 const firstProduct = sequence.findIndex(id => id.startsWith('product-'));
 const lastProduct = sequence.findLastIndex(id => id.startsWith('product-'));
 expect(firstProduct).toBeGreaterThan(specificationHeading);
 expect(sequence.indexOf('common-exclusions')).toBeGreaterThan(lastProduct);
 expect(sequence.indexOf('formal-signatures')).toBeGreaterThan(sequence.indexOf('clause-19'));
 return { pages, flowPages, sequence };
}

async function expectContractOpeningSchedule(page: Page, contract: ContractSnapshot) {
 const paper = page.locator('.commercial-document');
 const appendix = paper.locator('[data-contract-opening-schedule]');
 await expect(appendix).toHaveCount(1);
 await expect(paper.locator('.document-schedule')).toHaveCount(1);
 await expect(appendix.locator('.document-schedule')).toHaveCount(1);
 await expect(appendix.locator('.document-opening-group')).toHaveCount(contract.quotation.lines.length);
 const billableArea = contract.quotation.lines.reduce((sum, line) => sum + (line.system.unit === 'sqm' ? line.system.quantity : 0), 0)
  + (contract.quotation.additionalItems ?? []).reduce((sum, item) => sum + (item.unit === 'sqm' && !item.projectAddon ? item.quantity : 0), 0);
 const measures = appendix.locator('.document-total .document-summary-measures');
 await expect(measures).toHaveAttribute('data-area-basis', 'billable');
 await expect(measures).toHaveAttribute('data-area', String(billableArea));
 await expect(appendix.locator('.document-total strong')).toContainText(number(contract.quotation.total));
}

for (const locale of ['en', 'ar'] as const) {
 for (const mode of ['one', 'mixed', 'unknown', 'long'] as const) test(`${locale}: selected ${mode} specifications contain only approved products and preserve every saved item on screen and paper`, async ({ page }, testInfo) => {
  const state = selectedFixture(mode), before = structuredClone(state.flow.contract!);
  const health = await mount(page, locale, state);
  const paper = page.locator('.commercial-document');
  await expectContractOpeningSchedule(page, before);
  const products = paper.locator('[data-agreement-product]');
  const names = mode === 'mixed'
   ? ['ALUMEX A16', 'Low-E Glass', 'Handle', 'ALUMEX CURTAIN WALL C W 60', 'Curtain Wall Arch', 'ALUMEX SKYLIGHT C W 60', 'Sub Frame', 'ALUMEX SWING DOOR']
   : mode === 'unknown' ? ['BESPOKE NARROW-FRAME X9']
   : ['ALUMEX A16', ...(mode === 'long' ? Array.from({ length: 20 }, (_, index) => `Approved bespoke product ${index + 1}`) : [])];
  await expect(products).toHaveCount(names.length);
  for (const name of names) await expect(products.filter({ has: page.getByText(name, { exact: true }) })).toHaveCount(1);
  const layout = await compactLayout(page);
  const physicalPages = layout.pages.length;
  if (mode === 'long') expect(physicalPages).toBeGreaterThan(6);
  else if (mode === 'one' || mode === 'unknown') expect(physicalPages).toBeLessThanOrEqual(6);
  const text = (await products.allTextContents()).join(' ').replace(/\s+/g, ' ').toLowerCase();
  const sourceDocument = (await paper.locator('[data-agreement-layout="source-pdf-2027"]').textContent())!.replace(/\s+/g, ' ').toLowerCase();
  const unselected = ['ALUMEX A16 Pro', 'ALUMEX 16 PRO', 'ALUMEX 4500', 'ALUMEX PUSH OUT', 'THE ADDRESS AS A18', 'Glass Mirror', 'Turn And Tilt'];
  if (mode !== 'mixed') unselected.push('ALUMEX CURTAIN WALL', 'ALUMEX SKYLIGHT', 'ALUMEX SWING DOOR', 'Low-E Glass', 'Handle');
  if (mode === 'unknown') unselected.push('ALUMEX A16');
  for (const name of unselected) expect(sourceDocument).not.toContain(name.toLowerCase());
  expect(text).not.toContain('—');
  const rates = mode === 'mixed' ? [270001, 20000, 12345, 312345, 150000, 430987, 17000, 516789] : [270001];
  for (const rate of rates) expect(text).toContain(number(rate));
  if (mode === 'unknown') {
   expect(text).toContain('مواصفة x9 المعتمدة: عمق 77 ملم وسماكة 2.4 ملم');
   expect(text).toContain('برونزي خاص'); expect(text).toContain('المقبض حسب المخطط الموقع');
  }
  await noOverflow(page); await readyArtwork(page);
  await products.first().locator('xpath=ancestor::*[@data-agreement-page]').screenshot({ path: testInfo.outputPath(`${locale}-${mode}-selected-systems.png`) });
  await products.last().locator('xpath=ancestor::*[@data-agreement-page]').screenshot({ path: testInfo.outputPath(`${locale}-${mode}-selected-extras.png`) });
  writeFileSync(testInfo.outputPath(`${locale}-${mode}-compact-layout.json`), JSON.stringify(layout, null, 2) + '\n');
  const pdfPath = testInfo.outputPath(`${locale}-${mode}-selected-products.pdf`);
  const bytes = await page.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: true });
  expect(bytes.byteLength).toBeLessThanOrEqual(3 * 1024 * 1024);
  const pdf = await PDFDocument.load(bytes); expect(pdf.getPageCount()).toBeGreaterThanOrEqual(physicalPages + 1);
  // Technical-selection assertions apply to the original source pages. The
  // appended quotation retains all saved rows, including zero-quantity items.
  const sourcePdf = await PDFDocument.create();
  for (const sourcePage of await sourcePdf.copyPages(pdf, Array.from({ length: physicalPages }, (_, index) => index))) sourcePdf.addPage(sourcePage);
  const sourcePdfPath = testInfo.outputPath(`${locale}-${mode}-source-specifications.pdf`);
  writeFileSync(sourcePdfPath, await sourcePdf.save());
  const extraction = JSON.parse(execFileSync('swift', ['-module-cache-path', resolve(directory, 'swift-cache'), resolve(bundleDirectory, 'extract-pdf.swift'), sourcePdfPath], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })) as { text: string };
  for (const name of names) expect(normalized(extraction.text)).toContain(normalized(name));
  for (const name of unselected) expect(normalized(extraction.text).toLowerCase()).not.toContain(normalized(name).toLowerCase());
  expect(state.flow.contract).toEqual(before);
  expect(health.pageErrors).toEqual([]); expect(health.consoleErrors).toEqual([]); expect(health.unexpected).toEqual([]);
 });

 test(`${locale}: approved quotation prices and all 2027 content survive contract detail edits, reopening and print`, async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const state = fixture(), before = structuredClone(state.flow.contract!), posts: Record<string, unknown>[] = [];
  const health = await mount(page, locale, state, async (route, body) => {
   assert.equal(body.action, 'save-contract-details'); assert.equal(body.revision, state.flow.revision); assert.equal(body.confirmed, true);
   assert.equal(state.flow.signed_at, null); assert.ok(state.flow.contract?.agreement2027);
   assert.equal(Object.hasOwn(body, 'quotation'), false); assert.equal(Object.hasOwn(body, 'terms'), false);
   const details = body.details as Agreement2027Fields;
   assert.equal(Object.hasOwn(details, 'total'), false); assert.equal(Object.hasOwn(details, 'paymentSchedule'), false);
   state.flow = { ...state.flow, revision: state.flow.revision + 1, contract: { ...state.flow.contract!, agreement2027: { ...state.flow.contract!.agreement2027!, fields: structuredClone(details) } } };
   posts.push(body);
   return route.fulfill({ json: { flow: state.flow } });
  });
  const paper = page.locator('.commercial-document');
  await expect(paper.locator('.document-header')).toHaveCount(1);
  await expect(paper.locator('.document-header img')).toHaveAttribute('src', '/logos/AlumexLogo.svg');
  await expect(paper.locator('.document-footer')).toContainText(before.number);
  await expect(paper.locator('[data-agreement-clause]')).toHaveCount(19);
  for (const section of ['handover', 'payments', 'terms', 'annex']) await expect(paper.locator(`[data-agreement-section="${section}"]`)).toBeVisible();
  await expect(paper).toContainText('محمد صاحب المشروع');
  await expect(paper.locator('[data-agreement-section="parties"] h4').first()).toHaveText('الفريق الأول: محمد صاحب المشروع');
  await expect(paper.locator('[data-agreement-section="parties"] h4').last()).toContainText('الفريق الثاني: شركة خبراء الومكس');
  await expect(paper).toContainText('الممثل المخول الأصلي');
  await expect(paper).toContainText('برونزي');
  await expect(paper).toContainText('موضع المقبض الأصلي');
  const schedule = paper.locator('[data-agreement-section="specifications"]');
  await expect(schedule).toContainText(number(270001));
  await expect(schedule).toContainText(number(320003));
  await expect(schedule).not.toContainText(number(250000));
  await expect(schedule).not.toContainText(number(300000));
  const payments = paper.locator('[data-agreement-section="payments"]');
  expect(before.agreement2027!.paymentSchedules).toBeUndefined();
  const selectedPayments = payments.locator('[data-payment-schedule]');
  await expect(selectedPayments).toHaveCount(1);
  await expect(payments.locator('[data-payment-schedule="residential"]')).toHaveCount(0);
  for (const stage of before.agreement2027!.paymentSchedule) await expect(selectedPayments).toContainText(number(stage.amount));
  expect(before.agreement2027!.paymentSchedule.map(stage => stage.percent)).toEqual([30, 20, 10, 20, 15, 5]);
  expect(before.agreement2027!.paymentSchedule.reduce((sum, stage) => sum + stage.amount, 0)).toBe(before.quotation.total);
  await expect(paper.locator('[data-agreement-clause="3"]')).not.toContainText('للمشاريع السكنية');
  await expect(paper.locator('[data-agreement-clause="3"]')).toContainText('للمشاريع التجارية');
  await expect(paper).not.toContainText('2026 / 00 / 00');
  await noOverflow(page);
  await payments.screenshot({ path: testInfo.outputPath(`${locale}-approved-payments.png`) });

  // Previously entered signing consent must not survive an information revision.
  await page.getByRole('button', { name: term(locale, 'Client signed hard copy'), exact: true }).click();
  await page.getByRole('textbox', { name: term(locale, 'Client signer’s full name'), exact: true }).fill('Old unsigned draft signer');
  await page.getByRole('checkbox', { name: term(locale, 'I confirm the client has signed the complete printed contract shown above.'), exact: true }).check();
  await page.getByRole('button', { name: term(locale, 'Complete contract details'), exact: true }).click();
  const editor = page.locator('[data-agreement-fields-form]');
  await expect(editor).toBeVisible();
  const print = page.getByRole('button', { name: term(locale, 'Print contract'), exact: true });
  const changeType = page.getByRole('button', { name: term(locale, 'Change contract type'), exact: true });
  const signHardCopy = page.getByRole('button', { name: term(locale, 'Record hard-copy signature & send to Operations'), exact: true });
  await expect(print).toBeDisabled(); await expect(changeType).toBeDisabled(); await expect(signHardCopy).toBeDisabled();
  await editor.locator('[name="agreement-ownerName"]').fill('Pending owner change must be discarded');
  await page.emulateMedia({ media: 'print' });
  await expect(paper).not.toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await editor.getByRole('button', { name: term(locale, 'Cancel changes'), exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(print).toBeEnabled(); await expect(changeType).toBeEnabled(); await expect(signHardCopy).toBeEnabled();
  await expect(paper).not.toContainText('Pending owner change must be discarded');
  expect(posts).toEqual([]); expect(state.flow.contract).toEqual(before);
  await page.getByRole('button', { name: term(locale, 'Complete contract details'), exact: true }).click();
  await expect(editor.locator('[name="agreement-ownerName"]')).toHaveValue('محمد المالك');
  await editor.locator('[name="agreement-ownerName"]').fill('محمد المالك بعد المراجعة');
  await editor.locator('[name="agreement-consultantPhone"]').fill('07700000099');
  await editor.locator('details').filter({ has: page.locator('[name="agreement-agreedCommitments"]') }).locator('summary').click();
  await editor.locator('[name="agreement-agreedCommitments"]').fill('يتم الحفاظ على الأسعار المعتمدة وموعد التسليم المتفق عليه.');
  await editor.locator('details').filter({ has: page.locator('[name="agreement-phase-0-technicalMeetingDate"]') }).locator('summary').click();
  await editor.locator('[name="agreement-phase-0-technicalMeetingDate"]').fill('2027-02-03');
  await editor.locator('details').filter({ has: page.locator('[name="agreement-companyRepresentativeDate"]') }).locator('summary').click();
  await editor.locator('[name="agreement-companyRepresentativeDate"]').fill('2027-01-18');
  await editor.getByRole('button', { name: term(locale, 'Save contract details'), exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(posts).toHaveLength(1);
  expect(state.flow.contract!.agreement2027!.fields.companyRepresentativeDate).toBe('2027-01-18');
  expect(state.flow.contract!.quotation).toEqual(before.quotation);
  expect(state.flow.contract!.terms).toEqual(before.terms);
  expect(state.flow.contract!.agreement2027!.paymentSchedule).toEqual(before.agreement2027!.paymentSchedule);
  expect(state.flow.contract!.agreement2027!.paymentSchedules).toEqual(before.agreement2027!.paymentSchedules);
  expect(state.flow.contract!.agreement2027!.readiness).toEqual(before.agreement2027!.readiness);
  expect(state.flow.contract!.agreement2027!.specificationNotes).toEqual(before.agreement2027!.specificationNotes);
  await expect(paper).toContainText('محمد المالك بعد المراجعة');
  await expect(paper).toContainText('07700000099');
  await expect(paper).toContainText('2027-01-18');
  await expect(paper).toContainText('يتم الحفاظ على الأسعار المعتمدة وموعد التسليم المتفق عليه.');
  await expect(page.getByRole('textbox', { name: term(locale, 'Client signer’s full name') })).toHaveValue('');
  await expect(page.getByRole('checkbox', { name: term(locale, 'I confirm that I have read and agree to the contract, including all openings, prices, and terms.'), exact: true })).not.toBeChecked();
  await expect(page.locator('canvas')).toBeVisible();
  await page.reload();
  await expect(paper).toContainText('محمد المالك بعد المراجعة');
  await expect(paper.locator('[data-agreement-section="specifications"]')).toContainText(number(270001));
  await expect(paper.locator('.document-company-signature')).toContainText('التوقيع المخوّل وختم الشركة');
  await expect(paper.locator('.document-company-signature bdi[dir="ltr"]')).toHaveText('2027-01-18');
  await expect(paper).toContainText('الاسم: ____________________ التاريخ: ____________________');
  await noOverflow(page);
  await paper.locator('[data-agreement-section="handover"]').screenshot({ path: testInfo.outputPath(`${locale}-filled-handover.png`) });
  await paper.locator('[data-agreement-section="annex"]').screenshot({ path: testInfo.outputPath(`${locale}-filled-annex.png`) });

  await page.emulateMedia({ media: 'print' });
  await expect(paper.locator('.document-header')).toBeVisible();
  await expect(paper.locator('.document-footer')).toBeVisible();
  await expect(page.getByRole('button', { name: term(locale, 'Complete contract details'), exact: true })).not.toBeVisible();
  const pdfPath = testInfo.outputPath(`${locale}-agreement-2027.pdf`);
  const bytes = await page.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: true });
  const printed = await PDFDocument.load(bytes); expect(printed.getPageCount()).toBeGreaterThanOrEqual(4);
  const extraction = JSON.parse(execFileSync('swift', ['-module-cache-path', resolve(directory, 'swift-cache'), resolve(bundleDirectory, 'extract-pdf.swift'), pdfPath], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })) as { pages: number; text: string };
  expect(extraction.pages).toBe(printed.getPageCount());
  expect(extraction.text).toContain('270,001'); expect(extraction.text).toContain('320,003');
  // PDFKit may reorder an isolated LTR date inside the RTL signature block;
  // the DOM assertion above and rendered PDF review verify its visual order.
  expect(extraction.text).toMatch(/2027-01-18|18-01-2027/);
  expect(normalized(extraction.text)).toContain(normalized('التوقيع المخوّل وختم الشركة'));
  expect(normalized(extraction.text)).toContain(normalized('الاسم:'));
  expect(normalized(extraction.text)).toContain(normalized('التاريخ:'));
  expect(extraction.text).not.toContain('Authorized signature');
  expect(extraction.text).not.toContain('Name:');
  expect(normalized(extraction.text)).toContain(normalized('محمد المالك بعد المراجعة'));
  expect(normalized(extraction.text)).toContain(normalized('التاسع عشر'));
  expect(normalized(extraction.text)).not.toContain(normalized('للمشاريع السكنية'));
  expect(normalized(extraction.text)).toContain(normalized('للمشاريع التجارية'));
  expect(normalized(extraction.text)).toContain(normalized('ملحق رقم'));
  writeFileSync(testInfo.outputPath(`${locale}-printed-text.json`), JSON.stringify(extraction, null, 2) + '\n');
  await page.emulateMedia({ media: 'screen' });
  expect(health.pageErrors).toEqual([]); expect(health.consoleErrors).toEqual([]); expect(health.unexpected).toEqual([]);
 });

 for (const kind of ['commercial', 'residential'] as const) for (const quantity of [1, 10]) test(`${locale}: ${kind} source contracts ${quantity === 1 ? 'below' : 'above'} 15 million display only the selected payment terms on screen and paper`, async ({ page }, testInfo) => {
  const state = fixture({ kind, quantity, canonical: true });
  if (quantity === 1) expect(state.flow.quotation.total).toBeLessThan(15000000);
  else expect(state.flow.quotation.total).toBeGreaterThan(15000000);
  const health = await mount(page, locale, state);
  const paper = page.locator('.commercial-document'), payments = paper.locator('[data-agreement-section="payments"]');
  await expectContractOpeningSchedule(page, state.flow.contract!);
  const layout = await compactLayout(page);
  expect(layout.pages.length).toBeLessThanOrEqual(7);
  await expect(paper.locator(`[data-contract-type="${kind}"]`)).toHaveAttribute('aria-checked', 'true');
  await expect(paper.locator(`[data-contract-type="${kind === 'commercial' ? 'residential' : 'commercial'}"]`)).toHaveAttribute('aria-checked', 'false');
  const artworkCount = await paper.locator('[data-agreement-artwork="print"]').count();
  expect(artworkCount).toBeGreaterThan(layout.pages.length);
  await expect(paper.locator('[data-agreement-artwork="screen"]:visible')).toHaveCount(artworkCount);
  await expect(paper.locator('[data-agreement-artwork="print"]:visible')).toHaveCount(0);
  await expect(paper.locator(`[data-agreement-band="payment-${kind}"]`)).toHaveCount(1);
  await expect(paper.locator(`[data-agreement-band="payment-${kind === 'commercial' ? 'residential' : 'commercial'}"]`)).toHaveCount(0);
  await expect(payments).toBeVisible();
  const stages = state.flow.contract!.agreement2027!.paymentSchedule;
  expect(stages.map(stage => stage.percent)).toEqual(quantity === 1 ? [100] : kind === 'residential' ? [50, 50] : [30, 20, 10, 20, 15, 5]);
  await expect(paper.locator('[data-agreement-field="contractAmount"]')).toContainText(number(state.flow.quotation.total));
  const selected = paper.locator(`[data-agreement-section="payments"][data-payment-schedule="${kind}"]`);
  const otherKind = kind === 'commercial' ? 'residential' : 'commercial';
  await expect(payments.locator(`[data-payment-schedule="${otherKind}"]`)).toHaveCount(0);
  await expect(selected.locator('[data-payment-stage]')).toHaveCount(stages.length);
  for (const stage of stages) await expect(selected).toContainText(`${stage.percent}%`);
  const selectedPolicy = kind === 'commercial' ? 'للمشاريع التجارية' : 'للمشاريع السكنية';
  const otherPolicy = kind === 'commercial' ? 'للمشاريع السكنية' : 'للمشاريع التجارية';
  await expect(paper.locator('[data-agreement-clause="3"]')).toContainText(selectedPolicy);
  await expect(paper.locator('[data-agreement-clause="3"]')).not.toContainText(otherPolicy);
  await expect(paper).not.toContainText('سكني وتجاري');
  await expect(paper).toContainText(number(270001));
  await expect(paper).toContainText(number(320003));
  const overflowingNumbers = await paper.locator('[data-agreement-field^="rate-"], [data-agreement-field="contractNumber"], [data-agreement-field="contractAmount"]').evaluateAll(fields => fields.filter(field => field.scrollWidth > field.clientWidth + 1 || field.scrollHeight > field.clientHeight + 1 || getComputedStyle(field).whiteSpace !== 'nowrap').map(field => ({ key: field.getAttribute('data-agreement-field'), text: field.textContent, width: field.clientWidth, scrollWidth: field.scrollWidth, height: field.clientHeight, scrollHeight: field.scrollHeight })));
  expect(overflowingNumbers).toEqual([]);
  await noOverflow(page);
  await readyArtwork(page);
  await paper.locator('[data-agreement-page="2"]').screenshot({ path: testInfo.outputPath(`${locale}-${kind}-selected-payments.png`) });
  const pdfPath = testInfo.outputPath(`${locale}-${kind}-selected-contract.pdf`);
  const bytes = await page.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: true });
  expect(bytes.byteLength, 'The printed contract must fit the existing signed-copy upload limit').toBeLessThanOrEqual(3 * 1024 * 1024);
  const printed = await PDFDocument.load(bytes);
  expect(printed.getPageCount()).toBeGreaterThanOrEqual(layout.pages.length + 1);
  writeFileSync(testInfo.outputPath(`${locale}-${kind}-compact-layout.json`), JSON.stringify(layout, null, 2) + '\n');
  const extraction = JSON.parse(execFileSync('swift', ['-module-cache-path', resolve(directory, 'swift-cache'), resolve(bundleDirectory, 'extract-pdf.swift'), pdfPath], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })) as { pages: number; text: string };
  // Original Arabic source glyphs remain vector paths. Dynamic system fields
  // remain actual text, which makes their filled PDF values independently verifiable.
  expect(normalized(extraction.text)).toContain(normalized(state.flow.contract!.project.name));
  expect(normalized(extraction.text)).toContain(normalized(state.flow.contract!.project.address!));
  expect(normalized(extraction.text)).toContain(normalized(state.flow.contract!.client.name));
  expect(extraction.text).toContain(state.flow.contract!.number);
  expect(health.pageErrors).toEqual([]); expect(health.consoleErrors).toEqual([]); expect(health.unexpected).toEqual([]);
 });

 test(`${locale}: source document fills saved project fields and retains reviewed edits after reopening`, async ({ page }) => {
  const state = fixture({ kind: 'residential', canonical: true });
  const before = structuredClone(state.flow.contract!);
  const posts: Record<string, unknown>[] = [];
  const health = await mount(page, locale, state, async (route, body) => {
   assert.equal(body.action, 'save-contract-details');
   assert.equal(body.revision, state.flow.revision);
   assert.equal(body.confirmed, true);
   assert.equal(Object.hasOwn(body, 'quotation'), false);
   assert.equal(Object.hasOwn(body, 'terms'), false);
   const details = body.details as Agreement2027Fields;
   state.flow = { ...state.flow, revision: state.flow.revision + 1, contract: { ...state.flow.contract!, agreement2027: { ...state.flow.contract!.agreement2027!, fields: structuredClone(details) } } };
   posts.push(body);
   return route.fulfill({ json: { flow: state.flow } });
  });
  const paper = page.locator('.commercial-document');
  const physicalPages = await paper.locator('[data-agreement-page]').count();
  expect(physicalPages).toBeGreaterThan(0);
  await expect(paper.locator('[data-agreement-page="1"] [data-agreement-field="contractDate"]')).toHaveCount(0);
  await expect(paper.locator('[data-agreement-field="contractDate"]')).toHaveText('15/01/2027');
  for (const text of [before.project.name, before.project.number, before.project.address!, before.number, before.client.name, before.client.mobile!, before.agreement2027!.fields.ownerName]) await expect(paper).toContainText(text);
  await page.getByRole('button', { name: term(locale, 'Complete contract details'), exact: true }).click();
  const editor = page.locator('[data-agreement-fields-form]');
  await expect(editor.locator('[name="agreement-ownerName"]')).toHaveValue(before.agreement2027!.fields.ownerName);
  await editor.locator('[name="agreement-ownerName"]').fill('المالك بعد تدقيق بيانات المشروع');
  await editor.locator('[name="agreement-consultantPhone"]').fill('07700000099');
  await editor.getByRole('button', { name: term(locale, 'Save contract details'), exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(posts).toHaveLength(1);
  await expect(paper).toContainText('المالك بعد تدقيق بيانات المشروع');
  await expect(paper).toContainText('07700000099');
  expect(state.flow.contract!.quotation).toEqual(before.quotation);
  expect(state.flow.contract!.terms).toEqual(before.terms);
  expect(state.flow.contract!.agreement2027!.documentLayout).toBe('source-pdf-2027');
  expect(state.flow.contract!.agreement2027!.paymentSchedule).toEqual(before.agreement2027!.paymentSchedule);
  await page.reload();
  await expect(paper).toContainText('المالك بعد تدقيق بيانات المشروع');
  await expect(paper.locator('[data-agreement-page]')).toHaveCount(physicalPages);
  await noOverflow(page);
  expect(health.pageErrors).toEqual([]); expect(health.consoleErrors).toEqual([]); expect(health.unexpected).toEqual([]);
 });

 test(`${locale}: unavailable project details stay blank until Indoor Sales enters and saves them`, async ({ page }, testInfo) => {
  const state = fixture({ canonical: true });
  const fields = state.flow.contract!.agreement2027!.fields;
  for (const key of ['consultantName', 'consultantPhone', 'contractorName', 'contractorPhone', 'email', 'handoverDate', 'advancePaidDate'] as const) fields[key] = '';
  const quotationBefore = structuredClone(state.flow.contract!.quotation);
  const termsBefore = structuredClone(state.flow.contract!.terms);
  let saves = 0;
  const health = await mount(page, locale, state, async (route, body) => {
   assert.equal(body.action, 'save-contract-details'); assert.equal(body.confirmed, true); assert.equal(body.revision, state.flow.revision);
   assert.equal(Object.hasOwn(body, 'quotation'), false); assert.equal(Object.hasOwn(body, 'terms'), false);
   state.flow = { ...state.flow, revision: state.flow.revision + 1, contract: { ...state.flow.contract!, agreement2027: { ...state.flow.contract!.agreement2027!, fields: structuredClone(body.details as Agreement2027Fields) } } };
   saves += 1; return route.fulfill({ json: { flow: state.flow } });
  });
  const paper = page.locator('.commercial-document');
  await expect(paper).toContainText(state.flow.contract!.project.name);
  await expect(paper).toContainText(state.flow.contract!.project.address!);
  await expect(paper.locator('[data-agreement-field="ownerName"]')).toContainText(fields.ownerName);
  for (const key of ['consultantName', 'consultantPhone', 'contractorName', 'contractorPhone', 'handoffDate', 'advancePaymentDate']) await expect(paper.locator(`[data-agreement-field="${key}"]`)).toHaveCount(0);
  await page.getByRole('button', { name: term(locale, 'Complete contract details'), exact: true }).click();
  const editor = page.locator('[data-agreement-fields-form]');
  for (const key of ['consultantName', 'consultantPhone', 'contractorName', 'contractorPhone', 'email', 'handoverDate', 'advancePaidDate']) await expect(editor.locator(`[name="agreement-${key}"]`)).toHaveValue('');
  await expect(editor.locator('[name="agreement-ownerName"]')).toHaveValue(fields.ownerName);
  await editor.locator('details').first().screenshot({ path: testInfo.outputPath(`${locale}-missing-contact-fields.png`) });
  await editor.locator('[name="agreement-consultantName"]').fill('استشاري المشروع المعتمد');
  await editor.locator('[name="agreement-consultantPhone"]').fill('07712345678');
  await editor.locator('[name="agreement-email"]').fill('manual-contact@example.invalid');
  await editor.locator('[name="agreement-directPhone"]').fill('');
  await editor.locator('[name="agreement-clientLegalName"]').fill('');
  await editor.locator('details').filter({ has: page.locator('[name="agreement-handoverDate"]') }).locator('summary').click();
  await editor.locator('[name="agreement-handoverDate"]').fill('2027-02-04');
  await editor.getByRole('button', { name: term(locale, 'Save contract details'), exact: true }).click();
  await expect(editor).toHaveCount(0); expect(saves).toBe(1);
  await expect(paper.locator('[data-agreement-field="consultantName"]')).toHaveText('استشاري المشروع المعتمد');
  await expect(paper.locator('[data-agreement-field="consultantPhone"]')).toHaveText('07712345678');
  await expect(paper.locator('[data-agreement-field="handoffDate"]')).toHaveText('04/02/2027');
  await expect(paper).toContainText('manual-contact@example.invalid');
  await expect(paper.locator('[data-agreement-field="firstPartyName"]')).toHaveCount(0);
  await expect(paper.locator('[data-agreement-field="officialContacts"]').first()).not.toContainText('07700000001');
  for (const key of ['contractorName', 'contractorPhone', 'advancePaymentDate']) await expect(paper.locator(`[data-agreement-field="${key}"]`)).toHaveCount(0);
  expect(state.flow.contract!.quotation).toEqual(quotationBefore); expect(state.flow.contract!.terms).toEqual(termsBefore);
  await page.reload();
  await expect(paper.locator('[data-agreement-field="consultantName"]')).toHaveText('استشاري المشروع المعتمد');
  await expect(paper.locator('[data-agreement-field="handoffDate"]')).toHaveText('04/02/2027');
  await page.getByRole('button', { name: term(locale, 'Complete contract details'), exact: true }).click();
  await expect(editor.locator('[name="agreement-consultantPhone"]')).toHaveValue('07712345678');
  await expect(editor.locator('[name="agreement-email"]')).toHaveValue('manual-contact@example.invalid');
  await expect(editor.locator('[name="agreement-contractorName"]')).toHaveValue('');
  await expect(editor.locator('[name="agreement-directPhone"]')).toHaveValue('');
  await expect(editor.locator('[name="agreement-clientLegalName"]')).toHaveValue('');
  await editor.locator('details').first().screenshot({ path: testInfo.outputPath(`${locale}-saved-manual-fields.png`) });
  await noOverflow(page);
  expect(health.pageErrors).toEqual([]); expect(health.consoleErrors).toEqual([]); expect(health.unexpected).toEqual([]);
 });

 test(`${locale}: source signatures and saved signer dates remain inside the relocated original signature boxes`, async ({ page }, testInfo) => {
  const signature = await page.evaluate(() => {
   const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 100;
   const context = canvas.getContext('2d')!;
   context.strokeStyle = '#173f83'; context.lineWidth = 3; context.beginPath();
   context.moveTo(15, 70); context.bezierCurveTo(80, 10, 60, 100, 135, 40); context.bezierCurveTo(180, 15, 145, 90, 260, 35); context.stroke();
   return canvas.toDataURL('image/png');
  });
  const state = fixture({ kind: 'commercial', signed: true, canonical: true });
  const fields = state.flow.contract!.agreement2027!.fields;
  fields.companyRepresentativeSignature = signature;
  fields.companyRepresentativeDate = '2027-01-18';
  state.flow.evidence = { method: 'digital', signer: 'صاحب المشروع الموقع', signature };
  const before = structuredClone(state.flow);
  const health = await mount(page, locale, state);
  const paper = page.locator('.commercial-document');
  await expectContractOpeningSchedule(page, before.contract!);
  const layout = await compactLayout(page);
  const signatureBand = paper.locator('[data-agreement-band="formal-signatures"]');
  const signingPage = signatureBand.locator('xpath=ancestor::*[@data-agreement-page]');
  const offsetY = Number(await signatureBand.getAttribute('data-agreement-band-top')) - Number((await signatureBand.getAttribute('data-agreement-band-source-rect'))!.split(',')[1]);
  await expect(signingPage.locator('[data-agreement-field="companySignature"] img')).toBeVisible();
  await expect(signingPage.locator('[data-agreement-field="clientSignature"] img')).toBeVisible();
  await expect(signingPage.locator('[data-agreement-field="companySignature"]')).toContainText('18/01/2027');
  await expect(signingPage.locator('[data-agreement-field="clientSignature"]')).toContainText('16/01/2027');
  await expect(paper.locator('[data-agreement-page="1"] [data-agreement-field="contractDate"]')).toHaveText('16/01/2027');
  expect(await paper.locator('[data-agreement-field="contractDate"]').allTextContents()).toEqual(['16/01/2027', '15/01/2027']);
  const verifyBoxes = async () => {
   const bounds = await signingPage.evaluate(page => {
    const pageRect = page.getBoundingClientRect();
    // The original PDF drawing outlines are independent of our overlay
    // metadata: company y=677.38..727.06pt, client y=676.42..726.10pt.
    return (['companySignature', 'clientSignature'] as const).flatMap(key => {
     const container = page.querySelector(`[data-agreement-field="${key}"]`)!;
     return [container, ...container.querySelectorAll('img, p')].map(element => {
      const rect = element.getBoundingClientRect();
      return { key, element: element.tagName, top: (rect.top - pageRect.top) / pageRect.height * 841.92, bottom: (rect.bottom - pageRect.top) / pageRect.height * 841.92 };
     });
    });
   });
   for (const bound of bounds) {
    const [sourceTop, sourceBottom] = bound.key === 'companySignature' ? [677.38, 727.06] : [676.42, 726.10];
    const top = sourceTop + offsetY, bottom = sourceBottom + offsetY;
    expect(bound.top, `${bound.key} ${bound.element} starts inside its original box`).toBeGreaterThanOrEqual(top - 0.2);
    expect(bound.bottom, `${bound.key} ${bound.element} ends inside its original box`).toBeLessThanOrEqual(bottom + 0.2);
   }
  };
  await verifyBoxes();
  await readyArtwork(page);
  await page.emulateMedia({ media: 'print' });
  await verifyBoxes();
  await expect(paper.locator('[data-agreement-page]')).toHaveCount(layout.pages.length);
  await expect(paper.locator('[data-agreement-artwork="screen"]:visible')).toHaveCount(0);
  await expect(paper.locator('[data-agreement-artwork="print"]:visible')).toHaveCount(await paper.locator('[data-agreement-artwork="print"]').count());
  await expect(paper.locator('[data-agreement-page-kind="annex"] [data-agreement-artwork="print"]')).toHaveAttribute('src', '/contracts/agreement-2027/page-7.svg');
  const pdfPath = testInfo.outputPath(`${locale}-signed-source-contract.pdf`);
  const bytes = await page.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: true });
  expect(bytes.byteLength, 'The signed contract must fit the existing signed-copy upload limit').toBeLessThanOrEqual(3 * 1024 * 1024);
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(layout.pages.length + 1);
  const extraction = JSON.parse(execFileSync('swift', ['-module-cache-path', resolve(directory, 'swift-cache'), resolve(bundleDirectory, 'extract-pdf.swift'), pdfPath], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })) as { text: string };
  expect(normalized(extraction.text)).toContain(normalized(fields.companyRepresentativeName));
  expect(normalized(extraction.text)).toContain(normalized(state.flow.evidence.signer));
  expect(extraction.text).toContain('18/01/2027');
  expect(extraction.text).toContain('16/01/2027');
  expect(state.flow).toEqual(before);
  expect(health.pageErrors).toEqual([]); expect(health.consoleErrors).toEqual([]); expect(health.unexpected).toEqual([]);
 });

 test(`${locale}: source printing waits for every artwork image and reports decode failures without printing`, async ({ page }) => {
  const health = await mount(page, locale, fixture({ canonical: true }));
  const artworkCount = await page.locator('.commercial-document img').count();
  expect(artworkCount).toBeGreaterThan(0);
  type PrintState = { calls: number; decoded: string[]; pending: (() => void)[]; fontsLoadedAtPrint: boolean; imagesReadyAtPrint: boolean };
  await page.evaluate(() => {
   const target = window as typeof window & { contractPrintTest: PrintState };
   target.contractPrintTest = { calls: 0, decoded: [], pending: [], fontsLoadedAtPrint: false, imagesReadyAtPrint: false };
   const originalDecode = HTMLImageElement.prototype.decode;
   HTMLImageElement.prototype.decode = function (this: HTMLImageElement) {
    return new Promise<void>((accept, reject) => target.contractPrintTest.pending.push(() => originalDecode.call(this).then(() => {
     target.contractPrintTest.decoded.push(this.currentSrc); accept();
    }, reject)));
   };
   window.print = () => {
    const state = target.contractPrintTest; state.calls += 1;
    state.fontsLoadedAtPrint = document.fonts.status === 'loaded';
    state.imagesReadyAtPrint = [...document.querySelectorAll<HTMLImageElement>('.commercial-document img')].every(image => image.complete && image.naturalWidth > 0 && state.decoded.includes(image.currentSrc));
   };
  });
  await page.getByRole('button', { name: term(locale, 'Print contract'), exact: true }).click();
  await expect(page.getByRole('button', { name: locale === 'ar' ? 'جارٍ تجهيز العقد…' : 'Preparing contract…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: term(locale, 'Complete contract details'), exact: true })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: term(locale, 'Client signer’s full name') })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { contractPrintTest: PrintState }).contractPrintTest.pending.length)).toBe(artworkCount);
  expect(await page.evaluate(() => (window as typeof window & { contractPrintTest: PrintState }).contractPrintTest.calls)).toBe(0);
  await page.evaluate(() => { for (const release of (window as typeof window & { contractPrintTest: PrintState }).contractPrintTest.pending.splice(0)) release(); });
  await expect.poll(() => page.evaluate(() => (window as typeof window & { contractPrintTest: PrintState }).contractPrintTest.calls)).toBe(1);
  expect(await page.evaluate(() => {
   const state = (window as typeof window & { contractPrintTest: PrintState }).contractPrintTest;
   return { fontsLoaded: state.fontsLoadedAtPrint, imagesReady: state.imagesReadyAtPrint, decodedImages: state.decoded.length };
  })).toEqual({ fontsLoaded: true, imagesReady: true, decodedImages: artworkCount });
  await expect(page.getByRole('button', { name: term(locale, 'Print contract'), exact: true })).toBeEnabled();
  await page.evaluate(() => { HTMLImageElement.prototype.decode = () => Promise.reject(new Error('Fixture artwork decoding failed')); });
  await page.getByRole('button', { name: term(locale, 'Print contract'), exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(locale === 'ar' ? 'تعذر تجهيز العقد كاملاً للطباعة' : 'The complete contract could not be prepared for printing');
  expect(await page.evaluate(() => (window as typeof window & { contractPrintTest: PrintState }).contractPrintTest.calls)).toBe(1);
  await expect(page.getByRole('button', { name: term(locale, 'Print contract'), exact: true })).toBeEnabled();
  expect(health.pageErrors).toEqual([]); expect(health.consoleErrors).toEqual([]); expect(health.unexpected).toEqual([]);
 });

 test(`${locale}: unsigned source contracts switch between selected payment policies without losing manual details or approved prices`, async ({ page }) => {
  const state = fixture({ kind: 'residential', canonical: true });
  const before = structuredClone(state.flow.contract!);
  const posts: Record<string, unknown>[] = [];
  const health = await mount(page, locale, state, async (route, body) => {
   assert.equal(body.action, 'change-contract-template'); assert.equal(body.revision, state.flow.revision); assert.equal(body.confirmed, true);
   assert.ok(body.template === 'residential' || body.template === 'commercial');
   assert.deepEqual(Object.keys(body).sort(), ['action', 'confirmed', 'revision', 'template']);
   const contract = state.flow.contract!;
   const agreement = buildAgreement2027Snapshot(contract.quotation, body.template, contract.agreement2027!.fields, contract.agreement2027!.openingSpecifications);
   state.flow = { ...state.flow, revision: state.flow.revision + 1, contract: { ...contract, template: body.template, terms: agreement2027Terms(body.template), agreement2027: agreement } };
   posts.push(body);
   return route.fulfill({ json: { flow: state.flow } });
  });
  const paper = page.locator('.commercial-document');
  for (const kind of ['commercial', 'residential'] as const) {
   await page.getByRole('button', { name: term(locale, 'Client signed hard copy'), exact: true }).click();
   await page.getByRole('textbox', { name: term(locale, 'Client signer’s full name'), exact: true }).fill('Unsigned draft consent');
   await page.getByRole('checkbox', { name: term(locale, 'I confirm the client has signed the complete printed contract shown above.'), exact: true }).check();
   await page.getByRole('button', { name: term(locale, 'Change contract type'), exact: true }).click();
   const editor = page.getByRole('region', { name: term(locale, 'Change contract type'), exact: true });
   await editor.getByRole('combobox', { name: term(locale, 'Contract type'), exact: true }).selectOption(kind);
   await editor.getByRole('button', { name: term(locale, 'Save contract type'), exact: true }).click();
   await expect(editor).toHaveCount(0);
   await expect(paper.locator(`[data-contract-type="${kind}"]`)).toHaveAttribute('aria-checked', 'true');
   const other = kind === 'commercial' ? 'residential' : 'commercial';
   await expect(paper.locator(`[data-agreement-band="payment-${kind}"]`)).toHaveCount(1);
   await expect(paper.locator(`[data-agreement-band="payment-${other}"]`)).toHaveCount(0);
   const saved = state.flow.contract!;
   expect(saved.agreement2027!.paymentSchedule.map(stage => stage.percent)).toEqual(kind === 'commercial' ? [30, 20, 10, 20, 15, 5] : [50, 50]);
   expect(saved.agreement2027!.fields).toEqual(before.agreement2027!.fields);
   expect(saved.agreement2027!.openingSpecifications).toEqual(before.agreement2027!.openingSpecifications);
   expect(saved.quotation).toEqual(before.quotation);
   expect(saved.agreement2027!.documentLayout).toBe(before.agreement2027!.documentLayout);
   expect(saved.agreement2027!.selectedProductsOnly).toBe(before.agreement2027!.selectedProductsOnly);
   expect(saved.agreement2027!.compactLayout).toBe(before.agreement2027!.compactLayout);
   expect(state.flow.signed_at).toBeNull(); expect(state.flow.evidence).toBeNull();
   await expect(page.getByRole('textbox', { name: term(locale, 'Client signer’s full name') })).toHaveValue('');
   await expect(page.getByRole('checkbox', { name: term(locale, 'I confirm that I have read and agree to the contract, including all openings, prices, and terms.'), exact: true })).not.toBeChecked();
   await expect(page.locator('canvas')).toBeVisible();
   await expect(paper).toContainText(before.agreement2027!.fields.ownerName);
   await page.reload();
   await expect(paper.locator(`[data-agreement-band="payment-${kind}"]`)).toHaveCount(1);
  }
  expect(posts).toHaveLength(2);
  await noOverflow(page);
  expect(health.pageErrors).toEqual([]); expect(health.consoleErrors).toEqual([]); expect(health.unexpected).toEqual([]);
 });

 test(`${locale}: a historical unified contract retains both policies and exposes no type correction`, async ({ page }) => {
  const state = fixture({ kind: 'unified' });
  const before = structuredClone(state.flow);
  const health = await mount(page, locale, state);
  await expect(page.locator('[data-payment-schedule="residential"]')).toHaveCount(1);
  await expect(page.locator('[data-payment-schedule="commercial"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: term(locale, 'Change contract type'), exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: term(locale, 'Complete contract details'), exact: true })).toBeEnabled();
  expect(state.flow).toEqual(before);
  expect(health.pageErrors).toEqual([]); expect(health.consoleErrors).toEqual([]); expect(health.unexpected).toEqual([]);
 });

 test(`${locale}: an uploaded signed source contract keeps its download link outside the printed contract pages`, async ({ page }) => {
  const state = fixture({ kind: 'residential', canonical: true, signed: true });
  state.flow.evidence = { method: 'upload', signer: 'صاحب النسخة الموقعة', path: 'fixture/signed-copy.pdf', fileName: 'signed-copy.pdf' };
  const before = structuredClone(state.flow);
  const health = await mount(page, locale, state);
  const download = page.getByRole('link', { name: term(locale, 'Download signed copy'), exact: true });
  await expect(download).toBeVisible();
  await expect(download).toHaveAttribute('href', endpoint + '?download=signed');
  const paper = page.locator('.commercial-document');
  const physicalPages = await paper.locator('[data-agreement-page]').count();
  expect(physicalPages).toBeGreaterThan(0);
  await expect(paper.locator('a')).toHaveCount(0);
  await expect(page.getByRole('button', { name: term(locale, 'Complete contract details'), exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: term(locale, 'Print contract'), exact: true })).toBeEnabled();
  await page.emulateMedia({ media: 'print' });
  await expect(download).not.toBeVisible();
  await expect(paper.locator('[data-agreement-page]')).toHaveCount(physicalPages);
  await expect(paper.locator('[data-agreement-page]').last()).toBeVisible();
  expect(state.flow).toEqual(before);
  expect(health.pageErrors).toEqual([]); expect(health.consoleErrors).toEqual([]); expect(health.unexpected).toEqual([]);
 });

 test(`${locale}: signed and legacy contracts retain their saved document and expose no unsafe 2027 editor`, async ({ page }) => {
  const state = fixture({ kind: 'commercial', signed: true });
  // Preserve a contract issued before the payment policy changed.
  let allocated = 0;
  const savedPercentages = [30, 20, 10, 20, 15, 5];
  state.flow.contract!.agreement2027!.paymentSchedule = savedPercentages.map((percent, index) => {
   const amount = index === savedPercentages.length - 1 ? state.flow.quotation.total - allocated : Math.round(state.flow.quotation.total * percent / 100);
   allocated += amount;
   return { id: `historical-${index}`, label: `الدفعة المحفوظة ${index + 1}`, percent, amount, trigger: 'موعد الدفعة المحفوظ في العقد الموقع' };
  });
  state.flow.contract!.agreement2027!.readiness.measurement = ['شرط جاهزية محفوظ في العقد الموقع'];
  state.flow.contract!.agreement2027!.specificationNotes = ['ملاحظة مواصفات محفوظة في العقد الموقع'];
  const original = structuredClone(state.flow.contract!);
  const health = await mount(page, locale, state);
  const paper = page.locator('.commercial-document');
  await expect(paper.locator('[data-agreement-clause]')).toHaveCount(19);
  await expect(page.getByRole('button', { name: term(locale, 'Complete contract details'), exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: term(locale, 'Change contract type'), exact: true })).toHaveCount(0);
  await expect(paper).toContainText('صاحب العقد الموقع');
  await expect(paper).toContainText('شرط جاهزية محفوظ في العقد الموقع');
  await expect(paper).toContainText('ملاحظة مواصفات محفوظة في العقد الموقع');
  await expect(paper.locator('[data-payment-stage]')).toHaveCount(6);
  await expect(paper).toContainText('موعد الدفعة المحفوظ في العقد الموقع');
  await page.reload(); await expect(paper).toContainText('صاحب العقد الموقع'); expect(state.flow.contract).toEqual(original);
  const legacy = fixture({ legacy: true }); state.project = legacy.project; state.flow = legacy.flow;
  const legacyBefore = structuredClone(state.flow.contract!);
  await page.reload();
  await expect(paper).toBeVisible();
  await expect(paper.locator('[data-agreement-clause]')).toHaveCount(0);
  await expect(paper.locator('[data-agreement-section="handover"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: term(locale, 'Complete contract details'), exact: true })).toHaveCount(0);
  await expect(paper.locator('.document-terms h4')).toHaveCount(legacyBefore.terms.length);
  expect(state.flow.contract).toEqual(legacyBefore);
  await noOverflow(page);
  expect(health.pageErrors).toEqual([]); expect(health.consoleErrors).toEqual([]); expect(health.unexpected).toEqual([]);
 });
}
