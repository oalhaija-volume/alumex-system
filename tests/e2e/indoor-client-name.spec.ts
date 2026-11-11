import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const output = resolve('.next/cache/qa-client-name');
const projectId = '11111111-1111-4111-8111-111111111111';
const originalName = 'Original client';
const conflict = 'This client changed on another device. Reload the projects before changing its name.';
const validation = 'Enter a client name of 1 to 150 characters.';
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });

test.beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'browser-entry.tsx'), `
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {I18nProvider} from '@/components/i18n/I18nProvider';
    import {ClientNameEditor} from '@/components/workflow/ClientNameEditor';
    function Harness(){
      const role=new URLSearchParams(location.search).get('role')||'Indoor Sales';
      const [project,setProject]=useState({id:'${projectId}',client_id:'client-fixture',client_name:'${originalName}',project_name:'Separate project title',branch:'Karkh',updated_at:'2026-11-10T08:00:00Z'});
      return <main className="mx-auto max-w-3xl p-5"><h1 className="text-xl font-semibold">Separate project title</h1><ClientNameEditor project={project} actor={{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role,name:'Indoor employee',branch:'Karkh'}} onSaved={async()=>{const response=await fetch('/qa/client-project');setProject(await response.json());}}/></main>;
    }
    createRoot(document.getElementById('root')!).render(<I18nProvider><Harness/></I18nProvider>);
  `);
  writeFileSync(resolve(output, 'typescript-loader.cjs'), `const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,removeComments:true}}).outputText;};`);
  writeFileSync(resolve(output, 'workspace-entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {ProjectWorkspace} from '@/components/workflow/ProjectWorkspace';createRoot(document.getElementById('root')!).render(<I18nProvider><ProjectWorkspace/></I18nProvider>);`);
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({
    mode: 'production', target: 'web', context: process.cwd(), devtool: false,
    entry: { 'client-name': resolve(output, 'browser-entry.tsx'), 'client-workspace': resolve(output, 'workspace-entry.tsx') }, output: { path: output, filename: '[name].bundle.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [resolve(output, 'typescript-loader.cjs')] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
});

test('Projects updates every visible project linked to the renamed client', async ({ page, context, request }) => {
  const secondProjectId = '22222222-2222-4222-8222-222222222222';
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'Indoor Sales', name: 'Indoor employee', branch: 'Karkh' };
  const base = {
    client_id: 'client-fixture', client_name: originalName, branch: 'Karkh',
    project_number: 'PRJ-CLIENT-NAME', created_by: 'outdoor-employee', registeredBy: 'Outdoor employee',
    original_creator_role: 'Outdoor Sales', structure_readiness: 'ready', sales_status: 'quotation_in_progress',
    address: 'Baghdad, Mansour', phone: '07700000000', next_follow_up_at: null, project_notes: null,
    created_at: '2026-11-10T08:00:00Z', updated_at: '2026-11-10T08:00:00Z', assigned_outdoor_sales_id: null,
  };
  const projects = [
    { ...base, id: projectId, project_name: 'First project title' },
    { ...base, id: secondProjectId, project_number: 'PRJ-CLIENT-SECOND', project_name: 'Second project title' },
  ];
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Alumex Quotation System</title></head><body><div id="root"></div><script src="/qa/client-workspace.bundle.js"></script></body></html>`;
  const errors: string[] = [], unexpected: string[] = [];
  const attempts: unknown[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await context.addInitScript(() => {
    localStorage.setItem('alumex_locale', 'en');
    Reflect.deleteProperty(Navigator.prototype, 'serviceWorker');
  });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname !== 'localhost') { unexpected.push(req.method() + ' ' + url.hostname); return route.abort('blockedbyclient'); }
    if (url.pathname === '/projects' && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/qa/client-workspace.bundle.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, 'client-workspace.bundle.js')) });
    if (url.pathname === '/api/workspace' && req.method() === 'GET') return route.fulfill({ json: { actor, projects, indoorSales: [actor], outdoorSales: [] } });
    if (url.pathname === '/api/offline' && req.method() === 'GET') return route.fulfill({ json: { actor, projects, indoorSales: [actor], outdoorSales: [], openings: [], queue: [], syncedAt: null } });
    if (url.pathname === `/api/projects/${projectId}/client` && req.method() === 'PATCH') {
      const body = req.postDataJSON();
      assert.deepEqual(body, { clientName: 'Shared corrected client', expectedClientName: originalName });
      attempts.push(body);
      for (const project of projects) project.client_name = body.clientName;
      return route.fulfill({ json: { ok: true, client: { id: 'client-fixture', client_name: body.clientName } } });
    }
    if (/^\/api\/projects\/.+\/follow-ups$/.test(url.pathname)) return route.fulfill({ json: { project: projects.find(project => url.pathname.includes(project.id)), entries: [] } });
    if (url.pathname === '/api/notifications') return route.fulfill({ json: { notifications: [], userId: actor.id } });
    if (url.pathname.startsWith('/api/') || !['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(req.method() + ' ' + url.pathname); return route.fulfill({ status: 405, json: { error: 'Unexpected API request' } }); }
    return route.continue();
  });
  await page.goto('/projects');
  await expect(page).toHaveURL('http://localhost:3003/projects');
  await expect(page).toHaveTitle('Alumex Quotation System');
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  const first = page.locator(`#project-${projectId}`), second = page.locator(`#project-${secondProjectId}`);
  await expect(first.getByText(originalName, { exact: true })).toBeVisible();
  await expect(second.getByText(originalName, { exact: true })).toBeVisible();
  await first.getByRole('button', { name: 'Edit client name', exact: true }).click();
  await first.getByRole('textbox', { name: 'Client name', exact: true }).fill('Shared corrected client');
  await first.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(first.getByRole('status')).toHaveText('Client name updated.');
  await expect(first.getByText('Shared corrected client', { exact: true })).toBeVisible();
  await expect(second.getByText('Shared corrected client', { exact: true })).toBeVisible();
  await expect(first.getByRole('heading', { name: 'First project title', exact: true })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'Second project title', exact: true })).toBeVisible();
  expect(attempts).toHaveLength(1);
  await expect(page.locator('nextjs-portal')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('linked-project-client-names.png'), fullPage: true });
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});

for (const locale of ['en', 'ar'] as const) for (const role of ['Indoor Sales', 'Admin']) test(`${locale}: ${role} changes the client name with validation and conflict protection`, async ({ page, context, request }) => {
  const messages = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8'));
  const term = (value: string) => messages.terms[value] ?? value;
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Alumex Quotation System</title></head><body><div id="root"></div><script src="/qa/client-name.bundle.js"></script></body></html>`;
  let currentName = originalName;
  let rejectNextSave = false;
  const attempts: Array<{ clientName: string; expectedClientName: string }> = [];
  const errors: string[] = [], unexpected: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('status of 409')) errors.push(message.text()); });
  await context.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname !== 'localhost') { unexpected.push(req.method() + ' ' + url.hostname); return route.abort('blockedbyclient'); }
    if (url.pathname === '/qa/client-name' && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/qa/client-name.bundle.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, 'client-name.bundle.js')) });
    if (url.pathname === `/api/projects/${projectId}/client` && req.method() === 'PATCH') {
      const body = req.postDataJSON();
      assert.deepEqual(Object.keys(body).sort(), ['clientName', 'expectedClientName']);
      attempts.push(body);
      if (rejectNextSave) { rejectNextSave = false; return route.fulfill({ status: 409, json: { error: conflict } }); }
      assert.equal(body.expectedClientName, currentName);
      currentName = body.clientName;
      return route.fulfill({ json: { ok: true, client: { id: 'client-fixture', client_name: currentName } } });
    }
    if (url.pathname === '/qa/client-project') return route.fulfill({ json: { id: projectId, client_id: 'client-fixture', client_name: currentName, project_name: 'Separate project title', branch: 'Karkh', updated_at: '2026-11-10T08:00:00Z' } });
    if (url.pathname.startsWith('/api/') || !['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(req.method() + ' ' + url.pathname); return route.fulfill({ status: 405, json: { error: 'Unexpected API request' } }); }
    return route.continue();
  });
  await page.goto(`/qa/client-name?role=${encodeURIComponent(role)}`);
  await expect(page).toHaveTitle(messages.app.title);
  const edit = () => page.getByRole('button', { name: term('Edit client name'), exact: true });
  const form = () => page.getByRole('form', { name: term('Edit client name'), exact: true });
  const input = () => form().getByRole('textbox', { name: term('Client name'), exact: true });
  const save = () => form().getByRole('button', { name: messages.common.saveChanges, exact: true });
  const cancel = () => form().getByRole('button', { name: messages.common.cancel, exact: true });
  await expect(edit()).toBeVisible();
  await edit().click();
  await expect(input()).toHaveValue(originalName);
  await expect(input()).toHaveAttribute('maxlength', '150');
  await expect(form().getByText(term('This updates the client record for all linked projects.'), { exact: true })).toBeVisible();
  await input().fill('Discarded change'); await cancel().click();
  expect(attempts).toHaveLength(0);
  await edit().click(); await input().fill(''); await save().click();
  expect(await input().evaluate(node => (node as HTMLInputElement).validity.valueMissing)).toBe(true);
  expect(attempts).toHaveLength(0);
  await input().fill('   '); await save().click();
  await expect(page.getByRole('alert')).toHaveText(term(validation));
  expect(attempts).toHaveLength(0);
  await input().fill('x'.repeat(151)); await expect(input()).toHaveValue('x'.repeat(150));
  const proposed = locale === 'ar' ? 'اسم العميل بعد التصحيح' : 'Corrected client name';
  await input().fill(`  ${proposed}  `);
  await page.screenshot({ path: test.info().outputPath(`${locale}-client-name-editing.png`), fullPage: true });
  rejectNextSave = true; await save().click();
  await expect(page.getByRole('alert')).toHaveText(term(conflict));
  await expect(input()).toHaveValue(`  ${proposed}  `);
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(currentName).toBe(originalName);
  await save().click();
  await expect(form()).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText(term('Client name updated.'));
  expect(currentName).toBe(proposed);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual({ clientName: proposed, expectedClientName: originalName });
  await edit().click(); await expect(input()).toHaveValue(proposed);
  const secondName = locale === 'ar' ? 'اسم العميل النهائي' : 'Final client name';
  await input().fill(secondName); await save().click();
  await expect(form()).toHaveCount(0);
  expect(attempts[2]).toEqual({ clientName: secondName, expectedClientName: proposed });
  await expect(page.getByRole('heading', { name: 'Separate project title', exact: true })).toBeVisible();
  await expect(page.locator('nextjs-portal')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`${locale}-client-name-updated.png`), fullPage: true });
  await edit().click(); await input().fill('Offline change');
  await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }));
  await save().click();
  await expect(page.getByRole('alert')).toHaveText(term('Connect to the internet before changing the client name.'));
  expect(attempts).toHaveLength(3);
  await cancel().click();
  await assertEditorHidden(page, '/qa/client-name?role=Outdoor%20Sales', term('Edit client name'));
  await assertEditorHidden(page, '/qa/client-name?role=CEO', term('Edit client name'));
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});

async function assertEditorHidden(page: Page, url: string, label: string) {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Separate project title', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
}
