import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FieldState } from '../../src/lib/offline/types';
import type { OfflineQuotationData } from '../../src/lib/offline/quotationTypes';

// The repository has no connected Browser tool. Use its local Chromium binary,
// real IndexedDB and real service worker, with every business API intercepted.
const executablePath = [resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell'), resolve('artifacts/mini-crm-review-20261015/browser/chrome-headless-shell-mac-arm64/chrome-headless-shell')].find(path => existsSync(path));
const origin = 'http://localhost:3003';
const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const catalog = [{ id: 'system', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true }];
const opening = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', width: 100, height: 100, quantity: 1, floor: 'GF', room: 'Office', opening_type: 'Window', opening_direction: 'Sliding' };

function data(shared: boolean, rate = 250000, revision = 1): OfflineQuotationData {
  return {
    quotationAccess: shared ? 'prices' : 'full',
    project: { id: projectId, project_name: 'Windows quotation fixture', project_number: 'PRJ-WINDOWS-OFFLINE', branch: shared ? 'Rasafa' : 'Karkh', address: 'Baghdad', sales_status: 'quotation_in_progress' },
    client: { name: 'Windows fixture client', mobile: '07000000000' }, openings: [opening], catalog, history: [],
    flow: { project_id: projectId, revision, stage: 'quotation', signed_at: null, contract: null, evidence: null, accepted_at: null, accepted_by: null,
      quotation: { version: revision, branch: shared ? 'Rasafa' : 'Karkh', currency: 'IQD', createdAt: '2026-11-23T10:00:00Z', preparedBy: 'original-author', total: rate,
        lines: [{ opening, area: 1, system: { id: 'system', name: 'Alumex System', unit: 'sqm', quantity: 1, rate, total: rate, rateSource: 'quotation' }, glass: null, extras: [], total: rate }], additionalItems: [] },
    },
  };
}

async function state(page: Page): Promise<FieldState> {
  return page.evaluate(id => new Promise<FieldState>((accept, reject) => {
    const request = indexedDB.open('alumex-field-v1', 1);
    request.onerror = () => reject(new Error('IndexedDB unavailable'));
    request.onsuccess = () => {
      const db = request.result; const read = db.transaction('accounts', 'readonly').objectStore('accounts').get(id);
      read.onerror = () => { db.close(); reject(new Error('Saved account unavailable')); };
      read.onsuccess = () => { const result = read.result; db.close(); accept(result); };
    };
  }), accountId);
}

for (const scenario of [{ shared: false, conflict: false }, { shared: true, conflict: false }, { shared: true, conflict: true }]) test(`Windows ${scenario.shared ? 'legacy Indoor Sales shared price-only' : 'Sales Manager full'} quotation ${scenario.conflict ? 'keeps a server conflict for explicit review' : 'survives restart and synchronizes exactly once'}`, async ({}, testInfo) => {
  const { shared, conflict } = scenario;
  const actor = { id: accountId, name: 'Windows offline fixture', role: shared ? 'Indoor Sales' : 'Sales Manager', branch: 'Karkh' as const };
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Windows laptop scenario'); test.setTimeout(120000);
  expect(executablePath, 'A repository-local browser is required').toBeTruthy();
  let context: BrowserContext | undefined;
  let network = true;
  let remote = data(shared);
  const received: { id: string; body: Record<string, unknown> }[] = [];
  const receipts = new Map<string, unknown>();
  const errors: string[] = [];
  const remoteField: FieldState = { actor, projects: [], openings: [], queue: [], indoorSales: [{ id: actor.id, name: actor.name, role: actor.role, branch: actor.branch }], outdoorSales: [], syncedAt: null };

  async function launch(offline = false) {
    network = !offline;
    const current = await chromium.launchPersistentContext(testInfo.outputPath('windows-profile'), {
      executablePath, headless: true, serviceWorkers: 'allow', viewport: { width: 1366, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    });
    context = current; await current.setOffline(offline);
    await current.route('**/api/**', async route => {
      if (!network) return route.abort('internetdisconnected');
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort('blockedbyclient');
      const headers = { 'X-Alumex-Actor': actor.id, 'Cache-Control': 'private, no-store' };
      if (url.pathname === '/api/offline') {
        expect(request.method()).toBe('GET'); return route.fulfill({ headers, json: remoteField });
      }
      if (url.pathname === '/api/offline/quotations') {
        const { catalog: ignored, ...snapshot } = remote; void ignored;
        return route.fulfill({ headers, json: { actor, quotations: [{ projectId, data: snapshot }], catalog, nextCursor: null, complete: true, downloadedAt: new Date().toISOString() } });
      }
      if (url.pathname === '/api/shared-quotations') return route.fulfill({ headers, json: { projects: shared ? [{ id: projectId, ...remote.project }] : [] } });
      if (url.pathname === `/api/sales-flow/${projectId}`) {
        if (request.method() === 'GET') return route.fulfill({ headers, json: remote });
        const id = request.headers()['x-alumex-offline-operation']; expect(id).toMatch(/^[0-9a-f-]{36}$/);
        expect(request.headers()['x-alumex-offline-actor']).toBe(actor.id);
        const body = request.postDataJSON() as Record<string, unknown>; expect(body.action).toBe(shared ? 'save-shared-prices' : 'save');
        received.push({ id, body });
        if (!receipts.has(id)) {
          if (body.revision !== remote.flow!.revision) return route.fulfill({ status: 409, headers, json: { error: 'This project changed. Reload and try again.', code: 'OFFLINE_QUOTATION_CONFLICT' } });
          expect(body.revision).toBe(remote.flow!.revision);
          const rate = shared ? (body.systemRates as { rate: number }[])[0].rate : (body.choices as { systemRate: number }[])[0].systemRate;
          remote = data(shared, rate, remote.flow!.revision + 1);
          receipts.set(id, { ok: true, operationId: id, revision: remote.flow!.revision, flow: remote.flow, replayed: false });
        }
        return route.fulfill({ headers, json: receipts.get(id) });
      }
      if (url.pathname === '/api/notifications') return route.fulfill({ json: { notifications: [], unread: 0 } });
      if (url.pathname.includes('measurement-reports')) return route.fulfill({ json: { reports: [] } });
      if (request.method() !== 'GET') throw new Error(`Unexpected business write: ${request.method()} ${url.pathname}`);
      return route.fulfill({ status: 404, json: { error: 'Fixture endpoint unavailable' } });
    });
    await current.route('**/login', route => route.fulfill({ contentType: 'text/html', body: '<h1>Login fixture</h1>' }));
    const page = current.pages()[0] ?? await current.newPage();
    page.on('pageerror', error => errors.push(error.message)); return page;
  }

  async function edit(page: Page, rate: number) {
    if (!shared) await page.getByRole('button', { name: 'Edit quotation', exact: true }).click();
    await page.getByRole('spinbutton', { name: shared ? 'System price for opening 1' : 'Quotation system rate (IQD / m²)', exact: true }).fill(String(rate));
    await page.getByRole('button', { name: 'Save revised quotation', exact: true }).click();
    await expect(page.getByText('Quotation saved on this device. It will sync when connected.', { exact: true })).toBeVisible();
  }

  try {
    let page = await launch();
    if (shared) {
      // Retained drafts may have been created by the previous application.
      // Seed that existing account, then prove the new shell permits recovery
      // while preventing any further Indoor Sales editing offline.
      await page.goto(`${origin}/login`);
      const saved: FieldState = { ...remoteField, quotations: {
        entries: [{ projectId, data: data(true, 280000), available: true, downloadedAt: '2026-11-23T10:00:00Z' }],
        queue: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', userId: actor.id, projectId, recordedAt: '2026-11-23T10:01:00Z',
          body: { action: 'save-shared-prices', revision: 1, systemRates: [{ openingId: opening.id, rate: 280000 }] }, base: data(true), draft: data(true, 280000) }],
        archived: [], downloadedAt: '2026-11-23T10:00:00Z',
      } };
      await page.evaluate(saved => new Promise<void>((accept, reject) => {
        const request = indexedDB.open('alumex-field-v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('accounts');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('accounts', 'readwrite');
          tx.objectStore('accounts').put(saved, saved.actor.id);
          tx.oncomplete = () => { db.close(); localStorage.setItem('alumex-field-active', saved.actor.id); accept(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
      }), saved);
      await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }); });
    } else {
      await page.goto(`${origin}/offline?path=/quotation/${projectId}`);
      await expect(page.getByRole('heading', { name: 'Quotation', exact: true })).toBeVisible();
      await expect.poll(async () => (await state(page))?.quotations?.entries.length).toBe(1);
    }
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(async () => !!(await caches.match('/offline')))).toBe(true);
    const paths = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat());
    expect(paths.some(path => path.startsWith('/api/'))).toBe(false);
    await context!.close(); context = undefined;
    page = await launch(true); await page.goto(`${origin}/offline?path=/quotation/${projectId}`);
    if (shared) {
      await expect(page.getByRole('heading', { name: 'Indoor Sales requires an internet connection.', exact: true })).toBeVisible();
      await expect(page.getByRole('spinbutton')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Save revised quotation', exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByRole('heading', { name: 'Quotation', exact: true })).toBeVisible();
      await edit(page, 280000);
    }
    const saved = await state(page); expect(saved.quotations!.queue).toHaveLength(1);
    const operation = saved.quotations!.queue[0]; expect(operation.draft.flow!.quotation.total).toBe(280000);
    expect(received).toHaveLength(0); expect(saved.projects).toHaveLength(0);
    await context!.close(); context = undefined;
    page = await launch(true); await page.goto(`${origin}/offline?path=/quotation/${projectId}`);
    if (shared) await expect(page.getByRole('heading', { name: 'Indoor Sales requires an internet connection.', exact: true })).toBeVisible();
    else await expect(page.getByText('Quotation saved on this device. It will sync when connected.', { exact: true })).toBeVisible();
    expect((await state(page)).quotations!.queue[0].id).toBe(operation.id);
    if (shared) {
      await expect(page.getByRole('button', { name: 'Edit quotation', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Client approved this quotation', exact: true })).toHaveCount(0);
      expect((await state(page)).quotations!.queue[0].draft.project.branch).toBe('Rasafa');
    }
    await page.screenshot({ path: testInfo.outputPath('quotation-reopened-offline.png'), fullPage: true });
    if (conflict) remote = data(shared, 260000, 2);
    network = true; await context!.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online')));
    if (conflict) {
      await expect(page.getByRole('heading', { name: 'Saved quotations need attention', exact: true })).toBeVisible();
      expect((await state(page)).quotations!.queue).toHaveLength(1);
      await page.getByRole('button', { name: 'Review latest quotation', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Keep latest server quotation', exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('quotation-conflict-review.png'), fullPage: true });
      await page.getByRole('button', { name: 'Keep latest server quotation', exact: true }).click();
      await expect.poll(async () => (await state(page)).quotations!.queue.length).toBe(0);
      const resolved = await state(page); expect(resolved.quotations!.archived).toHaveLength(1);
      expect(resolved.quotations!.archived[0].operation.draft.flow!.quotation.total).toBe(280000);
      expect(resolved.quotations!.entries[0].data.flow!.quotation.total).toBe(260000);
      expect(receipts.size).toBe(0); expect(received).toHaveLength(1); expect(errors).toEqual([]);
      return;
    }
    await expect.poll(async () => (await state(page)).quotations!.queue.length).toBe(0);
    expect(received).toHaveLength(1); expect(received[0].id).toBe(operation.id); expect(remote.flow!.quotation.total).toBe(280000);
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(300);
    expect(received).toHaveLength(1); expect(errors).toEqual([]);
    await testInfo.attach('offline-quotation-restart', { body: JSON.stringify({ shared, windowsUserAgent: true, browserRestarts: 2, queued: 1, synchronized: 1, exactlyOnce: true }), contentType: 'application/json' });
  } finally { await context?.close(); }
});
