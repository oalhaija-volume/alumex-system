import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import type { FieldChange, FieldState } from '../../src/lib/offline/types';
import { savedFieldState } from './helpers/fieldState';

// Browser connector tools are unavailable. Use the actual local offline app,
// repository-local Chromium, and mocked APIs; no live project can be written.
const executablePath = [
  resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  resolve('artifacts/mini-crm-review-20261015/browser/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
].find(path => existsSync(path));
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36' });

const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Ehab', role: 'Outdoor Sales', branch: 'Rasafa' as const, outdoorRotationStartBranch: 'Rasafa' as const };
const branchError = 'You can only create projects for your assigned branch or Governorates during this half of the month.';

for (const locale of ['en', 'ar'] as const) test(`${locale}: Ehab retries the same saved Karkh registration after the server rotation check is repaired`, async ({ page }) => {
  const messages = locale === 'en' ? en : ar;
  const term = (key: string) => (messages.terms as Record<string, string>)[key] ?? key;
  await page.clock.setFixedTime(new Date('2026-11-16T09:00:00Z'));
  await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  const remote: FieldState = { actor, projects: [], openings: [], queue: [], outdoorSales: [], indoorSales: [], syncedAt: null };
  const posts: FieldChange[] = [], accepted: FieldChange[] = [], errors: string[] = [], unexpected: string[] = [];
  let rejectRegistration = true;
  const acknowledgement: { project?: FieldState['projects'][number] } = {};
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    // Chromium logs the deliberately mocked registration rejection as a failed
    // resource. Keep every runtime error and every other failed resource visible.
    const expectedRejection = message.text() === 'Failed to load resource: the server responded with a status of 400 (Bad Request)'
      && message.location().url === 'http://localhost:3003/api/offline';
    if (message.type() === 'error' && !expectedRejection) errors.push(message.text());
  });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf2f6"/></svg>' }));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === 'GET') {
      if (url.pathname === '/api/notifications') return route.fulfill({ json: { notifications: [], userId: actor.id } });
      return route.fulfill({ json: remote });
    }
    if (url.pathname === '/api/offline' && request.method() === 'POST') {
      const change = request.postDataJSON() as FieldChange;
      posts.push(change);
      expect(change.action).toBe('register');
      expect(change.userId).toBe(actor.id);
      expect(change.payload.project).toMatchObject({ branch: 'Karkh' });
      expect(change.payload).not.toHaveProperty('outdoorRotationStartBranch');
      expect(change.payload.project).not.toHaveProperty('outdoorRotationStartBranch');
      expect(change.payload.project).not.toHaveProperty('outdoor_rotation_start_branch');
      if (rejectRegistration) return route.fulfill({ status: 400, json: { error: branchError } });
      expect(acknowledgement.project).toBeDefined();
      accepted.push(change);
      remote.projects = [acknowledgement.project!];
      return route.fulfill({ json: { project: acknowledgement.project } });
    }
    unexpected.push(request.method() + ' ' + url.pathname);
    return route.fulfill({ status: 405, json: { error: 'Unexpected business write blocked' } });
  });

  await page.goto('/offline?path=/intake');
  await expect(page.getByRole('heading', { name: messages.registration.title, exact: true })).toBeVisible();
  const branches = page.locator('input[name="projectBranch"]');
  expect(await branches.evaluateAll(nodes => nodes.map(node => (node as HTMLInputElement).value))).toEqual(['Karkh', 'Governorates']);
  await expect(page.locator('input[name="projectBranch"][value="Rasafa"]')).toHaveCount(0);
  await page.locator('input[name="projectBranch"][value="Governorates"]').check();
  await page.locator('#project-governorate').selectOption('البصرة');
  await expect(page.locator('#project-governorate')).toHaveValue('البصرة');
  await page.locator('input[name="projectBranch"][value="Karkh"]').check();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
  });
  await page.locator('input[name="buildingType"][value="villa_house"]').check();
  await page.locator('input[autocomplete="name"]').fill('Ehab Karkh saved registration');
  await page.locator('input[type="tel"]').fill('07700000000');
  await page.locator('input[autocomplete="street-address"]').fill('Karkh, saved site address');
  await page.locator('input[name="readiness"][value="not_ready"]').check();
  await page.locator('#readiness-note').fill('Site plastering is incomplete.');
  await page.getByRole('button', { name: messages.registration.save, exact: true }).click();
  await expect(page.getByRole('heading', { name: messages.registration.saved, exact: true })).toBeVisible();
  const before = await savedFieldState(page);
  expect(before.queue).toHaveLength(1); expect(posts).toHaveLength(0);
  const original = before.queue[0], localProject = before.projects[0];
  expect(original.payload).toMatchObject({ registrationActorId: actor.id, client: { clientName: 'Ehab Karkh saved registration', mobile: '07700000000' }, project: { branch: 'Karkh', buildingType: 'villa_house', address: 'Karkh, saved site address', readinessNote: 'Site plastering is incomplete.' } });
  expect(original.recordedAt).toBe('2026-11-16T09:00:00.000Z');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    window.dispatchEvent(new Event('online'));
  });
  await expect.poll(async () => (await savedFieldState(page)).queue[0]?.error).toBe(branchError);
  await expect(page.getByRole('heading', { name: term('Saved work needs attention'), exact: true })).toBeVisible();
  const rejected = await savedFieldState(page);
  expect(rejected.queue[0]).toMatchObject({ ...original, error: branchError });
  expect(rejected.projects).toEqual(before.projects);
  await page.getByRole('navigation', { name: term('Outdoor Sales workspace'), exact: true }).getByRole('button', { name: term('Project log'), exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ehab Karkh saved registration', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath(`${locale}-saved-karkh-registration-needs-sync.png`), fullPage: true });

  acknowledgement.project = { ...localProject, project_number: 'PRJ-KARKH-RECOVERED', pending: false, updated_at: '2026-11-16T09:01:00.000Z' };
  rejectRegistration = false;
  await page.getByRole('button', { name: term('Retry sync'), exact: true }).click();
  await expect.poll(async () => (await savedFieldState(page)).queue.length).toBe(0);
  await expect(page.getByRole('heading', { name: term('Saved work needs attention'), exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: term('Retry sync'), exact: true })).toHaveCount(0);
  expect(accepted).toHaveLength(1);
  expect(accepted[0]).toMatchObject({ id: original.id, projectId: original.projectId, userId: original.userId, action: original.action, recordedAt: original.recordedAt, payload: original.payload });
  expect(posts.every(change => change.id === original.id && change.projectId === original.projectId)).toBe(true);
  const recovered = await savedFieldState(page);
  expect(recovered.projects).toHaveLength(1);
  expect(recovered.projects[0]).toMatchObject({ ...localProject, project_number: 'PRJ-KARKH-RECOVERED', pending: false, updated_at: acknowledgement.project.updated_at });
  expect(recovered.actor.outdoorRotationStartBranch).toBe('Rasafa');
  expect(recovered.projects[0].branch).toBe('Karkh');
  await expect(page.getByText('PRJ-KARKH-RECOVERED', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`${locale}-saved-karkh-registration-synced.png`), fullPage: true });
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});
