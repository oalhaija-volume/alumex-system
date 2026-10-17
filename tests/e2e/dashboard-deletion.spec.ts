import { expect, test, type Page } from '@playwright/test';
import type { FieldState } from '../../src/lib/offline/types';

test.use({ serviceWorkers: 'block' });
const projectId = '11111111-1111-4111-8111-111111111111';
async function dashboard(page: Page, { role = 'Admin', pending = false, failure = false } = {}) {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Employee', role };
  const state: FieldState = { actor, projects: [{
    id: projectId, project_name: 'Mansour residence', project_number: 'PRJ-DELETE-TEST', branch: 'Karkh',
    structure_readiness: 'ready', sales_status: 'new_lead', address: 'Baghdad', phone: '07700000000',
    created_by: actor.id, registeredBy: actor.name, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    next_follow_up_at: null, project_notes: null, pending,
  }], indoorSales: [], outdoorSales: [], queue: [], openings: [], syncedAt: null };
  const writes: unknown[] = [];
  await page.route('**/api/offline*', route => route.fulfill({ json: state }));
  await page.route('**/api/workspace', route => {
    if (route.request().method() !== 'DELETE') return route.fulfill({ json: state });
    writes.push(route.request().postDataJSON());
    if (failure) return route.fulfill({ status: 409, json: { error: 'Unable to delete this project. Refresh and try again.' } });
    state.projects = [];
    return route.fulfill({ json: { ok: true, cleanupPending: false } });
  });
  await page.goto('/offline?path=/dashboard');
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
  await expect(page.getByRole('heading', { name: 'Mansour residence', exact: true })).toBeVisible();
  return writes;
}

test('Admin cancels, then deletes a project from the dashboard and counts update', async ({ page }) => {
  const writes = await dashboard(page);
  const remove = page.getByRole('button', { name: 'Delete project', exact: true });
  page.once('dialog', dialog => { expect(dialog.message()).toContain('PRJ-DELETE-TEST'); void dialog.dismiss(); });
  await remove.click();
  expect(writes).toEqual([]);
  await expect(page.locator('article')).toHaveCount(1);
  page.once('dialog', dialog => { expect(dialog.message()).toContain('The client record is kept.'); void dialog.accept(); });
  await remove.click();
  await expect(page.getByRole('status').filter({ hasText: 'Project deleted.' })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
  expect(writes).toEqual([{ projectId, confirmed: true }]);
  await expect(page.getByRole('region', { name: 'Project overview', exact: true }).getByRole('button', { name: /Total projects/ })).toContainText('0');
});

test('failed deletion retains the project and reports the error', async ({ page }) => {
  await dashboard(page, { failure: true });
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to delete this project.' })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(1);
});

test('projects pending synchronization cannot be deleted', async ({ page }) => {
  const writes = await dashboard(page, { pending: true });
  await expect(page.getByRole('button', { name: 'Delete project', exact: true })).toBeDisabled();
  await expect(page.getByText('Sync saved changes before deleting.', { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

for (const role of ['Indoor Sales', 'Sales Director', 'CEO', 'Company Owner']) test(`${role} has no project delete action`, async ({ page }) => {
  await dashboard(page, { role });
  await expect(page.getByRole('button', { name: 'Delete project', exact: true })).toHaveCount(0);
});
