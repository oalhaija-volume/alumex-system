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
 const contract: ContractSnapshot = { number: legacy ? 'CT-PRJ-202611-0130-5' : 'RA-PRJ-202611-0130-5', branch: 'Rasafa', template: 'residential', createdAt: '2026-11-15T08:30:00Z', quotation,
  client: { name: fields.clientLegalName, mobile: null, client_type: 'individual' }, project: { name: 'مشروع اختبار المساحة', number: 'PRJ-202611-0130', address: 'عنوان اختباري', branch: 'Rasafa' },
  terms: legacy ? [{ title: 'Measurement basis', text: 'فقط القياس مادون المتر المربع يحسب متر مربع.' }] : agreement2027Terms('residential'),
  ...(legacy ? {} : { agreement2027: buildAgreement2027Snapshot(quotation, 'residential', fields) }) };
 const flow: SalesFlow = { project_id: projectId, revision: 8, stage: legacy ? 'operations' : 'contract', quotation, contract, signed_at: legacy ? '2026-11-15T09:00:00Z' : null,
  evidence: legacy ? { method: 'hard_copy', signer: 'عميل اختباري' } : null, accepted_at: null, accepted_by: null };
 return { flow, project: { id: projectId, project_name: contract.project.name, project_number: contract.project.number, branch: 'Rasafa', sales_status: legacy ? 'transferred_to_operations' : 'contract_generated', additional_openings_state: null, address: 'عنوان اختباري' } };
}

test.beforeAll(async ({ request }) => {
 mkdirSync(toolsDirectory, { recursive: true });
 const entry = resolve(toolsDirectory, 'entry.tsx'), loader = resolve(toolsDirectory, 'loader.cjs');
 writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {ContractWorkspace} from '@/components/workflow/ContractWorkspace';createRoot(document.getElementById('root')!).render(<I18nProvider><ContractWorkspace projectId="${projectId}"/></I18nProvider>);`);
 writeFileSync(loader, "const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};");
 const require = createRequire(resolve('package.json'));
 const { webpack } = require('next/dist/compiled/webpack/webpack');
 type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
 await new Promise<void>((accept, reject) => webpack({ mode: 'production', target: 'web', context: process.cwd(), entry, output: { path: toolsDirectory, filename: 'contract.js' },
  resolve: { extensions: ['.tsx','.ts','.js','.json'], alias: { '@': resolve('src') } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
  plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })], optimization: { minimize: false }, performance: { hints: false }
 }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
 bundle = readFileSync(resolve(toolsDirectory, 'contract.js'), 'utf8');
 const response = await request.get('/login'); expect(response.status()).toBe(200);
 styles = [...(await response.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
});

for (const locale of ['en','ar'] as const) for (const legacy of [true,false]) test(`${locale}: ${legacy ? 'signed legacy' : 'new agreement'} contracts show charged area and exact amounts`, async ({ page }, testInfo) => {
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
 await hinged.screenshot({ path: testInfo.outputPath(`${locale}-${legacy ? 'legacy' : 'new'}-billable-area.png`) });
 await page.emulateMedia({ media: 'print' });
 await expect(hinged).toContainText('37.3866');
 await expect(hinged).toBeVisible();
 if (testInfo.project.name === 'desktop-chromium') {
  const pdf = await page.pdf({ path: testInfo.outputPath(`${locale}-${legacy ? 'legacy' : 'new'}-contract.pdf`), format: 'A4', printBackground: true });
  expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(0);
 }
 assert.deepEqual(state, before, 'Rendering and printing preserve signed evidence, saved quantities, and prices');
 expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});
