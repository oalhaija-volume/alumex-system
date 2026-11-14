import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import { quotationOpenings } from '../../src/lib/workflow/quotationOpenings';
import { priceQuotation, type CatalogItem, type MeasuredOpening, type OpeningChoice, type QuoteSnapshot } from '../../src/lib/workflow/pricing';
import type { RegistrationOpening } from '../../src/lib/measurements/registrationOpening';
import type { QuotationRevision } from '../../src/lib/workflow/types';

// Browser plugin unavailable. Mount the actual quotation editor with local API
// fixtures so this regression does not require an account or business writes.
const localHeadless = [
  resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  resolve('artifacts/mini-crm-review-20261015/browser/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
].find(path => existsSync(path));
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath: localHeadless } });
const projectId = '11111111-1111-4111-8111-111111111111';
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'Indoor Sales', name: 'Indoor employee', branch: 'Karkh' };
const originalOpening: MeasuredOpening = { id: '22222222-2222-4222-8222-222222222222', floor: 'GF', room: 'Office', width: 200, height: 100, quantity: 1, opening_type: 'Window', opening_direction: 'Sliding' };
const catalog: CatalogItem[] = [
  { id: 'system', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true },
  { id: 'glass', name: 'Double Glass', category: 'glass_option', unit: 'sqm', unit_price: 10000, is_active: true },
  { id: 'handle', name: 'Handle', category: 'addon', unit: 'item', unit_price: 5000, is_active: true },
];
const project = { id: projectId, project_name: 'Repeated quotation opening fixture', project_number: 'PRJ-QUANTITY', address: 'Baghdad', branch: 'Karkh', sales_status: 'quotation_in_progress', structure_readiness: 'ready', created_by: actor.id, registeredBy: actor.name, created_at: '2026-11-14T08:00:00Z', updated_at: '2026-11-14T08:00:00Z' };
const messages = { en, ar };
let bundle: string;
let stylesheetLinks: string;
type BundleStats = { hasErrors(): boolean; toString(options: Record<string, unknown>): string };
type WebpackRunner = ((configuration: Record<string, unknown>, callback: (error: Error | null, stats?: BundleStats) => void) => void) & { DefinePlugin: new (definitions: Record<string, string>) => unknown };

test.beforeAll(async ({ request }, testInfo) => {
  const output = testInfo.outputPath('quotation-component');
  await mkdir(output, { recursive: true });
  const entry = resolve(output, 'entry.tsx');
  const loader = resolve(output, 'typescript-loader.cjs');
  await writeFile(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {QuotationWorkspace} from '@/components/workflow/QuotationWorkspace';createRoot(document.getElementById('root')!).render(<I18nProvider><QuotationWorkspace projectId="${projectId}"/></I18nProvider>);`);
  await writeFile(loader, "const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};");
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack') as { webpack: WebpackRunner };
  await new Promise<void>((accept, reject) => webpack({
    mode: 'production', target: 'web', context: process.cwd(), entry,
    output: { path: output, filename: 'component.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error, stats) => error ? reject(error) : !stats || stats.hasErrors() ? reject(new Error(stats?.toString({ all: false, errors: true }) ?? 'Unable to bundle quotation editor.')) : accept()));
  bundle = await readFile(resolve(output, 'component.js'), 'utf8');
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  stylesheetLinks = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  expect(stylesheetLinks).toContain('/_next/');
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: revised quotation saves identical openings as one quantity and retains scaled prices after reload`, async ({ page }, testInfo) => {
  const term = (key: string) => (messages[locale].terms as Record<string, string>)[key] ?? key;
  const money = (amount: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(amount) + (locale === 'ar' ? ' د.ع' : ' IQD');
  let openings = [structuredClone(originalOpening)];
  const initialChoices: OpeningChoice[] = [{ openingId: originalOpening.id, systemId: 'system', glassId: '', extras: [] }];
  const initial: QuoteSnapshot = { ...priceQuotation(openings, initialChoices, catalog, actor.id), version: 1 };
  let saved = structuredClone(initial);
  let revision = 1;
  const history: QuotationRevision[] = [];
  const posts: { action: string; revision: number; choices: OpeningChoice[]; newOpenings: RegistrationOpening[]; additionalItems: []; discountPercent: 0 }[] = [];
  const errors: string[] = [], unexpected: string[] = [];
  await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (url.origin !== 'http://localhost:3003') { unexpected.push(`${req.method()} ${url.origin}`); return route.abort('blockedbyclient'); }
    if (path === `/api/sales-flow/${projectId}` && req.method() === 'POST') {
      const body = req.postDataJSON() as typeof posts[number];
      expect(body.action).toBe('save'); expect(body.revision).toBe(revision);
      expect(body.newOpenings).toHaveLength(1);
      expect(body.newOpenings[0]).toMatchObject({ floor: 'GF', room: 'Office', structuralType: 'Window', openingType: 'Sliding', hasArch: false, width: 50, height: 50, quantity: 3 });
      openings = quotationOpenings(openings, body.newOpenings);
      const next = priceQuotation(openings, body.choices, catalog, actor.id, body.additionalItems, body.discountPercent);
      history.unshift({ version: saved.version!, quotation: structuredClone(saved), contract: null, previous_stage: 'quotation', superseded_at: '2026-11-14T11:00:00Z' });
      saved = { ...next, version: saved.version! + 1 }; revision++; posts.push(body);
      return route.fulfill({ json: { flow: { quotation: saved, revision } } });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(`${req.method()} ${path}`); return route.fulfill({ status: 405, json: { error: 'Unexpected business write blocked.' } }); }
    if (path === `/quotation/${projectId}` && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${stylesheetLinks}</head><body><div id="root"></div><script src="/qa/quotation-quantity.js"></script></body></html>` });
    if (path === '/qa/quotation-quantity.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    if (path === `/api/sales-flow/${projectId}`) return route.fulfill({ json: { project, client: { name: 'Fixture client', mobile: '07000000000' }, openings, catalog, history, flow: { project_id: projectId, revision, stage: 'quotation', signed_at: null, quotation: saved, contract: null, evidence: null } } });
    if (path.startsWith('/api/measurement-reports/')) return route.fulfill({ json: { reports: [] } });
    if (path.startsWith('/api/')) return route.fulfill({ json: { actor, projects: [project], openings: [], queue: [], syncedAt: null } });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const edit = () => page.getByRole('button', { name: term('Edit quotation'), exact: true });
  const cards = () => page.locator('[data-opening-id]');
  const form = () => page.getByRole('form', { name: term('New opening'), exact: true });
  const quantity = () => form().getByRole('spinbutton', { name: term('Number of identical openings'), exact: true });
  const total = () => page.getByLabel(term('Draft total'), { exact: true });
  const save = () => page.getByRole('button', { name: term('Save revised quotation'), exact: true });

  await page.goto(`/quotation/${projectId}`);
  await edit().click();
  await expect(cards()).toHaveCount(1); await expect(total()).toHaveText(money(500000));
  await page.getByRole('button', { name: term('+ Add opening'), exact: true }).click();
  await expect(quantity()).toHaveValue('1');
  await expect(quantity()).toHaveAttribute('inputmode', 'numeric');
  await expect(save()).toBeDisabled();
  await form().getByRole('textbox', { name: term('Floor'), exact: true }).fill('GF');
  await form().getByRole('combobox', { name: term('Room'), exact: true }).selectOption('Office');
  await form().getByRole('combobox', { name: term('Structural type'), exact: true }).selectOption('Window');
  await form().getByRole('combobox', { name: term('Opening type'), exact: true }).selectOption('Sliding');
  await form().getByRole('combobox', { name: term('Opening arch'), exact: true }).selectOption('false');
  await form().getByRole('spinbutton', { name: term('Width (cm)'), exact: true }).fill('50');
  await form().getByRole('spinbutton', { name: term('Height (cm)'), exact: true }).fill('50');
  for (const invalid of ['', '0', '-1', '1.5', '10001']) {
    await quantity().fill(invalid);
    await form().getByRole('button', { name: term('Add to quotation draft'), exact: true }).click();
    await expect(form()).toBeVisible(); await expect(cards()).toHaveCount(1);
    expect(await quantity().evaluate(input => (input as HTMLInputElement).validity.valid)).toBe(false);
    expect(posts).toHaveLength(0);
  }
  await quantity().fill('10000');
  expect(await quantity().evaluate(input => (input as HTMLInputElement).validity.valid)).toBe(true);
  await quantity().fill('3');
  await form().screenshot({ path: testInfo.outputPath(`${locale}-quantity-form.png`) });
  await form().getByRole('button', { name: term('Add to quotation draft'), exact: true }).click();
  await expect(form()).toHaveCount(0); await expect(cards()).toHaveCount(2);
  const added = cards().last();
  await expect(added).toContainText(`${term('Quantity')}: 3`);
  await expect(total()).toHaveText(money(1250000));
  await added.getByRole('combobox', { name: term('Glass'), exact: true }).selectOption('glass');
  await added.getByRole('combobox', { name: term('Add an extra'), exact: true }).selectOption('handle');
  const handleQuantity = () => cards().last().getByRole('spinbutton', { name: term('{name} quantity').replace('{name}', term('Handle')), exact: true });
  await handleQuantity().fill('2');
  await expect(total()).toHaveText(money(1310000));
  await page.getByRole('button', { name: term('+ Add opening'), exact: true }).click();
  await quantity().fill('7');
  await form().getByRole('button', { name: term('Cancel opening'), exact: true }).click();
  await expect(cards()).toHaveCount(2); await expect(total()).toHaveText(money(1310000));
  expect(posts).toHaveLength(0);
  await save().click(); await expect(edit()).toBeVisible();
  expect(posts).toHaveLength(1); expect(openings).toHaveLength(2);
  expect(openings[0]).toEqual(originalOpening);
  expect(saved.lines).toHaveLength(2); expect(saved.lines[1].opening.quantity).toBe(3);
  expect(saved.lines[1].area).toBe(0.75);
  expect(saved.lines[1].system).toMatchObject({ quantity: 3, total: 750000 });
  expect(saved.lines[1].glass).toMatchObject({ quantity: 3, total: 30000 });
  expect(saved.lines[1].extras).toEqual([expect.objectContaining({ id: 'handle', quantity: 6, total: 30000 })]);
  expect(saved.total).toBe(1310000); expect(history[0].quotation).toEqual(initial);
  await page.reload(); await edit().click();
  await expect(cards()).toHaveCount(2); await expect(cards().last()).toContainText(`${term('Quantity')}: 3`);
  await expect(handleQuantity()).toHaveValue('2'); await expect(total()).toHaveText(money(1310000));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`${locale}-saved-repeated-opening.png`), fullPage: true });
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});
