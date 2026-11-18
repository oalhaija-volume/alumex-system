import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';

// Exercise the real intake with isolated transport and map fixtures. These
// tests never sign in or register a project in the connected database.
const executablePath = [
  resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  resolve('artifacts/mini-crm-review-20261015/browser/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
].find(path => existsSync(path));
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath } });
const origin = 'http://localhost:3003';
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const dictionaries = { en, ar };
let bundle: string, styles: string;

test.beforeAll(async ({ request }, testInfo) => {
  const directory = testInfo.outputPath('intake-component');
  await mkdir(directory, { recursive: true });
  const entry = resolve(directory, 'entry.tsx'), loader = resolve(directory, 'typescript-loader.cjs');
  const transport = resolve(directory, 'transport.ts'), store = resolve(directory, 'store.ts'), map = resolve(directory, 'map.tsx');
  await writeFile(transport, "export const fieldFetch=(url:string,init?:RequestInit)=>fetch(url,init);export const isFieldOnline=()=>true;export const isDeviceWorkspace=()=>false;export const prepareOffline=async()=>null;");
  await writeFile(store, 'export const readFieldState=async()=>null;');
  await writeFile(map, "import React from 'react';export function ProjectLocationPicker({onChange,onSearchSelect}:{onChange:(value:{latitude:number;longitude:number})=>void;onSearchSelect:(address:string)=>void}){return <button type='button' onClick={()=>{onChange({latitude:32,longitude:44.3});onSearchSelect('Najaf fixture location');}}>Set fixture location</button>;}");
  await writeFile(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {OutdoorIntake} from '@/components/intake/OutdoorIntake';import type {FieldState} from '@/lib/offline/types';const params=new URLSearchParams(location.search);const state:Pick<FieldState,'actor'|'outdoorSales'>={actor:{id:'${actorId}',name:'Karkh Indoor fixture',role:params.get('role')??'Indoor Sales',branch:(params.get('branch')??'Karkh') as 'Karkh'|'Rasafa'|'Najaf'},outdoorSales:[]};createRoot(document.getElementById('root')!).render(<I18nProvider><OutdoorIntake initialEmployeeState={state}/></I18nProvider>);`);
  await writeFile(loader, "const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};");
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({
    mode: 'production', target: 'web', context: process.cwd(), entry,
    output: { path: directory, filename: 'component.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: {
      '@/lib/offline/client': transport, '@/lib/offline/store': store,
      '@/components/projects/ProjectLocationPicker': map, '@': resolve('src'),
    } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
  bundle = await readFile(resolve(directory, 'component.js'), 'utf8');
  const login = await request.get('/login'); expect(login.status()).toBe(200);
  styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
});

async function prepare(page: Page, locale: 'en' | 'ar') {
  const posts: Record<string, unknown>[] = [], unexpected: string[] = [], errors: string[] = [];
  await page.clock.setFixedTime(new Date('2026-11-18T08:00:00Z'));
  await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { unexpected.push(`${request.method()} ${url.origin}`); return route.abort('blockedbyclient'); }
    if (url.pathname === '/api/sales-intake' && request.method() === 'POST') {
      posts.push(request.postDataJSON());
      return route.fulfill({ status: 201, json: { projectId, pending: false } });
    }
    if (!['GET', 'HEAD'].includes(request.method())) {
      unexpected.push(`${request.method()} ${url.pathname}`);
      return route.fulfill({ status: 405, json: { error: 'Unexpected write blocked' } });
    }
    if (url.pathname === '/qa/karkh-indoor-najaf' && request.resourceType() === 'document') {
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/qa/karkh-indoor-najaf.js"></script></body></html>` });
    }
    if (url.pathname === '/qa/karkh-indoor-najaf.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    if (url.pathname === '/mini-crm' && request.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><h1>Karkh follow-up fixture</h1></body></html>' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return { posts, unexpected, errors };
}

for (const locale of ['en', 'ar'] as const) test(`${locale}: Karkh Indoor selects Najaf under Governorates and registers with self measurements`, async ({ page }, testInfo) => {
  const { posts, unexpected, errors } = await prepare(page, locale);
  const dictionary = dictionaries[locale];
  await page.goto('/qa/karkh-indoor-najaf');
  await expect(page.getByRole('heading', { name: dictionary.registration.title, exact: true })).toBeVisible();
  expect(await page.locator('input[name="projectBranch"]').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(['Karkh', 'Governorates']);
  await page.locator('input[name="projectBranch"][value="Governorates"]').check();
  const province = page.locator('#project-governorate');
  await expect(province).toBeVisible();
  await expect(province).toHaveAttribute('required', '');
  await expect(province.locator('option[value="النجف"]')).toHaveCount(1);
  await expect(province.locator('option[value="النجف"]')).toHaveText('النجف');
  await province.selectOption('النجف');
  await page.getByRole('textbox', { name: dictionary.mobileIntake.name, exact: true }).fill('Najaf Karkh Indoor fixture');
  await page.getByRole('textbox', { name: dictionary.mobileIntake.phone, exact: true }).fill('07000000000');
  await page.getByRole('button', { name: 'Set fixture location', exact: true }).click();
  await page.locator('input[name="readiness"][value="not_ready"]').check();
  await page.locator('#outdoor-assignee').selectOption(actorId);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`${locale}-karkh-najaf-form.png`), fullPage: true });
  await page.getByRole('button', { name: dictionary.registration.save, exact: true }).click();
  await expect(page).toHaveURL(`${origin}/mini-crm`);
  await expect(page.getByRole('heading', { name: 'Karkh follow-up fixture', exact: true })).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    registrationActorId: actorId,
    client: { clientName: 'Najaf Karkh Indoor fixture', mobile: '07000000000', clientType: 'individual' },
    project: { branch: 'Governorates', governorate: 'النجف', assignedOutdoorSalesId: actorId,
      structureReadiness: 'not_ready', address: 'Najaf fixture location', locationLatitude: 32, locationLongitude: 44.3 },
  });
  expect(posts[0].project).not.toHaveProperty('governorate_office');
  expect(unexpected).toEqual([]); expect(errors).toEqual([]);
});

test('other sales branches retain their existing Governorates choices', async ({ page }) => {
  const { posts, unexpected, errors } = await prepare(page, 'en');
  for (const [role, branch] of [['Outdoor Sales', 'Karkh'], ['Outdoor Sales', 'Rasafa'], ['Indoor Sales', 'Rasafa'], ['Indoor Sales', 'Najaf']]) {
    await page.goto(`/qa/karkh-indoor-najaf?${new URLSearchParams({ role, branch })}`);
    await expect(page.getByRole('heading', { name: en.registration.title, exact: true })).toBeVisible();
    const governorates = page.locator('input[name="projectBranch"][value="Governorates"]');
    if (role === 'Outdoor Sales') {
      await governorates.check();
      await expect(page.locator('#project-governorate')).toBeVisible();
      await expect(page.locator('#project-governorate option[value="النجف"]')).toHaveCount(0);
    } else {
      await expect(governorates).toHaveCount(0);
      await expect(page.locator('#project-governorate')).toHaveCount(0);
    }
  }
  expect(posts).toEqual([]); expect(unexpected).toEqual([]); expect(errors).toEqual([]);
});
