import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

// No Browser plugin is available. Exercise the real component with Playwright
// and isolated local API fixtures; commercial documents are never edited.
const output = resolve('.next/cache/qa-operations-documents');
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });

test.beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'entry.tsx'), `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {I18nProvider} from '@/components/i18n/I18nProvider';
    import {OperationsWorkspace} from '@/components/workflow/OperationsWorkspace';
    const canViewDocuments=new URLSearchParams(location.search).get('documents')==='1';
    createRoot(document.getElementById('root')!).render(<I18nProvider><OperationsWorkspace canViewDocuments={canViewDocuments}/></I18nProvider>);
  `);
  writeFileSync(resolve(output, 'typescript-loader.cjs'), `const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,removeComments:true}}).outputText;};`);
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({
    mode: 'production', target: 'web', context: process.cwd(), devtool: false,
    entry: resolve(output, 'entry.tsx'), output: { path: output, filename: 'operations-documents.bundle.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [resolve(output, 'typescript-loader.cjs')] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors()
    ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
});

const projectId = '11111111-1111-4111-8111-111111111111';
const project = {
  id: projectId, project_number: 'PRJ-OPERATIONS-DOCUMENTS', project_name: 'Signed operations project',
  address: 'Baghdad', client: { name: 'Fixture client', mobile: '07700000000' },
  handoff: { stage: 'signed', revision: 1, signed_at: '2026-11-20T08:00:00Z', specifications: [
    { openingId: 'opening-one', system: 'Alumex System', glass: 'Low-E Glass', extras: [] },
  ] },
  openings: [{ id: 'opening-one', floor: 'Ground', room: 'Office', width: 100, height: 150,
    quantity: 2, opening_type: 'Window', opening_direction: 'Hinged' }],
};

async function mount(page: Page, context: BrowserContext, request: APIRequestContext, locale: 'en' | 'ar', canViewDocuments = true) {
  const terms: Record<string, string> = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8')).terms;
  const term = (value: string) => terms[value] ?? value;
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Operations documents QA</title></head><body><div id="root"></div><script src="/qa/operations-documents.bundle.js"></script></body></html>`;
  const errors: string[] = [], unexpected: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await context.addInitScript(value => {
    localStorage.setItem('alumex_locale', value);
    Reflect.deleteProperty(Navigator.prototype, 'serviceWorker');
  }, locale);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname !== 'localhost') { unexpected.push(`${req.method()} ${url.hostname}`); return route.abort('blockedbyclient'); }
    if (url.pathname === '/operations' && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/qa/operations-documents.bundle.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, 'operations-documents.bundle.js')) });
    if (url.pathname === '/api/operations' && req.method() === 'GET') return route.fulfill({ json: { projects: [project], canAccept: true } });
    if ([`/contract/${projectId}`, `/quotation/${projectId}`].includes(url.pathname) && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<h1>Document destination ${url.pathname}</h1>` });
    if (url.pathname.startsWith('/api/') || !['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
      unexpected.push(`${req.method()} ${url.pathname}`);
      return route.fulfill({ status: 405, json: { error: 'Unexpected request' } });
    }
    return route.continue();
  });
  const path = `/operations?documents=${canViewDocuments ? '1' : '0'}`;
  await page.goto(path);
  await expect(page.getByRole('heading', { name: project.project_name, exact: true })).toBeVisible();
  return { term, errors, unexpected, path };
}

for (const locale of ['en', 'ar'] as const) test(`${locale}: admins open contract and quotation with responsive document links`, async ({ page, context, request }) => {
  const fixture = await mount(page, context, request, locale);
  const contract = page.getByRole('link', { name: fixture.term('View signed contract →'), exact: true });
  const quotation = page.getByRole('link', { name: fixture.term('Open quotation →'), exact: true });
  await expect(contract).toHaveAttribute('href', `/contract/${projectId}`);
  await expect(quotation).toHaveAttribute('href', `/quotation/${projectId}`);
  await expect(page.getByRole('heading', { name: project.project_name }).getByRole('link')).toHaveAttribute('href', `/contract/${projectId}`);
  await expect(page.getByRole('button', { name: fixture.term('Start project work'), exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const link of [contract, quotation]) {
    const bounds = await link.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    await link.focus();
    await expect(link).toBeFocused();
  }
  await page.screenshot({ path: test.info().outputPath(`${locale}-operations-documents.png`), fullPage: true });
  await contract.click();
  await expect(page).toHaveURL(`http://localhost:3003/contract/${projectId}`);
  await page.goto(fixture.path);
  await page.getByRole('link', { name: fixture.term('Open quotation →'), exact: true }).click();
  await expect(page).toHaveURL(`http://localhost:3003/quotation/${projectId}`);
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

test('operations managers retain work details without commercial links', async ({ page, context, request }) => {
  const fixture = await mount(page, context, request, 'en', false);
  await expect(page.locator('a[href^="/contract/"]')).toHaveCount(0);
  await expect(page.locator('a[href^="/quotation/"]')).toHaveCount(0);
  await page.locator('summary').click();
  await expect(page.getByText('100 × 150 cm', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start project work', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
