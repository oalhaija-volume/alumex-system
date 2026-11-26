import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ContractDocumentRevision } from '../../src/lib/contracts/documentRevisions';
import type { FieldProject } from '../../src/lib/offline/types';
import type { CatalogItem, QuoteSnapshot } from '../../src/lib/workflow/pricing';
import type { ContractSnapshot, SalesFlow } from '../../src/lib/workflow/types';

// Browser tools are unavailable. Test the actual quotation/contract components
// using local synthetic snapshots, with every business mutation blocked.
const projectId = '11111111-1111-4111-8111-111111111151';
const currentRevisionId = '22222222-2222-4222-8222-222222222252';
const previousRevisionId = '33333333-3333-4333-8333-333333333353';
const contractPath = `/contract/${projectId}`, quotationPath = `/quotation/${projectId}`;
const revisionsEndpoint = `/api/projects/${projectId}/contract-revisions`;
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
let bundle = '', styles = '';

function fixture(locale: 'en' | 'ar') {
  const corrected = locale === 'ar' ? 'اسم العميل المصحح' : 'Corrected client name';
  const original = 'Original signed client';
  const timestamp = '2026-11-26T08:00:00Z';
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'Indoor Sales', branch: 'Karkh', name: 'Indoor reviewer' };
  const project: FieldProject = {
    id: projectId, client_id: 'fixture-client', client_name: corrected, project_name: corrected, project_number: 'PRJ-NAME-CASCADE',
    branch: 'Karkh', address: 'Baghdad fixture site', phone: '07700000000', structure_readiness: 'ready',
    sales_status: 'transferred_to_operations', status: 'Production', next_follow_up_at: null, project_notes: null,
    created_at: timestamp, updated_at: '2026-11-26T09:00:00Z', created_by: actor.id, registeredBy: actor.name,
  };
  const catalog: CatalogItem[] = [{ id: 'fixture-system', name: 'Alumex Hinged Window', category: 'aluminum_system', unit: 'sqm', unit_price: 300000, is_active: true }];
  const quote: QuoteSnapshot = {
    lines: [[67, 39], [57, 53], [93, 50], [164, 73]].map(([width, height], index) => {
      const area = width * height / 10000, quantity = Math.max(1, area), total = Math.round(quantity * 300000);
      return { opening: { id: `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`, floor: 'Ground', room: 'Office', width, height,
        quantity: 1, opening_type: 'Window', opening_direction: 'Hinged' }, area,
        system: { id: 'fixture-system', name: 'Alumex Hinged Window', quantity, unit: 'sqm', rate: 300000, total },
        glass: null, extras: [], total };
    }),
    total: 1259160, currency: 'IQD', version: 4, createdAt: timestamp, preparedBy: actor.id,
  };
  const contract: ContractSnapshot = {
    number: 'CT-NAME-CASCADE', template: 'residential', createdAt: timestamp, branch: 'Karkh', quotation: structuredClone(quote),
    client: { name: original, mobile: '07700000000', client_type: 'individual' },
    project: { name: 'Original signed project', number: project.project_number, address: project.address, branch: 'Karkh' },
    terms: [{ title: 'contract terms', text: 'Preserved original contract terms.' }],
  };
  const flow: SalesFlow = { project_id: projectId, stage: 'operations', revision: 8, quotation: quote, contract,
    signed_at: timestamp, accepted_at: timestamp, accepted_by: actor.id,
    evidence: { method: 'digital', signer: 'Original signer', signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6l8AAAAASUVORK5CYII=' } };
  const revised = structuredClone(contract);
  revised.client.name = corrected; revised.project.name = corrected;
  const baseRevision = { project_id: projectId, source_workflow_revision: flow.revision, source_signed_at: timestamp,
    format_version: 'billable-opening-schedule-v1' as const, revision: 1, status: 'pending_approval' as const,
    created_by: actor.id, created_at: timestamp, approved_at: null, approved_by: null, signed_at: null, evidence: null };
  const documentRevisions: ContractDocumentRevision[] = [
    { ...baseRevision, id: currentRevisionId, document_revision: 2, revision_reason: 'client_name_correction', superseded_at: null, contract: revised },
    { ...baseRevision, id: previousRevisionId, document_revision: 1, revision_reason: 'opening_schedule', superseded_at: '2026-11-26T09:00:00Z', contract: structuredClone(contract) },
  ];
  return { actor, corrected, original, project, catalog, flow, documentRevisions,
    client: { name: corrected, mobile: '07700000000', client_type: 'individual' },
    openings: quote.lines.map(line => line.opening), history: [] };
}

test.beforeAll(async ({ request }, testInfo) => {
  const output = testInfo.outputPath('component');
  mkdirSync(output, { recursive: true });
  const entry = resolve(output, 'entry.tsx'), loader = resolve(output, 'loader.cjs'), cssLoader = resolve(output, 'css-loader.cjs');
  writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {QuotationWorkspace} from '@/components/workflow/QuotationWorkspace';import {ContractWorkspace} from '@/components/workflow/ContractWorkspace';import {notifyWorkspaceChanged} from '@/lib/workflow/workspaceEvents';Object.assign(window,{__qaNotifyWorkspaceChanged:notifyWorkspaceChanged});createRoot(document.getElementById('root')!).render(<I18nProvider>{location.pathname.startsWith('/quotation/')?<QuotationWorkspace projectId="${projectId}"/>:<ContractWorkspace projectId="${projectId}"/>}</I18nProvider>);`);
  writeFileSync(loader, `const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};`);
  writeFileSync(cssLoader, `const postcss=require('postcss');const local=require('next/dist/compiled/postcss-modules-local-by-default');const scope=require('next/dist/compiled/postcss-modules-scope');module.exports=function(source){const done=this.async();postcss([local(),scope({generateScopedName:name=>'qa_identity_'+name})]).process(source,{from:this.resourcePath}).then(result=>{const names={};result.root.walkRules(':export',rule=>{rule.walkDecls(decl=>{names[decl.prop]=decl.value;});rule.remove();});done(null,'const style=document.createElement("style");style.textContent='+JSON.stringify(result.root.toString())+';document.head.appendChild(style);export default '+JSON.stringify(names)+';');},done);};`);
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({ mode: 'production', target: 'web', context: process.cwd(), devtool: false,
    entry, output: { path: output, filename: 'client-documents.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }, { test: /\.module\.css$/, use: [cssLoader] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) }), new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors()
    ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
  bundle = readFileSync(resolve(output, 'client-documents.js'), 'utf8');
  const login = await request.get('/login'); expect(login.status()).toBe(200);
  styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: direct contract and quotation routes show corrected names while preserving the signed original`, async ({ page, context }, testInfo) => {
  if (testInfo.project.name === 'mobile-chromium') await page.setViewportSize({ width: 375, height: 950 });
  const state = fixture(locale), before = structuredClone(state);
  const terms: Record<string, string> = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8')).terms;
  const term = (value: string) => terms[value] ?? value;
  const errors: string[] = [], unexpected: string[] = [], reads: string[] = [];
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/qa/client-documents.js"></script></body></html>`;
  await context.addInitScript(value => {
    localStorage.setItem('alumex_locale', value);
    Reflect.deleteProperty(Navigator.prototype, 'serviceWorker');
  }, locale);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== 'http://localhost:3003') { unexpected.push(`${req.method()} ${url.origin}`); return route.abort('blockedbyclient'); }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(`${req.method()} ${url.pathname}`); return route.fulfill({ status: 405, json: { error: 'Business mutations blocked' } }); }
    if ([contractPath, quotationPath].includes(url.pathname) && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/qa/client-documents.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    if (url.pathname === `/api/sales-flow/${projectId}`) { reads.push(url.pathname); return route.fulfill({ json: state }); }
    if (url.pathname === revisionsEndpoint) { reads.push(url.pathname); return route.fulfill({ json: { actor: state.actor, documentRevisions: state.documentRevisions } }); }
    if (url.pathname === '/api/workspace') return route.fulfill({ json: { actor: state.actor, projects: [state.project], indoorSales: [], outdoorSales: [] } });
    if (url.pathname.startsWith('/api/measurement-reports/')) return route.fulfill({ json: { reports: [] } });
    if (url.pathname.startsWith('/api/')) { unexpected.push(`${req.method()} ${url.pathname}`); return route.fulfill({ status: 404, json: {} }); }
    return route.continue();
  });
  await page.goto(contractPath);
  const version = page.getByRole('combobox', { name: term('Contract version'), exact: true });
  await expect(version).toHaveValue(currentRevisionId);
  const paper = page.locator('.commercial-document');
  await expect(paper).toContainText(state.corrected);
  await expect(paper.locator('[data-contract-revision-status]')).toHaveAttribute('data-contract-revision-status', 'pending_approval');
  await expect(paper).toContainText('4.1972');
  await expect(paper).toContainText('1,259,160');
  await expect(paper).toContainText('Preserved original contract terms.');
  await expect(paper).not.toContainText(state.original);
  await expect(paper).not.toContainText('Original signer');
  await expect(paper.getByRole('img', { name: term('Client signature'), exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath(`${locale}-corrected-contract.png`), fullPage: true });
  await version.selectOption(previousRevisionId);
  await expect(paper.locator('[data-contract-revision-status]')).toHaveAttribute('data-contract-revision-status', 'superseded');
  const review = page.getByRole('region', { name: term('Contract revision review'), exact: true });
  await expect(review.getByRole('checkbox')).toHaveCount(0);
  await expect(review.getByRole('button')).toHaveCount(0);
  await version.selectOption('original');
  await expect(paper).toContainText(state.original);
  await expect(paper).toContainText('Original signed project');
  await expect(paper).toContainText('Original signer');
  await expect(paper.getByRole('img', { name: term('Client signature'), exact: true })).toHaveCount(1);
  await page.goto(quotationPath);
  await expect(page.locator('.commercial-document')).toContainText(state.corrected);
  await expect(page.locator('.document-parties .document-client').filter({ hasText: state.corrected })).toHaveCount(2);
  await expect(page.locator('.commercial-document')).not.toContainText('Original signed project');
  await expect(page.locator('.commercial-document')).toContainText('4.1972');
  await page.screenshot({ path: testInfo.outputPath(`${locale}-corrected-quotation.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  assert.ok(reads.includes(revisionsEndpoint));
  expect(state).toEqual(before);
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});

test('an already-open contract reloads a newly corrected revision after a workspace change', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Workspace event routing is independent of viewport.');
  const state = fixture('en'), before = structuredClone(state);
  let includeRevisions = false, revisionReads = 0;
  const errors: string[] = [], unexpected: string[] = [];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/qa/client-documents.js"></script></body></html>`;
  await context.addInitScript(() => {
    localStorage.setItem('alumex_locale', 'en');
    Reflect.deleteProperty(Navigator.prototype, 'serviceWorker');
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== 'http://localhost:3003') { unexpected.push(`${req.method()} ${url.origin}`); return route.abort('blockedbyclient'); }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(`${req.method()} ${url.pathname}`); return route.fulfill({ status: 405, json: { error: 'Business mutations blocked' } }); }
    if (url.pathname === contractPath && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/qa/client-documents.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    if (url.pathname === `/api/sales-flow/${projectId}`) return route.fulfill({ json: state });
    if (url.pathname === revisionsEndpoint) {
      revisionReads++;
      return route.fulfill({ json: { documentRevisions: includeRevisions ? state.documentRevisions : [] } });
    }
    if (url.pathname === '/api/workspace') return route.fulfill({ json: { actor: state.actor, projects: [state.project], indoorSales: [], outdoorSales: [] } });
    if (url.pathname.startsWith('/api/')) { unexpected.push(`${req.method()} ${url.pathname}`); return route.fulfill({ status: 404, json: {} }); }
    return route.continue();
  });
  await page.goto(contractPath);
  const paper = page.locator('.commercial-document');
  await expect(paper).toContainText('Original signed project');
  await expect(paper).toContainText('Original signer');
  await expect(paper.getByRole('img', { name: 'Client signature', exact: true })).toHaveCount(1);
  expect(revisionReads).toBe(1);
  includeRevisions = true;
  await page.evaluate(() => (window as typeof window & { __qaNotifyWorkspaceChanged: () => void }).__qaNotifyWorkspaceChanged());
  await expect.poll(() => revisionReads).toBeGreaterThan(1);
  await expect(page.getByRole('combobox', { name: 'Contract version', exact: true })).toHaveValue(currentRevisionId);
  await expect(paper).toContainText(state.corrected);
  await expect(paper).not.toContainText('Original signed project');
  await expect(paper).not.toContainText('Original signer');
  await expect(paper.getByRole('img', { name: 'Client signature', exact: true })).toHaveCount(0);
  await expect(paper.locator('[data-contract-revision-status]')).toHaveAttribute('data-contract-revision-status', 'pending_approval');
  await expect(page).toHaveURL(`http://localhost:3003${contractPath}`);
  expect(state).toEqual(before);
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});

test('corrected contract approval and signing broadcast successful updates without changing the signed original', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Workspace event routing is independent of viewport.');
  const state = fixture('en'), before = structuredClone(state);
  let revisionReads = 0;
  const posts: Record<string, unknown>[] = [], errors: string[] = [], unexpected: string[] = [];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/qa/client-documents.js"></script></body></html>`;
  await context.addInitScript(() => {
    localStorage.setItem('alumex_locale', 'en');
    Reflect.deleteProperty(Navigator.prototype, 'serviceWorker');
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== 'http://localhost:3003') { unexpected.push(`${req.method()} ${url.origin}`); return route.abort('blockedbyclient'); }
    if (url.pathname === revisionsEndpoint && req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>, current = state.documentRevisions[0];
      posts.push(body);
      expect(body).toMatchObject({ id: currentRevisionId, revision: current.revision });
      if (body.action === 'approve') {
        expect(body).toEqual({ action: 'approve', id: currentRevisionId, revision: 1, confirmed: true });
        expect(current.status).toBe('pending_approval');
        current.status = 'approved'; current.approved_at = '2026-11-26T10:00:00Z'; current.approved_by = state.actor.id;
      } else {
        expect(body).toEqual({ action: 'sign', id: currentRevisionId, revision: 2,
          evidence: { method: 'hard_copy', signer: 'Fresh revised signer', confirmed: true } });
        expect(current.status).toBe('approved');
        current.status = 'signed'; current.signed_at = '2026-11-26T11:00:00Z';
        current.evidence = { method: 'hard_copy', signer: 'Fresh revised signer' };
      }
      current.revision++;
      return route.fulfill({ json: { documentRevision: current } });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(`${req.method()} ${url.pathname}`); return route.fulfill({ status: 405, json: { error: 'Business mutations blocked' } }); }
    if (url.pathname === contractPath && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/qa/client-documents.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    if (url.pathname === `/api/sales-flow/${projectId}`) return route.fulfill({ json: state });
    if (url.pathname === revisionsEndpoint) {
      revisionReads++;
      return route.fulfill({ json: { documentRevisions: state.documentRevisions } });
    }
    if (url.pathname === '/api/workspace') return route.fulfill({ json: { actor: state.actor, projects: [state.project], indoorSales: [], outdoorSales: [] } });
    if (url.pathname.startsWith('/api/')) { unexpected.push(`${req.method()} ${url.pathname}`); return route.fulfill({ status: 404, json: {} }); }
    return route.continue();
  });
  await page.goto(contractPath);
  const review = page.getByRole('region', { name: 'Contract revision review', exact: true });
  const paper = page.locator('.commercial-document');
  await expect(paper.locator('[data-contract-revision-status]')).toHaveAttribute('data-contract-revision-status', 'pending_approval');
  const initialReads = revisionReads;
  await review.getByRole('checkbox', { name: 'I confirm the client approved this revised contract.', exact: true }).check();
  await review.getByRole('button', { name: 'Approve revised contract', exact: true }).click();
  await expect(paper.locator('[data-contract-revision-status]')).toHaveAttribute('data-contract-revision-status', 'approved');
  await expect.poll(() => revisionReads).toBeGreaterThan(initialReads);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await review.getByRole('button', { name: 'Client signed hard copy', exact: true }).click();
  await review.getByRole('textbox', { name: 'Client signer’s full name', exact: true }).fill('Fresh revised signer');
  await review.getByRole('checkbox', { name: 'I confirm the client has signed the complete printed contract shown above.', exact: true }).check();
  const readsBeforeSigning = revisionReads;
  await review.getByRole('button', { name: 'Save revised contract signature', exact: true }).click();
  await expect(paper.locator('[data-contract-revision-status]')).toHaveAttribute('data-contract-revision-status', 'signed');
  await expect.poll(() => revisionReads).toBeGreaterThan(readsBeforeSigning);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(paper.locator('[data-contract-revision-status]')).toHaveAttribute('data-contract-revision-status', 'signed');
  await expect(paper).toContainText('Fresh revised signer');
  await expect(paper).not.toContainText('Original signer');
  await page.getByRole('combobox', { name: 'Contract version', exact: true }).selectOption('original');
  await expect(paper).toContainText('Original signer');
  await expect(paper.getByRole('img', { name: 'Client signature', exact: true })).toHaveCount(1);
  expect(posts).toHaveLength(2);
  expect(state.flow).toEqual(before.flow);
  expect(state.documentRevisions[0].contract).toEqual(before.documentRevisions[0].contract);
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});
