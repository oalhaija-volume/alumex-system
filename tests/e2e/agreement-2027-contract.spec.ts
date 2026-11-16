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

function fixture({ kind = 'commercial', quantity = 10, legacy = false, signed = false }: { kind?: 'residential' | 'commercial'; quantity?: number; legacy?: boolean; signed?: boolean } = {}): Fixture {
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
 const contract: ContractSnapshot = {
  number: 'CT-PRJ-2027-FIXTURE-4', createdAt: '2027-01-15T09:00:00Z', createdBy: actorId, template: kind, branch: 'Rasafa',
  client: { name: 'محمد صاحب المشروع', mobile: '07700000000', client_type: 'company' },
  project: { name: 'مشروع العقد المعتمد 2027', number: 'PRJ-2027-FIXTURE', address: 'بغداد / حي البلديات / عنوان المشروع الأصلي', branch: 'Rasafa' },
  quotation: structuredClone(quotation), terms: legacy ? structuredClone(legacyTerms[kind]) : agreement2027Terms(kind),
  ...(legacy ? {} : { agreement2027: agreement }),
 };
 return {
  project: { id: projectId, project_name: contract.project.name, project_number: contract.project.number, address: contract.project.address!, branch: 'Rasafa', sales_status: signed ? 'transferred_to_operations' : 'contract_generated', additional_openings_state: null, created_by: actorId, registeredBy: 'Indoor employee', created_at: '2027-01-12T07:00:00Z', updated_at: '2027-01-15T09:00:00Z' },
  flow: { project_id: projectId, revision: 4, stage: signed ? 'signed' : 'contract', quotation, contract, signed_at: signed ? '2027-01-16T09:00:00Z' : null, evidence: signed ? { method: 'hard_copy', signer: 'صاحب العقد الموقع' } : null, accepted_at: null, accepted_by: null },
 };
}

// The bundle comes from current source; the live dev server supplies only CSS
// and public brand assets. Server authorization/RPC tests are separate checks.
test.beforeAll(async ({ request }, testInfo) => {
 directory = resolve(testInfo.outputPath('contract-tools'));
 bundleDirectory = resolve(directory, 'component');
 mkdirSync(bundleDirectory, { recursive: true });
 const entry = resolve(bundleDirectory, 'entry.tsx'), loader = resolve(bundleDirectory, 'typescript-loader.cjs');
 writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {ContractWorkspace} from '@/components/workflow/ContractWorkspace';createRoot(document.getElementById('root')!).render(<I18nProvider><ContractWorkspace projectId="${projectId}"/></I18nProvider>);`);
 writeFileSync(loader, "const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};");
 const require = createRequire(resolve('package.json'));
 const { webpack } = require('next/dist/compiled/webpack/webpack') as { webpack: ((config: Record<string, unknown>, callback: (error: Error | null, stats?: { hasErrors(): boolean; toString(options: Record<string, unknown>): string }) => void) => void) & { DefinePlugin: new (values: Record<string, string>) => unknown } };
 await new Promise<void>((accept, reject) => webpack({ mode: 'production', target: 'web', context: process.cwd(), entry, output: { path: bundleDirectory, filename: 'contract-component.js' }, resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] }, plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })], optimization: { minimize: false }, performance: { hints: false } }, (error, stats) => error ? reject(error) : !stats || stats.hasErrors() ? reject(new Error(stats?.toString({ all: false, errors: true }) ?? 'Contract component unavailable')) : accept()));
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

for (const locale of ['en', 'ar'] as const) {
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
  for (const stage of before.agreement2027!.paymentSchedule) await expect(payments).toContainText(number(stage.amount));
  expect(before.agreement2027!.paymentSchedule.map(stage => stage.percent)).toEqual([25, 25, 25, 15, 10]);
  expect(before.agreement2027!.paymentSchedule.reduce((sum, stage) => sum + stage.amount, 0)).toBe(before.quotation.total);
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
  expect(normalized(extraction.text)).toContain(normalized('ملحق رقم'));
  writeFileSync(testInfo.outputPath(`${locale}-printed-text.json`), JSON.stringify(extraction, null, 2) + '\n');
  await page.emulateMedia({ media: 'screen' });
  expect(health.pageErrors).toEqual([]); expect(health.consoleErrors).toEqual([]); expect(health.unexpected).toEqual([]);
 });

 test(`${locale}: commercial contracts below 15 million retain 100 percent upfront`, async ({ page }, testInfo) => {
  const state = fixture({ quantity: 1 });
  expect(state.flow.quotation.total).toBeLessThan(15000000);
  const health = await mount(page, locale, state);
  const paper = page.locator('.commercial-document'), payments = paper.locator('[data-agreement-section="payments"]');
  await expect(payments).toBeVisible();
  expect(state.flow.contract!.agreement2027!.paymentSchedule.map(stage => stage.percent)).toEqual([100]);
  await expect(payments).toContainText(number(state.flow.quotation.total));
  await expect(payments.locator('[data-payment-stage]')).toHaveCount(1);
  await expect(payments.locator('[data-payment-stage]')).toContainText('100%');
  await expect(paper.locator('[data-agreement-section="specifications"]')).toContainText(number(270001));
  await expect(paper.locator('[data-agreement-section="specifications"]')).toContainText(number(320003));
  await noOverflow(page);
  await payments.screenshot({ path: testInfo.outputPath(`${locale}-upfront-100-percent.png`) });
  expect(health.pageErrors).toEqual([]); expect(health.consoleErrors).toEqual([]); expect(health.unexpected).toEqual([]);
 });

 test(`${locale}: signed and legacy contracts retain their saved document and expose no unsafe 2027 editor`, async ({ page }) => {
  const state = fixture({ signed: true });
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
