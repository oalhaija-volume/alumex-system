import { expect, test, type Locator, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import enMessages from '../../messages/en.json';
import arMessages from '../../messages/ar.json';
import type { FieldProject, FieldState } from '../../src/lib/offline/types';

type Locale = 'en' | 'ar';
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const governorateId = '33333333-3333-4333-8333-333333333333';
const originalOwner = '44444444-4444-4444-8444-444444444444';
const karkhOwner = '55555555-5555-4555-8555-555555555555';
const rasafaOwner = '66666666-6666-4666-8666-666666666666';
const managerId = '77777777-7777-4777-8777-777777777777';
const originalClient = 'Original shared client · العميل الأصلي';
const originalVersion = '2026-11-10T09:00:00Z';
const nextVersion = '2026-11-11T10:00:00Z';
const clientConflict = 'This client changed on another device. Reload the projects before changing its name.';
const ownerConflict = 'This project changed on another device. Reload before changing Indoor Sales.';
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
let bundle = '', styles = '';

// The real offline shell redirects office employees to their online workspace.
// Mount the actual dashboard directly so its isolated API/IDB fixtures remain
// independent of login and offline-device navigation policies.
test.beforeAll(async ({ request }, testInfo) => {
  const directory = testInfo.outputPath('component');
  mkdirSync(directory, { recursive: true });
  const entry = resolve(directory, 'entry.tsx'), loader = resolve(directory, 'typescript-loader.cjs');
  const cssLoader = resolve(directory, 'css-loader.cjs'), fontMock = resolve(directory, 'font.ts');
  writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {SalesDashboard} from '@/components/workflow/SalesDashboard';createRoot(document.getElementById('root')!).render(<I18nProvider><SalesDashboard/></I18nProvider>);`);
  writeFileSync(loader, `const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};`);
  writeFileSync(fontMock, `export const Noto_Sans_Arabic=()=>({variable:'qa-dashboard-arabic'});`);
  writeFileSync(cssLoader, `const postcss=require('postcss');const local=require('next/dist/compiled/postcss-modules-local-by-default');const scope=require('next/dist/compiled/postcss-modules-scope');module.exports=function(source){const done=this.async();postcss([local(),scope({generateScopedName:name=>'qa_name_'+name})]).process(source,{from:this.resourcePath}).then(result=>{const names={};result.root.walkRules(':export',rule=>{rule.walkDecls(decl=>{names[decl.prop]=decl.value;});rule.remove();});done(null,'const style=document.createElement("style");style.textContent='+JSON.stringify(result.root.toString())+';document.head.appendChild(style);export default '+JSON.stringify(names)+';');},done);};`);
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({ mode: 'production', target: 'web', context: process.cwd(), devtool: false,
    entry, output: { path: directory, filename: 'dashboard.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { 'next/font/google': fontMock, '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }, { test: /\.module\.css$/, use: [cssLoader] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) }), new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors()
    ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
  bundle = readFileSync(resolve(directory, 'dashboard.js'), 'utf8');
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
});

function term(locale: Locale, value: string) {
  const terms: Record<string, string> = (locale === 'ar' ? arMessages : enMessages).terms;
  return terms[value] ?? value;
}

function fixture(role: string): FieldState {
  const base: FieldProject = {
    id: firstId, project_name: 'Residence المنصور', project_number: 'PRJ-EDIT-0001',
    client_id: '88888888-8888-4888-8888-888888888888', client_name: originalClient,
    branch: 'Karkh', address: 'Baghdad · بغداد', phone: '07701234567',
    created_by: actorId, registeredBy: 'Dashboard editor', created_at: '2026-11-01T09:00:00Z', updated_at: originalVersion,
    structure_readiness: 'ready', sales_status: 'quotation_in_progress',
    follow_up_owner_id: originalOwner, followUpOwner: 'Original Indoor',
    next_follow_up_at: '2026-11-10T12:00:00Z', project_notes: 'Preserved note · ملاحظة محفوظة',
    follow_up_type: 'call', follow_up_detail: null,
  };
  return {
    actor: { id: actorId, name: 'Dashboard editor', role, branch: 'Karkh' },
    projects: [base,
      { ...base, id: secondId, project_number: 'PRJ-EDIT-0002', project_name: 'Second site موقع ثان', created_at: '2026-10-01T09:00:00Z' },
      { ...base, id: governorateId, client_id: '99999999-9999-4999-8999-999999999999', client_name: 'Governorates client', project_name: 'Basra site موقع البصرة', project_number: 'PRJ-EDIT-0003', branch: 'Governorates', governorate: 'البصرة' },
    ],
    indoorSales: [
      { id: originalOwner, name: 'Original Indoor', role: 'Indoor Sales', branch: 'Karkh' },
      { id: karkhOwner, name: 'Rana رنا', role: 'Indoor Sales', branch: 'Karkh' },
      { id: rasafaOwner, name: 'Rasafa employee', role: 'Indoor Sales', branch: 'Rasafa' },
      { id: managerId, name: 'Sales Manager', role: 'Sales Manager', branch: 'Rasafa' },
    ],
    outdoorSales: [], queue: [], openings: [], syncedAt: originalVersion,
  };
}

async function storedState(page: Page) {
  return page.evaluate(async actorId => new Promise<FieldState>((resolve, reject) => {
    const request = indexedDB.open('alumex-field-v1', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction('accounts').objectStore('accounts').get(actorId);
      read.onsuccess = () => { database.close(); resolve(read.result); };
      read.onerror = () => reject(read.error);
    };
  }), actorId);
}

async function dashboard(page: Page, locale: Locale, role: string) {
  const state = fixture(role);
  const errors: string[] = [];
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const failures = { client: false, owner: false };
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-11T09:00:00Z'));
  await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== 'http://localhost:3003') return route.abort('blockedbyclient');
    if (url.pathname === '/offline' && request.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/qa/dashboard-name.js"></script></body></html>` });
    if (url.pathname === '/qa/dashboard-name.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    return route.continue();
  });
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON();
      writes.push({ path, body });
      if (path === `/api/projects/${firstId}/client`) {
        if (failures.client) { failures.client = false; return route.fulfill({ status: 409, json: { error: clientConflict } }); }
        expect(body).toEqual({ clientName: expect.any(String), expectedClientName: originalClient });
        const changes = [{ id: firstId, project_name: body.clientName, updated_at: nextVersion }];
        state.projects = state.projects.map(project => project.client_id === state.projects[0].client_id ? { ...project, client_name: body.clientName, ...(project.id === firstId ? changes[0] : {}) } : project);
        return route.fulfill({ json: { ok: true, client: { id: state.projects[0].client_id, client_name: body.clientName }, projects: changes, documentRevisionsCreated: 0 } });
      }
      if (path === `/api/projects/${firstId}/indoor-sales`) {
        if (failures.owner) { failures.owner = false; return route.fulfill({ status: 409, json: { error: ownerConflict } }); }
        expect(body).toEqual({ followUpOwnerId: karkhOwner, expectedUpdatedAt: originalVersion });
        const update = { id: firstId, follow_up_owner_id: karkhOwner, followUpOwner: 'Rana رنا', updated_at: nextVersion };
        state.projects = state.projects.map(project => project.id === firstId ? { ...project, ...update } : project);
        return route.fulfill({ json: { ok: true, project: update } });
      }
      return route.fulfill({ status: 405, json: { error: 'Unexpected dashboard write.' } });
    }
    if (request.method() !== 'GET') return route.fulfill({ status: 405, json: { error: 'Unexpected write.' } });
    if (path === '/api/workspace' || path === '/api/offline') return route.fulfill({ json: state });
    if (path === '/api/outdoor-sales-coverage') return route.fulfill({ json: { asOf: originalVersion, staff: [] } });
    if (path.endsWith('/follow-ups')) return route.fulfill({ json: { project: state.projects.find(project => path.includes(project.id)), entries: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/offline?path=/dashboard');
  await page.evaluate(async saved => {
    localStorage.setItem('alumex-field-active', saved.actor.id);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('alumex-field-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('accounts');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result, transaction = database.transaction('accounts', 'readwrite');
        transaction.objectStore('accounts').put(saved, saved.actor.id);
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
    window.dispatchEvent(new Event('field-change'));
  }, state);
  const projects = page.getByRole('region', { name: term(locale, 'Projects'), exact: true });
  const target = projects.locator(`article[aria-labelledby="project-name-${firstId}"]`);
  await expect(target).toBeVisible();
  const details = target.getByRole('button', { name: term(locale, 'Project details'), exact: true });
  await details.click();
  return { state, projects, target, details, errors, writes, failures };
}

async function combineFilters(page: Page, locale: Locale, search = 'Residence') {
  const filters = page.getByRole('region', { name: term(locale, 'Project filters'), exact: true });
  await filters.locator('summary').click();
  await filters.getByRole('searchbox').fill(search);
  await filters.getByRole('combobox', { name: term(locale, 'Project stage'), exact: true }).selectOption('quotation-response');
  await filters.getByRole('combobox', { name: term(locale, 'Created month'), exact: true }).selectOption('2026-11');
  await filters.getByRole('combobox', { name: term(locale, 'Created by'), exact: true }).selectOption(actorId);
  await filters.locator('summary').click();
  return filters;
}

async function expectPreservedFilters(filters: Locator, locale: Locale, search = 'Residence') {
  await expect(filters.getByRole('searchbox')).toHaveValue(search);
  await expect(filters.locator('details')).not.toHaveAttribute('open');
  await expect(filters.getByRole('combobox', { name: term(locale, 'Project stage'), exact: true, includeHidden: true })).toHaveValue('quotation-response');
  await expect(filters.getByRole('combobox', { name: term(locale, 'Created month'), exact: true, includeHidden: true })).toHaveValue('2026-11');
  await expect(filters.getByRole('combobox', { name: term(locale, 'Created by'), exact: true, includeHidden: true })).toHaveValue(actorId);
}

for (const locale of ['en', 'ar'] as const) {
  test(`${locale}: project title edits use the existing offline queue and preserve the client`, async ({ page }, testInfo) => {
    const { state, projects, writes, errors } = await dashboard(page, locale, 'Indoor Sales');
    const tr = (value: string) => term(locale, value), messages = locale === 'ar' ? arMessages : enMessages;
    const filters = await combineFilters(page, locale);
    const target = projects.locator(`article[aria-labelledby="project-name-${firstId}"]`);
    await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }));
    const edit = target.getByRole('button', { name: tr('Edit project name'), exact: true });
    await edit.click();
    const form = target.getByRole('form', { name: tr('Edit project name'), exact: true });
    const input = form.getByRole('textbox', { name: tr('Project name'), exact: true });
    await expect(input).toHaveValue('Residence المنصور');
    await input.fill('Discarded project title');
    await form.getByRole('button', { name: messages.common.cancel, exact: true }).click();
    expect((await storedState(page)).queue).toEqual([]);
    expect(writes).toEqual([]);
    await expect(target.getByRole('heading')).toHaveText('Residence المنصور');
    await edit.click();
    const proposed = locale === 'ar' ? 'Residence — مشروع المنصور المعدل' : 'Residence revised · مشروع محدث';
    await input.fill(`  ${proposed}  `);
    await form.screenshot({ path: testInfo.outputPath(`project-title-form-${locale}.png`) });
    await form.getByRole('button', { name: messages.common.saveChanges, exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(target.getByRole('heading')).toHaveText(proposed);
    await expect(target.getByRole('status')).toContainText(tr('Project name saved on this device. It will sync when connected.'));
    await expect(target.getByRole('button', { name: tr('Project details'), exact: true })).toHaveAttribute('aria-expanded', 'true');
    await expectPreservedFilters(filters, locale);
    await expect(projects.locator('article')).toHaveCount(1);
    const saved = await storedState(page);
    expect(saved.projects[0]).toMatchObject({ project_name: proposed, client_name: originalClient, pending: true });
    expect(saved.projects.slice(1).map(project => ({ id: project.id, project_name: project.project_name, client_name: project.client_name }))).toEqual(state.projects.slice(1).map(project => ({ id: project.id, project_name: project.project_name, client_name: project.client_name })));
    expect(saved.queue).toHaveLength(1);
    expect(saved.queue[0]).toMatchObject({ userId: actorId, projectId: firstId, action: 'rename-project', payload: { projectName: proposed } });
    expect(Object.keys(saved.queue[0].payload)).toEqual(['projectName']);
    expect(writes).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await target.screenshot({ path: testInfo.outputPath(`project-title-saved-${locale}.png`) });
    expect(errors).toEqual([]);
  });

  for (const role of ['Indoor Sales', 'Admin']) test(`${locale}: ${role} edits the shared client name and preserves dashboard state`, async ({ page }, testInfo) => {
    const { state, target, details, projects, errors, writes, failures } = await dashboard(page, locale, role);
    const before = structuredClone(state.projects);
    const tr = (value: string) => term(locale, value), messages = locale === 'ar' ? arMessages : enMessages;
    const stableSearch = state.projects[0].project_number;
    const filters = await combineFilters(page, locale, stableSearch);
    await expect(projects.locator('article')).toHaveCount(1);
    if (role === 'Admin') {
      await expect(target.getByRole('button', { name: tr('Edit project name'), exact: true })).toHaveCount(0);
      await expect(target.getByRole('button', { name: tr('Change Indoor Sales'), exact: true })).toBeVisible();
    } else {
      await expect(target.getByRole('button', { name: tr('Edit project name'), exact: true })).toBeVisible();
      await expect(target.getByRole('button', { name: tr('Change Indoor Sales'), exact: true })).toHaveCount(0);
    }
    const edit = target.getByRole('button', { name: tr('Edit client name'), exact: true });
    await edit.click();
    const form = target.getByRole('form', { name: tr('Edit client name'), exact: true });
    const input = form.getByRole('textbox', { name: tr('Client name'), exact: true });
    await expect(input).toHaveValue(originalClient);
    await input.fill('Discarded client');
    await form.getByRole('button', { name: messages.common.cancel, exact: true }).click();
    expect(writes).toEqual([]);
    await edit.click();
    await input.fill('   ');
    await form.getByRole('button', { name: messages.common.saveChanges, exact: true }).click();
    await expect(target.getByRole('alert')).toContainText(tr('Enter a client name of 1 to 150 characters.'));
    expect(writes).toEqual([]);
    const proposed = locale === 'ar' ? 'العميل بعد التصحيح' : 'Corrected shared client';
    await input.fill(`  ${proposed}  `);
    failures.client = true;
    await form.getByRole('button', { name: messages.common.saveChanges, exact: true }).click();
    await expect(target.getByRole('alert')).toContainText(tr(clientConflict));
    await expect(input).toHaveValue(`  ${proposed}  `);
    await form.getByRole('button', { name: messages.common.saveChanges, exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(target.getByRole('status')).toContainText(tr('Client name updated.'));
    await expect(details).toHaveAttribute('aria-expanded', 'true');
    await expectPreservedFilters(filters, locale, stableSearch);
    await expect(projects.locator('article')).toHaveCount(1);
    await expect(target.getByRole('heading', { name: proposed, exact: true })).toBeVisible();
    await expect.poll(async () => (await storedState(page)).projects.filter(project => project.client_id === state.projects[0].client_id).map(project => project.client_name)).toEqual([proposed, proposed]);
    await filters.getByRole('button', { name: tr('Clear filters'), exact: true }).click();
    const second = projects.getByRole('article', { name: 'Second site موقع ثان', exact: true });
    await expect(second.getByText(proposed, { exact: true })).toBeVisible();
    await expect(target.getByRole('heading')).toHaveText(proposed);
    expect(state.projects.map(project => project.project_name)).toEqual([proposed, 'Second site موقع ثان', 'Basra site موقع البصرة']);
    expect(state.projects).toEqual([{ ...before[0], client_name: proposed, project_name: proposed, updated_at: nextVersion }, { ...before[1], client_name: proposed }, before[2]]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await target.screenshot({ path: testInfo.outputPath(`client-name-${role.replaceAll(' ', '-')}-${locale}.png`) });
    expect(errors).toEqual([]);
  });

  test(`${locale}: leadership changes Indoor Sales without recording a follow-up`, async ({ page }, testInfo) => {
    const { state, target, details, projects, errors, writes, failures } = await dashboard(page, locale, 'Admin');
    const before = structuredClone(state.projects[0]);
    const tr = (value: string) => term(locale, value), messages = locale === 'ar' ? arMessages : enMessages;
    const filters = await combineFilters(page, locale);
    await expect(target.getByRole('button', { name: tr('Edit client name'), exact: true })).toBeVisible();
    await expect(target.getByRole('button', { name: tr('Edit project name'), exact: true })).toHaveCount(0);
    const edit = target.getByRole('button', { name: tr('Change Indoor Sales'), exact: true });
    await edit.click();
    const form = target.getByRole('form', { name: tr('Change Indoor Sales'), exact: true });
    const select = form.getByRole('combobox', { name: tr('Responsible Indoor Sales'), exact: true });
    await expect(select.locator(`option[value="${rasafaOwner}"]`)).toHaveCount(0);
    await expect(select.locator(`option[value="${karkhOwner}"]`)).toHaveCount(1);
    await select.selectOption(karkhOwner);
    await form.getByRole('button', { name: messages.common.cancel, exact: true }).click();
    expect(writes).toEqual([]);
    await edit.click(); await select.selectOption(karkhOwner);
    failures.owner = true;
    await form.getByRole('button', { name: messages.common.saveChanges, exact: true }).click();
    await expect(target.getByRole('alert')).toContainText(tr(ownerConflict));
    await expect(select).toHaveValue(karkhOwner);
    await form.getByRole('button', { name: messages.common.saveChanges, exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(target.getByText('Rana رنا', { exact: true })).toBeVisible();
    await expect(details).toHaveAttribute('aria-expanded', 'true');
    await expectPreservedFilters(filters, locale);
    await expect(projects.locator('article')).toHaveCount(1);
    const { follow_up_owner_id, followUpOwner, updated_at, ...unchanged } = state.projects[0];
    expect({ follow_up_owner_id, followUpOwner, updated_at }).toEqual({ follow_up_owner_id: karkhOwner, followUpOwner: 'Rana رنا', updated_at: nextVersion });
    expect({ ...unchanged, follow_up_owner_id: before.follow_up_owner_id, followUpOwner: before.followUpOwner, updated_at: before.updated_at }).toEqual(before);
    await expect.poll(async () => (await storedState(page)).projects[0].follow_up_owner_id).toBe(karkhOwner);
    await target.screenshot({ path: testInfo.outputPath(`indoor-sales-${locale}.png`) });
    await filters.getByRole('button', { name: tr('Clear filters'), exact: true }).click();
    const governorate = projects.getByRole('article', { name: 'Basra site موقع البصرة', exact: true });
    await governorate.getByRole('button', { name: tr('Project details'), exact: true }).click();
    await governorate.getByRole('button', { name: tr('Change Indoor Sales'), exact: true }).click();
    const governorateSelect = governorate.getByRole('combobox', { name: tr('Responsible Indoor Sales'), exact: true });
    await expect(governorateSelect.locator(`option[value="${rasafaOwner}"]`)).toHaveCount(0);
    await expect(governorateSelect.locator(`option[value="${karkhOwner}"]`)).toHaveCount(1);
    await expect(governorateSelect.locator(`option[value="${managerId}"]`)).toHaveCount(1);
    expect(writes.every(write => write.path.endsWith('/indoor-sales'))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('Sales Manager retains name editing and cannot use leadership reassignment', async ({ page }) => {
  const { target, writes } = await dashboard(page, 'en', 'Sales Manager');
  await expect(target.getByRole('button', { name: 'Edit client name', exact: true })).toBeVisible();
  await expect(target.getByRole('button', { name: 'Edit project name', exact: true })).toBeVisible();
  await expect(target.getByRole('button', { name: 'Change Indoor Sales', exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('CEO retains leadership reassignment and cannot edit client names', async ({ page }) => {
  const { target, writes } = await dashboard(page, 'en', 'CEO');
  await expect(target.getByRole('button', { name: 'Edit client name', exact: true })).toHaveCount(0);
  await expect(target.getByRole('button', { name: 'Edit project name', exact: true })).toHaveCount(0);
  await expect(target.getByRole('button', { name: 'Change Indoor Sales', exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});
