import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' }); // Keep mocked responses available after reload.

const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Fatma', role: 'Indoor Sales' };
const employee = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Ehab' };
const projects = ['Alpha residence', 'Beta office'].map((project_name, index) => ({
  id: `11111111-1111-4111-8111-11111111111${index}`, project_name, project_number: `PRJ-HISTORY-${index}`,
  structure_readiness: 'not_ready', sales_status: 'new_lead', created_by: actor.id, registeredBy: actor.name,
  address: 'Baghdad', phone: '07700000000', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-10T10:00:00Z',
  follow_up_owner_id: actor.id, followUpOwner: actor.name, next_follow_up_at: '2027-01-01T10:00:00Z', project_notes: 'Latest previous call',
}));
const history = {
  project: projects[0], entries: [
    { id: '22222222-2222-4222-8222-222222222222', action: 'follow-up', note: 'Latest previous call', recordedAt: '2026-10-10T10:00:00Z', recordedBy: 'Fatma', followUpType: 'whatsapp', followUpOwner: 'Fatma', nextFollowUp: '2027-01-01T10:00:00Z' },
    { id: '33333333-3333-4333-8333-333333333333', action: 'follow-up', note: 'Initial enquiry', recordedAt: '2026-10-01T10:00:00Z', recordedBy: 'Ahmad', followUpType: 'call', followUpOwner: 'Fatma', nextFollowUp: '2026-10-10T10:00:00Z' },
  ],
};
async function setup(page: Page, path: string, role = 'Indoor Sales', locale = 'en') {
  let requests = 0;
  const state = { actor: { ...actor, role }, projects, indoorSales: [actor], outdoorSales: [employee], queue: [], openings: [], syncedAt: null };
  await page.route('**/api/offline*', route => {
    if (route.request().method() === 'POST') throw new Error('These tests must never write to the server');
    return route.fulfill({ json: state });
  });
  await page.route('**/api/workspace', route => route.fulfill({ json: state }));
  await page.route('**/api/projects/*/follow-ups', route => {
    requests++;
    const first = route.request().url().includes(projects[0].id);
    return route.fulfill({ json: first ? history : { project: projects[1], entries: [{ ...history.entries[0], id: '44444444-4444-4444-8444-444444444444', note: 'Other client only' }] } });
  });
  await page.addInitScript(locale => localStorage.setItem('alumex_locale', locale), locale);
  await page.goto('/offline?path=' + encodeURIComponent(path));
  await page.evaluate(async state => {
    localStorage.setItem('alumex-field-active', state.actor.id);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('alumex-field-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('accounts');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result; const tx = db.transaction('accounts', 'readwrite'); tx.objectStore('accounts').put(state, state.actor.id); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    });
    window.dispatchEvent(new Event('field-change'));
  }, state);
  return () => requests;
}

for (const path of ['/mini-crm', '/projects', '/dashboard']) for (const locale of ['en', 'ar']) {
  test(`${path} ${locale}: each project displays only its own follow-up table`, async ({ page }) => {
    await page.setViewportSize({ width: locale === 'ar' ? 390 : 1440, height: 1000 });
    const requestCount = await setup(page, path, path === '/dashboard' ? 'CEO' : 'Indoor Sales', locale);
    const first = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Alpha residence', exact: true }) });
    const second = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Beta office', exact: true }) });
    if (path === '/dashboard') {
      for (const card of [first, second]) await card.locator('summary').filter({ hasText: locale === 'en' ? 'Follow-up history' : 'سجل المتابعات' }).click();
    }
    const firstTable = first.getByRole('table');
    await first.locator('h4').last().scrollIntoViewIfNeeded();
    await expect(firstTable).toBeVisible();
    await expect(firstTable.locator('thead th')).toHaveCount(6);
    await expect(firstTable.locator('tbody tr')).toHaveCount(2);
    await expect(firstTable.locator('tbody tr').first()).toContainText('Latest previous call');
    await expect(firstTable.locator('tbody tr').last()).toContainText('Initial enquiry');
    await expect(firstTable).not.toContainText('Other client only');
    await second.locator('h4').last().scrollIntoViewIfNeeded();
    await expect(second.getByRole('table')).toContainText('Other client only');
    await expect(second.getByRole('table')).not.toContainText('Initial enquiry');
    await firstTable.scrollIntoViewIfNeeded();
    const region = firstTable.locator('..');
    if (locale === 'ar') {
      expect(await region.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
      await region.evaluate(element => { element.scrollLeft = -element.scrollWidth; });
      expect(await region.evaluate(element => Math.abs(element.scrollLeft))).toBeGreaterThan(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('follow-up-tables.png') });
    // A history cache write must not start a refetch loop.
    const before = requestCount();
    await page.evaluate(() => { for (let i = 0; i < 5; i++) window.dispatchEvent(new Event('field-change')); });
    await page.getByRole('heading', { name: 'Alpha residence', exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    expect(requestCount()).toBeLessThanOrEqual(before + 1);
  });
}

test('CRM saves a new row immediately offline and preserves all previous rows after reload', async ({ page }) => {
  await setup(page, '/mini-crm');
  const first = page.locator('#project-' + projects[0].id);
  await first.getByRole('heading', { name: 'Follow-up history', exact: false }).scrollIntoViewIfNeeded();
  await expect(first.getByRole('table').locator('tbody tr')).toHaveCount(2);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
  });
  await first.getByRole('button', { name: 'Follow up', exact: true }).click();
  await first.getByRole('combobox', { name: 'Follow-up type', exact: true }).selectOption('call');
  await first.getByRole('combobox', { name: 'Responsible Indoor Sales', exact: true }).selectOption(actor.id);
  await first.locator('input[name="nextFollowUp"]').fill('2027-02-01T12:00');
  await first.getByRole('textbox', { name: 'Follow-up note', exact: true }).fill('Third note recorded on device');
  await first.getByRole('button', { name: 'Save follow-up', exact: true }).click();
  await expect(first.getByRole('table').locator('tbody tr')).toHaveCount(3);
  await expect(first.getByRole('table').locator('tbody tr').first()).toContainText('Third note recorded on device');
  await expect(first.getByRole('table').locator('tbody tr').first()).toContainText('Pending sync');
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }));
  await page.reload();
  await page.locator('#project-' + projects[0].id).getByRole('heading', { name: 'Follow-up history', exact: false }).scrollIntoViewIfNeeded();
  const restored = page.locator('#project-' + projects[0].id).getByRole('table');
  await expect(restored.locator('tbody tr')).toHaveCount(3);
  await expect(restored).toContainText('Initial enquiry');
  await expect(restored).toContainText('Latest previous call');
  await expect(restored).toContainText('Third note recorded on device');
  await page.goto('/offline?path=/projects/' + projects[0].id + '/follow-ups');
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3);
  const savedChange = await page.evaluate(async () => {
    return await new Promise<{ id: string; recordedAt: string }>((resolve, reject) => {
      const request = indexedDB.open('alumex-field-v1', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result; const tx = db.transaction('accounts', 'readonly'); const read = tx.objectStore('accounts').get(localStorage.getItem('alumex-field-active')!); read.onsuccess = () => resolve(read.result.queue[0]); tx.oncomplete = () => db.close(); };
    });
  });
  await page.route('**/api/projects/*/follow-ups', route => route.fulfill({ json: { project: projects[0], entries: [{ ...history.entries[0], id: savedChange.id, recordedAt: savedChange.recordedAt, note: 'Third note recorded on device' }, ...history.entries] } }));
  // Simulate the sync acknowledgement without creating any server records.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('alumex-field-v1', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result; const tx = db.transaction('accounts', 'readwrite'); const store = tx.objectStore('accounts'); const read = store.get(localStorage.getItem('alumex-field-active')!); read.onsuccess = () => store.put({ ...read.result, queue: [] }, read.result.actor.id); tx.oncomplete = () => { db.close(); resolve(); }; };
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    window.dispatchEvent(new Event('field-change'));
    window.dispatchEvent(new Event('online'));
  });
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3);
  await expect(page.getByRole('table')).not.toContainText('Pending sync');
  await expect(page.getByRole('table').getByText('Third note recorded on device', { exact: true })).toHaveCount(1);

});

test('Outdoor Sales project lists never load CRM history', async ({ page }, testInfo) => {
  const requests = await setup(page, '/projects', 'Outdoor Sales');
  if (testInfo.project.name === 'mobile') await expect(page.getByRole('heading', { name: 'Measurement assignments', exact: true })).toBeVisible();
  else await expect(page.locator('article')).toHaveCount(2);
  await expect(page.getByRole('table')).toHaveCount(0);
  expect(requests()).toBe(0);
});
