import { devices, expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import type { FieldProject, FieldState } from '../../src/lib/offline/types';
import { savedFieldState } from './helpers/fieldState';

// Browser connector tools are unavailable. Use the repository-local Chromium
// and the real mobile device workspace, with all API business writes blocked.
const executablePath = [
  resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  resolve('artifacts/mini-crm-review-20261015/browser/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
].find(path => existsSync(path));
test.use({ serviceWorkers: 'block', video: 'off', userAgent: devices['Pixel 7'].userAgent, launchOptions: { executablePath } });

const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Outdoor fixture', role: 'Outdoor Sales', branch: 'Karkh' as const,
  outdoorTeamMemberIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'] };
const other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const branches = ['Karkh', 'Rasafa', 'Governorates', 'Najaf'] as const;
function project(index: number, branch: FieldProject['branch'], values: Partial<FieldProject> = {}): FieldProject {
  return { id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`, branch,
    project_number: `PRJ-CREATOR-${index}`, project_name: `Own ${branch} entry`, client_id: `client-${index}`,
    created_by: actor.id, registeredBy: actor.name, original_creator_role: 'Outdoor Sales',
    assigned_outdoor_sales_id: other, assignedOutdoorSales: 'Other employee', assignedToYou: false,
    structure_readiness: 'ready', sales_status: 'new_lead', address: 'Fixture address', phone: null,
    next_follow_up_at: null, project_notes: null, created_at: '2026-11-13T08:00:00Z', updated_at: '2026-11-14T08:00:00Z', ...values };
}
const own = branches.map((branch, index) => project(index + 1, branch));
const foreign = [
  project(5, 'Rasafa', { project_name: 'Other creator assigned to me', created_by: other, assigned_outdoor_sales_id: actor.id }),
  project(6, 'Najaf', { project_name: 'Other creator assigned to team', created_by: other, assigned_outdoor_sales_id: actor.outdoorTeamMemberIds[1] }),
];
const state: FieldState = { actor, projects: [...own, ...foreign], outdoorSales: [actor], indoorSales: [], queue: [], syncedAt: null,
  openings: own.map((row, index) => ({ id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`, projectId: row.id,
    createdBy: actor.id, floor: 'GF', room: 'Bedroom', otherRoom: '', width: 1400, height: 1800, quantity: 2, structuralType: 'Window', openingType: 'Sliding' })),
};

for (const locale of ['en', 'ar'] as const) test(`${locale}: mobile Outdoor sees all own Baghdad entries while Najaf stays isolated online and offline`, async ({ page }, testInfo) => {
  const messages = locale === 'ar' ? ar : en;
  const terms = messages.terms as Record<string, string>, tr = (key: string) => terms[key] ?? key;
  const writes: string[] = [], errors: string[] = [];
  await page.clock.setFixedTime(new Date('2026-11-14T08:00:00Z'));
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(value => {
    localStorage.setItem('alumex_locale', value);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => sessionStorage.getItem('creator-offline') !== '1' });
  }, locale);
  await page.route('**/api/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      writes.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 405, json: { error: 'Business writes blocked by browser fixture.' } });
    }
    if (path.startsWith('/api/notifications')) return route.fulfill({ json: { notifications: [], userId: actor.id } });
    return route.fulfill({ json: state });
  });
  await page.goto('/offline?path=/projects');
  await expect(page.getByRole('heading', { name: tr('My projects'), exact: true })).toBeVisible();
  const records = page.locator('article[id^="project-"]');
  await expect(records).toHaveCount(4);
  for (const row of [...own.filter(row => row.branch !== 'Najaf'), foreign[0]]) await expect(page.locator(`#project-${row.id}`).getByRole('heading', { name: row.project_name, exact: true })).toBeVisible();
  for (const row of [own[3], foreign[1]]) await expect(page.getByRole('heading', { name: row.project_name, exact: true })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: tr('Showing {count} of {total} projects').replace('{count}', '4').replace('{total}', '4') })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`${locale}-mobile-own-all-branches.png`), fullPage: true });

  // Reopen the saved snapshot offline and retain earlier Baghdad-area work.
  await page.evaluate(() => { sessionStorage.setItem('creator-offline', '1'); window.dispatchEvent(new Event('offline')); });
  await page.reload();
  await expect(records).toHaveCount(4);
  const nav = page.getByRole('navigation', { name: tr('Outdoor Sales workspace'), exact: true });
  for (const row of own.filter(project => project.branch === 'Rasafa')) {
    await page.locator(`#project-${row.id}`).getByRole('link', { name: tr('Open project'), exact: true }).click();
    await expect(page.getByRole('region', { name: tr('Project record'), exact: true })).toContainText(tr(row.branch!));
    await expect(page.getByRole('form', { name: tr('New opening measurements'), exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: tr('Edit project name'), exact: true })).toHaveCount(0);
    await nav.getByRole('button', { name: tr('My projects'), exact: true }).click();
    await expect(records).toHaveCount(4);
  }
  const saved = await savedFieldState(page);
  expect(saved.projects).toEqual(state.projects);
  expect(saved.openings).toEqual(state.openings);
  expect(saved.queue).toEqual([]);

  // Reading old entries never authorizes registering into another office.
  await nav.getByRole('button', { name: tr('New project'), exact: true }).click();
  await expect(page.getByRole('heading', { name: messages.registration.title, exact: true })).toBeVisible();
  expect(await page.locator('input[name="projectBranch"]').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(['Karkh', 'Governorates']);
  await expect(page.getByRole('radio', { name: tr('Rasafa'), exact: true })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: tr('Najaf'), exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
