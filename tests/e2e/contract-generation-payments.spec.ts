import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import { buildAgreement2027Snapshot, emptyAgreement2027Fields } from '../../src/lib/contracts/agreement2027';
import { agreement2027PaymentSchedule, agreement2027Terms } from '../../src/lib/contracts/agreement2027Content';
import { priceQuotation, type CatalogItem, type MeasuredOpening } from '../../src/lib/workflow/pricing';
import type { ContractSnapshot, SalesFlow } from '../../src/lib/workflow/types';

// Browser connector tools are unavailable. Compile the real quotation and
// contract components, use local styles, and mock every business API request.
const output = resolve('.next/cache/qa-contract-generation-payments');
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
const projectId = '11111111-1111-4111-8111-111111111111';
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Indoor employee', role: 'Indoor Sales', branch: 'Karkh' };
const endpoint = `/api/sales-flow/${projectId}`;

test.beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {QuotationWorkspace} from '@/components/workflow/QuotationWorkspace';import {ContractWorkspace} from '@/components/workflow/ContractWorkspace';const Content=location.pathname.startsWith('/contract/')?ContractWorkspace:QuotationWorkspace;createRoot(document.getElementById('root')!).render(<I18nProvider><Content projectId="${projectId}"/></I18nProvider>);`);
  writeFileSync(resolve(output, 'typescript-loader.cjs'), `const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};`);
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({
    mode: 'production', target: 'web', context: process.cwd(), devtool: false,
    entry: resolve(output, 'entry.tsx'), output: { path: output, filename: 'component.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [resolve(output, 'typescript-loader.cjs')] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
});

for (const locale of ['en', 'ar'] as const) for (const clientType of ['individual', 'company'] as const) for (const kind of ['residential', 'commercial'] as const) for (const total of [1_000_001, 20_000_001]) {
  test(`${locale}: ${clientType} client explicitly chooses ${kind} with approved total ${total}`, async ({ page, context, request }) => {
    const messages = locale === 'en' ? en : ar;
    const term = (key: string) => (messages.terms as Record<string, string>)[key] ?? key;
    const number = (amount: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(amount);
    const money = (amount: number) => number(amount) + (locale === 'ar' ? ' د.ع' : ' IQD');
    const opening: MeasuredOpening = { id: 'approved-opening', floor: 'GF', room: 'Office', width: 100, height: 100, quantity: 1, opening_type: 'Window', opening_direction: 'Sliding' };
    const catalog: CatalogItem[] = [{ id: 'system', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: total, is_active: true }];
    const quotation = { ...priceQuotation([opening], [{ openingId: opening.id, systemId: 'system', glassId: '', extras: [] }], catalog, actor.id), version: 2, createdAt: '2026-11-16T09:00:00Z' };
    const client = { name: 'Approved client', mobile: '07700000000', client_type: clientType };
    const project = { id: projectId, project_name: 'Contract choice fixture', project_number: 'PRJ-CONTRACT-CHOICE', address: 'Saved project address', branch: 'Karkh' as const, sales_status: 'quotation_approved', structure_readiness: 'ready', created_by: actor.id, registeredBy: actor.name, created_at: '2026-11-15T09:00:00Z', updated_at: '2026-11-16T09:00:00Z' };
    let flow: SalesFlow = { project_id: projectId, revision: 3, stage: 'approved', quotation: structuredClone(quotation), contract: null, signed_at: null, evidence: null };
    const posts: { action: string; revision: number; template: 'residential' | 'commercial' }[] = [];
    const errors: string[] = [], unexpected: string[] = [];
    const login = await request.get('/login'); expect(login.status()).toBe(200);
    const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
    const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/qa/contract-generation-payments.js"></script></body></html>`;
    await context.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== 'http://localhost:3003') { unexpected.push(req.method() + ' ' + url.origin); return route.abort('blockedbyclient'); }
      if ([`/quotation/${projectId}`, `/contract/${projectId}`].includes(url.pathname) && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
      if (url.pathname === '/qa/contract-generation-payments.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, 'component.js')) });
      if (url.pathname === endpoint && req.method() === 'POST') {
        const body = req.postDataJSON();
        assert.deepEqual(body, { action: 'contract', revision: 3, template: kind });
        assert.equal(flow.stage, 'approved');
        const fields = emptyAgreement2027Fields();
        fields.clientLegalName = client.name; fields.directPhone = client.mobile; fields.clientClassification = clientType === 'company' ? 'شركة' : 'فرد';
        const contract: ContractSnapshot = { number: 'CT-PRJ-CONTRACT-CHOICE-3', createdAt: '2026-11-16T10:00:00Z', createdBy: actor.id, template: body.template, branch: 'Karkh', client: structuredClone(client), project: { name: project.project_name, number: project.project_number, address: project.address, branch: project.branch }, quotation: structuredClone(flow.quotation), terms: agreement2027Terms(body.template), agreement2027: buildAgreement2027Snapshot(flow.quotation, body.template, fields) };
        flow = { ...flow, revision: 4, stage: 'contract', contract }; project.sales_status = 'contract_generated'; posts.push(body);
        return route.fulfill({ json: { flow } });
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(req.method() + ' ' + url.pathname); return route.fulfill({ status: 405, json: { error: 'Unexpected business write blocked' } }); }
      if (url.pathname === endpoint) return route.fulfill({ json: { project, client, flow, history: [], openings: [opening], catalog: catalog.map(item => ({ ...item, unit_price: 999999 })) } });
      if (url.pathname.startsWith('/api/measurement-reports/')) return route.fulfill({ json: { reports: [] } });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { actor, projects: [project], queue: [], openings: [], indoorSales: [], outdoorSales: [], syncedAt: null } });
      return route.continue();
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

    await page.goto(`/quotation/${projectId}`);
    const generation = page.getByRole('region', { name: term('Contract generation'), exact: true });
    const select = generation.getByRole('combobox', { name: term('Contract type'), exact: true });
    const generate = generation.getByRole('button', { name: term('Generate contract'), exact: true });
    const preview = generation.getByRole('region', { name: term('Payment schedule preview'), exact: true });
    await expect(select).toHaveValue(''); await expect(select).toHaveAttribute('required', ''); await expect(generate).toBeDisabled();
    await expect(preview).toHaveCount(0);
    await expect(select.locator('option')).toHaveText([term('Choose contract type'), term('Residential contract'), term('Commercial contract')]);
    expect(posts).toHaveLength(0);
    // Both choices are independent of whether this client is a person/company.
    const alternate = kind === 'residential' ? 'commercial' : 'residential';
    await select.selectOption(alternate); await expect(preview).toBeVisible(); await expect(generate).toBeEnabled();
    await select.selectOption(''); await expect(preview).toHaveCount(0); await expect(generate).toBeDisabled();
    await select.selectOption(kind);
    const stages = agreement2027PaymentSchedule(quotation.total, kind);
    expect(stages.map(stage => stage.percent)).toEqual(kind === 'residential' ? [50, 50] : total < 15000000 ? [100] : [25, 25, 25, 15, 10]);
    await expect(preview).toContainText(money(total));
    await expect(preview.locator('[data-contract-payment-stage]')).toHaveCount(stages.length);
    for (const stage of stages) {
      const row = preview.locator(`[data-contract-payment-stage="${stage.id}"]`);
      await expect(row).toHaveAttribute('data-percent', String(stage.percent)); await expect(row).toHaveAttribute('data-amount', String(stage.amount));
      await expect(row).toContainText(term(stage.label)); await expect(row).toContainText(term(stage.trigger)); await expect(row).toContainText(money(stage.amount));
    }
    await expect(preview.getByText(term('Commercial contracts below 15,000,000 IQD require 100% at signing.'), { exact: true })).toHaveCount(kind === 'commercial' && total < 15000000 ? 1 : 0);
    if (locale === 'en') expect(await preview.textContent()).not.toMatch(/[\u0600-\u06ff]/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await generation.screenshot({ path: test.info().outputPath('before-generation-payment-preview.png') });
    expect(posts).toHaveLength(0);
    await generate.click();
    await expect(page.getByRole('link', { name: term('Open contract →'), exact: true })).toBeVisible();
    expect(posts).toEqual([{ action: 'contract', revision: 3, template: kind }]);
    expect(flow.quotation).toEqual(quotation); expect(flow.contract!.quotation).toEqual(quotation);
    expect(flow.contract!.template).toBe(kind); expect(flow.contract!.client.client_type).toBe(clientType);
    expect(flow.contract!.agreement2027!.paymentSchedule).toEqual(stages);
    const saved = structuredClone(flow.contract!);

    await page.goto(`/contract/${projectId}`);
    const payments = page.locator('[data-agreement-section="payments"]');
    await expect(payments).toBeVisible();
    await expect(payments.locator('[data-payment-stage]')).toHaveCount(stages.length);
    for (const stage of stages) {
      const row = payments.locator(`[data-payment-stage="${stage.id}"]`);
      await expect(row).toContainText(`${stage.percent}%`); await expect(row).toContainText(number(stage.amount)); await expect(row).toContainText(stage.trigger);
    }
    await payments.screenshot({ path: test.info().outputPath('saved-contract-payment-schedule.png') });
    await page.reload(); await expect(payments).toBeVisible();
    expect(flow.contract).toEqual(saved); expect(flow.quotation.total).toBe(total); expect(posts).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]); expect(unexpected).toEqual([]);
  });
}
