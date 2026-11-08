import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FieldChange, FieldProject, FieldState } from '../../src/lib/offline/types';
import { savedFieldState } from './helpers/fieldState';

const output = resolve('artifacts/indoor-project-name-20261108');
const projectId = '11111111-1111-4111-8111-111111111111';
const outdoorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'Indoor Sales', name: 'Indoor employee', branch: 'Karkh' as const };
const originalVersion = '2026-11-08T08:00:00Z';
const refreshedVersion = '2026-11-08T09:00:00Z';
const conflict = 'This project changed on another device. Reload the project before changing its name.';

test.beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'browser-entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {ProjectWorkspace} from '@/components/workflow/ProjectWorkspace';createRoot(document.getElementById('root')!).render(<I18nProvider><ProjectWorkspace/></I18nProvider>);`);
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

for (const locale of ['en', 'ar'] as const) test(`${locale}: Indoor Sales edits an Outdoor-created project title without changing client or documents`, async ({ page, context, request }, testInfo) => {
  test.setTimeout(60000);
  const mobile = testInfo.project.name === 'mobile-chromium';
  const messages = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8'));
  const term = (value: string) => messages.terms[value] ?? value;
  const project: FieldProject = {
    id: projectId, project_name: 'Outdoor registered project', project_number: 'PRJ-INDOOR-RENAME',
    created_by: outdoorId, registeredBy: 'Outdoor creator', original_creator_role: 'Outdoor Sales',
    assigned_outdoor_sales_id: outdoorId, assignedOutdoorSales: 'Outdoor creator', assignedToYou: false,
    branch: 'Karkh', structure_readiness: 'ready', sales_status: 'quotation_in_progress',
    address: 'Baghdad, Mansour', phone: '07700000000', next_follow_up_at: null,
    project_notes: 'Preserve the project note', created_at: originalVersion, updated_at: originalVersion,
  };
  const shared: FieldProject = { ...project, id: '22222222-2222-4222-8222-222222222222', project_name: 'Shared governorate project', project_number: 'PRJ-SHARED', branch: 'Governorates', governorate: 'الرمادي' };
  const foreign: FieldProject = { ...project, id: '33333333-3333-4333-8333-333333333333', project_name: 'Other branch project', project_number: 'PRJ-FOREIGN', branch: 'Rasafa' };
  const state: FieldState = {
    actor, projects: [project, shared, foreign], queue: [], outdoorSales: [{ id: outdoorId, name: 'Outdoor creator' }], indoorSales: [actor], syncedAt: null,
    openings: [{ id: '44444444-4444-4444-8444-444444444444', projectId, floor: 'GF', room: 'Office', otherRoom: '', width: 120, height: 150, quantity: 2, structuralType: 'Window', openingType: 'Sliding', createdBy: outdoorId }],
  };
  const protectedRecords = {
    client: { id: 'client-fixture', name: 'Legal client name', mobile: project.phone },
    quotation: { version: 3, projectTitle: project.project_name, total: 1000000, lines: structuredClone(state.openings) },
    contract: { signed_at: '2026-11-07T12:00:00Z', projectTitle: project.project_name, clientName: 'Legal client name', total: 1000000 },
    openings: structuredClone(state.openings),
  };
  const protectedBefore = structuredClone(protectedRecords);
  const attempts: unknown[] = [], applied: unknown[] = [];
  const errors: string[] = [], unexpected: string[] = [];
  const oldName = project.project_name;
  let html = '';
  if (!mobile) {
    const login = await request.get('/login');
    expect(login.status()).toBe(200);
    const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
    html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Alumex Quotation System</title></head><body><div id="root"></div><script src="/qa/indoor-project-name.bundle.js"></script></body></html>`;
  }
  await context.addInitScript(value => {
    localStorage.setItem('alumex_locale', value);
    Reflect.deleteProperty(Navigator.prototype, 'serviceWorker');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => sessionStorage.getItem('indoor-rename-offline') !== '1' });
  }, locale);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (url.hostname !== 'localhost') { unexpected.push(req.method() + ' ' + url.hostname); return route.abort('blockedbyclient'); }
    if (path === '/api/workspace' && req.method() === 'PATCH') {
      try {
        const body = req.postDataJSON(); attempts.push(body);
        assert.deepEqual(Object.keys(body).sort(), ['action', 'expectedUpdatedAt', 'projectId', 'projectName']);
        assert.equal(body.action, 'rename-project'); assert.equal(body.projectId, projectId);
        if (body.expectedUpdatedAt !== project.updated_at) return route.fulfill({ status: 409, json: { error: conflict } });
        project.project_name = body.projectName; project.updated_at = '2026-11-08T10:00:00Z'; applied.push(body);
        return route.fulfill({ json: { ok: true, project } });
      } catch (error) { errors.push((error as Error).message); return route.fulfill({ status: 400, json: { error: (error as Error).message } }); }
    }
    if (path === '/api/offline' && req.method() === 'POST') {
      try {
        const body = req.postDataJSON() as FieldChange & { expectedUpdatedAt: string }; attempts.push(body);
        assert.equal(body.action, 'rename-project'); assert.equal(body.projectId, projectId); assert.equal(body.userId, actor.id);
        assert.deepEqual(Object.keys(body.payload), ['projectName']); assert.equal(body.expectedUpdatedAt, refreshedVersion);
        project.project_name = String(body.payload.projectName); project.updated_at = body.recordedAt; applied.push(body);
        return route.fulfill({ json: { project } });
      } catch (error) { errors.push((error as Error).message); return route.fulfill({ status: 400, json: { error: (error as Error).message } }); }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(req.method() + ' ' + path); return route.fulfill({ status: 405, json: { error: 'Unexpected write blocked' } }); }
    if (!mobile && path === '/projects' && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (path === '/qa/indoor-project-name.bundle.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, 'workspace.bundle.js')) });
    if (path === '/api/notifications') return route.fulfill({ json: { notifications: [], userId: actor.id } });
    if (/^\/api\/projects\/.+\/follow-ups$/.test(path)) {
      const row = state.projects.find(item => item.id === path.split('/')[3]) ?? project;
      return route.fulfill({ json: { project: row, entries: [] } });
    }
    if (path === '/api/workspace' || path === '/api/offline') return route.fulfill({ json: state });
    if (path.startsWith('/api/')) { unexpected.push(req.method() + ' ' + path); return route.fulfill({ status: 404, json: { error: 'Unexpected API read' } }); }
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(mobile ? '/offline?path=/projects' : '/projects');
  const record = page.locator(`#project-${projectId}`);
  const edit = () => record.getByRole('button', { name: term('Edit project name'), exact: true });
  const form = () => record.getByRole('form', { name: term('Edit project name'), exact: true });
  const input = () => form().getByRole('textbox', { name: term('Project name'), exact: true });
  const save = () => form().getByRole('button', { name: messages.common.saveChanges, exact: true });
  const cancel = () => form().getByRole('button', { name: messages.common.cancel, exact: true });
  await expect(edit()).toBeVisible();
  await expect(page.locator(`#project-${shared.id}`).getByRole('button', { name: term('Edit project name'), exact: true })).toBeVisible();
  if (mobile) await expect(page.locator(`#project-${foreign.id}`)).toHaveCount(0);
  else await expect(page.locator(`#project-${foreign.id}`).getByRole('button', { name: term('Edit project name'), exact: true })).toHaveCount(0);
  await expect(record.getByRole('link', { name: project.phone!, exact: true })).toHaveAttribute('href', 'tel:' + project.phone);
  await edit().click();
  await expect(input()).toHaveValue(oldName); await expect(input()).toHaveAttribute('maxlength', '150');
  await input().fill('x'.repeat(151));
  await expect(input()).toHaveValue('x'.repeat(150));
  await cancel().click();
  await expect(record.getByRole('heading', { name: oldName, exact: true })).toBeVisible(); expect(attempts).toHaveLength(0);
  await edit().click();
  await input().fill(''); await save().click();
  expect(await input().evaluate(node => (node as HTMLInputElement).validity.valueMissing)).toBe(true);
  expect(attempts).toHaveLength(0);
  await input().fill('   '); await save().click();
  await expect(record.getByRole('alert')).toHaveText(term('Enter a project name of 1 to 150 characters.'));
  expect(attempts).toHaveLength(0);
  const proposed = locale === 'ar' ? 'عنوان المشروع بعد المراجعة' : 'Reviewed project title';
  await input().fill(proposed);
  project.updated_at = refreshedVersion;
  if (mobile) {
    await page.evaluate(async ({ projectId, refreshedVersion }) => {
      sessionStorage.setItem('indoor-rename-offline', '1'); window.dispatchEvent(new Event('offline'));
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('alumex-field-v1', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result, tx = db.transaction('accounts', 'readwrite'), store = tx.objectStore('accounts');
          const read = store.get(localStorage.getItem('alumex-field-active')!);
          read.onsuccess = () => { const saved = read.result as FieldState; saved.projects.find(row => row.id === projectId)!.updated_at = refreshedVersion; store.put(saved, saved.actor.id); };
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
        };
      });
      window.dispatchEvent(new Event('field-change'));
    }, { projectId, refreshedVersion });
  }
  await save().click();
  await expect(record.getByRole('alert')).toHaveText(term(conflict));
  await expect(input()).toHaveValue(proposed);
  await expect(record.getByRole('heading', { name: oldName, exact: true })).toBeVisible();
  await expect(record.getByText(term('Project name updated.'), { exact: true })).toHaveCount(0);
  expect(applied).toHaveLength(0);
  if (!mobile) expect(attempts).toHaveLength(1);
  await record.screenshot({ path: test.info().outputPath(`${locale}-stale-project-title.png`) });
  await cancel().click(); await page.reload();
  await expect(edit()).toBeVisible();
  await edit().click(); await input().fill(`  ${proposed}  `); await save().click();
  await expect(record.getByRole('heading', { name: proposed, exact: true })).toBeVisible();
  await expect(form()).toHaveCount(0);
  await expect(record.getByRole('link', { name: project.phone!, exact: true })).toHaveAttribute('href', 'tel:' + project.phone);
  let queuedId: string | undefined;
  if (mobile) {
    await expect.poll(async () => (await savedFieldState(page)).queue.length).toBe(1);
    const saved = await savedFieldState(page); queuedId = saved.queue[0].id;
    expect(saved.queue[0]).toMatchObject({ action: 'rename-project', projectId, userId: actor.id, payload: { projectName: proposed } });
    expect(saved.openings).toEqual(protectedBefore.openings); expect(applied).toHaveLength(0);
    await expect(record.getByText(term('Project name saved on this device. It will sync when connected.'), { exact: true })).toBeVisible();
  } else {
    expect(applied).toHaveLength(1);
    await expect(record.getByText(term('Project name updated.'), { exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(record.getByRole('heading', { name: proposed, exact: true })).toBeVisible();
  if (mobile) {
    expect((await savedFieldState(page)).queue[0].id).toBe(queuedId);
    await page.evaluate(() => { sessionStorage.removeItem('indoor-rename-offline'); window.dispatchEvent(new Event('online')); });
    await expect.poll(async () => (await savedFieldState(page)).queue.length).toBe(0);
    expect(applied).toHaveLength(1);
    expect((applied[0] as FieldChange).id).toBe(queuedId);
    expect((await savedFieldState(page)).openings).toEqual(protectedBefore.openings);
  }
  expect(project.project_name).toBe(proposed);
  expect(project.created_by).toBe(outdoorId); expect(project.phone).toBe(protectedBefore.client.mobile);
  expect(project.sales_status).toBe('quotation_in_progress'); expect(project.project_notes).toBe('Preserve the project note');
  expect(protectedRecords).toEqual(protectedBefore);
  await record.screenshot({ path: test.info().outputPath(`${locale}-renamed-project-title.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});
