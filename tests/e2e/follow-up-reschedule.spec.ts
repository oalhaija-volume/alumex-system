import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { devices, expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import type { FieldProject, SalesWorkspaceData } from '../../src/lib/offline/types';

// Exercise actual CRM forms, dashboard predicates, and useResource requests.
// All APIs are isolated fixtures; no production account or business row is used.
const output = resolve('artifacts/overdue-followups-20261111');
const localHeadless = resolve('artifacts/mini-crm-review-20261015/browser/chrome-headless-shell-mac-arm64/chrome-headless-shell');
// Keep these tests on the live API transport, including narrow/mobile viewports.
// Offline pending saves intentionally have different cross-tab semantics.
test.use({ userAgent: devices['Desktop Chrome'].userAgent, timezoneId: 'Asia/Baghdad', video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
const now = '2026-11-11T09:00:00.000Z';
const upcoming = '2026-11-12T09:00:00.000Z';
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Indoor employee', role: 'Indoor Sales', branch: 'Karkh' as const };
const targetId = '11111111-1111-4111-8111-111111111111';
const measured: FieldProject = {
  id: targetId, project_name: 'Rescheduled follow-up fixture', project_number: 'PRJ-FOLLOW-UP',
  address: 'Baghdad', phone: null, branch: 'Karkh', created_by: actor.id, registeredBy: actor.name,
  structure_readiness: 'ready', sales_status: 'quotation_in_progress', status: 'Quotation',
  created_at: '2026-11-01T09:00:00.000Z', updated_at: '2026-11-10T09:00:00.000Z',
  next_follow_up_at: '2026-11-10T09:00:00.000Z', follow_up_owner_id: actor.id, followUpOwner: actor.name,
  follow_up_type: 'call', follow_up_detail: null, project_notes: 'Previous conversation',
};
const projects: FieldProject[] = [
  measured,
  { ...measured, id: '22222222-2222-4222-8222-222222222222', project_name: 'Already scheduled in future', project_number: 'PRJ-FUTURE', next_follow_up_at: '2026-12-01T09:00:00.000Z' },
  { ...measured, id: '33333333-3333-4333-8333-333333333333', project_name: 'Closed project', project_number: 'PRJ-CLOSED', sales_status: 'closed' },
  { ...measured, id: '44444444-4444-4444-8444-444444444444', project_name: 'Signed project', project_number: 'PRJ-SIGNED', sales_status: 'transferred_to_operations', status: 'Production' },
];

test.beforeAll(async ({}, testInfo) => {
  mkdirSync(output, { recursive: true });
  const baseline = Boolean(testInfo.project.metadata.baseline);
  writeFileSync(resolve(output, 'reschedule-entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {ProjectWorkspace} from '@/components/workflow/ProjectWorkspace';import {SalesDashboard} from '@/components/workflow/SalesDashboard';createRoot(document.getElementById('root')!).render(<I18nProvider>{location.pathname==='/dashboard'?<SalesDashboard/>:<ProjectWorkspace followUps/>}</I18nProvider>);`);
  writeFileSync(resolve(output, 'reschedule-typescript-loader.cjs'), `const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,removeComments:true}}).outputText;};`);
  // This transport regression fixture bundles outside Next's font/CSS loaders.
  // Real dashboard styling and font loading are covered by the dashboard UI tests.
  writeFileSync(resolve(output, 'reschedule-font-stub.cjs'), `module.exports={Noto_Sans_Arabic:function(){return {variable:''};}};`);
  writeFileSync(resolve(output, 'reschedule-css-module-loader.cjs'), `module.exports=function(source){const names=[...source.matchAll(/\\.([a-zA-Z_][\\w-]*)/g)].map(match=>match[1]);return 'export default '+JSON.stringify(Object.fromEntries(names.map(name=>[name,name])))+';';};`);
  if (baseline) writeFileSync(resolve(output, 'baseline-ui.tsx'), execFileSync('git', ['show', '3e153584bfb410d54444e4245e0cc1d1cabe6e2b:src/components/workflow/ui.tsx'], { encoding: 'utf8' }));
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({
    mode: 'production', target: 'web', context: process.cwd(), devtool: false,
    entry: resolve(output, 'reschedule-entry.tsx'), output: { path: output, filename: baseline ? 'reschedule-baseline.bundle.js' : 'reschedule.bundle.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } },
    module: { rules: [
      { test: /\.tsx?$/, exclude: /node_modules/, use: [resolve(output, 'reschedule-typescript-loader.cjs')] },
      { test: /\.module\.css$/, use: [resolve(output, 'reschedule-css-module-loader.cjs')] },
    ] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) }),
      new webpack.NormalModuleReplacementPlugin(/^next\/font\/google$/, resolve(output, 'reschedule-font-stub.cjs')),
      ...(baseline ? [new webpack.NormalModuleReplacementPlugin(/(?:^|\/)ui(?:\.tsx)?$/, (resource: { context: string; request: string }) => {
        if (resource.context.includes('/src/components/workflow')) resource.request = resolve(output, 'baseline-ui.tsx');
      })] : [])],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
});

async function fixture(context: BrowserContext, request: APIRequestContext, locale: 'en' | 'ar', baseline: boolean) {
  const messages = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8'));
  const term = (value: string) => messages.terms[value] ?? value;
  const state = {
    projects: structuredClone(projects), patches: [] as Record<string, unknown>[], errors: [] as string[],
    rejectNext: false, holdCrm: false, held: false, release: undefined as (() => void) | undefined,
    reads: { crm: 0, dashboard: 0 },
    history: [{ id: 'old-follow-up', action: 'follow-up', note: 'Previous conversation', recordedAt: '2026-11-10T09:00:00.000Z', recordedBy: actor.name, nextFollowUp: measured.next_follow_up_at, followUpType: 'call', followUpOwner: actor.name }],
  };
  const snapshot = (): SalesWorkspaceData => ({ actor, indoorSales: [actor], outdoorSales: [], projects: structuredClone(state.projects) });
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Follow-up regression</title></head><body><div id="root"></div><script src="/qa/follow-up-reschedule.bundle.js"></script></body></html>`;
  await context.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (url.hostname !== 'localhost') { state.errors.push(`${req.method()} ${url.hostname}`); return route.abort('blockedbyclient'); }
    if (path === '/api/workspace') {
      if (req.method() === 'GET') {
        const data = snapshot(), crm = new URL(req.frame().url()).pathname === '/mini-crm';
        state.reads[crm ? 'crm' : 'dashboard']++;
        if (crm && state.holdCrm) { state.holdCrm = false; state.held = true; await new Promise<void>(accept => { state.release = accept; }); }
        return route.fulfill({ json: data });
      }
      if (req.method() === 'PATCH') {
        const body = req.postDataJSON(); state.patches.push(body);
        assert.equal(body.action, 'follow-up'); assert.equal(body.projectId, targetId);
        if (state.rejectNext) { state.rejectNext = false; return route.fulfill({ status: 409, json: { error: 'The project changed. Reload and try again.' } }); }
        state.projects = state.projects.map(project => project.id === targetId ? {
          ...project, next_follow_up_at: body.nextFollowUp, project_notes: body.note,
          follow_up_type: body.followUpType, follow_up_owner_id: body.followUpOwnerId, updated_at: now,
        } : project);
        state.history.unshift({ id: 'new-follow-up', action: 'follow-up', note: body.note, recordedAt: now, recordedBy: actor.name, nextFollowUp: body.nextFollowUp, followUpType: body.followUpType, followUpOwner: actor.name });
        return route.fulfill({ json: { ok: true } });
      }
    }
    if (path === '/api/offline' && req.method() === 'GET') return route.fulfill({ json: { ...snapshot(), queue: [], openings: [], syncedAt: now } });
    if (/^\/api\/projects\/[^/]+\/follow-ups$/.test(path) && req.method() === 'GET') {
      const id = path.split('/')[3], project = state.projects.find(item => item.id === id)!;
      return route.fulfill({ json: { project, entries: id === targetId ? state.history : [] } });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { state.errors.push(`${req.method()} ${path}`); return route.fulfill({ status: 405, json: { error: 'Unexpected write blocked' } }); }
    if (['/mini-crm', '/dashboard'].includes(path) && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (path === '/qa/follow-up-reschedule.bundle.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, baseline ? 'reschedule-baseline.bundle.js' : 'reschedule.bundle.js')) });
    if (path.startsWith('/api/')) return route.fulfill({ json: {} });
    return route.continue();
  });
  const open = async (path: string) => {
    const page = await context.newPage();
    page.on('pageerror', error => state.errors.push(error.message));
    await page.clock.install({ time: new Date(now) });
    await page.goto(path);
    await expect(page.getByRole('heading', { name: term(path === '/dashboard' ? 'Sales dashboard' : 'Mini CRM'), exact: true })).toBeVisible();
    return page;
  };
  const dashboardCount = (page: Page) => page.getByRole('region', { name: term('Project overview'), exact: true }).getByRole('button').filter({ hasText: term('Overdue follow-ups') }).locator('span').last();
  const crmCount = (page: Page) => page.getByLabel(term('Follow-up overview'), { exact: true }).getByRole('button').filter({ hasText: term('Overdue') }).locator(':scope > span').nth(1);
  const prepareForm = async (page: Page) => {
    const project = page.locator(`#project-${targetId}`);
    await project.getByRole('button', { name: term('Follow up'), exact: true }).click();
    await project.getByRole('combobox', { name: term('Follow-up type'), exact: true }).selectOption('call');
    await project.getByRole('combobox', { name: term('Responsible Indoor Sales'), exact: true }).selectOption(actor.id);
    await project.getByLabel(term('Next follow-up'), { exact: true }).fill('2026-11-12T12:00');
    await project.getByRole('textbox', { name: term('Follow-up note'), exact: true }).fill('Client contacted; next call scheduled tomorrow.');
    return project.getByRole('button', { name: term('Save follow-up'), exact: true });
  };
  return { state, term, open, dashboardCount, crmCount, prepareForm };
}

for (const locale of ['en', 'ar'] as const) {
  test(`${locale}: saved future follow-up clears CRM and an already-open dashboard, then becomes due at the new time`, async ({ context, request }, testInfo) => {
    const f = await fixture(context, request, locale, Boolean(testInfo.project.metadata.baseline));
    const dashboard = await f.open('/dashboard');
    await expect(f.dashboardCount(dashboard)).toHaveText('1');
    const crm = await f.open('/mini-crm');
    await expect(f.crmCount(crm)).toHaveText('1');
    const save = await f.prepareForm(crm);
    await save.click();
    await expect(crm.getByRole('status').filter({ hasText: f.term('Follow-up saved.') })).toBeVisible();
    await expect(f.crmCount(crm)).toHaveText('0');
    await expect(f.dashboardCount(dashboard)).toHaveText('0', { timeout: 5000 });
    assert.equal(f.state.patches.length, 1);
    assert.equal(f.state.patches[0].nextFollowUp, upcoming);
    assert.equal(f.state.history.length, 2);
    assert.equal(f.state.history[1].note, 'Previous conversation');
    assert.equal(f.state.projects.find(project => project.id === targetId)!.next_follow_up_at, upcoming);
    for (const page of [crm, dashboard]) {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: resolve(output, `${locale}-${testInfo.project.name}-${page === crm ? 'crm' : 'dashboard'}-rescheduled.png`), fullPage: true });
    }
    for (const page of [crm, dashboard]) {
      await page.clock.setSystemTime(new Date(Date.parse(upcoming) + 1000));
      await page.clock.runFor(60001);
    }
    await expect(f.crmCount(crm)).toHaveText('1');
    await expect(f.dashboardCount(dashboard)).toHaveText('1');
    assert.deepEqual(f.state.errors, []);
  });

  test(`${locale}: stale poll cannot overwrite a successful follow-up reload`, async ({ context, request }, testInfo) => {
    const f = await fixture(context, request, locale, Boolean(testInfo.project.metadata.baseline));
    const crm = await f.open('/mini-crm');
    await expect(f.crmCount(crm)).toHaveText('1');
    const save = await f.prepareForm(crm);
    f.state.holdCrm = true;
    await crm.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => f.state.held).toBe(true);
    await save.click();
    await expect(crm.getByRole('status').filter({ hasText: f.term('Follow-up saved.') })).toBeVisible();
    await expect(f.crmCount(crm)).toHaveText('0');
    const settled = crm.waitForResponse(response => new URL(response.url()).pathname === '/api/workspace' && response.request().method() === 'GET');
    f.state.release?.();
    await settled;
    // Allow the released response's promise and React update to settle.
    await crm.evaluate(() => new Promise<void>(accept => requestAnimationFrame(() => requestAnimationFrame(() => accept()))));
    await expect(f.crmCount(crm)).toHaveText('0');
    assert.equal(f.state.patches.length, 1);
    assert.deepEqual(f.state.errors, []);
  });

  test(`${locale}: failed follow-up leaves the project overdue and retains entered values for retry`, async ({ context, request }, testInfo) => {
    const f = await fixture(context, request, locale, Boolean(testInfo.project.metadata.baseline));
    const dashboard = await f.open('/dashboard');
    await expect(f.dashboardCount(dashboard)).toHaveText('1');
    const crm = await f.open('/mini-crm');
    const save = await f.prepareForm(crm);
    f.state.rejectNext = true;
    await save.click();
    await expect(crm.getByRole('alert')).toBeVisible();
    await expect(f.crmCount(crm)).toHaveText('1');
    await expect(f.dashboardCount(dashboard)).toHaveText('1');
    await expect(crm.locator(`#project-${targetId}`).getByLabel(f.term('Next follow-up'), { exact: true })).toHaveValue('2026-11-12T12:00');
    assert.equal(f.state.history.length, 1);
    assert.equal(f.state.projects.find(project => project.id === targetId)!.next_follow_up_at, measured.next_follow_up_at);
    assert.deepEqual(f.state.errors, []);
  });
}
