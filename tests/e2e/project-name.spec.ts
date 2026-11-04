import { expect, test } from '@playwright/test';
import type { FieldChange, FieldProject, FieldState } from '../../src/lib/offline/types';
import { savedFieldState } from './helpers/fieldState';

test.use({
  serviceWorkers: 'block',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
});

const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Outdoor employee', role: 'Outdoor Sales' };
const projectId = '11111111-1111-4111-8111-111111111111';
const updatedAt = '2026-11-04T08:00:00Z';

for (const locale of ['en', 'ar'] as const) test(`${locale}: outdoor project rename survives offline reload and sync without changing measurements`, async ({ page }) => {
  const labels = locale === 'en' ? {
    log: 'Project log', edit: 'Edit project name', name: 'Project name', save: 'Save changes', cancel: 'Cancel',
    validation: 'Enter a project name of 1 to 150 characters.',
  } : {
    log: 'سجل المشاريع', edit: 'تعديل اسم المشروع', name: 'اسم المشروع', save: 'حفظ التغييرات', cancel: 'إلغاء',
    validation: 'أدخل اسم مشروع يتكون من 1 إلى 150 حرفاً.',
  };
  const project: FieldProject = {
    id: projectId, project_name: 'Registered customer villa', project_number: 'PRJ-RENAME',
    created_by: actor.id, registeredBy: actor.name, assigned_outdoor_sales_id: actor.id,
    assignedOutdoorSales: actor.name, assignedToYou: true, structure_readiness: 'ready',
    sales_status: 'ready_for_quotation', address: 'Baghdad, Mansour', phone: '07700000000',
    next_follow_up_at: null, project_notes: 'Keep this note', created_at: updatedAt, updated_at: updatedAt,
  };
  const ownProject: FieldProject = {
    ...project, id: '22222222-2222-4222-8222-222222222222', project_name: 'Registered by me',
    project_number: 'PRJ-CREATOR', created_by: actor.id, assigned_outdoor_sales_id: null, assignedToYou: false,
  };
  const assignedProject: FieldProject = {
    ...project, id: '55555555-5555-4555-8555-555555555555', project_name: 'Assigned by Indoor Sales',
    project_number: 'PRJ-ASSIGNED', created_by: 'indoor-employee', registeredBy: 'Indoor employee',
  };
  const historyProject: FieldProject = {
    ...project, id: '33333333-3333-4333-8333-333333333333', project_name: 'Previous visit history',
    project_number: 'PRJ-HISTORY', created_by: 'indoor-employee', assigned_outdoor_sales_id: 'different-employee', assignedToYou: false, project_log_only: true,
  };
  const state: FieldState = {
    actor, projects: [project, ownProject, assignedProject, historyProject], outdoorSales: [actor], indoorSales: [], queue: [], syncedAt: null,
    openings: [{ id: '44444444-4444-4444-8444-444444444444', projectId, floor: 'Ground floor', room: 'Bedroom', otherRoom: '', width: 1400, height: 1800, quantity: 2, structuralType: 'Window', openingType: 'Sliding' }],
  };
  const writes: (FieldChange & { expectedUpdatedAt: string })[] = [];
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.addInitScript(locale => {
    localStorage.setItem('alumex_locale', locale);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => sessionStorage.getItem('rename-test-offline') !== '1' });
  }, locale);
  await page.route('**/api/**', async route => {
    const request = route.request();
    if (request.url().includes('/api/notifications')) return route.fulfill({ json: { notifications: [], userId: actor.id } });
    if (request.method() === 'POST') {
      const change = request.postDataJSON() as FieldChange & { expectedUpdatedAt: string };
      writes.push(change);
      Object.assign(project, { project_name: change.payload.projectName, updated_at: change.recordedAt });
      return route.fulfill({ json: { project } });
    }
    return route.fulfill({ json: state });
  });

  await page.goto('/offline?path=/project-log');
  await expect(page).toHaveURL(/\/offline\?path=\/project-log$/);
  await expect(page).toHaveTitle(/Alumex|ألومكس/i);
  await expect(page.getByRole('heading', { name: labels.log, exact: true })).toBeVisible();
  const record = page.locator(`#project-${projectId}`);
  const ownRecord = page.locator(`#project-${ownProject.id}`);
  const assignedRecord = page.locator(`#project-${assignedProject.id}`);
  await expect(assignedRecord.getByRole('heading', { name: assignedProject.project_name, exact: true })).toBeVisible();
  await expect(assignedRecord.getByRole('button', { name: labels.edit, exact: true })).toHaveCount(0);
  const historyRecord = page.locator(`#project-${historyProject.id}`);
  await expect(ownRecord.getByRole('button', { name: labels.edit, exact: true })).toBeVisible();
  await expect(historyRecord.getByRole('button', { name: labels.edit, exact: true })).toHaveCount(0);

  await record.getByRole('button', { name: labels.edit, exact: true }).click();
  const form = record.getByRole('form', { name: labels.edit, exact: true });
  const input = form.getByRole('textbox', { name: labels.name, exact: true });
  await expect(input).toHaveValue(project.project_name);
  await page.screenshot({ path: test.info().outputPath(`project-name-${locale}-editor.png`), fullPage: true });
  await input.fill('Discard this name');
  await form.getByRole('button', { name: labels.cancel, exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(record.getByRole('heading', { name: project.project_name, exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);

  await record.getByRole('button', { name: labels.edit, exact: true }).click();
  await input.fill('   ');
  await form.getByRole('button', { name: labels.save, exact: true }).click();
  await expect(record.getByRole('alert')).toHaveText(labels.validation);
  await expect(record.getByRole('heading', { name: project.project_name, exact: true })).toBeVisible();
  expect((await savedFieldState(page)).queue).toHaveLength(0);

  const renamed = locale === 'en' ? 'Mansour family villa' : 'فيلا العائلة في المنصور';
  await input.fill(`  ${renamed}  `);
  await page.evaluate(() => { sessionStorage.setItem('rename-test-offline', '1'); window.dispatchEvent(new Event('offline')); });
  await form.getByRole('button', { name: labels.save, exact: true }).click();
  await expect(record.getByRole('heading', { name: renamed, exact: true })).toBeVisible();
  await expect.poll(async () => (await savedFieldState(page)).queue.length).toBe(1);
  let saved = await savedFieldState(page);
  expect(saved.queue[0]).toMatchObject({ action: 'rename-project', projectId, userId: actor.id, payload: { projectName: renamed } });
  expect(saved.openings).toEqual(state.openings);
  expect(saved.projects.find(p => p.id === projectId)).toMatchObject({ sales_status: 'ready_for_quotation', project_notes: 'Keep this note', project_name: renamed });
  expect(writes).toHaveLength(0);

  await page.reload();
  await expect(record.getByRole('heading', { name: renamed, exact: true })).toBeVisible();
  expect((await savedFieldState(page)).queue).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`project-name-${locale}-saved-offline.png`), fullPage: true });

  await page.evaluate(() => { sessionStorage.removeItem('rename-test-offline'); window.dispatchEvent(new Event('online')); });
  await expect.poll(async () => (await savedFieldState(page)).queue.length).toBe(0);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ action: 'rename-project', expectedUpdatedAt: updatedAt, payload: { projectName: renamed } });
  await expect(record.getByRole('heading', { name: renamed, exact: true })).toBeVisible();
  saved = await savedFieldState(page);
  expect(saved.openings).toEqual(state.openings);
  expect(saved.projects.find(p => p.id === projectId)?.pending).not.toBe(true);
  expect(saved.projects.find(p => p.id === projectId)?.sales_status).toBe('ready_for_quotation');
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await expect(page.locator('nextjs-portal').filter({ hasText: /Runtime Error|Build Error/ })).toHaveCount(0);
});
