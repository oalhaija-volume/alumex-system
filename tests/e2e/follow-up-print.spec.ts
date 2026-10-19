import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

// Use the mobile field shell to exercise Indoor Sales without real credentials or writes.
test.use({ serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Fatma', role: 'Indoor Sales' };
const projects = ['Alpha residence', 'Beta office'].map((project_name, i) => ({
  id: `11111111-1111-4111-8111-11111111111${i}`, project_name, project_number: `PRJ-PRINT-${i}`,
  structure_readiness: 'not_ready', sales_status: 'new_lead', created_by: actor.id, registeredBy: actor.name,
  address: 'Baghdad', phone: null, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-10T10:00:00Z',
  follow_up_owner_id: actor.id, followUpOwner: actor.name, next_follow_up_at: '2027-01-01T10:00:00Z', project_notes: null,
}));
const entries = Array.from({ length: 48 }, (_, i) => ({
  id: `entry-${i}`, action: 'follow-up', note: `Follow-up ${i + 1}: تم التواصل مع العميل\nClient requested a site visit and updated the preferred appointment.`,
  recordedAt: new Date(Date.UTC(2026, 9, 18, 12, -i)).toISOString(), recordedBy: 'Fatma',
  followUpType: 'call', followUpOwner: 'Fatma', nextFollowUp: '2027-01-01T10:00:00Z',
}));

async function setup(page: Page, path: string, locale: string, historyEntries = entries) {
  const state = { actor, projects, indoorSales: [actor], outdoorSales: [], queue: [], openings: [], syncedAt: null };
  await page.route('**/api/**', route => {
    if (route.request().method() !== 'GET') throw new Error('Print checks must not write any records.');
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/follow-ups')) {
      const first = url.pathname.includes(projects[0].id);
      return route.fulfill({ json: { project: projects[first ? 0 : 1], entries: first ? historyEntries : [{ ...entries[0], note: 'Other project confidential note' }] } });
    }
    if (url.pathname === '/api/offline' || url.pathname === '/api/workspace') return route.fulfill({ json: state });
    return route.fulfill({ json: {} });
  });
  await page.addInitScript(locale => {
    localStorage.setItem('alumex_locale', locale);
    window.print = () => { document.documentElement.dataset.printCalls = String(Number(document.documentElement.dataset.printCalls ?? 0) + 1); };
  }, locale);
  await page.goto('/offline?path=' + encodeURIComponent(path));
  await page.evaluate(async state => {
    localStorage.setItem('alumex-field-active', state.actor.id);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('alumex-field-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('accounts');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result; const tx = db.transaction('accounts', 'readwrite');
        tx.objectStore('accounts').put(state, state.actor.id);
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    });
    window.dispatchEvent(new Event('field-change'));
  }, state);
}

for (const locale of ['en', 'ar']) {
  test(`${locale}: Indoor Sales prints only the selected project's full history across pages`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: locale === 'ar' ? 390 : 1440, height: 1000 });
    await setup(page, '/dashboard', locale);
    const first = page.getByRole('article', { name: 'Alpha residence' });
    const second = page.getByRole('article', { name: 'Beta office' });
    const historyLabel = locale === 'ar' ? 'سجل المتابعات' : 'Follow-up history';
    const printLabel = locale === 'ar' ? 'طباعة المتابعات' : 'Print follow-ups';
    for (const row of [first, second]) {
      await row.getByRole('button', { name: historyLabel, exact: true }).click();
      await row.getByRole('table').scrollIntoViewIfNeeded();
      await expect(row.getByRole('button', { name: printLabel, exact: true })).toBeEnabled();
    }
    await expect(first.getByRole('table').locator('tbody tr')).toHaveCount(48);
    await expect(second.getByRole('table')).toContainText('Other project confidential note');
    // Print output must remain readable even when the application uses dark mode.
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await first.getByRole('button', { name: printLabel, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-print-calls', '1');
    const report = page.locator('.follow-up-print-document');
    await expect(report).toHaveCount(1);
    await expect(report).toBeHidden();
    await page.emulateMedia({ media: 'print' });
    await expect(report).toBeVisible();
    await expect(report).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(report).toContainText('PRJ-PRINT-0');
    await expect(report).not.toContainText('Beta office');
    await expect(report).not.toContainText('Other project confidential note');
    await expect(first).toBeHidden(); await expect(second).toBeHidden();
    await expect(report.locator('tbody tr')).toHaveCount(48);
    await expect(report.locator('tbody tr').last()).toContainText('Follow-up 48:');
    expect(await report.locator('.follow-up-table-scroll').evaluate(el => getComputedStyle(el).maxHeight)).toBe('none');
    expect(await report.locator('thead').evaluate(el => getComputedStyle(el).position)).toBe('static');
    expect(await report.locator('td').first().evaluate(el => getComputedStyle(el).color)).toBe('rgb(15, 23, 42)');
    expect(await report.locator('table').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`print-${locale}.png`) });
    const pdf = await PDFDocument.load(await page.pdf({ path: test.info().outputPath(`follow-ups-${locale}.pdf`), preferCSSPageSize: true, printBackground: true }));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    for (const sheet of pdf.getPages()) expect(sheet.getWidth()).toBeGreaterThan(sheet.getHeight());
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(report).toHaveCount(0);
    await expect(first.getByRole('button', { name: printLabel, exact: true })).toBeEnabled();
    await second.getByRole('button', { name: printLabel, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-print-calls', '2');
    await expect(report).toContainText('PRJ-PRINT-1');
    await expect(report).not.toContainText('PRJ-PRINT-0');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    expect(errors).toEqual([]);
  });
}

test('project history page can print an empty history', async ({ page }) => {
  await setup(page, `/projects/${projects[0].id}/follow-ups`, 'en', []);
  const print = page.getByRole('button', { name: 'Print follow-ups', exact: true });
  await expect(print).toBeEnabled(); await print.click();
  await expect(page.locator('html')).toHaveAttribute('data-print-calls', '1');
  await page.emulateMedia({ media: 'print' });
  const report = page.locator('.follow-up-print-document');
  await expect(report).toContainText('No follow-ups recorded yet.');
  await expect(report).toContainText('PRJ-PRINT-0');
  await expect(report).not.toContainText('PRJ-PRINT-1');
});

test('printing is unavailable when history access fails', async ({ page }) => {
  await setup(page, '/dashboard', 'en');
  await page.route('**/api/projects/*/follow-ups', route => route.fulfill({ status: 403, json: { error: 'You do not have access to this project.' } }));
  const first = page.getByRole('article', { name: 'Alpha residence' });
  await first.getByRole('button', { name: 'Follow-up history', exact: true }).click();
  await expect(first.getByText('You do not have access to this project.', { exact: true })).toBeVisible();
  await expect(first.getByRole('button', { name: 'Print follow-ups', exact: true })).toBeDisabled();
  await expect(page.locator('.follow-up-print-document')).toHaveCount(0);
});
