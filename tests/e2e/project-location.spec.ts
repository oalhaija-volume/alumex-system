import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

for (const role of ['Indoor Sales', 'Sales Manager']) for (const scenario of ['pinned', 'address-only', 'legacy']) {
  test(`${role} project map: ${scenario}`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Device snapshot coverage uses the mobile workspace.');
    const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Sales employee', role, branch: 'Karkh' };
    const project = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', project_name: 'Location test', project_number: 'PRJ-MAP',
      address: 'Baghdad, Mansour', structure_readiness: 'ready', sales_status: 'new_lead',
      created_by: actor.id, registeredBy: actor.name, created_at: '2026-10-19T08:00:00Z', updated_at: '2026-10-19T08:00:00Z',
      assigned_outdoor_sales_id: actor.id, assignedOutdoorSales: actor.name,
      next_follow_up_at: null, project_notes: null, phone: null,
      ...(scenario === 'legacy' ? {} : { location_latitude: scenario === 'pinned' ? 33.3 : null, location_longitude: scenario === 'pinned' ? 44.4 : null }),
    };
    const state = { actor, projects: [project], openings: [], queue: [], syncedAt: null, indoorSales: [actor], outdoorSales: [] };
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('alumex_locale', 'en');
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    });
    await page.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'Offline test' } }));
    await page.goto(`/offline?project=${project.id}`);
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
    const record = page.getByRole('region', { name: 'Project record', exact: true });
    await expect(record.getByText(project.address, { exact: true })).toBeVisible();
    const map = record.getByRole('button', { name: 'Saved project location map', exact: true });
    if (scenario === 'pinned') {
      await expect(map).toBeVisible();
      const link = record.getByRole('link', { name: 'Open in Google Maps', exact: true });
      const target = 'https://www.google.com/maps/search/?api=1&query=33.3,44.4';
      await expect(link).toHaveAttribute('href', target);
      await expect(link).toHaveAttribute('target', '_blank');
      await map.click({ position: { x: 20, y: 20 } });
      await record.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await expect(link).toHaveAttribute('href', target);
      await expect(record.getByRole('button', { name: 'Clear pin', exact: true })).toHaveCount(0);
      await expect(record.getByRole('button', { name: 'Use current location', exact: true })).toHaveCount(0);
    } else {
      await expect(record.getByText('No map pin saved for this project.', { exact: true })).toBeVisible();
      await expect(map).toHaveCount(0);
      await expect(record.getByRole('link', { name: 'Open in Google Maps', exact: true })).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
