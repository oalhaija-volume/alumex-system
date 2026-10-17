import { expect, test, type Page } from '@playwright/test';
import type { FieldState } from '../../src/lib/offline/types';

test.use({ serviceWorkers: 'block' }); // Keep mocked writes and destinations under Playwright control.

const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Indoor employee', role: 'Indoor Sales', branch: 'Karkh' as const };
async function prepare(page: Page) {
  const state: FieldState = { actor, projects: [], openings: [], queue: [], syncedAt: null, outdoorSales: [], indoorSales: [{ id: actor.id, name: actor.name }] };
  let registration: { userId: string; payload: { project: { assignedOutdoorSalesId: string } } } | undefined;
  await page.route('**/api/offline*', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: state });
    const change = route.request().postDataJSON();
    registration = change;
    return route.fulfill({ json: { project: { id: change.projectId, project_number: 'PRJ-SELF-TEST', branch: 'Karkh', assigned_outdoor_sales_id: actor.id, assignedOutdoorSales: actor.name, assignedToYou: true, updated_at: new Date().toISOString() } } });
  });
  await page.goto('/offline?path=/intake');
  await page.evaluate(async state => {
    localStorage.setItem('alumex-field-active', state.actor.id);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('alumex-field-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('accounts');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('accounts', 'readwrite');
        tx.objectStore('accounts').put(state, state.actor.id);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    window.dispatchEvent(new Event('field-change'));
  }, state);
  return { registration: () => registration };
}

test.describe('Indoor Sales self measurement', () => {
  for (const online of [true, false]) test(`select myself and start measurements ${online ? 'online' : 'offline'}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    if (!online) await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }));
    const check = await prepare(page);
    await page.getByPlaceholder('Enter full name').fill('Self-assigned measurement project');
    await page.getByPlaceholder('07xx xxx xxxx').fill('07700000000');
    await page.getByRole('button', { name: 'Project location map', exact: true }).click({ position: { x: 80, y: 80 } });
    await page.getByRole('combobox', { name: /Measurements by/ }).selectOption(actor.id);
    await expect(page.getByText('You will enter the initial measurements.', { exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Myself — Indoor employee', exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/indoor-self-measurements/select-self-${testInfo.project.name}-${online}.png`, fullPage: true });
    if (online) await page.route(url => /^\/initial-measurements\/[\da-f-]+$/.test(url.pathname), route => route.fulfill({ contentType: 'text/html', body: '<h1>Initial measurement destination</h1>' }));
    await page.getByRole('button', { name: /Continue to measurements/ }).click();
    if (online) {
      await expect(page).toHaveURL(/\/initial-measurements\/[\da-f-]+$/);
      expect(check.registration()?.userId).toBe(actor.id);
      expect(check.registration()?.payload.project.assignedOutdoorSalesId).toBe(actor.id);
    } else {
      await expect(page).toHaveURL(/\/offline\?project=[\da-f-]+$/);
      await expect(page.getByRole('heading', { name: 'Initial measurements', exact: true })).toBeVisible();
      await page.getByLabel('Floor', { exact: true }).fill('Ground');
      await page.getByRole('combobox', { name: 'Room', exact: true }).selectOption('Kitchen');
      await page.getByRole('combobox', { name: 'Structural type', exact: true }).selectOption('Window');
      await page.getByRole('radio', { name: 'Sliding', exact: true }).check();
      await page.getByLabel('Width (cm)', { exact: true }).fill('120');
      await page.getByLabel('Height (cm)', { exact: true }).fill('150');
      await page.getByRole('button', { name: 'Save & add opening', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Saved openings (1)', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Finish measurements — ready for quotation', exact: true }).click();
      await expect(page.getByText('Measurements complete. This project is ready for quotation.', { exact: true })).toBeVisible();
      await page.screenshot({ path: `artifacts/indoor-self-measurements/measurements-saved-${testInfo.project.name}.png`, fullPage: true });
      const saved = await page.evaluate(async actorId => new Promise<FieldState>((resolve, reject) => {
        const request = indexedDB.open('alumex-field-v1', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, value = db.transaction('accounts').objectStore('accounts').get(actorId);
          value.onsuccess = () => { db.close(); resolve(value.result); };
          value.onerror = () => reject(value.error);
        };
      }), actor.id);
      expect(saved.queue.map(change => change.action)).toEqual(['register', 'opening', 'finish']);
      expect(saved.projects[0].assigned_outdoor_sales_id).toBe(actor.id);
      expect(saved.projects[0].branch).toBe('Karkh');
      expect(saved.openings[0].width).toBe(120);
      expect(saved.openings[0].height).toBe(150);
    }
    expect(errors).toEqual([]);
  });

  test('Arabic self option and not-ready routing', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem('alumex_locale', 'ar');
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    });
    await prepare(page);
    await page.locator('#outdoor-assignee').selectOption(actor.id);
    await expect(page.getByRole('option', { name: 'أنا — Indoor employee', exact: true })).toHaveCount(1);
    await page.locator('input[autocomplete="name"]').fill('مشروع القياسات');
    await page.locator('input[type="tel"]').fill('07700000000');
    await page.locator('input[name="readiness"][value="not_ready"]').check();
    const coordinates = page.locator('input[type="number"]');
    await coordinates.nth(0).fill('33.3'); await coordinates.nth(1).fill('44.4');
    await page.screenshot({ path: `artifacts/indoor-self-measurements/arabic-self-${testInfo.project.name}.png`, fullPage: true });
    await page.locator('section > fieldset > button').click();
    await expect(page).toHaveURL(/\/offline\?path=\/mini-crm$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
