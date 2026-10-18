import { expect, test } from '@playwright/test';
import { savedFieldState } from './helpers/fieldState';
import type { FieldState } from '../../src/lib/offline/types';

test.use({ serviceWorkers: 'block' });

for (const locale of ['en', 'ar']) test(`${locale}: Outdoor logout protects queued work and clears the active account after sync`, async ({ page }) => {
  const state: FieldState = {
    actor: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Outdoor employee', role: 'Outdoor Sales' },
    projects: [], openings: [], queue: [], syncedAt: null, outdoorSales: [], indoorSales: [],
  };
  let logoutPosts = 0;
  await page.addInitScript(locale => localStorage.setItem('alumex_locale', locale), locale);
  await page.route('**/api/**', route => route.fulfill({ json: state }));
  await page.route('**/auth/logout', route => {
    expect(route.request().method()).toBe('POST');
    logoutPosts++;
    return route.fulfill({ status: 303, headers: { location: '/login' } });
  });
  await page.route('**/login', route => route.fulfill({ contentType: 'text/html', body: '<h1>Login</h1>' }));
  await page.goto('/offline?path=/intake');
  const nav = page.getByRole('navigation', { name: locale === 'en' ? 'Outdoor Sales workspace' : 'مساحة عمل المبيعات الخارجية' });
  const logout = nav.getByRole('button', { name: locale === 'en' ? 'Logout' : 'تسجيل الخروج', exact: true });
  await expect(logout).toBeVisible();
  const dialogs: string[] = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });

  await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }));
  await logout.click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toBe(locale === 'en' ? 'Connect to the internet before signing out.' : 'اتصل بالإنترنت قبل تسجيل الخروج.');
  expect(logoutPosts).toBe(0);
  expect((await savedFieldState(page)).actor.id).toBe(state.actor.id);

  // Retain an unsynced measurement in the account store while the connection returns.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('alumex-field-v1', 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('accounts', 'readwrite');
        const store = tx.objectStore('accounts');
        const id = localStorage.getItem('alumex-field-active')!;
        const read = store.get(id);
        read.onsuccess = () => store.put({ ...read.result, queue: [{ id: 'queued-measurement', userId: id, projectId: 'site', action: 'finish', payload: {}, recordedAt: new Date().toISOString() }] }, id);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });
  await logout.click();
  await expect.poll(() => dialogs.length).toBe(2);
  expect(dialogs[1]).toBe(locale === 'en' ? 'Sync the changes saved on this device before signing out.' : 'زامن التغييرات المحفوظة على هذا الجهاز قبل تسجيل الخروج.');
  expect(logoutPosts).toBe(0);
  expect((await savedFieldState(page)).queue).toHaveLength(1);
  await page.screenshot({ path: test.info().outputPath('outdoor-logout.png'), fullPage: false });

  // Represent a completed sync, then exercise the existing server logout endpoint.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('alumex-field-v1', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('accounts', 'readwrite');
      const store = tx.objectStore('accounts');
      const id = localStorage.getItem('alumex-field-active')!;
      const read = store.get(id);
      read.onsuccess = () => store.put({ ...read.result, queue: [] }, id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await logout.click();
  await expect(page).toHaveURL(/\/login$/);
  expect(logoutPosts).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('alumex-field-active'))).toBeNull();
  const retained = await page.evaluate(id => new Promise<FieldState>((resolve, reject) => {
    const open = indexedDB.open('alumex-field-v1', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction('accounts').objectStore('accounts').get(id);
      read.onsuccess = () => { db.close(); resolve(read.result); };
      read.onerror = () => reject(read.error);
    };
  }), state.actor.id);
  expect(retained.actor.id).toBe(state.actor.id);
  expect(retained.queue).toHaveLength(0);
});
