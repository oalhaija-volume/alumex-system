import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import { projectGovernorates } from '../../src/lib/intake/projectBranch';

// Browser tools are unavailable. Mount the real intake and access helpers with
// local transport and map fixtures; no employee account or project is written.
const executablePath = [
  resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  resolve('artifacts/mini-crm-review-20261015/browser/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
].find(path => existsSync(path));
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath } });
const messages = { en, ar };
const origin = 'http://localhost:3003';
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let bundle: string, styles: string;

test.beforeAll(async ({ request }, testInfo) => {
  const directory = testInfo.outputPath('intake-component');
  await mkdir(directory, { recursive: true });
  const entry = resolve(directory, 'entry.tsx'), loader = resolve(directory, 'typescript-loader.cjs');
  const transport = resolve(directory, 'transport.ts'), store = resolve(directory, 'store.ts'), map = resolve(directory, 'map.tsx');
  await writeFile(transport, "export const fieldFetch=(url:string,init?:RequestInit)=>fetch(url,init);export const isFieldOnline=()=>true;export const isDeviceWorkspace=()=>false;export const prepareOffline=async()=>null;");
  await writeFile(store, 'export const readFieldState=async()=>null;');
  await writeFile(map, "import React from 'react';export function ProjectLocationPicker({onChange,onSearchSelect}:{onChange:(value:{latitude:number;longitude:number})=>void;onSearchSelect:(address:string)=>void}){return <button type='button' onClick={()=>{onChange({latitude:33.3,longitude:44.4});onSearchSelect('Fixture location');}}>Set fixture location</button>;}");
  await writeFile(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {OutdoorIntake} from '@/components/intake/OutdoorIntake';import type {FieldState} from '@/lib/offline/types';const indoor=new URLSearchParams(location.search).has('indoor');const state:Pick<FieldState,'actor'|'outdoorSales'>={actor:{id:'${actorId}',name:'Outdoor fixture',role:indoor?'Indoor Sales':'Outdoor Sales',branch:'Rasafa'},outdoorSales:[]};createRoot(document.getElementById('root')!).render(<I18nProvider><OutdoorIntake initialEmployeeState={state}/></I18nProvider>);`);
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

for (const locale of ['en', 'ar'] as const) test(`${locale}: Rasafa Outdoor selects Governorates and its province without Najaf branch access`, async ({ page }, testInfo) => {
  const dictionary = messages[locale];
  const term = (key: string) => (dictionary.terms as Record<string, string>)[key] ?? key;
  const mutations: Record<string, unknown>[] = [], unexpected: string[] = [], errors: string[] = [];
  await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) { unexpected.push(req.method() + ' ' + url.origin); return route.abort('blockedbyclient'); }
    if (url.pathname === '/api/sales-intake' && req.method() === 'POST') {
      const body = req.postDataJSON();
      expect(body).toMatchObject({ registrationActorId: actorId, client: { clientName: 'Governorates fixture', mobile: '07000000000' }, project: { branch: 'Governorates', governorate: 'البصرة', structureReadiness: 'not_ready', readinessNote: 'Fixture site preparation' } });
      mutations.push(body); return route.fulfill({ status: 201, json: { projectId: actorId, pending: false } });
    }
    if (!['GET', 'HEAD'].includes(req.method())) { unexpected.push(req.method() + ' ' + url.pathname); return route.fulfill({ status: 405, json: { error: 'Unexpected write blocked' } }); }
    if (url.pathname === '/qa/outdoor-governorates' && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/qa/outdoor-governorates.js"></script></body></html>` });
    if (url.pathname === '/qa/outdoor-governorates.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/qa/outdoor-governorates');
  const branch = page.locator('input[name="projectBranch"]');
  await expect(branch).toHaveCount(2);
  expect(await branch.evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(['Rasafa', 'Governorates']);
  await expect(page.getByRole('radio', { name: term('Najaf'), exact: true })).toHaveCount(0);
  await expect(page.locator('#project-governorate')).toHaveCount(0);
  await page.getByRole('radio', { name: term('Governorates'), exact: true }).check();
  const province = page.locator('#project-governorate');
  await expect(province).toBeVisible(); await expect(province).toHaveAttribute('required', '');
  expect(await province.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(['', ...projectGovernorates]);
  await expect(province).toHaveValue('');
  await page.getByRole('button', { name: dictionary.registration.save, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(term('Choose the project governorate.'));
  expect(mutations).toHaveLength(0);
  await province.selectOption('البصرة');
  await page.locator('input[name="buildingType"][value="villa_house"]').check();
  await page.getByRole('textbox', { name: dictionary.mobileIntake.name, exact: true }).fill('Governorates fixture');
  await page.getByRole('textbox', { name: dictionary.mobileIntake.phone, exact: true }).fill('07000000000');
  await page.getByRole('button', { name: 'Set fixture location', exact: true }).click();
  await page.locator('input[name="readiness"][value="not_ready"]').check();
  await page.locator('#readiness-note').fill('Fixture site preparation');
  await page.screenshot({ path: testInfo.outputPath(`${locale}-governorates-form.png`), fullPage: true });
  await page.getByRole('button', { name: dictionary.registration.save, exact: true }).click();
  await expect(page.getByRole('heading', { name: dictionary.registration.saved, exact: true })).toBeVisible();
  expect(mutations).toHaveLength(1);
  await page.goto('/qa/outdoor-governorates?indoor=1');
  await expect(page.locator('input[name="projectBranch"]')).toHaveCount(1);
  await expect(page.getByRole('radio', { name: term('Rasafa'), exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: term('Governorates'), exact: true })).toHaveCount(0);
  await expect(page.locator('#project-governorate')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(unexpected).toEqual([]); expect(errors).toEqual([]);
});
