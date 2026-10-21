import { expect, test } from '@playwright/test';
import type { FieldChange, FieldProject, FieldState } from '../../src/lib/offline/types';
import { savedFieldState } from './helpers/fieldState';

test.use({ serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36' });

const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Outdoor employee', role: 'Outdoor Sales' };
const id = '11111111-1111-4111-8111-111111111111';

for (const locale of ['en', 'ar']) test(`${locale}: unanswered visit survives reload, returns to CRM, and stays in the project log after reassignment`, async ({ page }) => {
  const project: FieldProject = {
    id, project_name: 'Customer Villa', project_number: 'PRJ-VISIT', created_by: 'indoor', registeredBy: 'Indoor employee',
    assigned_outdoor_sales_id: actor.id, assignedOutdoorSales: actor.name, assignedToYou: true,
    structure_readiness: 'ready', sales_status: 'new_lead', address: 'Baghdad, Mansour', phone: '07700000000',
    next_follow_up_at: null, project_notes: null, created_at: '2026-10-21T08:00:00Z', updated_at: '2026-10-21T08:00:00Z',
  };
  const ownProject = { ...project, id: '22222222-2222-4222-8222-222222222222', project_name: 'Registered by me', project_number: 'PRJ-OWN', created_by: actor.id, assigned_outdoor_sales_id: null };
  const state: FieldState = { actor, projects: [project, ownProject], openings: [], queue: [], syncedAt: null, outdoorSales: [actor], indoorSales: [] };
  const writes: FieldChange[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(locale => localStorage.setItem('alumex_locale', locale), locale);
  await page.route('**/api/**', async route => {
    if (route.request().url().includes('/api/notifications')) return route.fulfill({ json: { notifications: [], userId: actor.id } });
    if (route.request().method() === 'POST') {
      const change = route.request().postDataJSON() as FieldChange;
      writes.push(change);
      Object.assign(project, {
        measurement_delayed: true, measurement_delay_reason: change.payload.reason,
        measurement_delay_note: change.payload.note, measurement_delayed_at: change.recordedAt,
        measurement_delayed_by: actor.id, measurementDelayedBy: actor.name, updated_at: change.recordedAt,
        measurement_attempts: [{ id: change.id, projectId: id, action: 'delay-measurements', reason: change.payload.reason, note: change.payload.note, recordedAt: change.recordedAt, recordedBy: actor.name }],
      });
      return route.fulfill({ json: { project } });
    }
    return route.fulfill({ json: state });
  });

  await page.goto(`/offline?path=/initial-measurements/${id}`);
  await page.getByText(locale === 'en' ? 'Unable to take measurements' : 'تعذر أخذ القياسات', { exact: true }).click();
  const form = page.getByRole('form', { name: locale === 'en' ? 'Report visit outcome' : 'تسجيل نتيجة الزيارة' });
  await form.locator('select').selectOption('client_no_answer');
  const note = locale === 'en' ? 'The site was closed. Called the client twice with no answer.' : 'كان الموقع مغلقاً. اتصلت بالعميل مرتين ولم يرد.';
  await form.locator('textarea').fill(note);
  await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')); });
  await form.getByRole('button', { name: locale === 'en' ? 'Return to Indoor Sales' : 'إعادة إلى المبيعات الداخلية' }).click();
  await expect.poll(async () => (await savedFieldState(page)).queue.length).toBe(1);
  const saved = await savedFieldState(page);
  expect(saved.projects.find(p => p.id === id)?.measurement_delayed).toBe(true);
  expect(saved.projects.find(p => p.id === id)?.sales_status).toBe('new_lead');
  expect(saved.queue[0].payload).toMatchObject({ reason: 'client_no_answer', note });
  expect(writes).toHaveLength(0);

  const nav = page.getByRole('navigation', { name: locale === 'en' ? 'Outdoor Sales workspace' : 'مساحة عمل المبيعات الخارجية' });
  await nav.getByRole('button', { name: locale === 'en' ? 'Project log' : 'سجل المشاريع', exact: true }).click();
  await expect(page.getByRole('heading', { name: locale === 'en' ? 'Project log' : 'سجل المشاريع', exact: true })).toBeVisible();
  await expect(page.getByText('Registered by me', { exact: true })).toBeVisible();
  const entry = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Customer Villa' }) });
  await entry.locator('summary').filter({ hasText: locale === 'en' ? 'Visit history' : 'سجل الزيارات' }).click();
  await expect(entry.getByText(note, { exact: true }).last()).toBeVisible();
  await expect(entry.getByText(locale === 'en' ? 'Client did not answer' : 'لم يرد العميل', { exact: true }).last()).toBeVisible();
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Customer Villa' })).toBeVisible();
  await entry.locator('summary').filter({ hasText: locale === 'en' ? 'Visit history' : 'سجل الزيارات' }).click();
  await expect(entry.getByText(note, { exact: true }).last()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath(`project-log-${locale}.png`), fullPage: true });

  await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); window.dispatchEvent(new Event('online')); });
  await expect.poll(async () => (await savedFieldState(page)).queue.length).toBe(0);
  expect(writes).toHaveLength(1);
  expect(writes[0].action).toBe('delay-measurements');
  // The next server snapshot represents Indoor Sales arranging and assigning a new visit.
  Object.assign(project, { measurement_delayed: false, measurement_assignment_id: '33333333-3333-4333-8333-333333333333', updated_at: new Date().toISOString() });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(async () => (await savedFieldState(page)).projects.find(p => p.id === id)?.measurement_delayed).toBe(false);
  await expect(entry.getByText(note, { exact: true }).last()).toBeVisible();
  await expect(entry.getByRole('link', { name: locale === 'en' ? 'Record measurements' : 'تسجيل القياسات', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
