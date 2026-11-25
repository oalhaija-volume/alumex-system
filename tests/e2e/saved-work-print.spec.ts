import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { translateTerm } from '../../src/lib/i18nFormatting';
import { messagesByLocale } from '../../src/lib/i18n';
import { priceQuotation, type CatalogItem, type MeasuredOpening } from '../../src/lib/workflow/pricing';
import type { FieldProject, FieldState } from '../../src/lib/offline/types';

// Render the real normal quotation page composition without production login
// credentials. Only the Next navigation context and business APIs are fixtures.
const output = resolve('.next/cache/print-saved-work-20261125');
const projectId = '11111111-1111-4111-8111-111111111111';
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'Indoor Sales', name: 'Indoor print fixture', branch: 'Karkh' as const };
const note = 'PRIVATE UNSYNCED FOLLOW-UP DO NOT PRINT';
const archivedNote = 'PRIVATE ARCHIVED FOLLOW-UP DO NOT PRINT';
const pendingProjectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const archiveProjectId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const baseProject: FieldProject = {
  id: projectId, project_name: 'Client quotation project', project_number: 'PRJ-PRINT-CLIENT',
  branch: 'Karkh', address: 'Baghdad', phone: '07000000000', structure_readiness: 'ready',
  sales_status: 'quotation_in_progress', project_notes: null, next_follow_up_at: null,
  created_at: '2026-11-24T10:00:00Z', updated_at: '2026-11-25T10:00:00Z',
  created_by: actor.id, registeredBy: actor.name, follow_up_owner_id: actor.id,
};
const savedProject: FieldProject = { ...baseProject, id: pendingProjectId, project_name: 'Private pending project', project_notes: note, structure_readiness: 'not_ready', sales_status: 'new_lead', pending: true };
const archivedProject: FieldProject = { ...baseProject, id: archiveProjectId, project_name: 'Private archived project', project_notes: archivedNote };
const state: FieldState = {
  actor, projects: [baseProject, savedProject], openings: [], syncedAt: '2026-11-25T10:00:00Z',
  indoorSales: [{ ...actor }], outdoorSales: [],
  queue: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', userId: actor.id, projectId: pendingProjectId, action: 'follow-up', recordedAt: '2026-11-25T10:01:00Z',
    payload: { note, nextFollowUp: '2026-11-26T10:00:00Z', followUpOwnerId: actor.id }, error: 'This project was changed on another device. Review the online project before retrying your saved changes.' }],
  archivedProjects: [{ projectId: archiveProjectId, project: archivedProject, archivedAt: '2026-11-25T10:02:00Z', openings: [], measurementReports: [],
    changes: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', userId: actor.id, projectId: archiveProjectId, action: 'follow-up', recordedAt: '2026-11-25T10:01:00Z', payload: { note: archivedNote } }] }],
};
const openings: MeasuredOpening[] = [{ id: 'print-opening', floor: 'GF', room: 'Office', width: 100, height: 100, quantity: 2, opening_type: 'Window', opening_direction: 'Sliding' }];
const catalog: CatalogItem[] = [{ id: 'system', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true }];
const quote = { ...priceQuotation(openings, [{ openingId: openings[0].id, systemId: catalog[0].id, glassId: '', extras: [] }], catalog, actor.id), version: 1, createdAt: '2026-11-25T10:00:00Z' };
let bundle = '';
let styles = '';

test.beforeAll(async ({ request }) => {
  test.setTimeout(60000);
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {RegistrationShell} from '@/components/intake/RegistrationShell';import {QuotationWorkspace} from '@/components/workflow/QuotationWorkspace';createRoot(document.getElementById('root')!).render(<I18nProvider><RegistrationShell role="Indoor Sales" userName="Indoor print fixture"><QuotationWorkspace projectId="${projectId}"/></RegistrationShell></I18nProvider>);`);
  writeFileSync(resolve(output, 'navigation.ts'), 'export function usePathname(){return window.location.pathname;}');
  writeFileSync(resolve(output, 'typescript-loader.cjs'), "const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};");
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack') as { webpack: ((config: Record<string, unknown>, callback: (error: Error | null, stats?: { hasErrors(): boolean; toString(options: Record<string, unknown>): string }) => void) => void) & { DefinePlugin: new (values: Record<string, string>) => unknown } };
  await new Promise<void>((accept, reject) => webpack({
    mode: 'production', target: 'web', context: process.cwd(), devtool: false,
    entry: resolve(output, 'entry.tsx'), output: { path: output, filename: 'quotation-print.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src'), 'next/navigation$': resolve(output, 'navigation.ts') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [resolve(output, 'typescript-loader.cjs')] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })], optimization: { minimize: false }, performance: { hints: false },
  }, (error, stats) => error ? reject(error) : !stats || stats.hasErrors() ? reject(new Error(stats?.toString({ all: false, errors: true }) ?? 'Print fixture unavailable')) : accept()));
  bundle = readFileSync(resolve(output, 'quotation-print.js'), 'utf8');
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  expect(styles).not.toBe('');
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: client quotation printing excludes saved-work warnings and private drafts`, async ({ page }, testInfo) => {
  const errors: string[] = [];
  const unexpected: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const term = (value: string) => translateTerm(locale, value);
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Alumex Quotation System</title></head><body><div id="root"></div><script src="/qa/saved-work-print.js"></script></body></html>`;
  await page.addInitScript(locale => localStorage.setItem('alumex_locale', locale), locale);
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== 'http://localhost:3003') { unexpected.push(`${request.method()} ${url.origin}`); return route.abort('blockedbyclient'); }
    if (url.pathname === '/qa/seed') return route.fulfill({ contentType: 'text/html', body: '<h1>Local print fixture setup</h1>' });
    if (url.pathname === `/quotation/${projectId}` && request.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/qa/saved-work-print.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    if (url.pathname === '/api/offline' && request.method() === 'GET' && url.searchParams.has('session')) return route.fulfill({ json: { actor } });
    if (url.pathname === '/api/offline' && request.method() === 'POST') return route.fulfill({ status: 409, json: { error: state.queue[0].error } });
    if (url.pathname === `/api/sales-flow/${projectId}` && request.method() === 'GET') return route.fulfill({ headers: { 'X-Alumex-Actor': actor.id }, json: {
      project: baseProject, client: { name: 'Quotation client', mobile: '07000000000' }, openings, catalog, history: [],
      flow: { project_id: projectId, revision: 1, stage: 'quotation', quotation: quote, signed_at: null, contract: null, evidence: null, accepted_at: null, accepted_by: null },
    } });
    if (request.method() !== 'GET') { unexpected.push(`${request.method()} ${url.pathname}`); return route.fulfill({ status: 405, json: { error: 'Unexpected write blocked' } }); }
    if (url.pathname === '/api/workspace') return route.fulfill({ json: { actor, projects: [baseProject], indoorSales: [{ ...actor }], outdoorSales: [] } });
    if (url.pathname === '/api/notifications') return route.fulfill({ json: { userId: actor.id, role: actor.role, notifications: [], unreadCount: 0 } });
    if (url.pathname.startsWith('/api/measurement-reports/')) return route.fulfill({ json: { reports: [] } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: { error: 'Fixture endpoint unavailable' } });
    return route.continue();
  });
  await page.goto('/qa/seed');
  await page.evaluate(state => new Promise<void>((accept, reject) => {
    const request = indexedDB.open('alumex-field-v1', 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => request.result.createObjectStore('accounts');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('accounts', 'readwrite');
      tx.objectStore('accounts').put(state, state.actor.id);
      tx.oncomplete = () => { db.close(); localStorage.setItem('alumex-field-active', state.actor.id); accept(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), state);
  await page.goto(`/quotation/${projectId}`);
  const warning = page.getByRole('heading', { name: term('Saved work needs attention'), exact: true });
  const pending = page.getByText(term('1 saved change from this account needs syncing or review.'), { exact: true });
  const archive = page.locator('details').filter({ has: page.locator('summary', { hasText: term('Saved work for deleted projects') }) });
  const paper = page.locator('.commercial-document');
  const total = paper.locator('.document-total strong');
  const money = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(quote.total) + (locale === 'ar' ? ' د.ع' : ' IQD');
  await expect(warning).toBeVisible();
  await expect(pending).toBeVisible();
  await expect(page.getByText(note, { exact: false })).toBeVisible();
  await archive.locator('summary').click();
  await expect(page.getByText(archivedNote, { exact: false })).toBeVisible();
  await expect(page.getByText(savedProject.project_name, { exact: false })).toBeVisible();
  await expect(page.getByText(archivedProject.project_name, { exact: true })).toBeVisible();
  await expect(paper).toBeVisible();
  await expect(total).toHaveText(money);
  await expect(page).toHaveTitle(messagesByLocale[locale].app.title);
  await page.screenshot({ path: testInfo.outputPath('quotation-screen-with-private-recovery.png'), fullPage: true });

  await page.emulateMedia({ media: 'print' });
  for (const content of [warning, pending, page.getByText(note, { exact: false }), page.getByText(archivedNote, { exact: false }), page.getByText(savedProject.project_name, { exact: false }), page.getByText(archivedProject.project_name, { exact: true }), archive]) await expect(content).toBeHidden();
  await expect(page.getByRole('button', { name: term('Review server version'), exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: term('Refresh projects'), exact: true })).toBeHidden();
  await expect(paper).toBeVisible();
  await expect(paper.locator('.document-parties').getByText('PRJ-PRINT-CLIENT', { exact: true })).toBeVisible();
  await expect(paper.getByText('Quotation client', { exact: true })).toBeVisible();
  await expect(total).toBeVisible();
  await expect(total).toHaveText(money);
  await page.screenshot({ path: testInfo.outputPath('quotation-print-without-private-recovery.png'), fullPage: true });
  await page.pdf({ path: testInfo.outputPath('client-quotation.pdf'), format: 'A4', printBackground: true });
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});
