import { expect, test, type Page } from '@playwright/test';
import type { FieldState } from '../../src/lib/offline/types';

test.use({ serviceWorkers: 'block' });
const creator = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Ehab', role: 'Outdoor Sales' };
const project = {
  id: '11111111-1111-4111-8111-111111111111', project_name: 'Creation date sample', project_number: 'PRJ-DATE',
  created_by: creator.id, registeredBy: creator.name, original_creator_role: creator.role,
  created_at: '2026-12-31T21:05:00Z', updated_at: '2027-01-04T12:00:00Z',
  assigned_outdoor_sales_id: creator.id, assignedOutdoorSales: creator.name, assignedToYou: true,
  structure_readiness: 'ready', sales_status: 'new_lead', address: 'Baghdad', phone: null, next_follow_up_at: null, project_notes: null,
};
async function setup(page: Page, role: string, path: string, locale: string) {
  const state: FieldState = { actor: role === creator.role ? creator : { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Fatma', role, branch: 'Karkh' },
    projects: [project], openings: [], queue: [], syncedAt: null, indoorSales: [], outdoorSales: [creator] };
  await page.addInitScript(locale => localStorage.setItem('alumex_locale', locale), locale);
  await page.route('**/api/offline*', route => route.fulfill({ json: state }));
  await page.route('**/api/workspace', route => route.fulfill({ json: state }));
  await page.route('**/api/initial-measurements/*', route => route.fulfill({ json: { project, openings: [] } }));
  await page.route('**/api/projects/*/follow-ups', route => route.fulfill({ json: { project, entries: [] } }));
  await page.goto('/offline?path=' + encodeURIComponent(path));
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

for (const locale of ['en', 'ar']) {
  for (const [role, path] of [
    ['Outdoor Sales', '/dashboard'], ['Outdoor Sales', '/initial-measurements/' + project.id],
    ['Indoor Sales', '/projects'], ['Indoor Sales', '/mini-crm'], ['Admin', '/dashboard'],
  ]) test(`${locale}: ${role} ${path} retains creator and numeric creation date`, async ({ page }, testInfo) => {
    await setup(page, role, path, locale);
    if (path === '/mini-crm') await page.getByRole('button', { name: locale === 'en' ? 'Follow up' : 'متابعة', exact: true }).click();
    if (role === 'Admin') await page.getByText(locale === 'en' ? 'Project details' : 'تفاصيل المشروع', { exact: true }).click();
    const created = page.locator(`time[datetime="${project.created_at}"]`).first();
    await expect(created).toBeVisible();
    await expect(created).toHaveText('01/01/2027, 00:05');
    await expect(created).toHaveAttribute('dir', 'ltr');
    await expect(created.locator('..')).toContainText('Ehab');
    await expect(created).not.toContainText('04/01/2027');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (path.startsWith('/initial-measurements')) await page.screenshot({ path: `artifacts/project-dates/creator-${testInfo.project.name}-${locale}.png`, fullPage: true });
  });
}
