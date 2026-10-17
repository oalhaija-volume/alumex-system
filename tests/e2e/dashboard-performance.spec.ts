import { expect, test, type Page } from '@playwright/test';
import type { FieldState } from '../../src/lib/offline/types';

test.use({ serviceWorkers: 'block' });

async function dashboard(page: Page) {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Employee', role: 'Indoor Sales', branch: 'Karkh' as const };
  const state: FieldState = { actor, projects: [{
    id: '11111111-1111-4111-8111-111111111111', project_name: 'Performance sample', project_number: 'PRJ-PERF',
    structure_readiness: 'ready', sales_status: 'new_lead', address: 'Baghdad', phone: null,
    created_by: actor.id, registeredBy: actor.name, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    next_follow_up_at: null, project_notes: null,
  }], indoorSales: [], outdoorSales: [], queue: [], openings: [], syncedAt: null };
  const requests = { workspace: 0, snapshot: 0, session: 0 };
  let held: Promise<void> | null = null;
  // Exercise real IndexedDB preparation without waiting for a blocked service worker.
  await page.addInitScript(() => { Reflect.deleteProperty(Navigator.prototype, 'serviceWorker'); });
  await page.route('**/api/offline*', async route => {
    expect(route.request().method()).toBe('GET');
    if (new URL(route.request().url()).searchParams.has('session')) requests.session++;
    else requests.snapshot++;
    const response=structuredClone(state);
    if(held)await held;
    return route.fulfill({ json: response });
  });
  await page.route('**/api/workspace', async route => {
    requests.workspace++;
    const response = structuredClone(state);
    if (held) await held;
    await route.fulfill({ json: response });
  });
  await page.goto('/offline?path=/dashboard');
  await expect(page.getByRole('heading', { name: 'Performance sample', exact: true })).toBeVisible();
  return { state, requests, hold() { let release!: () => void; held = new Promise(resolve => { release = resolve; }); return () => { held = null; release(); }; } };
}

test('offline preparation and repeated focus events do not duplicate active dashboard requests', async ({ page }) => {
  const { requests, hold } = await dashboard(page);
  await page.waitForTimeout(400);
  expect(requests).toEqual({ workspace: 0, snapshot: 1, session: 0 });
  const release = hold();
  try {
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForTimeout(250);
    }
    expect(requests.workspace).toBe(0);
    expect(requests.snapshot).toBe(2);
    expect(requests.session).toBe(0);
  } finally { release(); }
  await expect(page.getByRole('heading', { name: 'Performance sample', exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  expect(requests.workspace).toBe(0);
    expect(requests.snapshot).toBe(2);
});

test('a local edit supersedes an older request and survives its late response', async ({ page }) => {
  const { state, requests, hold } = await dashboard(page);
  const release = hold();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => requests.snapshot).toBe(2);
  try {
    await page.evaluate(async state => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      state.projects[0].project_name = 'Saved locally';
      state.projects[0].pending = true;
      state.queue = [{ id: crypto.randomUUID(), userId: state.actor.id, projectId: state.projects[0].id, action: 'ready', payload: {}, recordedAt: new Date().toISOString() }];
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('alumex-field-v1', 1);
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction('accounts', 'readwrite');
          tx.objectStore('accounts').put(state, state.actor.id);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
      window.dispatchEvent(new Event('field-change'));
      // A focus event in the same debounce window must not lose the local edit.
      window.dispatchEvent(new Event('focus'));
    }, state);
    await expect(page.getByRole('heading', { name: 'Saved locally', exact: true })).toBeVisible();
  } finally { release(); }
  await page.waitForTimeout(400);
  await expect(page.getByRole('heading', { name: 'Saved locally', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Performance sample', exact: true })).toHaveCount(0);
  expect(requests.workspace).toBe(0);
    expect(requests.snapshot).toBe(2);
});

test('a refreshed device snapshot updates visible projects without a workspace API request',async({page})=>{
 const {state,requests}=await dashboard(page);
 state.projects[0].project_name='Updated on the server';
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('heading',{name:'Updated on the server',exact:true})).toBeVisible();
 expect(requests.workspace).toBe(0);
});
