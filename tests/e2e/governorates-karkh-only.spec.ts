import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FieldOpening, FieldProject, FieldState } from '../../src/lib/offline/types';

const output = resolve('.next/cache/qa-governorates-karkh-only');
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({
  video: 'off', serviceWorkers: 'block',
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1',
  launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined },
});
const governoratesId = '11111111-1111-4111-8111-111111111111';
const karkhId = '22222222-2222-4222-8222-222222222222';
const rasafaId = '33333333-3333-4333-8333-333333333333';
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const recordedAt = '2026-11-11T08:00:00Z';
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jh9sAAAAASUVORK5CYII=';

type QaApi = {
  visible: () => Promise<FieldState>;
  raw: () => Promise<FieldState>;
  measurements: (id: string) => Promise<{ status: number; body: { openings?: FieldOpening[]; error?: string } }>;
};

function cachedMixedState(branch: 'Karkh' | 'Rasafa'): FieldState {
  const base = {
    address: 'Baghdad', phone: '07700000000', structure_readiness: 'not_ready', sales_status: 'new_lead',
    next_follow_up_at: null, project_notes: null, created_at: recordedAt, updated_at: recordedAt,
    created_by: actorId, registeredBy: 'Indoor employee', original_creator_role: 'Indoor Sales',
    assigned_outdoor_sales_id: null,
  };
  const projects: FieldProject[] = [
    { ...base, id: governoratesId, project_name: 'قمة المعماريون ـ مزرعة يعقوب يوسف', project_number: 'PRJ-202611-0084', branch: 'Governorates', governorate: 'الرمادي', project_notes: 'Governorates private project note' },
    { ...base, id: karkhId, project_name: 'Karkh client project', project_number: 'PRJ-KARKH', branch: 'Karkh', project_notes: 'Karkh private project note' },
    { ...base, id: rasafaId, project_name: 'Rasafa client project', project_number: 'PRJ-RASAFA', branch: 'Rasafa', project_notes: 'Rasafa private project note' },
  ];
  const actor = { id: actorId, role: 'Indoor Sales', name: 'Indoor employee', branch };
  const openings: FieldOpening[] = projects.map((project, index) => ({
    id: `${index + 4}4444444-4444-4444-8444-444444444444`, projectId: project.id, createdBy: actorId,
    floor: 'GF', room: 'Office', otherRoom: '', width: 120, height: 150, quantity: 1,
    structuralType: 'Window', openingType: 'Sliding', hasCurtainWallCapture: true,
    curtainWall: { note: `${project.branch} private opening media`, photo },
  }));
  const queue = projects.map((project, index) => ({
    id: `${index + 7}7777777-7777-4777-8777-777777777777`, userId: actorId, projectId: project.id,
    action: 'follow-up' as const, recordedAt, error: 'Saved follow-up needs review.',
    payload: { note: `${project.branch} private queued follow-up`, nextFollowUp: '2026-11-12T09:00:00Z', followUpType: 'call', followUpOwnerId: actorId },
  }));
  const measurementReports = projects.map(project => ({
    id: `report-${project.id}`, project_id: project.id, note: `${project.branch} private measurement report`,
    has_photo: true, photo, recorded_by: actorId, recorded_by_name: actor.name, recorded_at: recordedAt,
  }));
  const followUpHistories = Object.fromEntries(projects.map(project => [project.id, {
    project, entries: [{ id: `history-${project.id}`, action: 'follow-up' as const,
      note: `${project.branch} private cached history`, nextFollowUp: null, recordedAt, recordedBy: actor.name }],
  }]));
  return {
    actor, projects, openings, queue, measurementReports, followUpHistories, syncedAt: recordedAt,
    indoorSales: [actor], outdoorSales: [],
    archivedProjects: projects.map(project => ({
      projectId: project.id, project: { ...project, project_name: `Archived ${project.project_name}` },
      changes: [{ ...queue.find(change => change.projectId === project.id)!, payload: { note: `${project.branch} private archived note` } }],
      openings: openings.filter(opening => opening.projectId === project.id),
      measurementReports: measurementReports.filter(report => report.project_id === project.id),
      followUpHistory: followUpHistories[project.id], archivedAt: recordedAt,
    })),
  };
}

test.beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'browser-entry.tsx'), `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {I18nProvider} from '@/components/i18n/I18nProvider';
    import {ProjectWorkspace} from '@/components/workflow/ProjectWorkspace';
    import {FollowUpWorkspace} from '@/components/workflow/FollowUpWorkspace';
    import {SyncConflicts} from '@/components/offline/SyncConflicts';
    import {MeasurementReports} from '@/components/measurements/MeasurementReports';
    import {setFieldUser,updateFieldState,readFieldState,readStoredFieldState} from '@/lib/offline/store';
    import {fieldFetch} from '@/lib/offline/client';
    (async()=>{
      const initial=JSON.parse(document.getElementById('fixture-state')!.textContent!);
      document.getElementById('fixture-state')!.remove();
      setFieldUser(initial.actor.id);await updateFieldState(initial.actor.id,()=>initial);
      window.governoratesQa={visible:readFieldState,raw:readStoredFieldState,measurements:async id=>{const response=await fieldFetch('/api/initial-measurements/'+id);return{status:response.status,body:await response.json()};}};
      const visible=await readFieldState();
      const direct=new URLSearchParams(location.search).get('direct')==='follow-ups';
      createRoot(document.getElementById('root')!).render(<I18nProvider>{direct?<FollowUpWorkspace projectId="${governoratesId}"/>:<><ProjectWorkspace/><SyncConflicts state={visible!}/><MeasurementReports projectId="${governoratesId}"/></>}</I18nProvider>);
    })().catch(error=>{document.getElementById('root')!.textContent=error.message;throw error;});
  `);
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

for (const locale of ['en', 'ar'] as const) for (const branch of ['Karkh', 'Rasafa'] as const) test(`${locale}: ${branch} scopes a legacy mixed cache without deleting unsynced work`, async ({ page, context, request }) => {
  const initial = cachedMixedState(branch);
  const messages = JSON.parse(readFileSync(resolve(`messages/${locale}.json`), 'utf8'));
  const term = (value: string) => messages.terms[value] ?? value;
  const errors: string[] = [], unexpected: string[] = [];
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Alumex Quotation System</title></head><body><div id="root"></div><script id="fixture-state" type="application/json">${JSON.stringify(initial)}</script><script src="/qa/governorates-karkh-only.bundle.js"></script></body></html>`;
  await context.addInitScript(value => {
    localStorage.setItem('alumex_locale', value);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  }, locale);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname !== 'localhost') { unexpected.push(req.method() + ' ' + url.hostname); return route.abort('blockedbyclient'); }
    if (url.pathname === '/offline' && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/qa/governorates-karkh-only.bundle.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, 'workspace.bundle.js')) });
    if (url.pathname.startsWith('/api/') || !['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push(req.method() + ' ' + url.pathname); return route.fulfill({ status: 405, json: { error: 'Offline fixture blocked unexpected network access' } }); }
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/offline?path=/projects');
  await expect(page).toHaveTitle(messages.app.title);
  await expect(page).toHaveURL('http://localhost:3003/offline?path=/projects');
  await expect(page.getByRole('heading', { name: term('Projects'), exact: true })).toBeVisible();
  const allowedIds = branch === 'Karkh' ? [governoratesId, karkhId] : [rasafaId];
  const forbidden = initial.projects.filter(project => !allowedIds.includes(project.id));
  for (const project of initial.projects) {
    if (allowedIds.includes(project.id)) await expect(page.locator(`#project-${project.id}`)).toBeVisible();
    else await expect(page.locator(`#project-${project.id}`)).toHaveCount(0);
  }
  for (const project of forbidden) {
    await expect(page.locator('body')).not.toContainText(project.project_name);
    await expect(page.locator('body')).not.toContainText(`${project.branch} private`);
  }
  const visible = await page.evaluate(async () => (window as unknown as { governoratesQa: QaApi }).governoratesQa.visible());
  expect(visible.projects.map(project => project.id).sort()).toEqual([...allowedIds].sort());
  expect(visible.openings.map(opening => opening.projectId).sort()).toEqual([...allowedIds].sort());
  expect(visible.queue.map(change => change.projectId).sort()).toEqual([...allowedIds].sort());
  expect(visible.measurementReports!.map(report => report.project_id).sort()).toEqual([...allowedIds].sort());
  expect(Object.keys(visible.followUpHistories!).sort()).toEqual([...allowedIds].sort());
  expect(visible.archivedProjects!.map(archive => archive.projectId).sort()).toEqual([...allowedIds].sort());
  const measurements = await page.evaluate(async id => (window as unknown as { governoratesQa: QaApi }).governoratesQa.measurements(id), governoratesId);
  expect(measurements.status).toBe(branch === 'Karkh' ? 200 : 404);
  if (branch === 'Karkh') {
    expect(measurements.body.openings).toHaveLength(1);
    await expect(page.getByText('Governorates private measurement report', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: term('Measurement site photo'), exact: true })).toBeVisible();
    await expect(page.locator(`#project-${governoratesId}`)).toContainText('الرمادي');
  } else {
    expect(measurements.body.openings).toBeUndefined();
    await expect(page.getByRole('region', { name: term('Measurement notes and photos'), exact: true })).toHaveCount(0);
    await expect(page.getByRole('img', { name: term('Measurement site photo'), exact: true })).toHaveCount(0);
  }
  expect(await page.evaluate(async () => (window as unknown as { governoratesQa: QaApi }).governoratesQa.raw())).toEqual(initial);
  await expect(page.locator('nextjs-portal')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`${locale}-${branch.toLowerCase()}-legacy-cache.png`), fullPage: true });

  await page.goto('/offline?path=/projects&direct=follow-ups');
  await expect(page.getByRole('heading', { name: term('Project follow-ups'), exact: true })).toBeVisible();
  if (branch === 'Karkh') {
    await expect(page.getByRole('heading', { name: initial.projects[0].project_name, exact: true })).toBeVisible();
    await expect(page.getByText('Governorates private cached history', { exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole('alert')).toHaveText(term('Connect to the internet to download this project’s follow-up history.'));
    await expect(page.locator('body')).not.toContainText(initial.projects[0].project_name);
    await expect(page.locator('body')).not.toContainText('Governorates private');
    await expect(page.getByRole('button', { name: term('Print follow-ups'), exact: true })).toBeDisabled();
  }
  expect(await page.evaluate(async () => (window as unknown as { governoratesQa: QaApi }).governoratesQa.raw())).toEqual(initial);
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});
