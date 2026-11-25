import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { messagesByLocale } from '../../src/lib/i18n';
import { translateTerm } from '../../src/lib/i18nFormatting';
import { emptyAgreement2027Fields, buildAgreement2027Snapshot } from '../../src/lib/contracts/agreement2027';
import { agreement2027Terms } from '../../src/lib/contracts/agreement2027Content';
import { priceQuotation, type CatalogItem, type MeasuredOpening } from '../../src/lib/workflow/pricing';
import type { ContractSnapshot, SalesFlow } from '../../src/lib/workflow/types';

// Browser plugin unavailable. Real page components, local styles and assets are
// mounted with isolated API fixtures; no authenticated business data is touched.
const output = resolve('.next/cache/document-only-print-20261125');
const projectId = '11111111-1111-4111-8111-111111111111';
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'Indoor Sales', name: 'PRIVATE EMPLOYEE SHELL NAME', branch: 'Karkh' };
const project = { id: projectId, branch: 'Karkh', project_name: 'Client document project', project_number: 'PRJ-CLIENT-DOCUMENT', address: 'Baghdad', structure_readiness: 'ready', sales_status: 'quotation_in_progress', created_by: actor.id, registeredBy: actor.name, created_at: '2026-11-25T08:00:00Z', updated_at: '2026-11-25T10:00:00Z' };
const openings: MeasuredOpening[] = [
  { id: 'sliding-opening', floor: 'GF', room: 'Office', width: 100, height: 100, quantity: 2, opening_type: 'Window', opening_direction: 'Sliding' },
  { id: 'hinged-opening', floor: 'F1', room: 'Bedroom', width: 100, height: 150, quantity: 1, opening_type: 'Window', opening_direction: 'Hinged' },
];
const catalog: CatalogItem[] = [{ id: 'system', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true }];
const quote = { ...priceQuotation(openings, openings.map(opening => ({ openingId: opening.id, systemId: 'system', glassId: '', extras: [] })), catalog, actor.id), version: 1, createdAt: '2026-11-25T10:00:00Z' };
const fields = emptyAgreement2027Fields();
Object.assign(fields, { clientLegalName: 'Approved document client', ownerName: 'Approved document client', companyRepresentativeName: 'APPROVED COMPANY SIGNER', companyRepresentativeTitle: 'Authorized representative', companyRepresentativeDate: '2026-11-25', salesEngineerName: 'APPROVED SALES SIGNER', ownerPhone: '07000000000', directPhone: '07000000000' });
fields.approvals.salesEngineer.name = 'APPROVED SALES SIGNER';
fields.approvals.projectsManager.name = 'APPROVED PROJECT SIGNER';
const contract: ContractSnapshot = { number: 'CT-CLIENT-DOCUMENT', createdAt: quote.createdAt, createdBy: actor.id, template: 'residential', branch: 'Karkh',
  client: { name: 'Approved document client', mobile: '07000000000', client_type: 'individual' }, project: { name: project.project_name, number: project.project_number, address: project.address, branch: 'Karkh' }, quotation: quote,
  terms: agreement2027Terms('residential'), agreement2027: buildAgreement2027Snapshot(quote, 'residential', fields, openings.map(opening => ({ openingId: opening.id, aluminumColor: 'برونزي', glassColor: 'شفاف', bottomFrame: '', notes: '' }))),
};
const outsideLabels = ['PRIVATE ROOT STATUS WIDGET', 'PRIVATE FOOTER WIDGET', 'PRIVATE EDITOR MESSAGE', 'PRIVATE EDITOR INPUT VALUE'];
const isolation = /body:has\(\.commercial-document\):not\(:has\(\.follow-up-print-document\)\)\s+:not\(\.commercial-document,\s*\.commercial-document \*,\s*:has\(\.commercial-document\)\)\s*\{\s*display:\s*none\s*!important;\s*\}/g;
let bundle = '', stylesheet = '', baseline = '';

test.beforeAll(async ({ request }) => {
  test.setTimeout(60000);
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {RegistrationShell} from '@/components/intake/RegistrationShell';import {QuotationWorkspace} from '@/components/workflow/QuotationWorkspace';import {ContractWorkspace} from '@/components/workflow/ContractWorkspace';const contract=location.pathname.startsWith('/contract/');createRoot(document.getElementById('root')!).render(<I18nProvider><aside data-private-print-widget="root">${outsideLabels[0]}</aside><RegistrationShell role="Indoor Sales" userName="${actor.name}">{contract?<ContractWorkspace projectId="${projectId}"/>:<QuotationWorkspace projectId="${projectId}"/>}</RegistrationShell><footer data-private-print-widget="footer">${outsideLabels[1]}</footer></I18nProvider>);`);
  writeFileSync(resolve(output, 'navigation.ts'), 'export function usePathname(){return window.location.pathname;}');
  writeFileSync(resolve(output, 'typescript-loader.cjs'), "const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};");
  writeFileSync(resolve(output, 'css-module-loader.cjs'), "module.exports=function(source){const names=[...source.matchAll(/\\.([a-zA-Z_][\\w-]*)/g)].map(match=>match[1]);const css=source.replace(/:global\\(([^)]+)\\)/g,'$1');return 'const sheet=document.createElement(\"style\");sheet.textContent='+JSON.stringify(css)+';document.head.appendChild(sheet);export default '+JSON.stringify(Object.fromEntries(names.map(name=>[name,name])))+';';};");
  // Same existing PDFKit extraction pattern as agreement-2027-contract.spec.ts.
  writeFileSync(resolve(output, 'extract-pdf.swift'), 'import Foundation\nimport PDFKit\nlet document = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!\nlet result: [String: Any] = ["pages": document.pageCount, "text": document.string ?? ""]\nlet data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])\nprint(String(data: data, encoding: .utf8)!)\n');
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack') as { webpack: ((config: Record<string, unknown>, callback: (error: Error | null, stats?: { hasErrors(): boolean; toString(options: Record<string, unknown>): string }) => void) => void) & { DefinePlugin: new (values: Record<string, string>) => unknown } };
  await new Promise<void>((accept, reject) => webpack({ mode: 'production', target: 'web', context: process.cwd(), devtool: false,
    entry: resolve(output, 'entry.tsx'), output: { path: output, filename: 'commercial-print.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src'), 'next/navigation$': resolve(output, 'navigation.ts') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [resolve(output, 'typescript-loader.cjs')] }, { test: /\.module\.css$/, use: [resolve(output, 'css-module-loader.cjs')] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })], optimization: { minimize: false }, performance: { hints: false },
  }, (error, stats) => error ? reject(error) : !stats || stats.hasErrors() ? reject(new Error(stats?.toString({ all: false, errors: true }) ?? 'Print fixture unavailable')) : accept()));
  bundle = readFileSync(resolve(output, 'commercial-print.js'), 'utf8');
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  const links = [...(await login.text()).matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map(match => match[1].replaceAll('&amp;', '&'));
  expect(links.length).toBeGreaterThan(0);
  stylesheet = (await Promise.all(links.map(async link => { const response = await request.get(link); expect(response.status()).toBe(200); return response.text(); }))).join('\n');
  // Prefer the captured before-change app stylesheet locally. Other machines
  // derive the identical baseline by removing only the new isolation rule.
  baseline = existsSync(resolve(output, 'baseline.css')) ? readFileSync(resolve(output, 'baseline.css'), 'utf8') : stylesheet.replace(isolation, '');
  expect(stylesheet.match(isolation)).toHaveLength(1);
});

async function documentLayout(page: Page) {
  return page.locator('.commercial-document').evaluate(root => {
    const paperBounds = root.getBoundingClientRect();
    const elements = [root, ...root.querySelectorAll('header,h1,h2,h3,h4,table,col,thead,tr,th,td,.document-total,.document-parties,.document-footer,[data-agreement-page],[data-agreement-company-signature]')];
    return { html: root.innerHTML, metrics: elements.map(element => {
      const style = getComputedStyle(element), bounds = element.getBoundingClientRect();
      const rendered = bounds.width !== 0 || bounds.height !== 0;
      return { tag: element.tagName, x: rendered ? bounds.x - paperBounds.x : 0, y: rendered ? bounds.y - paperBounds.y : 0, width: bounds.width, height: bounds.height, display: style.display, font: style.fontFamily, size: style.fontSize, weight: style.fontWeight, lineHeight: style.lineHeight,
        padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft], direction: style.direction, columns: style.gridTemplateColumns, tableLayout: style.tableLayout };
    }) };
  });
}

function pdfText(path: string) {
  if (process.platform !== 'darwin') return null;
  return JSON.parse(execFileSync('swift', ['-module-cache-path', resolve(output, 'swift-cache'), resolve(output, 'extract-pdf.swift'), path], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })) as { pages: number; text: string };
}

for (const locale of ['en', 'ar'] as const) for (const kind of ['quotation', 'contract'] as const) test(`${locale}: printing ${kind} isolates only the document and preserves its original layout`, async ({ page }, testInfo) => {
  const failures: string[] = [], unexpected: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  const term = (value: string) => translateTerm(locale, value);
  const pathname = `/${kind}/${projectId}`;
  const flow: SalesFlow = { project_id: projectId, revision: 1, stage: kind === 'contract' ? 'contract' : 'quotation', quotation: quote, contract: kind === 'contract' ? contract : null, signed_at: null, evidence: null, accepted_at: null, accepted_by: null };
  await page.addInitScript(locale => localStorage.setItem('alumex_locale', locale), locale);
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== 'http://localhost:3003') { unexpected.push(`${request.method()} ${url.origin}`); return route.abort('blockedbyclient'); }
    if (url.pathname === pathname && request.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${messagesByLocale[locale].app.title}</title><style id="app-print-style">${baseline}</style></head><body><div id="root"></div><script src="/qa/commercial-print.js"></script></body></html>` });
    if (url.pathname === '/qa/commercial-print.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    if (request.method() !== 'GET') { unexpected.push(`${request.method()} ${url.pathname}`); return route.fulfill({ status: 405, json: { error: 'Unexpected business write blocked' } }); }
    if (url.pathname === '/api/offline' && url.searchParams.has('session')) return route.fulfill({ json: { actor } });
    if (url.pathname === `/api/sales-flow/${projectId}`) return route.fulfill({ headers: { 'X-Alumex-Actor': actor.id }, json: { project: { ...project, sales_status: kind === 'contract' ? 'contract_generated' : project.sales_status }, client: contract.client, openings, catalog, flow, history: [] } });
    if (url.pathname === '/api/workspace') return route.fulfill({ json: { actor, projects: [project], indoorSales: [{ ...actor }], outdoorSales: [] } });
    if (url.pathname === '/api/notifications') return route.fulfill({ json: { userId: actor.id, role: actor.role, notifications: [], unreadCount: 0 } });
    if (url.pathname.startsWith('/api/measurement-reports/')) return route.fulfill({ json: { reports: [] } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: { error: 'Fixture endpoint unavailable' } });
    return route.continue();
  });
  await page.goto(pathname);
  const paper = page.locator('.commercial-document');
  await expect(page).toHaveTitle(messagesByLocale[locale].app.title);
  await expect(paper).toBeVisible();
  await expect(page.getByRole('button', { name: term(kind === 'contract' ? 'Print contract' : 'Print quotation'), exact: true })).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.commercial-document img')).map(image => image.decode())); });
  await paper.evaluate((element, labels) => {
    const message = document.createElement('aside'); message.setAttribute('data-private-print-widget', 'editor'); message.textContent = labels[0];
    const field = document.createElement('input'); field.setAttribute('aria-label', labels[1]); field.value = labels[1]; field.setAttribute('data-private-print-widget', 'input');
    element.before(message, field);
  }, [outsideLabels[2], outsideLabels[3]]);
  for (const label of outsideLabels.slice(0, 3)) await expect(page.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: outsideLabels[3], exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('screen-with-operational-widgets.png'), fullPage: true });

  await page.emulateMedia({ media: 'print' });
  // Before-change CSS proves ordinary future widgets leak; this test does not
  // depend on each UI author remembering to add print:hidden individually.
  for (const label of outsideLabels.slice(0, 3)) await expect(page.getByText(label, { exact: true })).toBeVisible();
  const original = await documentLayout(page);
  writeFileSync(testInfo.outputPath('original-document-layout.json'), JSON.stringify(original, null, 2));
  await page.screenshot({ path: testInfo.outputPath('before-print-with-extra-ui.png'), fullPage: true });
  const beforePath = testInfo.outputPath('before-document.pdf');
  await page.pdf({ path: beforePath, format: 'A4', printBackground: true });

  await page.locator('#app-print-style').evaluate((element, css) => { element.textContent = css; }, stylesheet);
  for (const label of outsideLabels.slice(0, 3)) await expect(page.getByText(label, { exact: true })).toBeHidden();
  await expect(page.getByRole('textbox', { name: outsideLabels[3], exact: true })).toBeHidden();
  for (const employeeLabel of await page.getByText(actor.name, { exact: true }).all()) await expect(employeeLabel).toBeHidden();
  await expect(page.getByRole('button', { name: term(kind === 'contract' ? 'Print contract' : 'Print quotation'), exact: true })).toBeHidden();
  await expect(paper).toBeVisible();
  const isolated = await documentLayout(page);
  expect(isolated).toEqual(original);
  writeFileSync(testInfo.outputPath('isolated-document-layout.json'), JSON.stringify(isolated, null, 2));
  if (kind === 'quotation') await expect(paper.locator('.document-total strong')).toContainText('875,000');
  else {
    expect(await paper.locator('[data-agreement-page]').count()).toBeGreaterThan(1);
    await expect(paper.locator('[data-agreement-company-signature]')).toBeVisible();
    await expect(paper.locator('[data-agreement-company-signature]')).toContainText('APPROVED COMPANY SIGNER');
  }
  await page.screenshot({ path: testInfo.outputPath('after-print-document-only.png'), fullPage: true });
  const afterPath = testInfo.outputPath('document-only.pdf');
  await page.pdf({ path: afterPath, format: 'A4', printBackground: true });
  const before = pdfText(beforePath), after = pdfText(afterPath);
  if (before && after) {
    writeFileSync(testInfo.outputPath('pdf-text-proof.json'), JSON.stringify({ before, after }, null, 2));
    const compact = (value: string) => value.normalize('NFKC').replace(/[\s\u200e\u200f\u202a-\u202e]/g, '');
    // Standalone root/footer runs extract consistently in both directions;
    // adjacent RTL editor/input runs can interleave in PDFKit's text order.
    for (const label of outsideLabels.slice(0, 2)) expect(compact(before.text)).toContain(compact(label));
    expect(compact(after.text)).not.toContain('PRIVATE');
    for (const label of [...outsideLabels, actor.name]) expect(compact(after.text)).not.toContain(compact(label));
    expect(after.text).toContain('875,000');
    // PDFKit can interleave the phone's LTR run into a split client-name run.
    expect(compact(after.text).replaceAll('07000000000', '')).toContain(compact('Approved document client'));
    if (kind === 'contract') { expect(after.pages).toBeGreaterThan(1); expect(compact(after.text)).toContain(compact('APPROVED COMPANY SIGNER')); }
  }
  const pdf = await PDFDocument.load(readFileSync(afterPath));
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  expect(failures).toEqual([]); expect(unexpected).toEqual([]);
});

test('an existing quotation does not hide the separate follow-up print portal', async ({ page }, testInfo) => {
  await page.setContent(`<style>${stylesheet}</style><div><article class="commercial-document">INACTIVE QUOTATION DOCUMENT</article><aside>PRIVATE DASHBOARD CONTENT</aside></div><section class="follow-up-print-document">FOLLOW-UP PRINT PORTAL CONTENT</section>`);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText('FOLLOW-UP PRINT PORTAL CONTENT', { exact: true })).toBeVisible();
  await expect(page.getByText('INACTIVE QUOTATION DOCUMENT', { exact: true })).toBeHidden();
  await expect(page.getByText('PRIVATE DASHBOARD CONTENT', { exact: true })).toBeHidden();
  await page.pdf({ path: testInfo.outputPath('follow-up-portal.pdf'), format: 'A4', printBackground: true });
});
