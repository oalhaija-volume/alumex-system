import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import type { CatalogItem } from '../../src/lib/workflow/pricing';

// Render the actual catalog component. All catalog reads and writes use an
// isolated fixture store; no authentication or production records are touched.
const output = resolve('artifacts/catalog-create-20261111');
const localHeadless = resolve('artifacts/mini-crm-review-20261015/browser/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
const existing: CatalogItem = {
  id: '11111111-1111-4111-8111-111111111111', name: 'Alumex System',
  category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true,
};

test.beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'browser-entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {CatalogWorkspace} from '@/components/workflow/CatalogWorkspace';createRoot(document.getElementById('root')!).render(<I18nProvider><CatalogWorkspace canEdit={!new URLSearchParams(location.search).has('readonly')}/></I18nProvider>);`);
  writeFileSync(resolve(output, 'typescript-loader.cjs'), `const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,removeComments:true}}).outputText;};`);
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({
    mode: 'production', target: 'web', context: process.cwd(), devtool: false,
    entry: resolve(output, 'browser-entry.tsx'), output: { path: output, filename: 'catalog.bundle.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [resolve(output, 'typescript-loader.cjs')] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
});

async function fixture(page: Page, context: BrowserContext, request: APIRequestContext, locale: 'en' | 'ar', items: CatalogItem[] = [existing], readonly = false) {
  const messages = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8'));
  const term = (value: string, replacements: Record<string, string | number> = {}) => {
    let result: string = messages.terms[value] ?? value;
    for (const [key, replacement] of Object.entries(replacements)) result = result.replaceAll(`{${key}}`, String(replacement));
    return result;
  };
  const state = {
    items: structuredClone(items), posts: [] as { name: string; price: number }[],
    patches: [] as { changes: { id: string; price: number }[] }[], errors: [] as string[],
    rejectNext: false, holdNext: false, release: undefined as (() => void) | undefined,
  };
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Alumex Quotation System</title></head><body><div id="root"></div><script src="/qa/catalog-create.bundle.js"></script></body></html>`;
  await context.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (url.hostname !== 'localhost') { state.errors.push(`${req.method()} ${url.hostname}`); return route.abort('blockedbyclient'); }
    if (path === '/api/catalog') {
      if (req.method() === 'GET') return route.fulfill({ json: { items: state.items } });
      if (req.method() === 'POST') {
        const body: { name: string; price: number } = req.postDataJSON();
        state.posts.push(body);
        if (state.holdNext) {
          state.holdNext = false;
          await new Promise<void>(accept => { state.release = accept; });
        }
        if (state.rejectNext) {
          state.rejectNext = false;
          return route.fulfill({ status: 409, json: { error: 'An item with this name already exists in the catalog.', field: 'name' } });
        }
        const item: CatalogItem = {
          id: `22222222-2222-4222-8222-${String(state.items.length + 1).padStart(12, '0')}`,
          name: body.name.trim().replace(/\s+/g, ' '), category: 'aluminum_section', unit: 'sqm', unit_price: body.price, is_active: true,
        };
        state.items.push(item);
        return route.fulfill({ status: 201, json: { item } });
      }
      if (req.method() === 'PATCH') {
        const body: { changes: { id: string; price: number }[] } = req.postDataJSON();
        state.patches.push(body);
        for (const change of body.changes) state.items = state.items.map(item => item.id === change.id ? { ...item, unit_price: change.price } : item);
        return route.fulfill({ json: { ok: true, prices: body.changes } });
      }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
      state.errors.push(`${req.method()} ${path}`);
      return route.fulfill({ status: 405, json: { error: 'Unexpected write blocked' } });
    }
    if (path === '/catalog' && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (path === '/qa/catalog-create.bundle.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, 'catalog.bundle.js')) });
    if (path.startsWith('/api/')) return route.fulfill({ json: {} });
    return route.continue();
  });
  page.on('pageerror', error => state.errors.push(error.message));
  await page.goto(`/catalog${readonly ? '?readonly' : ''}`);
  await expect(page.getByRole('heading', { name: term('Price catalog'), exact: true })).toBeVisible();
  const open = page.getByRole('button', { name: term('Add aluminum section'), exact: true });
  const name = page.getByRole('textbox', { name: term('Section name'), exact: true });
  const price = page.getByRole('spinbutton', { name: term('Price (IQD / m²)'), exact: true });
  const submit = page.getByRole('button', { name: term('Add section'), exact: true });
  const itemPrice = (itemName: string) => page.getByRole('spinbutton', { name: term('{name} price', { name: term(itemName) }), exact: true });
  return { state, term, open, name, price, submit, itemPrice };
}

for (const locale of ['en', 'ar'] as const) {
  test(`${locale}: adding a section retains draft prices, saves separately, and persists after reload`, async ({ page, context, request }, testInfo) => {
    const f = await fixture(page, context, request, locale);
    await f.itemPrice(existing.name).fill('275000');
    await f.open.click();
    await f.name.fill('Custom Thermal Section');
    await f.price.fill('500000');
    await page.screenshot({ path: resolve(output, `${locale}-${testInfo.project.name}-add-form.png`), fullPage: true });
    await f.submit.click();
    await expect(f.itemPrice('Custom Thermal Section')).toHaveValue('500000');
    await expect(f.itemPrice(existing.name)).toHaveValue('275000');
    assert.deepEqual(f.state.posts, [{ name: 'Custom Thermal Section', price: 500000 }]);
    assert.deepEqual(f.state.patches, []);
    const created = f.state.items.find(item => item.name === 'Custom Thermal Section')!;
    assert.equal(created.category, 'aluminum_section'); assert.equal(created.unit, 'sqm');
    await page.getByRole('button', { name: f.term('Save all changes'), exact: true }).click();
    await expect(page.getByRole('button', { name: f.term('Save all changes'), exact: true })).toBeDisabled();
    assert.deepEqual(f.state.patches, [{ changes: [{ id: existing.id, price: 275000 }] }]);
    await page.reload();
    await expect(f.itemPrice('Custom Thermal Section')).toHaveValue('500000');
    await expect(f.itemPrice(existing.name)).toHaveValue('275000');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: resolve(output, `${locale}-${testInfo.project.name}-saved.png`), fullPage: true });
    assert.deepEqual(f.state.errors, []);
  });

  test(`${locale}: an empty catalog can add its first aluminum section`, async ({ page, context, request }) => {
    const f = await fixture(page, context, request, locale, []);
    await f.open.click();
    await expect(f.name).toBeFocused();
    await f.name.fill(locale === 'ar' ? 'قطاع ألمنيوم حراري' : 'Thermal Section');
    await f.price.fill('500000');
    await f.submit.click();
    await expect(f.itemPrice(locale === 'ar' ? 'قطاع ألمنيوم حراري' : 'Thermal Section')).toHaveValue('500000');
    assert.equal(f.state.posts.length, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    assert.deepEqual(f.state.errors, []);
  });

  test(`${locale}: validation, duplicate recovery, pending protection, and cancel retain the catalog`, async ({ page, context, request }, testInfo) => {
    const f = await fixture(page, context, request, locale);
    await f.open.click();
    const tryInvalid = async () => {
      if (await f.submit.isEnabled()) await f.submit.click();
      assert.equal(f.state.posts.length, 0);
    };
    await tryInvalid();
    await f.name.fill('New Section');
    for (const value of ['0', '-1', '10000000001']) {
      await f.price.fill(value);
      await tryInvalid();
    }
    await f.price.fill('500000');
    f.state.rejectNext = true;
    await f.submit.click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(f.name).toHaveValue('New Section');
    await expect(f.price).toHaveValue('500000');
    await expect(f.name).toBeFocused();
    await expect(f.name).toHaveAttribute('aria-invalid', 'true');
    await f.price.focus();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(f.name).toHaveAttribute('aria-invalid', 'true');
    assert.equal(f.state.items.length, 1);
    await f.name.fill('Another Section');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(f.name).toHaveAttribute('aria-invalid', 'false');
    f.state.holdNext = true;
    await f.submit.click();
    await expect.poll(() => f.state.posts.length).toBe(2);
    await expect(f.name).toBeDisabled();
    await expect(f.price).toBeDisabled();
    await expect(page.getByRole('button', { name: f.term('Cancel'), exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: f.term('Adding…'), exact: true })).toBeDisabled();
    await page.getByRole('form', { name: f.term('Add aluminum section'), exact: true }).evaluate(form => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(f.state.posts.length, 2, 'An Enter/submit event while pending cannot create another item');
    expect(await page.locator('form').evaluateAll(forms => forms.every(form => !form.querySelector('form')))).toBe(true);
    f.state.release?.();
    await expect(f.itemPrice('Another Section')).toHaveValue('500000');
    await f.open.click();
    await f.name.fill('Cancelled Section');
    await page.getByRole('button', { name: f.term('Cancel'), exact: true }).click();
    await expect(f.name).toHaveCount(0);
    await expect(f.open).toBeFocused();
    assert.equal(f.state.posts.length, 2);
    assert.equal(f.state.items.length, 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: resolve(output, `${locale}-${testInfo.project.name}-validation.png`), fullPage: true });
    assert.deepEqual(f.state.errors, []);
  });

  test(`${locale}: read-only catalog access hides section creation and price saving`, async ({ page, context, request }) => {
    const f = await fixture(page, context, request, locale, [existing], true);
    await expect(f.itemPrice(existing.name)).toHaveValue('250000');
    await expect(f.itemPrice(existing.name)).toBeDisabled();
    await expect(f.open).toHaveCount(0);
    await expect(page.getByRole('button', { name: f.term('Save all changes'), exact: true })).toHaveCount(0);
    assert.deepEqual(f.state.posts, []);
    assert.deepEqual(f.state.patches, []);
    assert.deepEqual(f.state.errors, []);
  });
}
