import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import type { ProjectOverviewData } from '../../src/lib/workflow/projectOverview';
import type { QuoteSnapshot } from '../../src/lib/workflow/pricing';
import type { ContractSnapshot } from '../../src/lib/workflow/types';
import { buildAgreement2027Snapshot, emptyAgreement2027Fields } from '../../src/lib/contracts/agreement2027';
import type { ContractDocumentRevision } from '../../src/lib/contracts/documentRevisions';

// No Browser connector is available. Render the actual project view with local
// fixtures. Approval/signature requests update only isolated fixture objects;
// every other write is blocked and no request can leave localhost.
const projectId = '11111111-1111-4111-8111-111111111141';
const reportId = '22222222-2222-4222-8222-222222222242';
const pathname = `/projects/${projectId}`;
const endpoint = `/api/projects/${projectId}`;
const revisionsEndpoint = `${endpoint}/contract-revisions`;
const documentRevisionId = '44444444-4444-4444-8444-444444444444';
const revisionConflict = 'The contract revision changed. Reload and try again.';
const signatureImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6l8AAAAASUVORK5CYII=';
const output = resolve('.next/cache/qa-project-overview');
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
let bundle = '', styles = '';

function quotation(dimensions: number[][], version: number): QuoteSnapshot {
  const lines = dimensions.map(([width, height], index) => {
    const area = width * height / 10000, quantity = Math.max(1, area), total = Math.round(quantity * 300000);
    return {
      opening: { id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`, floor: 'Ground', room: 'Office',
        width, height, quantity: 1, opening_type: 'Window', opening_direction: 'Hinged' }, area,
      system: { id: 'hinged-system', name: 'Alumex Hinged Window', unit: 'sqm', quantity, rate: 300000, total },
      glass: null, extras: [], total,
    };
  });
  return { lines, total: lines.reduce((sum, line) => sum + line.total, 0), currency: 'IQD', version,
    createdAt: '2026-11-26T08:00:00Z', preparedBy: 'Fixture Indoor Sales' };
}

function fixture(): ProjectOverviewData {
  const current = quotation([[67, 39], [57, 53], [93, 50], [164, 73]], 4);
  const savedContractQuote = quotation([[300, 300]], 3);
  const archived = quotation([[100, 200]], 2);
  const timestamp = '2026-11-26T08:00:00Z';
  const project: ProjectOverviewData['project'] = {
    id: projectId, project_number: 'PRJ-OVERVIEW-FIXTURE', project_name: 'Complete project fixture',
    client_id: 'fixture-client', client_name: 'Fixture legal client', branch: 'Karkh', building_type: 'villa_house',
    address: 'Baghdad, project fixture address', phone: '07700000000', structure_readiness: 'ready',
    sales_status: 'contract_signed', status: 'Signed', next_follow_up_at: null, project_notes: 'Fixture project notes',
    created_at: timestamp, updated_at: timestamp, created_by: 'fixture-creator', registeredBy: 'Outdoor creator',
    assigned_outdoor_sales_id: 'fixture-measurer', assignedOutdoorSales: 'Measurement employee',
    followUpOwner: 'Indoor reviewer', location_latitude: null, location_longitude: null,
  };
  const contract = (quote: QuoteSnapshot, number: string): ContractSnapshot => ({
    number, createdAt: timestamp, branch: 'Karkh', template: 'residential', quotation: quote,
    client: { name: 'Saved contract client', mobile: '07701111111', client_type: 'individual' },
    project: { name: 'Frozen contract project', number: project.project_number, address: 'Frozen contract site', branch: 'Karkh' },
    terms: [{ title: 'contract terms', text: 'Saved contract terms fixture.' }],
  });
  return {
    actor: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'Branch Manager', branch: 'Karkh', name: 'Branch manager' },
    documentRevisions: [],
    project,
    client: { id: 'fixture-client', name: 'Fixture legal client', mobile: '07700000000', alternate_mobile: '07702222222',
      address: 'Fixture client address', province: 'Baghdad', city: 'Mansour', email: 'client@example.invalid',
      notes: 'Fixture client notes', client_type: 'individual', company_name: null, whatsapp: '07700000000', preferred_language: 'ar' },
    contacts: [{ id: 'fixture-contact', client_id: 'fixture-client', project_id: projectId, contact_type: 'engineer',
      contact_name: 'Fixture engineering contact', role_title: 'Site engineer', mobile: '07703333333',
      whatsapp: null, email: 'engineer@example.invalid', is_primary: true, created_by: 'fixture-creator',
      created_at: timestamp, updated_at: timestamp }],
    openings: current.lines.map(line => ({
      ...line.opening, project_id: projectId, has_arch: false, has_roller_shutter: false, work_area: 'internal',
      facade_number: null, curtain_wall_capture: null, has_curtain_wall_capture: false, skylight_capture: null,
      has_skylight_capture: false, opening_code: line.opening.id, site_readiness: 'ready', solid_panel_height: 0,
      fixed_height: 0, quantity: line.opening.quantity ?? 1, area_sqm: line.area, product_system: null, glass_type: null, aluminum_color: null,
      shape: null, bottom_frame: null, glass_color: null, measurement_request_id: null, measurement_visit_id: null,
      measurement_submission_id: null, measurement_version: 1, notes: 'Fixture opening note', created_by: 'fixture-measurer',
      created_at: timestamp, updated_at: timestamp, recordedBy: 'Measurement employee',
    })),
    flow: { project_id: projectId, revision: 8, stage: 'signed', quotation: current,
      contract: contract(savedContractQuote, 'CT-SAVED-FIXTURE'), signed_at: timestamp,
      evidence: { method: 'upload', signer: 'Fixture signer', path: 'private-fixture-contract.pdf', fileName: 'fixture-contract.pdf' },
      accepted_at: null, accepted_by: null },
    history: [{ version: 2, quotation: archived, contract: contract(archived, 'CT-ARCHIVED-FIXTURE'),
      previous_stage: 'contract', superseded_at: timestamp }],
    followUps: { project: { id: projectId, project_name: project.project_name, project_number: project.project_number,
      structure_readiness: 'ready', next_follow_up_at: null }, entries: [{ id: 'fixture-follow-up', action: 'follow-up',
      note: 'Fixture showroom follow-up', nextFollowUp: null, recordedAt: timestamp, recordedBy: 'Indoor reviewer',
      followUpType: 'showroom_visit', followUpOwner: 'Indoor reviewer' }] },
    measurementReports: [{ id: reportId, project_id: projectId, note: 'Fixture measurement report note', has_photo: true,
      recorded_by: 'fixture-measurer', recorded_by_name: 'Measurement employee', recorded_at: timestamp }],
    sizeHistory: [{ id: 'fixture-size-change', project_id: projectId, opening_id: current.lines[0].opening.id,
      source_opening_id: current.lines[0].opening.id, previous_width: 50, previous_height: 50, previous_quantity: 1,
      width: 67, height: 39, quantity: 1, reason: 'Fixture window resize reason', changed_by: 'fixture-indoor',
      changed_by_name: 'Indoor reviewer', changed_at: timestamp, quotation_version: 4 }],
    warnings: [], signedCopyAvailable: true,
  };
}

function addDocumentRevision(state: ProjectOverviewData, role: string) {
  assert.ok(state.flow?.contract);
  state.actor.role = role;
  // The revised document preserves the original contract's opening quantities,
  // terms and prices; the original remains signed independently of this copy.
  state.flow.contract.quotation = structuredClone(state.flow.quotation);
  state.flow.evidence = { method: 'digital', signer: 'Original signed client', signature: signatureImage };
  const documentRevision: ContractDocumentRevision = {
    id: documentRevisionId, project_id: projectId, document_revision: 1,
    source_workflow_revision: state.flow.revision, source_signed_at: state.flow.signed_at!,
    format_version: 'billable-opening-schedule-v1', status: 'pending_approval', revision: 1,
    contract: structuredClone(state.flow.contract), created_by: state.actor.id, created_at: '2026-11-26T09:00:00Z',
    approved_by: null, approved_at: null, signed_at: null, evidence: null,
  };
  state.documentRevisions = [documentRevision];
}

test.beforeAll(async ({ request }) => {
  mkdirSync(output, { recursive: true });
  const entry = resolve(output, 'entry.tsx'), loader = resolve(output, 'typescript-loader.cjs'), cssLoader = resolve(output, 'css-loader.cjs');
  writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {CompanyDashboard} from '@/components/workflow/CompanyDashboard';import {ProjectOverview} from '@/components/workflow/ProjectOverview';createRoot(document.getElementById('root')!).render(<I18nProvider>{location.pathname==='/dashboard'?<CompanyDashboard role="Branch Manager"/>:<ProjectOverview projectId="${projectId}"/>}</I18nProvider>);`);
  writeFileSync(loader, `const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};`);
  writeFileSync(cssLoader, `const postcss=require('postcss');const local=require('next/dist/compiled/postcss-modules-local-by-default');const scope=require('next/dist/compiled/postcss-modules-scope');module.exports=function(source){const done=this.async();postcss([local(),scope({generateScopedName:name=>'qa_project_'+name})]).process(source,{from:this.resourcePath}).then(result=>{const names={};result.root.walkRules(':export',rule=>{rule.walkDecls(decl=>{names[decl.prop]=decl.value;});rule.remove();});done(null,'const style=document.createElement("style");style.textContent='+JSON.stringify(result.root.toString())+';document.head.appendChild(style);export default '+JSON.stringify(names)+';');},done);};`);
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({ mode: 'production', target: 'web', context: process.cwd(), devtool: false,
    entry, output: { path: output, filename: 'project-overview.bundle.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }, { test: /\.module\.css$/, use: [cssLoader] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) }), new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors()
    ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
  bundle = readFileSync(resolve(output, 'project-overview.bundle.js'), 'utf8');
  const response = await request.get('/login');
  expect(response.status()).toBe(200);
  styles = [...(await response.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
});

async function mount(page: Page, context: BrowserContext, locale: 'en' | 'ar', options: { empty?: boolean; rejectInitial?: boolean; sourceContract?: boolean; viaDashboard?: boolean; documentRevisionRole?: string; rejectRevisionAction?: boolean } = {}) {
  const messages = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8'));
  const terms: Record<string, string> = messages.terms;
  const term = (value: string) => terms[value] ?? value;
  const errorMessage = (value: string) => terms[value] ?? value;
  const state = fixture();
  if (options.documentRevisionRole) addDocumentRevision(state, options.documentRevisionRole);
  if (options.sourceContract && state.flow?.contract) {
    const fields = emptyAgreement2027Fields();
    fields.clientLegalName = 'Saved source contract client';
    fields.ownerName = fields.clientLegalName;
    state.flow.contract.agreement2027 = buildAgreement2027Snapshot(state.flow.contract.quotation, 'residential', fields);
  }
  if (options.empty) { state.flow = null; state.history = []; }
  const before = structuredClone(state), errors: string[] = [], unexpected: string[] = [];
  let reads = 0, dashboardReads = 0, rejectNextRevisionAction = options.rejectRevisionAction ?? false;
  const actions: Record<string, unknown>[] = [];
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Project overview fixture</title></head><body><div id="root"></div><script src="/qa/project-overview.bundle.js"></script></body></html>`;
  await context.addInitScript(value => {
    localStorage.setItem('alumex_locale', value);
    Reflect.deleteProperty(Navigator.prototype, 'serviceWorker');
  }, locale);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !(options.rejectInitial && /status of 500/.test(message.text()))
      && !(options.documentRevisionRole && /status of 409/.test(message.text()))) errors.push(message.text());
  });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== 'http://localhost:3003') { unexpected.push(`${req.method()} ${url.hostname}`); return route.abort('blockedbyclient'); }
    if (url.pathname === revisionsEndpoint && req.method() === 'POST' && options.documentRevisionRole) {
      const body = req.postDataJSON() as Record<string, unknown>;
      actions.push(body);
      if (rejectNextRevisionAction) {
        rejectNextRevisionAction = false;
        const concurrent = state.documentRevisions?.[0];
        assert.ok(concurrent);
        concurrent.status = 'approved'; concurrent.approved_by = 'other-approver';
        concurrent.approved_at = '2026-11-26T09:30:00Z'; concurrent.revision++;
        return route.fulfill({ status: 409, json: { error: revisionConflict } });
      }
      try {
        assert.ok(['Admin', 'CEO', 'Company Owner', 'Sales Director'].includes(state.actor.role));
        const current = state.documentRevisions?.[0];
        assert.ok(current);
        assert.equal(body.id, current.id);
        assert.equal(body.revision, current.revision);
        if (body.action === 'approve') {
          assert.equal(current.status, 'pending_approval');
          assert.equal(body.confirmed, true);
          current.status = 'approved'; current.approved_at = '2026-11-26T10:00:00Z'; current.approved_by = state.actor.id;
        } else {
          assert.equal(body.action, 'sign');
          assert.equal(current.status, 'approved');
          const evidence = body.evidence as Record<string, unknown>;
          assert.equal(evidence.confirmed, true);
          assert.equal(typeof evidence.signer, 'string');
          assert.ok((evidence.signer as string).trim());
          assert.ok(evidence.method === 'digital' || evidence.method === 'hard_copy');
          if (evidence.method === 'digital') assert.match(String(evidence.signature), /^data:image\/png;base64,/);
          current.status = 'signed'; current.signed_at = '2026-11-26T11:00:00Z';
          current.evidence = { method: evidence.method, signer: String(evidence.signer),
            ...(evidence.method === 'digital' ? { signature: String(evidence.signature) } : {}) };
        }
        current.revision++;
        return route.fulfill({ json: { documentRevision: current } });
      } catch (cause) {
        errors.push((cause as Error).message);
        return route.fulfill({ status: 400, json: { error: (cause as Error).message } });
      }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
      unexpected.push(`${req.method()} ${url.pathname}`);
      return route.fulfill({ status: 405, json: { error: 'Read-only project writes blocked' } });
    }
    if ([pathname, '/dashboard'].includes(url.pathname) && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/qa/project-overview.bundle.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    if (url.pathname === endpoint && url.searchParams.get('report') === reportId) return route.fulfill({ json: { photo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6l8AAAAASUVORK5CYII=' } });
    if (url.pathname === endpoint && url.searchParams.get('download') === 'signed') return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\nFixture signed contract\n%%EOF' });
    if (url.pathname === endpoint && !url.search) {
      reads++;
      if (options.rejectInitial && reads === 1) return route.fulfill({ status: 500, json: { error: 'Unable to load project details.' } });
      return route.fulfill({ json: state });
    }
    if (url.pathname === '/api/dashboard') {
      dashboardReads++;
      const { id, project_name, project_number, structure_readiness, sales_status, status,
        created_at, created_by, registeredBy, updated_at } = state.project;
      return route.fulfill({ json: { projects: [{ id, project_name, project_number, structure_readiness,
        sales_status, status, created_at, created_by, registeredBy, updated_at }] } });
    }
    if (url.pathname.startsWith('/api/')) {
      unexpected.push(`${req.method()} ${url.pathname}${url.search}`);
      return route.fulfill({ status: 404, json: { error: 'Unexpected project read' } });
    }
    return route.continue();
  });
  await page.goto(options.viaDashboard ? '/dashboard' : pathname);
  return { term, errorMessage, state, before, errors, unexpected, actions, reads: () => reads, dashboardReads: () => dashboardReads };
}

for (const locale of ['en', 'ar'] as const) test(`${locale}: Branch Manager opens project information and commercial documents from the dashboard`, async ({ page, context }, testInfo) => {
  if (testInfo.project.name === 'mobile-chromium') await page.setViewportSize({ width: 375, height: 950 });
  const state = await mount(page, context, locale, { viaDashboard: true });
  await expect(page.getByRole('heading', { name: state.state.project.project_name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: state.state.project.project_name, exact: true }).getByRole('link')).toHaveAttribute('href', pathname);
  expect(state.reads()).toBe(0);
  const open = page.getByRole('link', { name: state.term('Open project →'), exact: true });
  await expect(open).toHaveAttribute('href', pathname);
  await open.click();
  await expect(page).toHaveURL(`http://localhost:3003${pathname}`);
  await expect(page.getByRole('tab', { name: state.term('Project overview'), exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Fixture legal client', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Fixture engineering contact', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: state.term('Quotation'), exact: true }).click();
  await expect(page.locator('.commercial-document [data-group-subtotal="hinged"]')).toContainText('4.1972');
  await page.getByRole('tab', { name: state.term('Contract'), exact: true }).click();
  await expect(page.locator('.commercial-document')).toContainText('CT-SAVED-FIXTURE');
  await expect(page.locator('.commercial-document')).toContainText('2,700,000');
  await expect(page.getByRole('button', { name: /Generate|Save quotation|Sign contract/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.dashboardReads()).toBe(1);
  expect(state.reads()).toBe(1);
  expect(state.errors).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: complete project view exposes saved records and separate commercial snapshots without edits`, async ({ page, context }, testInfo) => {
  if (testInfo.project.name === 'mobile-chromium') await page.setViewportSize({ width: 375, height: 950 });
  const state = await mount(page, context, locale);
  const tab = (name: string) => page.getByRole('tab', { name: state.term(name), exact: true });
  await expect(page.getByRole('tablist')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(5);
  await expect(tab('Project overview')).toHaveAttribute('aria-selected', 'true');
  await tab('Project overview').focus();
  await page.keyboard.press('End');
  await expect(tab('Contract')).toBeFocused();
  await expect(tab('Contract')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(tab('Project overview')).toBeFocused();
  await expect(tab('Project overview')).toHaveAttribute('aria-selected', 'true');
  for (const control of await page.getByRole('tab').all()) expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByText('Fixture legal client', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Fixture engineering contact', { exact: true })).toBeVisible();
  await expect(page.getByText('07703333333', { exact: true })).toBeVisible();
  await expect(page.getByText('Outdoor creator', { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`${locale}-project-overview.png`), fullPage: true });

  await tab('Measurements').click();
  await expect(page.getByText('Fixture measurement report note', { exact: true })).toBeVisible();
  await expect(page.getByText('Fixture window resize reason', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: state.term('View site photo'), exact: true }).click();
  await expect(page.getByRole('img', { name: state.term('Measurement site photo'), exact: true })).toBeVisible();
  await expect(page.getByText(/67\s*×\s*39/).first()).toBeVisible();
  await tab('Follow-up history').click();
  await expect(page.getByText('Fixture showroom follow-up', { exact: true })).toBeVisible();
  await expect(page.getByText('Indoor reviewer', { exact: true }).first()).toBeVisible();

  await tab('Quotation').click();
  let paper = page.locator('.commercial-document');
  await expect(paper).toHaveCount(1);
  await expect(paper.locator('[data-group-subtotal="hinged"]')).toContainText('4.1972');
  await expect(paper).toContainText(state.term('Billable area'));
  await expect(paper).not.toContainText('2.23');
  await expect(paper).toContainText('1,259,160');
  await expect(paper).toContainText('67 × 39');
  await page.screenshot({ path: testInfo.outputPath(`${locale}-project-quotation.png`), fullPage: true });
  const quotationVersion = page.getByRole('combobox', { name: state.term('Quotation version'), exact: true });
  await expect(quotationVersion).toBeVisible();
  const oldQuotation = await quotationVersion.locator('option').last().getAttribute('value');
  assert.ok(oldQuotation);
  await quotationVersion.selectOption(oldQuotation);
  await expect(paper).toContainText('600,000');
  await expect(paper).not.toContainText('1,259,160');

  await tab('Contract').click();
  paper = page.locator('.commercial-document');
  await expect(paper).toHaveCount(1);
  await expect(paper).toContainText('CT-SAVED-FIXTURE');
  await expect(paper).toContainText('Saved contract client');
  await expect(paper).toContainText('2,700,000');
  await expect(paper).not.toContainText('1,259,160');
  await expect(page.getByRole('link', { name: state.term('Download signed copy'), exact: true })).toHaveAttribute('href', `${endpoint}?download=signed`);
  const contractVersion = page.getByRole('combobox', { name: state.term('Contract version'), exact: true });
  const oldContract = await contractVersion.locator('option').last().getAttribute('value');
  assert.ok(oldContract);
  await contractVersion.selectOption(oldContract);
  await expect(paper).toContainText('CT-ARCHIVED-FIXTURE');
  await expect(paper).toContainText('600,000');
  await expect(paper).not.toContainText('2,700,000');
  for (const label of ['Edit quotation', 'Generate contract', 'Sign contract', 'Save quotation', 'Edit client name', 'Edit project name']) {
    await expect(page.getByRole('button', { name: state.term(label), exact: true })).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: state.term('Refresh records'), exact: true }).click();
  await expect.poll(state.reads).toBe(2);
  expect(state.errors).toEqual([]);
  expect(state.unexpected).toEqual([]);
  expect(state.state).toEqual(state.before);
});

test('empty commercial records explain their state without generating or editing documents', async ({ page, context }) => {
  const state = await mount(page, context, 'en', { empty: true });
  await expect(page.getByRole('tablist')).toBeVisible();
  for (const name of ['Quotation', 'Contract']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(page.locator('.commercial-document')).toHaveCount(0);
    await expect(page.getByRole('tabpanel')).toContainText(/no|not|saved|available/i);
  }
  await expect(page.getByRole('button', { name: /Generate|Save quotation|Sign contract/ })).toHaveCount(0);
  expect(state.errors).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

test('source agreement contracts keep their own saved opening list inside the project view', async ({ page, context }) => {
  const state = await mount(page, context, 'en', { sourceContract: true });
  await page.getByRole('tab', { name: 'Contract', exact: true }).click();
  const paper = page.locator('.commercial-document');
  await expect(paper).toHaveCount(1);
  await expect(paper).toContainText('Saved source contract client');
  await expect(paper.locator('.document-schedule')).toContainText('300 × 300');
  await expect(paper.locator('.document-schedule')).toContainText('2,700,000');
  await expect(paper.locator('.document-schedule')).not.toContainText('4.1972');
  await expect(paper.locator('.document-schedule')).not.toContainText('67 × 39');
  expect(state.errors).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

test('a failed project load can be retried from the read-only overview', async ({ page, context }) => {
  const state = await mount(page, context, 'en', { rejectInitial: true });
  await expect(page.getByRole('alert')).toContainText('Unable to load project details.');
  await page.getByRole('button', { name: 'Refresh records', exact: true }).click();
  await expect(page.getByRole('tablist')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(state.reads()).toBe(2);
  expect(state.errors).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

for (const locale of ['en', 'ar'] as const) for (const method of ['hard_copy', 'digital'] as const) {
  test(`${locale}: revised contract requires fresh approval and ${method} signature while retaining the signed original`, async ({ page, context }, testInfo) => {
    if (testInfo.project.name === 'mobile-chromium') await page.setViewportSize({ width: 375, height: 950 });
    const state = await mount(page, context, locale, { documentRevisionRole: method === 'hard_copy' ? 'Admin' : 'Company Owner' });
    await page.getByRole('tab', { name: state.term('Contract'), exact: true }).click();
    const version = page.getByRole('combobox', { name: state.term('Contract version'), exact: true });
    await expect(version).toHaveValue(`document-${documentRevisionId}`);
    const review = page.getByRole('region', { name: state.term('Contract revision review'), exact: true });
    const paper = page.locator('.commercial-document');
    await expect(paper.locator('[data-contract-revision-status]')).toHaveAttribute('data-contract-revision-status', 'pending_approval');
    await expect(paper.locator('.document-schedule')).toContainText('4.1972');
    await expect(paper.locator('.document-schedule')).toContainText('1,259,160');
    await expect(paper.locator('.document-schedule')).toContainText('67 × 39');
    await expect(paper).toContainText('Saved contract terms fixture.');
    await expect(paper).not.toContainText('2.23');
    await expect(paper).not.toContainText('Original signed client');
    await expect(paper.getByRole('img', { name: state.term('Client signature'), exact: true })).toHaveCount(0);
    await review.screenshot({ path: testInfo.outputPath(`${locale}-${method}-pending-review.png`) });
    if (method === 'hard_copy') {
      await page.emulateMedia({ media: 'print' });
      try {
        await expect(paper.locator('[data-contract-revision-status="pending_approval"]')).toBeVisible();
        await expect(paper.locator('[data-contract-revision-status="pending_approval"]')).toHaveCSS('position', 'fixed');
        await expect(paper.locator('.document-schedule')).toBeVisible();
        await expect(paper.locator('[data-group-subtotal="hinged"]')).toContainText('4.1972');
        await expect(review).not.toBeVisible();
        await expect(version).not.toBeVisible();
        if (testInfo.project.name === 'desktop-chromium') {
          const bytes = await page.pdf({ path: testInfo.outputPath(`${locale}-pending-contract-revision.pdf`), format: 'A4', printBackground: true });
          expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
        }
      } finally { await page.emulateMedia({ media: 'screen' }); }
    }
    const approve = review.getByRole('button', { name: state.term('Approve revised contract'), exact: true });
    await expect(approve).toBeDisabled();
    await review.getByRole('checkbox', { name: state.term('I confirm the client approved this revised contract.'), exact: true }).check();
    await approve.click();
    await expect(paper.locator('[data-contract-revision-status]')).toHaveAttribute('data-contract-revision-status', 'approved');
    expect(state.actions[0]).toEqual({ action: 'approve', id: documentRevisionId, revision: 1, confirmed: true });
    await expect(approve).toHaveCount(0);
    const save = review.getByRole('button', { name: state.term('Save revised contract signature'), exact: true });
    await expect(save).toBeDisabled();
    if (method === 'hard_copy') await review.getByRole('button', { name: state.term('Client signed hard copy'), exact: true }).click();
    await review.getByRole('textbox', { name: state.term('Client signer’s full name') }).fill('Revised contract signer');
    if (method === 'digital') {
      const canvas = review.locator('canvas');
      await canvas.scrollIntoViewIfNeeded();
      const bounds = await canvas.boundingBox();
      assert.ok(bounds && bounds.width > 100);
      await page.mouse.move(bounds.x + 20, bounds.y + 60);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 70, bounds.y + 25, { steps: 5 });
      await page.mouse.move(bounds.x + 120, bounds.y + 70, { steps: 5 });
      await page.mouse.up();
      await expect(review.getByText(state.term('Signature captured'), { exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await review.getByRole('checkbox').check();
    await save.click();
    await expect(paper.locator('[data-contract-revision-status]')).toHaveAttribute('data-contract-revision-status', 'signed');
    await expect(paper).toContainText('Revised contract signer');
    await expect(save).toHaveCount(0);
    expect(state.actions).toHaveLength(2);
    expect(state.actions[1]).toMatchObject({ action: 'sign', id: documentRevisionId, revision: 2,
      evidence: { method, signer: 'Revised contract signer', confirmed: true } });
    const evidence = state.actions[1].evidence as Record<string, unknown>;
    if (method === 'digital') expect(String(evidence.signature)).toMatch(/^data:image\/png;base64,/);
    else expect('signature' in evidence).toBe(false);
    expect(state.state.flow).toEqual(state.before.flow);
    expect(state.state.documentRevisions?.[0].contract).toEqual(state.before.documentRevisions?.[0].contract);
    expect(state.state.documentRevisions?.[0].revision).toBe(3);
    await version.selectOption('current');
    await expect(paper).toContainText('Original signed client');
    await expect(paper.getByRole('img', { name: state.term('Client signature'), exact: true })).toHaveCount(1);
    await expect(page.getByRole('link', { name: state.term('Download signed copy'), exact: true })).toHaveAttribute('href', `${endpoint}?download=signed`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(state.errors).toEqual([]);
    expect(state.unexpected).toEqual([]);
  });
}

for (const locale of ['en', 'ar'] as const) test(`${locale}: Branch Manager can review the unsigned revised copy without approval or signing controls`, async ({ page, context }) => {
  const state = await mount(page, context, locale, { documentRevisionRole: 'Branch Manager' });
  await page.getByRole('tab', { name: state.term('Contract'), exact: true }).click();
  await expect(page.getByRole('combobox', { name: state.term('Contract version'), exact: true })).toHaveValue(`document-${documentRevisionId}`);
  await expect(page.locator('[data-contract-revision-status]')).toHaveAttribute('data-contract-revision-status', 'pending_approval');
  const review = page.getByRole('region', { name: state.term('Contract revision review'), exact: true });
  await expect(review.getByRole('checkbox')).toHaveCount(0);
  await expect(review.getByRole('button')).toHaveCount(0);
  await expect(review.getByRole('textbox')).toHaveCount(0);
  await expect(page.locator('.commercial-document')).not.toContainText('Original signed client');
  expect(state.actions).toEqual([]);
  expect(state.errors).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: a stale approval reports the conflict and refreshes without silently retrying`, async ({ page, context }) => {
  const state = await mount(page, context, locale, { documentRevisionRole: 'Sales Director', rejectRevisionAction: true });
  await page.getByRole('tab', { name: state.term('Contract'), exact: true }).click();
  const review = page.getByRole('region', { name: state.term('Contract revision review'), exact: true });
  await review.getByRole('checkbox', { name: state.term('I confirm the client approved this revised contract.'), exact: true }).check();
  await review.getByRole('button', { name: state.term('Approve revised contract'), exact: true }).click();
  await expect(review.getByRole('alert')).toContainText(state.errorMessage(revisionConflict));
  expect(state.actions).toHaveLength(1);
  await expect(page.locator('[data-contract-revision-status]')).toHaveAttribute('data-contract-revision-status', 'pending_approval');
  await page.getByRole('button', { name: state.term('Refresh records'), exact: true }).click();
  await expect(page.locator('[data-contract-revision-status]')).toHaveAttribute('data-contract-revision-status', 'approved');
  await expect(review.getByRole('alert')).toHaveCount(0);
  await expect(review.getByRole('button', { name: state.term('Approve revised contract'), exact: true })).toHaveCount(0);
  await expect(review.getByRole('button', { name: state.term('Save revised contract signature'), exact: true })).toBeDisabled();
  expect(state.actions).toHaveLength(1);
  expect(state.state.flow).toEqual(state.before.flow);
  expect(state.errors).toEqual([]);
  expect(state.unexpected).toEqual([]);
});
