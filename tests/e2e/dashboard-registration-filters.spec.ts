import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
for (const role of ['Admin', 'Indoor Sales', 'Sales Manager', 'Outdoor Sales']) for (const locale of ['en', 'ar']) {
  test(`${role} ${locale}: month and creator combine and clear`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Use the device workspace for isolated dashboard fixtures.');
    const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Employee', role, branch: 'Karkh' };
    const projects = [
      ['October by Rana', '2026-10-01T09:00:00Z', 'creator-a', 'Rana'],
      ['September by Rana', '2026-09-01T09:00:00Z', 'creator-a', 'Rana'],
      ['October by Ali', '2026-10-02T09:00:00Z', 'creator-b', 'Ali'],
      ['Last year by Ali', '2025-10-02T09:00:00Z', 'creator-b', 'Ali'],
    ].map(([project_name, created_at, created_by, registeredBy], index) => ({
      id: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${index}`, project_number: `PRJ-FILTER-${index}`, project_name,
      created_at, created_by, registeredBy, updated_at: created_at, structure_readiness: 'ready', sales_status: 'new_lead',
      assigned_outdoor_sales_id: actor.id, assignedOutdoorSales: actor.name, address: 'Baghdad', phone: null,
      next_follow_up_at: null, project_notes: null,
    }));
    const state = { actor, projects, queue: [], openings: [], syncedAt: null, indoorSales: [actor], outdoorSales: [] };
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(locale => {
      localStorage.setItem('alumex_locale', locale);
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    }, locale);
    await page.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'Offline fixture' } }));
    await page.goto('/offline?path=/dashboard');
    await page.evaluate(async state => {
      localStorage.setItem('alumex-field-active', state.actor.id);
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('alumex-field-v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('accounts');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { const db = request.result, tx = db.transaction('accounts', 'readwrite'); tx.objectStore('accounts').put(state, state.actor.id); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
      });
      window.dispatchEvent(new Event('field-change'));
    }, state);
    const filters = page.getByRole('region', { name: locale === 'en' ? 'Project filters' : 'تصفية المشاريع', exact: true });
    // Labels come from the same translated controls in every dashboard.
    const month = page.getByRole('combobox', { name: locale === 'en' ? 'Created month' : 'شهر الإنشاء', exact: true });
    const creator = page.getByRole('combobox', { name: locale === 'en' ? 'Created by' : 'تم الإنشاء بواسطة', exact: true });
    await expect(month).toBeVisible();
    await month.selectOption('2026-10');
    await expect(page.getByRole('heading', { name: 'October by Rana', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'October by Ali', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'September by Rana', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Last year by Ali', exact: true })).toHaveCount(0);
    await creator.selectOption('creator-a');
    await expect(page.getByRole('heading', { name: 'October by Ali', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'October by Rana', exact: true })).toBeVisible();
    await page.getByRole('searchbox').fill('Ali');
    await expect(page.getByRole('heading', { name: 'October by Rana', exact: true })).toHaveCount(0);
    await page.getByRole('searchbox').fill('');
    await month.selectOption('2025-10');
    await expect(page.getByRole('heading', { name: 'Last year by Ali', exact: true })).toHaveCount(0);
    await filters.getByRole('button').click();
    await expect(month).toHaveValue(''); await expect(creator).toHaveValue('');
    for (const project of projects) await expect(page.getByRole('heading', { name: project.project_name, exact: true })).toBeVisible();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    if (role === 'Indoor Sales') await filters.screenshot({ path: `artifacts/dashboard-filters-20261019/filters-${locale}.png` });
    expect(errors).toEqual([]);
  });
}
