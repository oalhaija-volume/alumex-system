import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { CatalogItem, QuoteSnapshot } from '../../src/lib/workflow/pricing';
import type { SalesFlow } from '../../src/lib/workflow/types';

const output = resolve('.next/cache/qa-shared-quotation-prices');
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
const projectId = '11111111-1111-4111-8111-111111111111';
const catalog: CatalogItem[] = [
  { id: 'alumex', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 280000, is_active: true },
  { id: 'curtain', name: 'Curtain Wall', category: 'facade_service', unit: 'sqm', unit_price: 240000, is_active: true },
  { id: 'fixed-door', name: 'Photocell Door', category: 'standalone_product', unit: 'item', unit_price: 450000, is_active: true },
];
const initial: QuoteSnapshot = {
  branch: 'Rasafa', governorate: null, version: 1, currency: 'IQD', total: 3000000,
  createdAt: '2026-11-21T09:35:31Z', preparedBy: 'duaa',
  lines: [{
    opening: { id: 'opening-1', floor: 'GF', room: 'Office', width: 100, height: 150, quantity: 2, opening_type: 'Window', opening_direction: 'Sliding' },
    system: { id: 'alumex', name: 'Alumex System', unit: 'sqm', rate: 280000, quantity: 3, total: 840000 },
    glass: { id: 'glass', name: 'Low-E Glass', unit: 'sqm', rate: 20000, quantity: 3, total: 60000 },
    extras: [], area: 3, total: 900000,
  }],
  additionalItems: [
    { id: 'curtain', name: 'Curtain Wall', unit: 'sqm', rate: 240000, quantity: 5, total: 1200000 },
    { id: 'fixed-door', name: 'Photocell Door', unit: 'item', rate: 450000, quantity: 2, total: 900000 },
  ],
};
type PriceRequest = {
  action: string;
  revision: number;
  systemRates: { openingId: string; rate: number }[];
  additionalRates: { id: string; rate: number }[];
  replaceUnsignedContract: boolean;
};
let bundle = '';
let styles = '';

test.beforeAll(async ({ request }) => {
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {QuotationWorkspace} from '@/components/workflow/QuotationWorkspace';import {SharedQuotationProjects} from '@/components/workflow/SharedQuotationProjects';createRoot(document.getElementById('root')!).render(<I18nProvider>{location.pathname==='/qa/shared-quotation-projects'?<SharedQuotationProjects/>:<QuotationWorkspace projectId="${projectId}"/>}</I18nProvider>);`);
  writeFileSync(resolve(output, 'loader.cjs'), "const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};");
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({
    mode: 'production', target: 'web', context: process.cwd(), devtool: false,
    entry: resolve(output, 'entry.tsx'), output: { path: output, filename: 'component.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [resolve(output, 'loader.cjs')] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
  bundle = readFileSync(resolve(output, 'component.js'), 'utf8');
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
});

async function fixture(page: Page, locale: 'en' | 'ar' = 'en') {
  const quotation = structuredClone(initial);
  let revision = 1;
  let stage = 'quotation';
  let status = 'quotation_in_progress';
  let pending: 'requested' | 'submitted' | null = null;
  let signed = false;
  let accepted = false;
  let failure = '';
  let reloadedRate: number | undefined;
  const posts: PriceRequest[] = [];
  const errors: string[] = [];
  const unexpected: string[] = [];
  const messages = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8'));
  const term = (key: string, replacements: Record<string, string | number> = {}) => {
    let result: string = messages.terms[key] ?? key;
    for (const [name, value] of Object.entries(replacements)) result = result.replaceAll(`{${name}}`, String(value));
    return result;
  };
  await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== 'http://localhost:3003') { unexpected.push(request.method() + ' ' + url.origin); return route.abort('blockedbyclient'); }
    if (url.pathname === `/api/sales-flow/${projectId}` && request.method() === 'POST') {
      const body = request.postDataJSON() as PriceRequest;
      posts.push(body);
      if (failure) return route.fulfill({ status: 409, json: { error: failure } });
      assert.equal(body.action, 'save-shared-prices'); assert.equal(body.revision, revision);
      assert.equal(signed || accepted || !!pending, false);
      assert.ok(stage !== 'contract' || body.replaceUnsignedContract);
      for (const rate of body.systemRates) {
        const line = quotation.lines.find(item => item.opening.id === rate.openingId)!;
        line.system.rate = rate.rate; line.system.total = rate.rate * line.system.quantity;
        line.total = line.system.total + (line.glass?.total ?? 0) + line.extras.reduce((sum, extra) => sum + extra.total, 0);
      }
      for (const rate of body.additionalRates) {
        const item = quotation.additionalItems!.find(item => item.id === rate.id)!;
        item.rate = rate.rate; item.total = rate.rate * item.quantity;
      }
      if (reloadedRate !== undefined) {
        quotation.lines[0].system.rate = reloadedRate;
        quotation.lines[0].system.total = reloadedRate * quotation.lines[0].system.quantity;
        quotation.lines[0].total = quotation.lines[0].system.total + (quotation.lines[0].glass?.total ?? 0);
      }
      quotation.total = quotation.lines.reduce((sum, line) => sum + line.total, 0) + quotation.additionalItems!.reduce((sum, item) => sum + item.total, 0);
      quotation.version = (quotation.version ?? 1) + 1; revision++; stage = 'quotation'; status = 'quotation_in_progress';
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname === `/api/sales-flow/${projectId}`) {
      const flow: SalesFlow = { project_id: projectId, revision, stage, quotation, contract: null, evidence: null, signed_at: signed ? '2026-11-23T09:00:00Z' : null, accepted_at: accepted ? '2026-11-23T09:00:00Z' : null, accepted_by: accepted ? 'operations' : null };
      return route.fulfill({ json: { quotationAccess: 'prices', project: { id: projectId, project_name: 'Rasafa shared project', project_number: 'PRJ-202611-0452', address: 'Baghdad', branch: 'Rasafa', sales_status: status, additional_openings_state: pending, follow_up_owner_id: 'duaa' }, client: { name: 'Fixture client', mobile: '07000000000' }, flow, catalog, openings: initial.lines.map(line => line.opening), history: [] } });
    }
    if (url.pathname.startsWith('/api/')) { unexpected.push(request.method() + ' ' + url.pathname); return route.fulfill({ status: 403, json: { error: 'Shared price access does not allow this operation.' } }); }
    if (url.pathname === `/quotation/${projectId}` && request.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/qa/shared-prices.js"></script></body></html>` });
    if (url.pathname === '/qa/shared-prices.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  const open = () => page.goto(`/quotation/${projectId}`);
  const form = () => page.getByRole('form', { name: term('Shared quotation prices'), exact: true });
  const systemInput = () => form().getByRole('spinbutton', { name: term('System price for opening {number}', { number: 1 }), exact: true });
  const curtainInput = () => form().getByRole('spinbutton', { name: term('Unit price for {name}', { name: term('Curtain Wall') }), exact: true });
  const save = () => form().getByRole('button', { name: term('Save revised quotation'), exact: true });
  return { term, posts, errors, unexpected, open, form, systemInput, curtainInput, save,
    lock: (kind: 'signed' | 'accepted' | 'closed' | 'requested' | 'submitted') => {
      signed = kind === 'signed'; accepted = kind === 'accepted'; status = kind === 'closed' ? 'closed' : 'quotation_in_progress';
      pending = kind === 'requested' || kind === 'submitted' ? kind : null;
    },
    contract: () => { stage = 'contract'; status = 'contract_generated'; },
    fail: (message: string) => { failure = message; },
    reloadWithRate: (rate: number) => { reloadedRate = rate; },
    quote: () => quotation,
  };
}

for (const locale of ['en', 'ar'] as const) test(`${locale}: shared access edits prices while keeping products, measurements and ownership intact`, async ({ page }, testInfo) => {
  const view = await fixture(page, locale);
  await view.open();
  await expect(view.form()).toBeVisible();
  await expect(page.getByText('PRJ-202611-0452', { exact: false }).first()).toBeVisible();
  await expect(view.systemInput()).toHaveValue('280000');
  await expect(view.curtainInput()).toHaveValue('240000');
  await expect(view.form().getByRole('spinbutton')).toHaveCount(2);
  await expect(view.save()).toBeDisabled();
  for (const action of ['+ Add product', 'Edit quotation', 'Edit size', 'Record client approval', 'Generate contract', 'Add more openings', 'Open contract →']) {
    await expect(page.getByRole('button', { name: view.term(action), exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: view.term(action), exact: true })).toHaveCount(0);
  }
  await view.systemInput().fill('239999');
  await expect(view.save()).toBeDisabled();
  await view.systemInput().fill('310000'); await view.curtainInput().fill('260000');
  await expect(view.save()).toBeEnabled();
  await view.save().click();
  await expect(view.systemInput()).toHaveValue('310000');
  await expect(view.curtainInput()).toHaveValue('260000');
  await expect(view.save()).toBeDisabled();
  expect(view.posts).toEqual([{ action: 'save-shared-prices', revision: 1, systemRates: [{ openingId: 'opening-1', rate: 310000 }], additionalRates: [{ id: 'curtain', rate: 260000 }, { id: 'fixed-door', rate: 450000 }], replaceUnsignedContract: false }]);
  expect(view.quote().branch).toBe('Rasafa');
  expect(view.quote().lines[0].opening).toEqual(initial.lines[0].opening);
  expect(view.quote().lines[0].glass).toEqual(initial.lines[0].glass);
  expect(view.quote().additionalItems![1]).toEqual(initial.additionalItems![1]);
  expect(view.errors).toEqual([]); expect(view.unexpected).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`${locale}-shared-prices.png`), fullPage: true });
});

test('shared price editing remains locked for signed, accepted, closed and pending-measurement projects', async ({ page }) => {
  const view = await fixture(page);
  for (const kind of ['signed', 'accepted', 'closed', 'requested', 'submitted'] as const) {
    view.lock(kind); await view.open();
    await expect(view.form()).toBeVisible(); await expect(view.systemInput()).toBeDisabled();
    await expect(view.curtainInput()).toBeDisabled(); await expect(view.save()).toBeDisabled();
  }
  expect(view.posts).toEqual([]); expect(view.errors).toEqual([]); expect(view.unexpected).toEqual([]);
});

test('shared price editing requires unsigned-contract confirmation and retains conflicts for review', async ({ page }) => {
  const view = await fixture(page);
  view.contract(); await view.open(); await view.systemInput().fill('310000');
  await expect(view.save()).toBeDisabled();
  await view.form().getByRole('checkbox').check(); await expect(view.save()).toBeEnabled();
  view.fail('The project changed. Reload and try again.'); await view.save().click();
  await expect(page.getByRole('alert')).toContainText('The project changed. Reload and try again.');
  await expect(view.systemInput()).toHaveValue('310000');
  expect(view.posts).toHaveLength(1); expect(view.posts[0].replaceUnsignedContract).toBe(true);
  expect(view.quote()).toEqual(initial); expect(view.errors).toEqual([]); expect(view.unexpected).toEqual([]);
});

test('shared editor resets draft rates from the successfully reloaded revision', async ({ page }) => {
  const view = await fixture(page);
  view.reloadWithRate(315000);
  await view.open(); await view.systemInput().fill('310000'); await view.save().click();
  await expect(view.systemInput()).toHaveValue('315000');
  await expect(view.save()).toBeDisabled();
  expect(view.posts).toHaveLength(1);
  expect(view.quote().version).toBe(2);
  expect(view.errors).toEqual([]); expect(view.unexpected).toEqual([]);
});

async function sharedProjectsFixture(page: Page, locale: 'en' | 'ar') {
  let mode: 'grant' | 'empty' | 'error' = 'grant';
  let requests = 0;
  const errors: string[] = [];
  const unexpected: string[] = [];
  const messages = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8'));
  const term = (key: string) => messages.terms[key] ?? key;
  const sharedProject = { id: projectId, project_number: 'PRJ-202611-0452', project_name: 'Rasafa project shared with Lina', branch: 'Rasafa', sales_status: 'quotation_in_progress', updated_at: '2026-11-21T09:38:02Z' };
  await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== 'http://localhost:3003') { unexpected.push(request.method() + ' ' + url.origin); return route.abort('blockedbyclient'); }
    if (url.pathname === '/api/shared-quotations' && request.method() === 'GET') {
      requests++;
      return mode === 'error'
        ? route.fulfill({ status: 503, json: { error: 'Unable to load shared quotations.' } })
        : route.fulfill({ json: { projects: mode === 'empty' ? [] : [sharedProject] } });
    }
    if (url.pathname.startsWith('/api/')) { unexpected.push(request.method() + ' ' + url.pathname); return route.fulfill({ status: 403, json: { error: 'Unexpected operation blocked.' } }); }
    if (url.pathname === '/qa/shared-quotation-projects' && request.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><main class="mx-auto max-w-5xl px-5 py-9"><div id="root"></div></main><script src="/qa/shared-prices.js"></script></body></html>` });
    if (url.pathname === '/qa/shared-prices.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  const open = async () => {
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/shared-quotations'),
      page.goto('/qa/shared-quotation-projects'),
    ]);
  };
  const region = () => page.getByRole('region', { name: term('Shared quotations'), exact: true });
  return { term, open, region, errors, unexpected, requests: () => requests,
    setMode: (next: typeof mode) => { mode = next; },
    link: () => region().getByRole('link', { name: `${term('View quotation / Edit prices')} — ${sharedProject.project_number}`, exact: true }),
  };
}

for (const locale of ['en', 'ar'] as const) test(`${locale}: shared-project entries link only to the granted quotation and hide an empty list`, async ({ page }) => {
  const view = await sharedProjectsFixture(page, locale);
  await view.open(); await expect(view.region()).toBeVisible();
  await expect(view.region()).toContainText('PRJ-202611-0452');
  await expect(view.link()).toHaveAttribute('href', `/quotation/${projectId}`);
  await expect(view.region().getByRole('link')).toHaveCount(1);
  await expect(view.region().getByRole('button')).toHaveCount(0);
  await expect(page.locator('a[href*="mini-crm"],a[href*="follow-ups"],a[href*="initial-measurements"],a[href*="contract"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  view.setMode('empty'); await view.open(); await expect(view.region()).toHaveCount(0);
  expect(view.requests()).toBe(2); expect(view.errors).toEqual([]); expect(view.unexpected).toEqual([]);
});

test('shared-project errors expose a scoped retry without ordinary project actions', async ({ page }) => {
  const view = await sharedProjectsFixture(page, 'en');
  view.setMode('error'); await view.open();
  await expect(view.region().getByRole('alert')).toHaveText(view.term('Unable to load shared quotations.'));
  await expect(view.region().getByRole('link')).toHaveCount(0);
  await expect(view.region().getByRole('button')).toHaveCount(1);
  view.setMode('grant'); await view.region().getByRole('button', { name: view.term('Try again'), exact: true }).click();
  await expect(view.link()).toHaveAttribute('href', `/quotation/${projectId}`);
  await expect(view.region().getByRole('alert')).toHaveCount(0);
  await expect(view.region().getByRole('button')).toHaveCount(0);
  expect(view.requests()).toBe(2); expect(view.errors).toEqual([]); expect(view.unexpected).toEqual([]);
});
