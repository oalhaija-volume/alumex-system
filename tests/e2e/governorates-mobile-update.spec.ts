import { devices, expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import { projectGovernorates } from '../../src/lib/intake/projectBranch';
import type { FieldState } from '../../src/lib/offline/types';
import { savedFieldState } from './helpers/fieldState';

// Browser connector tools are unavailable. Global Chromium UA also makes the
// actual service worker take its mobile path; context UA alone is insufficient.
const mobileAgent = devices['Pixel 7'].userAgent;
const executablePath = [
  resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  resolve('artifacts/mini-crm-review-20261015/browser/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
].find(path => existsSync(path));
test.use({ serviceWorkers: 'allow', video: 'off', userAgent: mobileAgent,
  launchOptions: { executablePath, args: [`--user-agent=${mobileAgent}`] } });

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectId = '11111111-1111-4111-8111-111111111111';
const state: FieldState = {
  actor: { id: actorId, name: 'Mobile fixture', role: 'Outdoor Sales', branch: 'Rasafa' },
  outdoorSales: [], indoorSales: [], syncedAt: null,
  projects: [{ id: projectId, project_number: 'PRJ-MOBILE-UPDATE', project_name: 'Saved customer entry', branch: 'Rasafa',
    created_by: actorId, registeredBy: 'Mobile fixture', assigned_outdoor_sales_id: actorId,
    structure_readiness: 'ready', sales_status: 'new_lead', created_at: '2026-11-14T08:00:00Z', updated_at: '2026-11-14T08:00:00Z',
    address: 'Saved fixture address', phone: null, next_follow_up_at: null, project_notes: null, pending: true }],
  openings: [{ id: '22222222-2222-4222-8222-222222222222', projectId, createdBy: actorId,
    floor: 'Roof', room: 'Other', otherRoom: 'Saved skylight', width: 1200, height: 1800, quantity: 1,
    structuralType: 'Skylight', openingType: null,
    skylight: { photo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+tmWsAAAAASUVORK5CYII=', sections: [] } }],
  queue: [{ id: '33333333-3333-4333-8333-333333333333', userId: actorId, projectId, action: 'opening',
    payload: { note: 'Unsynced fixture media stays saved' }, recordedAt: '2026-11-14T08:01:00Z' }],
};

const oldWorker = `self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.mode==='navigate'&&url.pathname==='/offline')event.respondWith(caches.open('alumex-field-shell-v29').then(cache=>cache.match('/offline')));});`;
const oldShell = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Cached previous mobile form</h1><label>Client name<input id="cached-client-name"></label><label><input type="radio" name="projectBranch" value="Rasafa" checked>Rasafa</label></body></html>';

for (const locale of ['en', 'ar'] as const) test(`${locale}: one online navigation replaces an old mobile shell without losing saved work`, async ({ page, context }, testInfo) => {
  const dictionary = locale === 'ar' ? ar : en;
  const terms = dictionary.terms as Record<string, string>, tr = (key: string) => terms[key] ?? key;
  const writes: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Production shells have no HMR transport. Mutable dev-server chunks paired
  // with its reload messages otherwise obscure the service-worker behavior.
  await context.routeWebSocket('**/_next/webpack-hmr*', () => {});
  await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await context.route('**/qa-old-mobile-worker.js', route => route.fulfill({ contentType: 'application/javascript', headers: { 'Service-Worker-Allowed': '/' }, body: oldWorker }));
  await context.route('**/api/**', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      writes.push(`${request.method()} ${url.pathname}`);
      return route.fulfill({ status: 405, json: { error: 'Fixture business write blocked.' } });
    }
    // Retain the existing queue without replaying it in this display test.
    if (url.pathname === '/api/offline' && url.searchParams.has('session')) return route.fulfill({ status: 503, json: { error: 'Fixture sync deferred.' } });
    if (url.pathname.startsWith('/api/notifications')) return route.fulfill({ json: { notifications: [], userId: actorId } });
    return route.fulfill({ json: { ...state, queue: [], openings: [] } });
  });
  await page.goto('/login');
  await page.evaluate(async ({ saved, html }) => {
    localStorage.setItem('alumex-field-active', saved.actor.id);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('alumex-field-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('accounts');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result, tx = db.transaction('accounts', 'readwrite');
        tx.objectStore('accounts').put(saved, saved.actor.id); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    });
    await (await caches.open('alumex-field-shell-v29')).put('/offline', new Response(html, { headers: { 'Content-Type': 'text/html' } }));
    await navigator.serviceWorker.register('/qa-old-mobile-worker.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  }, { saved: state, html: oldShell });
  await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/qa-old-mobile-worker.js'));
  await page.goto('/offline?path=/intake');
  await expect(page.getByRole('heading', { name: 'Cached previous mobile form', exact: true })).toBeVisible();
  await expect(page.locator('input[name="projectBranch"]')).toHaveCount(1);
  await page.locator('#cached-client-name').fill('Keep the open customer form');

  // Updating a service worker changes future document loads, never a form the
  // employee is currently filling. The current worker is the actual app file.
  let documentNavigations = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) documentNavigations++; });
  await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }); });
  await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js'));
  await expect(page.locator('#cached-client-name')).toHaveValue('Keep the open customer form');
  await page.waitForTimeout(250);
  expect(documentNavigations).toBe(0);
  const worker = context.serviceWorkers().find(worker => worker.url().endsWith('/sw.js'));
  expect(await worker?.evaluate(() => /Android|iPhone|iPad|iPod|Tablet|Silk|Windows Phone/i.test(navigator.userAgent))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`${locale}-open-form-preserved.png`), fullPage: true });

  // Simulate a cached document from a previous build under the active cache.
  // A navigation must check for a complete current shell even just after install.
  await page.evaluate(async html => { await (await caches.open('alumex-field-shell-v30')).put('/offline', new Response(html, { headers: { 'Content-Type': 'text/html' } })); }, oldShell);
  await page.goto('/offline?path=/intake');
  await expect(page.getByRole('heading', { name: dictionary.registration.title, exact: true })).toBeVisible();
  const governorates = page.getByRole('radio', { name: tr('Governorates'), exact: true });
  await expect(governorates).toBeVisible();
  await governorates.check();
  expect(await page.locator('#project-governorate option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(['', ...projectGovernorates]);
  await expect(page.locator('#project-governorate')).toHaveAttribute('required', '');
  await expect(page.getByRole('radio', { name: tr('Najaf'), exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath(`${locale}-current-governorates-form.png`), fullPage: true });
  expect((await savedFieldState(page)).queue).toEqual(state.queue);
  expect((await savedFieldState(page)).openings).toEqual(state.openings);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: dictionary.registration.title, exact: true })).toBeVisible();
  await page.getByRole('radio', { name: tr('Governorates'), exact: true }).check();
  await expect(page.locator('#project-governorate option')).toHaveCount(13);
  await expect(page.locator('#project-governorate option[value="البصرة"]')).toHaveCount(1);
  expect((await savedFieldState(page)).queue).toEqual(state.queue);
  expect((await savedFieldState(page)).openings).toEqual(state.openings);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
