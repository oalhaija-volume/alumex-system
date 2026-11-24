import { devices, expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import type { FieldProject, FieldState } from '../../src/lib/offline/types';
import { savedFieldState } from './helpers/fieldState';

// Browser connector tools are unavailable. Use repository-local Chromium and
// the real mobile device workspace, with all business writes blocked.
const executablePath = [
  resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  resolve('artifacts/mini-crm-review-20261015/browser/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
].find(path => existsSync(path));
test.use({ serviceWorkers: 'block', video: 'off', userAgent: devices['Pixel 7'].userAgent, launchOptions: { executablePath } });

const actor = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Outdoor fixture', role: 'Outdoor Sales', branch: 'Rasafa' as const,
  outdoorRotationStartBranch: 'Rasafa' as const,
  outdoorTeamMemberIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
};
const other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function project(index: number, values: Partial<FieldProject> = {}): FieldProject {
  return {
    id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`, branch: 'Rasafa',
    project_number: `PRJ-VISIBILITY-${index}`, project_name: `Own entry ${index}`, client_name: `Original client ${index}`,
    created_by: actor.id, registeredBy: actor.name, assigned_outdoor_sales_id: other, assignedOutdoorSales: 'Another team',
    structure_readiness: 'ready', sales_status: 'new_lead', address: 'Fixture address', phone: null,
    next_follow_up_at: null, project_notes: null, created_at: '2026-10-13T08:00:00Z', updated_at: '2026-11-14T08:00:00Z',
    ...values,
  };
}
const own = [
  project(1, { branch: 'Karkh' }),
  project(2, { branch: 'Rasafa' }),
  project(3, { branch: 'Governorates', governorate: 'البصرة' }),
];
const credited = [
  project(4, { project_name: 'Renamed commercial tower', client_name: 'عميل قديم مميز', created_by: other, registeredBy: 'Indoor fixture', branch: 'Karkh', legacy_outdoor_sales_id: actor.id, legacyOutdoorSalesOwner: actor.name, project_log_only: true }),
  project(5, { project_name: 'Credited villa', created_by: other, registeredBy: 'Indoor fixture', legacy_outdoor_sales_id: actor.id, legacyOutdoorSalesOwner: actor.name, project_log_only: true }),
];
const team = project(6, { created_by: other, assigned_outdoor_sales_id: actor.outdoorTeamMemberIds[1], assignedOutdoorSales: 'Teammate' });
const history = project(7, { project_name: 'Previous visit only', created_by: other, project_log_only: true });
const najaf = project(8, { branch: 'Najaf', project_name: 'Separate region entry' });
const unrelated = project(9, { project_name: 'Unrelated credited entry', created_by: other, legacy_outdoor_sales_id: other, project_log_only: true });

for (const locale of ['en', 'ar'] as const) test(`${locale}: own and credited projects follow the current area across midnight, client search and offline reopen`, async ({ page }, testInfo) => {
  const messages = locale === 'ar' ? ar : en;
  const terms = messages.terms as Record<string, string>, tr = (key: string) => terms[key] ?? key;
  const state: FieldState = { actor, projects: [...own, ...credited, team, history, najaf, unrelated], openings: [], outdoorSales: [actor], indoorSales: [], queue: [], syncedAt: null };
  const writes: string[] = [], errors: string[] = [];
  let failSnapshot = false;
  await page.clock.setFixedTime(new Date('2026-11-15T23:59:00+03:00'));
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(value => {
    localStorage.setItem('alumex_locale', value);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => sessionStorage.getItem('visibility-offline') !== '1' });
  }, locale);
  await page.route('**/api/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      writes.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 405, json: { error: 'Business writes blocked by browser fixture.' } });
    }
    if (path.startsWith('/api/notifications')) return route.fulfill({ json: { notifications: [], userId: actor.id } });
    if (path === '/api/offline' && failSnapshot) return route.abort('internetdisconnected');
    return route.fulfill({ json: state });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/offline?path=/projects');
  await expect(page.getByRole('heading', { name: tr('My projects'), exact: true })).toBeVisible();
  const records = page.locator('article[id^="project-"]');
  const firstHalfVisible = [own[1], own[2], credited[1], team];
  await expect(records).toHaveCount(4);
  for (const row of firstHalfVisible) await expect(page.locator(`#project-${row.id}`).getByRole('heading', { name: row.project_name, exact: true })).toBeVisible();
  for (const row of [credited[1]]) {
    const article = page.locator(`#project-${row.id}`);
    await expect(article).toContainText(tr('Original Outdoor Sales owner'));
    await expect(article).toContainText(tr('This project is available in your log for reference only.'));
    await expect(article.getByRole('link', { name: tr('Open project'), exact: true })).toHaveCount(0);
  }
  for (const row of [own[1], own[2], team]) await expect(page.locator(`#project-${row.id}`).getByRole('link', { name: tr('Open project'), exact: true })).toBeVisible();
  for (const row of [own[0], credited[0], history, najaf, unrelated]) await expect(page.getByRole('heading', { name: row.project_name, exact: true })).toHaveCount(0);
  const search = page.getByRole('searchbox', { name: tr('Find a project'), exact: true });
  await search.fill(credited[1].client_name!);
  await expect(records).toHaveCount(1);
  await expect(page.getByRole('heading', { name: credited[1].project_name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: tr('Clear filters'), exact: true }).click();
  await expect(records).toHaveCount(4);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`${locale}-own-and-credited-projects.png`), fullPage: true });

  // An unsuccessful refresh keeps saved entries and makes their age explicit.
  const refresh = page.getByRole('button', { name: tr('Refresh projects'), exact: true });
  const savedWarning = page.getByRole('status').filter({ hasText: tr('Showing saved projects. Connect and refresh to see the latest entries.') });
  failSnapshot = true;
  await refresh.click();
  await expect(savedWarning).toBeVisible();
  await expect(records).toHaveCount(4);
  await expect(page.getByText(tr('Last synced'), { exact: false })).toBeVisible();

  // A manual retry bypasses the one-minute background cache and downloads a
  // newly available project without clearing storage or touching saved work.
  const newlyAssigned = project(10, { project_name: 'Newly assigned site', created_by: other, assigned_outdoor_sales_id: actor.id });
  state.projects.push(newlyAssigned);
  failSnapshot = false;
  await refresh.click();
  await expect(records).toHaveCount(5);
  await expect(page.getByRole('heading', { name: newlyAssigned.project_name, exact: true })).toBeVisible();
  await expect(savedWarning).toHaveCount(0);

  const savedBeforeRotation = await savedFieldState(page);
  // Crossing Baghdad midnight hides the previous area, including creator,
  // legacy-credit and assigned rows, while retained storage stays intact.
  await page.clock.setFixedTime(new Date('2026-11-16T00:01:00+03:00'));
  await page.evaluate(() => { sessionStorage.setItem('visibility-offline', '1'); window.dispatchEvent(new Event('offline')); });
  await page.reload();
  await expect(records).toHaveCount(3);
  for (const row of [own[0], own[2], credited[0]]) await expect(page.locator(`#project-${row.id}`)).toBeVisible();
  for (const row of [own[1], credited[1], team, newlyAssigned, history, najaf, unrelated]) await expect(page.locator(`#project-${row.id}`)).toHaveCount(0);
  await search.fill(credited[0].client_name!);
  await expect(records).toHaveCount(1);
  await expect(page.getByRole('heading', { name: credited[0].project_name, exact: true })).toBeVisible();
  await expect(page.locator(`#project-${credited[0].id}`).getByRole('link')).toHaveCount(0);
  const saved = await savedFieldState(page);
  expect(saved.projects).toEqual(savedBeforeRotation.projects);
  expect(saved.openings).toEqual(savedBeforeRotation.openings);
  expect(saved.queue).toEqual(savedBeforeRotation.queue);
  expect(saved.queue).toEqual([]);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
