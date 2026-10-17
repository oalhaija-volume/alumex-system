import { expect, test, type Page } from '@playwright/test';
import type { FieldState } from '../../src/lib/offline/types';

test.use({ serviceWorkers: 'block' });
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Outdoor employee', role: 'Outdoor Sales' };
async function seed(page: Page, state: FieldState) {
  await page.evaluate(async state => {
    localStorage.setItem('alumex-field-active', state.actor.id);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('alumex-field-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('accounts');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('accounts', 'readwrite');
        tx.objectStore('accounts').put(state, state.actor.id);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    window.dispatchEvent(new Event('field-change'));
  }, state);
}
async function savedState(page: Page) {
  return page.evaluate(() => new Promise<FieldState>((resolve, reject) => {
    const request = indexedDB.open('alumex-field-v1', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('accounts', 'readonly');
      const record = tx.objectStore('accounts').get(localStorage.getItem('alumex-field-active')!);
      record.onsuccess = () => resolve(record.result);
      tx.oncomplete = () => db.close();
    };
  }));
}

for (const online of [true, false]) for (const locale of ['en', 'ar']) test(`${locale}: not-ready registration requires and retains a note ${online ? 'online' : 'offline'}`, async ({ page }, testInfo) => {
  const state: FieldState = { actor, projects: [], openings: [], queue: [], syncedAt: null, indoorSales: [], outdoorSales: [] };
  const posts: { payload: { project: { readinessNote: string } } }[] = [];
  await page.addInitScript(locale => localStorage.setItem('alumex_locale', locale), locale);
  await page.route('**/api/offline*', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: state });
    const change = route.request().postDataJSON(); posts.push(change);
    return route.fulfill({ json: { project: { id: change.projectId, project_number: 'PRJ-NOTE', readiness_note: change.payload.project.readinessNote.trim(), updated_at: new Date().toISOString() } } });
  });
  await page.goto('/offline?path=/intake');
  await seed(page, state);
  await page.locator('input[autocomplete="name"]').fill('Readiness sample');
  await page.locator('input[type="tel"]').fill('07700000000');
  await page.getByRole('button', { name: locale === 'en' ? 'Project location map' : 'خريطة موقع المشروع', exact: true }).click({ position: { x: 80, y: 80 } });
  await expect(page.locator('#readiness-note')).toHaveCount(0);
  await page.locator('input[value="not_ready"]').check();
  if (!online) await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
  });
  const save = page.getByRole('button', { name: locale === 'en' ? 'Save registration' : 'حفظ التسجيل', exact: false });
  for (const value of ['', '   ']) {
    await page.locator('#readiness-note').fill(value);
    await save.click();
    await expect(page.getByRole('alert').filter({hasText:locale === 'en' ? 'Add a note explaining' : 'أضف ملاحظة'})).toBeVisible();
    expect(posts).toHaveLength(0);
    expect((await savedState(page)).queue).toHaveLength(0);
  }
  await page.locator('#readiness-note').fill('  الجدران غير مكتملة  ');
  await page.screenshot({ path: `artifacts/readiness-note/form-${testInfo.project.name}-${locale}-${online}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await save.click();
  await expect(page.getByRole('heading', { name: locale === 'en' ? 'Registration saved' : 'تم حفظ التسجيل', exact: true })).toBeVisible();
  const saved = await savedState(page);
  expect(saved.projects[0].readiness_note).toBe('الجدران غير مكتملة');
  if (online) { expect(posts).toHaveLength(1); expect(posts[0].payload.project.readinessNote.trim()).toBe('الجدران غير مكتملة'); }
  else { expect(saved.queue).toHaveLength(1); expect(saved.queue[0].payload.project).toMatchObject({ readinessNote: 'الجدران غير مكتملة' }); }
  await page.getByRole('button', { name: locale === 'en' ? 'Register another client' : 'تسجيل عميل آخر', exact: true }).click();
  await page.locator('input[value="not_ready"]').check();
  await expect(page.locator('#readiness-note')).toHaveValue('');
});

test('Indoor Sales can read the original readiness note in CRM', async ({ page }) => {
  const state: FieldState = { actor: { ...actor, role: 'Indoor Sales', branch: 'Karkh' }, projects: [{
    id: '11111111-1111-4111-8111-111111111111', project_name: 'Readiness sample', project_number: 'PRJ-NOTE',
    structure_readiness: 'not_ready', readiness_note: 'Plastering unfinished', project_notes: 'Called client', sales_status: 'new_lead',
    address: 'Baghdad', phone: null, created_by: actor.id, registeredBy: actor.name, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), next_follow_up_at: null,
  }], openings: [], queue: [], syncedAt: null, indoorSales: [], outdoorSales: [] };
  await page.route('**/api/offline*', route => route.fulfill({ json: state }));
  await page.route('**/api/workspace', route => route.fulfill({ json: state }));
  await page.goto('/offline?path=/mini-crm');
  await seed(page, state);
  await expect(page.getByText('Plastering unfinished', { exact: true })).toBeVisible();
});
