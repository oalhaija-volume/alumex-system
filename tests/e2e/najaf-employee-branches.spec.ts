import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';

// Browser tools are unavailable. Exercise the actual components against local
// fixture APIs; these checks cannot create employees or projects in production.
const browser = [
  resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  resolve('artifacts/mini-crm-review-20261015/browser/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
].find(path => existsSync(path));
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath: browser } });
const messages = { en, ar };
let bundle: string, styles: string;
const base = 'http://localhost:3003';
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Admin fixture', role: 'Admin', branch: null };
const firstEmployee = { id: '11111111-1111-4111-8111-111111111111', full_name: 'Karkh employee', username: 'karkh.employee', email: 'karkh.employee@example.invalid', role: 'Indoor Sales', branch: 'Karkh', status: 'Active', is_active: true, updated_at: '2026-11-14T10:00:00Z' };
const outdoor = [
  { id: '22222222-2222-4222-8222-222222222222', name: 'Najaf Outdoor', branch: 'Najaf' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Karkh Outdoor', branch: 'Karkh' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Rasafa Outdoor', branch: 'Rasafa' },
];

test.beforeAll(async ({ request }, testInfo) => {
  const directory = testInfo.outputPath('component');
  await mkdir(directory, { recursive: true });
  const entry = resolve(directory, 'entry.tsx'), loader = resolve(directory, 'typescript-loader.cjs');
  const currentRole = resolve(directory, 'current-role.ts');
  const locationPicker = resolve(directory, 'location-picker.ts');
  await writeFile(currentRole, "export function useCurrentRole(){return {role:'Admin',userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',isAdmin:true};}");
  await writeFile(locationPicker, "export function ProjectLocationPicker(){return null;}");
  await writeFile(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {EmployeeWorkspace} from '@/components/workflow/EmployeeWorkspace';import {OutdoorIntake} from '@/components/intake/OutdoorIntake';import type {FieldState} from '@/lib/offline/types';const mode=new URLSearchParams(location.search).get('mode');const state:Pick<FieldState,'actor'|'outdoorSales'>={actor:${JSON.stringify(actor)},outdoorSales:${JSON.stringify(outdoor)}};if(mode==='indoor'){state.actor.role='Indoor Sales';state.actor.branch='Najaf';}createRoot(document.getElementById('root')!).render(<I18nProvider>{mode?<OutdoorIntake initialEmployeeState={state}/>:<EmployeeWorkspace/>}</I18nProvider>);`);
  await writeFile(loader, "const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};");
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({
    mode: 'production', target: 'web', context: process.cwd(), entry,
    output: { path: directory, filename: 'component.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@/components/auth/useCurrentRole': currentRole, '@/components/projects/ProjectLocationPicker': locationPicker, '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
  bundle = await readFile(resolve(directory, 'component.js'), 'utf8');
  const login = await request.get('/login'); expect(login.status()).toBe(200);
  styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: Admin assigns Najaf and project employee choices stay inside the selected office`, async ({ page }, testInfo) => {
  const term = (key: string) => (messages[locale].terms as Record<string, string>)[key] ?? key;
  let employees = [structuredClone(firstEmployee)];
  const mutations: { method: string; body: Record<string, string> }[] = [], unexpected: string[] = [], errors: string[] = [];
  await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) { unexpected.push(req.method() + ' ' + url.origin); return route.abort('blockedbyclient'); }
    if (url.pathname === '/api/admin/users') {
      if (req.method() === 'GET') return route.fulfill({ json: { users: employees } });
      const body = req.postDataJSON(); mutations.push({ method: req.method(), body });
      if (req.method() === 'POST') {
        expect(body).toMatchObject({ fullName: 'Najaf new employee', role: 'Outdoor Sales', branch: 'Najaf', username: 'najaf.employee' });
        employees = [...employees, { ...firstEmployee, id: outdoor[0].id, full_name: body.fullName, username: body.username, role: body.role, branch: body.branch }];
        return route.fulfill({ status: 201, json: { user: employees.at(-1) } });
      }
      expect(body).toMatchObject({ action: 'update-profile', id: firstEmployee.id, role: 'Indoor Sales', branch: 'Najaf', updatedAt: firstEmployee.updated_at });
      employees = employees.map(employee => employee.id === firstEmployee.id ? { ...employee, branch: body.branch } : employee);
      return route.fulfill({ json: { user: employees[0] } });
    }
    if (!['GET', 'HEAD'].includes(req.method())) { unexpected.push(req.method() + ' ' + url.pathname); return route.fulfill({ status: 405, json: { error: 'Unexpected write blocked' } }); }
    if (url.pathname === '/qa/najaf-employee-branches' && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/qa/najaf-branches.js"></script></body></html>` });
    if (url.pathname === '/qa/najaf-branches.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto('/qa/najaf-employee-branches');
  const form = page.getByRole('form', { name: term('Add employee'), exact: true });
  await form.getByRole('combobox', { name: term('Role'), exact: true }).selectOption('Outdoor Sales');
  const branch = () => form.getByRole('combobox', { name: term('Branch'), exact: true });
  await expect(branch()).toBeVisible(); await expect(branch()).toHaveAttribute('required', '');
  await expect(branch().getByRole('option', { name: term('Najaf'), exact: true })).toHaveCount(1);
  await form.getByRole('combobox', { name: term('Role'), exact: true }).selectOption('Sales Director');
  await expect(branch()).toHaveCount(0); await expect(form.getByText(term('Access to all branches'), { exact: true })).toBeVisible();
  await form.getByRole('combobox', { name: term('Role'), exact: true }).selectOption('CEO');
  await expect(branch()).toBeVisible();
  await form.getByRole('combobox', { name: term('Role'), exact: true }).selectOption('Outdoor Sales');
  await form.getByRole('textbox', { name: term('Employee name'), exact: true }).fill('Najaf new employee');
  await branch().selectOption('Najaf');
  await form.getByRole('textbox', { name: term('Username'), exact: true }).fill('najaf.employee');
  await form.getByLabel(term('Password'), { exact: true }).fill('fixture-password');
  await form.screenshot({ path: testInfo.outputPath(`${locale}-create-najaf-employee.png`) });
  await form.getByRole('button', { name: term('Add employee'), exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Najaf new employee', exact: true })).toBeVisible();
  expect(mutations).toHaveLength(1);
  await page.getByRole('button', { name: term('Edit {name}').replace('{name}', 'Karkh employee'), exact: true }).click();
  const editor = page.getByRole('form', { name: term('Edit employee'), exact: true });
  await editor.getByRole('combobox', { name: term('Branch'), exact: true }).selectOption('Najaf');
  await editor.getByRole('button', { name: term('Save changes'), exact: true }).click();
  await expect(editor).toHaveCount(0); expect(mutations).toHaveLength(2);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Najaf new employee', exact: true })).toBeVisible();
  expect(employees.every(employee => employee.branch === 'Najaf')).toBe(true);

  await page.goto('/qa/najaf-employee-branches?mode=admin');
  await expect(page.locator('input[name="projectBranch"]')).toHaveCount(4);
  await page.getByRole('radio', { name: term('Najaf'), exact: true }).check();
  const assignee = () => page.locator('#outdoor-assignee');
  await expect(assignee().getByRole('option', { name: 'Najaf Outdoor', exact: true })).toHaveCount(1);
  await expect(assignee().getByRole('option', { name: 'Karkh Outdoor', exact: true })).toHaveCount(0);
  await page.locator('#legacy-outdoor-project').check();
  const legacy = () => page.locator('#legacy-outdoor-owner');
  await expect(legacy().getByRole('option', { name: 'Najaf Outdoor', exact: true })).toHaveCount(1);
  await expect(legacy().getByRole('option', { name: 'Rasafa Outdoor', exact: true })).toHaveCount(0);
  await legacy().selectOption(outdoor[0].id); await assignee().selectOption(outdoor[0].id);
  await page.getByRole('radio', { name: term('Karkh'), exact: true }).check();
  await expect(legacy()).toHaveValue(''); await expect(assignee()).toHaveValue('');
  await expect(assignee().getByRole('option', { name: 'Najaf Outdoor', exact: true })).toHaveCount(0);
  await expect(assignee().getByRole('option', { name: 'Karkh Outdoor', exact: true })).toHaveCount(1);

  await page.goto('/qa/najaf-employee-branches?mode=indoor');
  await expect(page.locator('input[name="projectBranch"]')).toHaveCount(1);
  await expect(page.getByRole('radio', { name: term('Najaf'), exact: true })).toBeChecked();
  await expect(assignee().getByRole('option', { name: 'Najaf Outdoor', exact: true })).toHaveCount(1);
  await expect(assignee().getByRole('option', { name: 'Karkh Outdoor', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath(`${locale}-najaf-intake.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(mutations).toHaveLength(2); expect(unexpected).toEqual([]); expect(errors).toEqual([]);
});
