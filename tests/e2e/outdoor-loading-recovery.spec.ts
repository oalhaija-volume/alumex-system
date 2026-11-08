import { expect, test } from '@playwright/test';
import { savedFieldState } from './helpers/fieldState';
import type { FieldChange, FieldState } from '../../src/lib/offline/types';

test.use({ serviceWorkers: 'block' });

const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Outdoor employee', role: 'Outdoor Sales' };
const projectId = '11111111-1111-4111-8111-111111111111';

test('an aborted first opening save preserves the draft and can be retried exactly once', async ({ page }) => {
  const state: FieldState = {
    actor, projects: [{
      id: projectId, project_name: 'First opening recovery', project_number: 'PRJ-RECOVERY',
      created_by: actor.id, assigned_outdoor_sales_id: actor.id, registeredBy: actor.name,
      address: 'Baghdad', phone: null, structure_readiness: 'ready', sales_status: 'new_lead',
      created_at: '2026-11-08T08:00:00Z', updated_at: '2026-11-08T08:00:00Z',
      next_follow_up_at: null, project_notes: null,
    }], openings: [], queue: [], outdoorSales: [], indoorSales: [], syncedAt: null,
  };
  const errors: string[] = [];
  const synchronized: FieldChange[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: state });
    const change = route.request().postDataJSON() as FieldChange;
    synchronized.push(change);
    state.openings.push({ ...change.payload, projectId } as FieldState['openings'][number]);
    return route.fulfill({ json: { project: state.projects[0] } });
  });
  await page.goto(`/offline?path=/initial-measurements/${projectId}`);
  await page.getByLabel('Floor', { exact: true }).selectOption('GF');
  await page.getByRole('combobox', { name: 'Room', exact: true }).selectOption('Office');
  await page.getByRole('combobox', { name: 'Structural type', exact: true }).selectOption('Window');
  await page.getByRole('radio', { name: 'Sliding', exact: true }).check();
  await page.getByRole('radio', { name: 'No arch', exact: true }).check();
  await page.getByLabel('Width (cm)', { exact: true }).fill('120');
  await page.getByLabel('Height (cm)', { exact: true }).fill('150');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      const transaction = original.apply(this, args);
      if (args[1] === 'readwrite') {
        const objectStore = transaction.objectStore.bind(transaction);
        transaction.objectStore = name => {
          const store = objectStore(name);
          const put = store.put.bind(store);
          store.put = (...values: Parameters<typeof put>) => {
            const request = put(...values);
            // Abort after the last request succeeds: IndexedDB emits only abort,
            // so handling request/transaction errors alone leaves Save pending.
            request.addEventListener('success', () => transaction.abort(), { once: true });
            return request;
          };
          return store;
        };
      }
      return transaction;
    };
    window.addEventListener('test-restore-storage', () => { IDBDatabase.prototype.transaction = original; }, { once: true });
  });
  const save = page.getByRole('button', { name: 'Save & add opening', exact: true });
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Your changes have not been saved.' })).toBeVisible();
  await expect(save).toBeEnabled();
  await expect(page.getByLabel('Width (cm)', { exact: true })).toHaveValue('120');
  await expect(page.getByLabel('Height (cm)', { exact: true })).toHaveValue('150');
  const failed = await savedFieldState(page);
  expect(failed.openings).toHaveLength(0);
  expect(failed.queue).toHaveLength(0);

  await page.evaluate(() => window.dispatchEvent(new Event('test-restore-storage')));
  await save.click();
  await expect(page.getByRole('heading', { name: 'Saved openings (1)', exact: true })).toBeVisible();
  const saved = await savedFieldState(page);
  expect(saved.openings).toHaveLength(1);
  expect(saved.queue.map(change => change.action)).toEqual(['opening']);
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Saved openings (1)', exact: true })).toBeVisible();
  expect((await savedFieldState(page)).queue).toHaveLength(1);
  expect(synchronized).toHaveLength(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    window.dispatchEvent(new Event('online'));
  });
  await expect.poll(async () => (await savedFieldState(page)).queue.length).toBe(0);
  expect(synchronized.map(change => change.id)).toEqual(saved.queue.map(change => change.id));
  expect(state.openings).toHaveLength(1);
  expect((await savedFieldState(page)).openings).toHaveLength(1);
  await page.screenshot({ path: test.info().outputPath('first-opening-saved.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('a stalled browser database stops loading and offers a retry without clearing saved work', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('alumex-field-active', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    Reflect.deleteProperty(Navigator.prototype, 'serviceWorker');
    indexedDB.open = () => ({} as IDBOpenDBRequest);
  });
  await page.route('**/api/**', route => route.abort('internetdisconnected'));
  await page.goto('/offline?path=/dashboard');
  await expect(page.getByText('Loading saved workspace…', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible({ timeout: 12000 });
  await expect(page.getByText('Loading saved workspace…', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open online system', exact: true }).last()).toHaveAttribute('href', '/dashboard');
  expect(await page.evaluate(() => localStorage.getItem('alumex-field-active'))).toBe(actor.id);
});
