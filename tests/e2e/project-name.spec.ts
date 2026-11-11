import { expect, test } from '@playwright/test';
import enMessages from '../../messages/en.json';
import arMessages from '../../messages/ar.json';
import type { FieldProject, FieldState } from '../../src/lib/offline/types';
import { savedFieldState } from './helpers/fieldState';

test.use({
  serviceWorkers: 'block',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
});

const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Outdoor employee', role: 'Outdoor Sales' };
const projectId = '11111111-1111-4111-8111-111111111111';
const updatedAt = '2026-11-04T08:00:00Z';

for (const locale of ['en', 'ar'] as const) for (const path of ['/projects', '/project-log']) {
  test(`${locale}: Outdoor Sales cannot rename registered or assigned projects in ${path}`, async ({ page }) => {
    const messages = locale === 'ar' ? arMessages : enMessages;
    const terms: Record<string, string> = messages.terms;
    const tr = (value: string) => terms[value] ?? value;
    const project: FieldProject = {
      id: projectId, project_name: 'Registered customer villa', project_number: 'PRJ-RENAME',
      client_id: '99999999-9999-4999-8999-999999999999', client_name: 'Registered customer',
      created_by: actor.id, registeredBy: actor.name, assigned_outdoor_sales_id: actor.id,
      assignedOutdoorSales: actor.name, assignedToYou: true, structure_readiness: 'ready',
      branch: 'Karkh', sales_status: 'new_lead', address: 'Baghdad, Mansour', phone: '07700000000',
      next_follow_up_at: null, project_notes: 'Keep this note', created_at: updatedAt, updated_at: updatedAt,
    };
    const ownProject: FieldProject = {
      ...project, id: '22222222-2222-4222-8222-222222222222', project_name: 'Registered by me',
      project_number: 'PRJ-CREATOR', assigned_outdoor_sales_id: null, assignedToYou: false,
    };
    const assignedProject: FieldProject = {
      ...project, id: '55555555-5555-4555-8555-555555555555', project_name: 'Assigned by Indoor Sales',
      project_number: 'PRJ-ASSIGNED', created_by: 'indoor-employee', registeredBy: 'Indoor employee',
    };
    const historyProject: FieldProject = {
      ...project, id: '33333333-3333-4333-8333-333333333333', project_name: 'Previous visit history',
      project_number: 'PRJ-HISTORY', created_by: 'indoor-employee', assigned_outdoor_sales_id: 'different-employee',
      assignedToYou: false, project_log_only: true,
      measurement_attempts: [{ id: 'visit-history', projectId: '33333333-3333-4333-8333-333333333333', action: 'finish',
        note: 'Saved visit remains readable', recordedAt: updatedAt, recordedBy: actor.name }],
    };
    const state: FieldState = {
      actor, projects: [project, ownProject, assignedProject, historyProject], outdoorSales: [actor], indoorSales: [], queue: [], syncedAt: null,
      openings: [{ id: '44444444-4444-4444-8444-444444444444', projectId, floor: 'Ground floor', room: 'Bedroom', otherRoom: '', width: 1400, height: 1800, quantity: 2, structuralType: 'Window', openingType: 'Sliding' }],
    };
    const originalProjects = structuredClone(state.projects), originalOpenings = structuredClone(state.openings);
    const writes: string[] = [], errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => {
      localStorage.setItem('alumex_locale', value);
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => sessionStorage.getItem('name-permission-offline') !== '1' });
    }, locale);
    await page.route('**/api/**', route => {
      const request = route.request();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
        return route.fulfill({ status: 405, json: { error: 'Unexpected write blocked.' } });
      }
      if (request.url().includes('/api/notifications')) return route.fulfill({ json: { notifications: [], userId: actor.id } });
      return route.fulfill({ json: state });
    });
    await page.goto(`/offline?path=${path}`);
    await expect(page.getByRole('heading', { name: tr(path === '/projects' ? 'My projects' : 'Project log'), exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    for (const visible of [project, ownProject, assignedProject]) {
      const record = page.locator(`#project-${visible.id}`);
      await expect(record.getByRole('heading', { name: visible.project_name, exact: true })).toBeVisible();
      await expect(record.getByRole('button', { name: tr('Edit project name'), exact: true })).toHaveCount(0);
      await expect(record.getByRole('button', { name: tr('Edit client name'), exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole('form', { name: tr('Edit project name'), exact: true })).toHaveCount(0);
    await expect(page.getByRole('form', { name: tr('Edit client name'), exact: true })).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: tr('Outdoor Sales workspace'), exact: true });
    await expect(nav.getByRole('button', { name: tr('New project'), exact: true })).toBeEnabled();
    if (path === '/projects') {
      await expect(page.locator(`#project-${project.id}`).getByRole('link', { name: tr('Open project'), exact: true })).toHaveAttribute('href', `/initial-measurements/${project.id}`);
      await expect(page.locator(`#project-${historyProject.id}`)).toHaveCount(0);
    } else {
      await expect(page.locator(`#project-${assignedProject.id}`).getByRole('link', { name: tr('Record measurements'), exact: true })).toHaveAttribute('href', `/initial-measurements/${assignedProject.id}`);
      const history = page.locator(`#project-${historyProject.id}`);
      await history.locator('summary').click();
      await expect(history.getByText('Saved visit remains readable', { exact: true })).toBeVisible();
      await expect(history.getByRole('button', { name: tr('Edit project name'), exact: true })).toHaveCount(0);
    }
    const filters = page.getByRole('region', { name: tr('Project filters'), exact: true });
    await filters.getByRole('searchbox').fill('Assigned by Indoor Sales');
    await expect(page.locator('article')).toHaveCount(1);
    await filters.getByRole('button', { name: tr('Clear filters'), exact: true }).click();
    await expect(page.locator('article')).toHaveCount(path === '/projects' ? 3 : 4);

    await page.evaluate(() => { sessionStorage.setItem('name-permission-offline', '1'); window.dispatchEvent(new Event('offline')); });
    await page.reload();
    await expect(page.locator(`#project-${project.id}`).getByRole('heading', { name: project.project_name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: tr('Edit project name'), exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: tr('Edit client name'), exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${locale}-${path.slice(1)}-names-read-only.png`), fullPage: true });
    const saved = await savedFieldState(page);
    expect(saved.queue).toEqual([]);
    expect(saved.openings).toEqual(originalOpenings);
    expect(saved.projects).toEqual(originalProjects);

    // Registration remains available; this is a new record, never a rename of
    // any existing project. Do not submit or create a business fixture here.
    await nav.getByRole('button', { name: tr('New project'), exact: true }).click();
    await expect(page.getByRole('heading', { name: messages.registration.title, exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: messages.mobileIntake.name, exact: true })).toBeEditable();
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}
