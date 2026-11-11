import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { priceQuotation, type QuoteSnapshot } from '../../src/lib/workflow/pricing';
import type { QuotationRevision } from '../../src/lib/workflow/types';

const output = resolve('.next/cache/qa-quotation-discounts-disabled');
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
const projectId = '11111111-1111-4111-8111-111111111111';
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'Indoor Sales', name: 'Indoor employee', branch: 'Karkh' };
const opening = { id: 'sliding', floor: 'GF', room: 'Office', width: 1000, height: 700, quantity: 1, opening_type: 'Window', opening_direction: 'Sliding' };
const product = { id: 'alumex', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 278000, is_active: true };
const choice = { openingId: opening.id, systemId: product.id, systemRate: 278000, glassId: '', extras: [] };
const project = { id: projectId, project_name: 'Discount policy fixture', project_number: 'PRJ-DISCOUNT', address: 'Baghdad', branch: 'Karkh', sales_status: 'quotation_in_progress', structure_readiness: 'ready', created_by: actor.id, registeredBy: actor.name, created_at: '2026-11-11T08:00:00Z', updated_at: '2026-11-11T08:00:00Z' };
const removalNotice = 'This saved quotation includes a 5% discount. Saving a revision will remove the discount.';

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

for (const locale of ['en', 'ar'] as const) test(`${locale}: discounts stay in saved history while new quotations, revisions and price updates use full amounts`, async ({ page, context, request }) => {
  test.setTimeout(60000);
  const messages = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8'));
  const term = (value: string) => messages.terms[value] ?? value;
  const money = (amount: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(amount) + (locale === 'ar' ? ' د.ع' : ' IQD');
  const gross: QuoteSnapshot = { ...priceQuotation([opening], [choice], [product], actor.id), version: 1 };
  // This fixture represents an already saved document from when discounts existed.
  const legacy: QuoteSnapshot = { ...structuredClone(gross), total: gross.total * 0.95, discount: { percent: 5, subtotal: gross.total, amount: gross.total * 0.05 } };
  let saved = structuredClone(legacy), revision = 3, stage = 'quotation', hasFlow = true, hasContract = false;
  const history: QuotationRevision[] = [], posts: Array<{ action: string; discountPercent?: number; replaceUnsignedContract?: boolean }> = [];
  const errors: string[] = [], unexpected: string[] = [];
  const archive = () => history.unshift({ version: saved.version!, quotation: structuredClone(saved), contract: null, previous_stage: stage, superseded_at: '2026-11-11T09:00:00Z' });
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Alumex Quotation System</title></head><body><div id="root"></div><script src="/qa/quotation-discount-disabled.bundle.js"></script></body></html>`;
  await context.addInitScript(value => {
    localStorage.setItem('alumex_locale', value);
    window.print = () => { document.documentElement.dataset.printed = 'true'; };
  }, locale);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname !== 'localhost') { unexpected.push(req.method() + ' ' + url.hostname); return route.abort('blockedbyclient'); }
    if (url.pathname === `/api/sales-flow/${projectId}` && req.method() === 'POST') {
      try {
        const body = req.postDataJSON(); posts.push(body);
        assert.equal(body.revision, hasFlow ? revision : 0);
        assert.notEqual(body.discountPercent, 5);
        if (body.action === 'preview-prices') return route.fulfill({ json: { quotation: gross, priceKey: 'gross-preview', revision } });
        if (body.action === 'approve') { assert.equal(body.confirmed, true); stage = 'approved'; revision++; }
        else if (body.action === 'contract') { stage = 'contract'; hasContract = true; revision++; }
        else if (body.action === 'save' || body.action === 'update-prices') {
          if (stage === 'contract') assert.equal(body.replaceUnsignedContract, true);
          if (body.action === 'save') assert.equal(body.discountPercent, 0);
          else { assert.equal(body.priceKey, 'gross-preview'); assert.equal(body.confirmed, true); }
          if (hasFlow) archive();
          saved = { ...structuredClone(gross), version: hasFlow ? saved.version! + 1 : 1 };
          hasFlow = true; stage = 'quotation'; hasContract = false; revision++;
        } else throw new Error('Unexpected action: ' + body.action);
        return route.fulfill({ json: { ok: true } });
      } catch (error) { errors.push((error as Error).message); return route.fulfill({ status: 400, json: { error: (error as Error).message } }); }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(req.method() + ' ' + url.pathname); return route.fulfill({ status: 405, json: { error: 'Unexpected write blocked' } }); }
    if (url.pathname === `/quotation/${projectId}` && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/qa/quotation-discount-disabled.bundle.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, 'workspace.bundle.js')) });
    if (url.pathname === `/api/sales-flow/${projectId}`) return route.fulfill({ json: { project: { ...project, sales_status: stage === 'contract' ? 'contract_generated' : stage === 'approved' ? 'quotation_approved' : project.sales_status }, client: { name: 'Fixture client', mobile: '07000000000' }, openings: [opening], catalog: [product], history, flow: hasFlow ? { project_id: projectId, revision, stage, signed_at: null, quotation: saved, contract: hasContract ? { number: 'CT-FIXTURE' } : null, evidence: null } : null } });
    if (url.pathname.startsWith('/api/measurement-reports/')) return route.fulfill({ json: { reports: [] } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { actor, projects: [project], openings: [], queue: [], syncedAt: null } });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const edit = () => page.getByRole('button', { name: term('Edit quotation'), exact: true });
  const save = () => page.getByRole('button', { name: term('Save revised quotation'), exact: true });
  const documentTotal = () => page.locator('.document-total strong');
  const noDiscountControls = async () => {
    await expect(page.getByRole('heading', { name: term('Quotation discount'), exact: true })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: term('Apply 5% discount'), exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: term('Quotation discount'), exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: term('Save discount'), exact: true })).toHaveCount(0);
  };
  await page.goto(`/quotation/${projectId}`);
  await expect(page).toHaveTitle(messages.app.title);
  await expect(page).toHaveURL(`http://localhost:3003/quotation/${projectId}`);
  await noDiscountControls();
  await expect(documentTotal()).toHaveText(money(legacy.total));
  await expect(page.locator('.commercial-document').getByText(term('Discount (5%)'), { exact: true })).toBeVisible();
  await expect(page.locator('.document-opening-area-indicator .opening-area-red')).toHaveCount(1);
  await expect(page.getByRole('region', { name: term('Suggested average system rate'), exact: true })).toContainText(money(265000));
  await expect(page.getByText(term('Suggested prices before discount'), { exact: true })).toHaveCount(0);
  const print = page.getByRole('button', { name: term('Print quotation'), exact: true });
  await expect(print).toBeEnabled(); await print.click();
  await expect(page.locator('html')).toHaveAttribute('data-printed', 'true');
  const approval = page.getByRole('checkbox', { name: term('The client approved this saved quotation.'), exact: true });
  await expect(approval).toBeEnabled(); await approval.check();
  await page.getByRole('button', { name: term('Record client approval'), exact: true }).click();
  await expect(page.getByRole('button', { name: term('Generate contract'), exact: true })).toBeEnabled();
  expect(saved).toEqual(legacy);
  await page.getByRole('button', { name: term('Generate contract'), exact: true }).click();
  await expect(page.getByRole('link', { name: term('Open contract →'), exact: true })).toBeVisible();
  await noDiscountControls();
  expect(saved).toEqual(legacy);
  await edit().click(); await noDiscountControls();
  await expect(page.getByText(term(removalNotice), { exact: true })).toBeVisible();
  await expect(page.getByLabel(term('Draft total'), { exact: true })).toHaveText(money(gross.total));
  await expect(documentTotal()).toHaveText(money(legacy.total));
  await expect(save()).toBeDisabled();
  await page.getByRole('checkbox', { name: term('Replace the unsigned contract. The previous document will be kept in history, and the revised quotation must be approved before a new contract can be generated.'), exact: true }).check();
  await expect(save()).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath(`${locale}-legacy-discount-revision.png`), fullPage: true });
  await save().click(); await expect(edit()).toBeVisible();
  expect(saved.discount).toBeUndefined(); expect(saved.total).toBe(gross.total);
  await expect(documentTotal()).toHaveText(money(gross.total));
  await page.getByRole('combobox', { name: term('Quotation version'), exact: true }).selectOption('1');
  await expect(documentTotal()).toHaveText(money(legacy.total));
  await expect(page.locator('.commercial-document').getByText(term('Discount (5%)'), { exact: true })).toBeVisible();
  await expect(page.locator('.document-opening-area-indicator .opening-area-red')).toHaveCount(1);
  expect(history[0].quotation).toEqual(legacy);

  saved = structuredClone(legacy); stage = 'quotation'; revision = 3; history.length = 0;
  await page.reload();
  await page.getByRole('button', { name: term('Update prices'), exact: true }).click();
  const preview = page.getByRole('region', { name: term('Update quotation prices'), exact: true });
  await expect(preview).toBeVisible(); await noDiscountControls();
  await expect(page.getByText(term(removalNotice), { exact: true })).toBeVisible();
  await expect(preview).toContainText(money(legacy.total)); await expect(preview).toContainText(money(gross.total));
  await expect(documentTotal()).toHaveText(money(legacy.total));
  await page.getByRole('button', { name: term('Save updated prices'), exact: true }).click();
  await expect(preview).toHaveCount(0); await expect(documentTotal()).toHaveText(money(gross.total));
  expect(saved.discount).toBeUndefined(); expect(history[0].quotation).toEqual(legacy);

  hasFlow = false; stage = 'quotation'; revision = 0; history.length = 0;
  await page.reload(); await noDiscountControls();
  await expect(page.getByLabel(term('Draft total'), { exact: true })).toHaveText(money(gross.total));
  await expect(page.getByText(term(removalNotice), { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: term('Generate quotation'), exact: true }).click();
  await expect(edit()).toBeVisible(); await noDiscountControls();
  await expect(documentTotal()).toHaveText(money(gross.total));
  expect(saved.discount).toBeUndefined();
  await page.screenshot({ path: test.info().outputPath(`${locale}-new-quotation-without-discount.png`), fullPage: true });
  expect(posts.map(post => post.action)).toEqual(['approve', 'contract', 'save', 'preview-prices', 'update-prices', 'save']);
  await expect(page.locator('nextjs-portal')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});
