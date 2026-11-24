import { expect, test, type Page } from '@playwright/test';
import { translateTerm } from '../../src/lib/i18nFormatting';
import type { FieldActor, FieldState } from '../../src/lib/offline/types';

test.use({ serviceWorkers: 'block' });

const actor: FieldActor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Indoor employee one', role: 'Indoor Sales', branch: 'Karkh' };
const secondActor: FieldActor = { ...actor, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Indoor employee two' };
const projectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const savedNote = 'Private saved follow-up belonging to employee one';

function legacyState(): FieldState {
  return {
    actor, syncedAt: '2026-11-24T10:00:00Z', openings: [], indoorSales: [{ ...actor }], outdoorSales: [],
    projects: [{ id: projectId, project_name: 'Legacy indoor project', project_number: 'PRJ-INDOOR-RECOVERY',
      branch: 'Karkh', address: 'Baghdad', phone: null, structure_readiness: 'not_ready', sales_status: 'new_lead',
      project_notes: savedNote, next_follow_up_at: '2026-11-25T10:00:00Z', follow_up_owner_id: actor.id,
      created_at: '2026-11-23T10:00:00Z', updated_at: '2026-11-24T10:00:00Z', serverUpdatedAt: '2026-11-24T10:00:00Z',
      created_by: actor.id, registeredBy: actor.name, pending: true }],
    queue: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', userId: actor.id, projectId, action: 'follow-up',
      recordedAt: '2026-11-24T10:01:00Z', payload: { note: savedNote, nextFollowUp: '2026-11-25T10:00:00Z', followUpOwnerId: actor.id },
      error: 'This project was changed on another device. Review the online project before retrying your saved changes.' }],
  };
}

async function storeAccount(page: Page, state: FieldState) {
  await page.evaluate(state => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('alumex-field-v1', 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => request.result.createObjectStore('accounts');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('accounts', 'readwrite');
      tx.objectStore('accounts').put(state, state.actor.id);
      tx.oncomplete = () => { db.close(); localStorage.setItem('alumex-field-active', state.actor.id); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), state);
}

async function readAccount(page: Page, id = actor.id) {
  return page.evaluate(id => new Promise<FieldState>((resolve, reject) => {
    const request = indexedDB.open('alumex-field-v1', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('accounts').objectStore('accounts').get(id);
      read.onsuccess = () => { db.close(); resolve(read.result); };
      read.onerror = () => { db.close(); reject(read.error); };
    };
  }), id);
}

for (const locale of ['en', 'ar'] as const) {
  test(`${locale}: Indoor Sales recovers legacy work, signs out with a conflict, and isolates the next employee`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    const posts: string[] = [];
    const downloads: string[] = [];
    const dialogs: string[] = [];
    let currentActor = actor;
    let logoutPosts = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
    await page.addInitScript(locale => localStorage.setItem('alumex_locale', locale), locale);
    await page.route('**/api/**', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/offline' && request.method() === 'GET') {
        if (url.searchParams.has('session')) return route.fulfill({ json: { actor: currentActor } });
        downloads.push(url.search);
        if (url.searchParams.has('recovery')) return route.fulfill({ json: legacyState() });
        return route.fulfill({ status: 403, json: { error: 'Indoor Sales requires an internet connection.' } });
      }
      if (url.pathname === '/api/offline' && request.method() === 'POST') {
        const operation = request.postDataJSON() as { userId: string };
        posts.push(operation.userId);
        return route.fulfill({ status: 409, json: { error: 'This project was changed on another device. Review the online project before retrying your saved changes.' } });
      }
      return route.fulfill({ status: 404, json: { error: 'Fixture endpoint unavailable' } });
    });
    await page.route('**/auth/logout', route => {
      expect(route.request().method()).toBe('POST');
      logoutPosts++;
      return route.fulfill({ status: 303, headers: { location: '/login' } });
    });
    await page.route('**/login', route => route.fulfill({ contentType: 'text/html', body: '<h1>Login fixture</h1>' }));
    await page.goto('/login');
    await storeAccount(page, legacyState());
    await page.goto('/offline?path=/dashboard');

    const heading = page.getByRole('heading', { name: translateTerm(locale, 'Indoor Sales requires an internet connection.'), exact: true });
    await expect(heading).toBeVisible();
    await expect(page.getByRole('status')).toHaveText(translateTerm(locale, 'Indoor Sales · Online only'));
    await expect(page.getByRole('heading', { name: translateTerm(locale, 'Saved work needs attention'), exact: true })).toBeVisible();
    await expect(page.getByText(savedNote, { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: translateTerm(locale, 'New project'), exact: true })).toHaveCount(0);
    await expect(page.locator('input, textarea, select')).toHaveCount(0);
    await expect(page.getByRole('link', { name: translateTerm(locale, 'Open online system'), exact: true })).toHaveAttribute('href', '/dashboard?__alumex_online=1');
    expect(downloads.filter(search => !search.includes('recovery'))).toEqual([]);
    expect((await readAccount(page)).queue[0].payload.note).toBe(savedNote);
    expect(await page.title()).toContain('Alumex');
    await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('indoor-recovery-online.png'), fullPage: false });

    // Connection loss closes review controls as well as all work editors.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      window.dispatchEvent(new Event('offline'));
    });
    await expect(page.getByRole('status')).toHaveText(translateTerm(locale, 'Connect to the internet to use Indoor Sales.'));
    await expect(page.getByRole('button', { name: translateTerm(locale, 'Review server version'), exact: true })).toHaveCount(0);
    await expect(page.locator('input, textarea, select')).toHaveCount(0);
    expect((await readAccount(page)).queue).toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath('indoor-work-blocked-offline.png'), fullPage: false });
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      window.dispatchEvent(new Event('online'));
    });
    await expect(page.getByRole('status')).toHaveText(translateTerm(locale, 'Indoor Sales · Online only'));
    await page.getByRole('button', { name: locale === 'en' ? 'Logout' : 'تسجيل الخروج', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(logoutPosts).toBe(1);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every(id => id === actor.id)).toBe(true);
    expect(dialogs).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('alumex-field-active'))).toBeNull();
    const retained = await readAccount(page);
    expect(retained.queue).toHaveLength(1);
    expect(retained.queue[0].payload.note).toBe(savedNote);

    // A different verified account cannot display or send the first account's draft.
    currentActor = secondActor;
    await storeAccount(page, { actor: secondActor, projects: [], openings: [], queue: [], syncedAt: null, indoorSales: [], outdoorSales: [] });
    const sentBeforeSwitch = posts.length;
    await page.goto('/offline?path=/dashboard');
    await expect(heading).toBeVisible();
    await expect(page.getByRole('status')).toHaveText(translateTerm(locale, 'Indoor Sales · Online only'));
    await expect(page.getByText(savedNote, { exact: false })).toHaveCount(0);
    expect(posts).toHaveLength(sentBeforeSwitch);
    expect((await readAccount(page)).queue[0].payload.note).toBe(savedNote);

    // Signing back in as the draft owner restores the existing recovery work.
    currentActor = actor;
    await page.evaluate(id => localStorage.setItem('alumex-field-active', id), actor.id);
    await page.reload();
    await expect(page.getByText(savedNote, { exact: false })).toBeVisible();
    expect((await readAccount(page)).queue[0].id).toBe(legacyState().queue[0].id);
    expect(errors).toEqual([]);
  });
}

for (const locale of ['en', 'ar'] as const) {
  test(`${locale}: Refresh projects reconnects after a failed server check without clearing saved conflicts`, async ({ page }, testInfo) => {
    let reachable = false;
    let checks = 0;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(locale => localStorage.setItem('alumex_locale', locale), locale);
    await page.route('**/api/**', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/offline' && request.method() === 'GET' && url.searchParams.has('session')) {
        checks++;
        return reachable ? route.fulfill({ json: { actor } }) : route.fulfill({ status: 503, json: { error: 'Service temporarily unavailable' } });
      }
      if (url.pathname === '/api/offline' && request.method() === 'POST') {
        return route.fulfill({ status: 409, json: { error: 'This project was changed on another device. Review the online project before retrying your saved changes.' } });
      }
      return route.fulfill({ status: 404, json: { error: 'Fixture endpoint unavailable' } });
    });
    await page.route('**/login', route => route.fulfill({ contentType: 'text/html', body: '<h1>Login fixture</h1>' }));
    await page.route(url => url.pathname === '/dashboard', route => route.fulfill({ contentType: 'text/html', body: '<title>Alumex online fixture</title><h1>Live online dashboard</h1>' }));
    await page.goto('/login');
    await storeAccount(page, legacyState());
    await page.goto('/offline?path=/dashboard');
    await expect(page.getByRole('status').filter({ hasText: translateTerm(locale, 'Connect to the internet to use Indoor Sales.') })).toBeVisible();
    await expect.poll(() => checks).toBeGreaterThan(0);
    const refresh = page.getByRole('button', { name: translateTerm(locale, 'Refresh projects'), exact: true });
    await expect(refresh).toBeEnabled();
    const before = checks;
    reachable = true;
    await refresh.click();
    await expect.poll(() => checks).toBeGreaterThan(before);
    await expect(page).toHaveURL(/\/dashboard\?__alumex_online=1$/);
    await expect(page.getByRole('heading', { name: 'Live online dashboard' })).toBeVisible();
    expect((await readAccount(page)).queue[0].payload.note).toBe(savedNote);
    await page.screenshot({ path: testInfo.outputPath('manual-reconnect-preserves-conflict.png'), fullPage: false });
    expect(errors).toEqual([]);
  });

  test(`${locale}: a stalled saved-change request cannot trap online access or the reconnect control`, async ({ page }, testInfo) => {
    let posts = 0;
    let release = () => {};
    const stalled = new Promise<void>(resolve => { release = resolve; });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(locale => localStorage.setItem('alumex_locale', locale), locale);
    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/offline' && request.method() === 'GET' && url.searchParams.has('session')) return route.fulfill({ json: { actor } });
      if (url.pathname === '/api/offline' && request.method() === 'POST') {
        posts++;
        await stalled;
        await route.fulfill({ status: 409, json: { error: 'This project was changed on another device. Review the online project before retrying your saved changes.' } }).catch(() => {});
        return;
      }
      return route.fulfill({ status: 404, json: { error: 'Fixture endpoint unavailable' } });
    });
    await page.route('**/login', route => route.fulfill({ contentType: 'text/html', body: '<h1>Login fixture</h1>' }));
    await page.route(url => url.pathname === '/dashboard', route => route.fulfill({ contentType: 'text/html', body: '<title>Alumex online fixture</title><h1>Live online dashboard</h1>' }));
    try {
      await page.goto('/login');
      await storeAccount(page, legacyState());
      await page.goto('/offline?path=/dashboard');
      await expect.poll(() => posts, { timeout: 3000 }).toBeGreaterThan(0);
      await expect(page.getByRole('status').filter({ hasText: translateTerm(locale, 'Indoor Sales · Online only') })).toBeVisible();
      const refresh = page.getByRole('button', { name: translateTerm(locale, 'Refresh projects'), exact: true });
      await expect(refresh).toBeEnabled({ timeout: 3000 });
      await expect(page.getByRole('link', { name: translateTerm(locale, 'Open online system'), exact: true })).toHaveAttribute('href', '/dashboard?__alumex_online=1');
      expect((await readAccount(page)).queue[0].payload.note).toBe(savedNote);
      await page.screenshot({ path: testInfo.outputPath('online-while-recovery-request-stalls.png'), fullPage: false });
      await page.getByRole('link', { name: translateTerm(locale, 'Open online system'), exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard\?__alumex_online=1$/);
      await expect(page.getByRole('heading', { name: 'Live online dashboard' })).toBeVisible();
      expect((await readAccount(page)).queue[0].payload.note).toBe(savedNote);
      expect(errors).toEqual([]);
    } finally { release(); }
  });

  test(`${locale}: manual reconnect checks the real server when the browser still reports offline`, async ({ page }) => {
    let checks = 0;
    await page.addInitScript(locale => {
      localStorage.setItem('alumex_locale', locale);
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    }, locale);
    await page.route('**/api/**', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/offline' && request.method() === 'GET' && url.searchParams.has('session')) {
        checks++;
        return route.fulfill({ json: { actor } });
      }
      return route.fulfill({ status: 404, json: { error: 'Fixture endpoint unavailable' } });
    });
    await page.route('**/login', route => route.fulfill({ contentType: 'text/html', body: '<h1>Login fixture</h1>' }));
    await page.route(url => url.pathname === '/dashboard', route => route.fulfill({ contentType: 'text/html', body: '<title>Alumex online fixture</title><h1>Live online dashboard</h1>' }));
    await page.goto('/login');
    await storeAccount(page, legacyState());
    await page.goto('/offline?path=/dashboard');
    await expect(page.getByRole('status').filter({ hasText: translateTerm(locale, 'Connect to the internet to use Indoor Sales.') })).toBeVisible();
    expect(checks).toBe(0);
    await page.getByRole('button', { name: translateTerm(locale, 'Refresh projects'), exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\?__alumex_online=1$/);
    await expect(page.getByRole('heading', { name: 'Live online dashboard' })).toBeVisible();
    expect(checks).toBeGreaterThan(0);
    expect((await readAccount(page)).queue[0].payload.note).toBe(savedNote);
  });
}
