import { devices, expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import type { EmployeeBranch } from '../../src/lib/intake/projectBranch';
import type { FieldState } from '../../src/lib/offline/types';
import { savedFieldState } from './helpers/fieldState';

// Run against the repository production build on port 3003. Real service-worker
// caching needs immutable production assets; development HMR chunks are mutable.
// Browser connector tools are unavailable, so use repository-local Chromium.
const mobileAgent = devices['Pixel 7'].userAgent;
const executablePath = [
  resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  resolve('artifacts/mini-crm-review-20261015/browser/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
].find(path => existsSync(path));
test.use({ serviceWorkers: 'allow', video: 'off', userAgent: mobileAgent,
  launchOptions: { executablePath, args: [`--user-agent=${mobileAgent}`] } });
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectId = '11111111-1111-4111-8111-111111111111';
const governorates = ['البصرة', 'الرمادي', 'صلاح الدين', 'ديالى', 'الحلة', 'كربلاء', 'الديوانية', 'الكوت', 'العمارة', 'الناصرية', 'السماوة'];
function snapshot(branch: EmployeeBranch): FieldState {
  return { actor: { id: actorId, name: 'Outdoor fixture', role: 'Outdoor Sales', branch }, outdoorSales: [], indoorSales: [], syncedAt: null,
    projects: [{ id: projectId, branch, project_number: 'PRJ-GOVERNORATES-FIXTURE', project_name: 'Saved customer entry', created_by: actorId,
      registeredBy: 'Outdoor fixture', assigned_outdoor_sales_id: actorId, structure_readiness: 'ready', sales_status: 'new_lead',
      created_at: '2026-11-15T08:00:00Z', updated_at: '2026-11-15T08:00:00Z', address: 'Saved fixture address', phone: null,
      next_follow_up_at: null, project_notes: null, pending: true }],
    openings: [{ id: '22222222-2222-4222-8222-222222222222', projectId, createdBy: actorId, floor: 'Roof', room: 'Other', otherRoom: 'Saved skylight',
      width: 1200, height: 1800, quantity: 1, structuralType: 'Skylight', openingType: null,
      skylight: { photo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+tmWsAAAAASUVORK5CYII=', sections: [] } }],
    queue: [{ id: '33333333-3333-4333-8333-333333333333', userId: actorId, projectId, action: 'opening',
      payload: { note: 'Existing unsynced fixture' }, recordedAt: '2026-11-15T08:01:00Z' }],
  };
}

for (const branch of ['Karkh', 'Rasafa', 'Najaf'] as const) for (const locale of ['en', 'ar'] as const) {
  test(`${locale}: ${branch} Outdoor chooses Governorates with eleven provinces online and offline`, async ({ page, context }, testInfo) => {
    const state = snapshot(branch), dictionary = locale === 'ar' ? ar : en;
    const terms = dictionary.terms as Record<string, string>, tr = (key: string) => terms[key] ?? key;
    const writes: string[] = [], errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
    await context.route('**/api/**', route => {
      const request = route.request(), url = new URL(request.url());
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        writes.push(`${request.method()} ${url.pathname}`);
        return route.fulfill({ status: 405, json: { error: 'Fixture business write blocked.' } });
      }
      if (url.pathname === '/api/offline' && url.searchParams.has('session')) return route.fulfill({ status: 503, json: { error: 'Fixture synchronization deferred.' } });
      if (url.pathname.startsWith('/api/notifications')) return route.fulfill({ json: { notifications: [], userId: actorId } });
      return route.fulfill({ json: { ...state, queue: [], openings: [] } });
    });
    await page.goto('/login');
    await page.evaluate(async saved => {
      localStorage.setItem('alumex-field-active', saved.actor.id);
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('alumex-field-v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('accounts');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { const db = request.result, tx = db.transaction('accounts', 'readwrite');
          tx.objectStore('accounts').put(saved, saved.actor.id); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
      });
      await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
    }, state);
    await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js'));
    const worker = context.serviceWorkers().find(worker => worker.url().endsWith('/sw.js'));
    expect(await worker?.evaluate(() => /Android|iPhone|iPad|iPod|Tablet|Silk|Windows Phone/i.test(navigator.userAgent))).toBe(true);
    await page.goto('/offline?path=/intake');
    await expect(page.getByRole('heading', { name: dictionary.registration.title, exact: true })).toBeVisible();
    expect(await page.locator('input[name="projectBranch"]').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual([branch, 'Governorates']);
    for (const office of ['Karkh', 'Rasafa', 'Najaf']) {
      if (office !== branch) await expect(page.getByRole('radio', { name: tr(office), exact: true })).toHaveCount(0);
    }
    await page.getByRole('radio', { name: tr('Governorates'), exact: true }).check();
    const province = page.locator('#project-governorate');
    await expect(province).toBeVisible();
    await expect(province).toHaveAttribute('required', '');
    expect(await province.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(['', ...governorates]);
    await expect(province.locator('option[value="النجف"]')).toHaveCount(0);
    await page.getByRole('button', { name: dictionary.registration.save, exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: tr('Choose the project governorate.') })).toBeVisible();
    await province.selectOption('البصرة');
    await page.screenshot({ path: testInfo.outputPath(`${locale}-${branch.toLowerCase()}-governorates.png`), fullPage: true });
    expect((await savedFieldState(page)).queue).toEqual(state.queue);
    expect((await savedFieldState(page)).openings).toEqual(state.openings);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: dictionary.registration.title, exact: true })).toBeVisible();
    await page.getByRole('radio', { name: tr('Governorates'), exact: true }).check();
    expect(await page.locator('#project-governorate option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(['', ...governorates]);
    expect((await savedFieldState(page)).queue).toEqual(state.queue);
    expect((await savedFieldState(page)).openings).toEqual(state.openings);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}
