import { expect, test, type Page } from '@playwright/test';
import type { FieldActor, FieldChange, FieldProject, FieldState } from '../../src/lib/offline/types';
import { savedFieldState } from './helpers/fieldState';

test.use({
  serviceWorkers: 'block',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
});

const employees = [
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Ali Ammar' },
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Mohammad Ahmad' },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Sajjad' },
  { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Ehab' },
];
const stamp = '2026-11-04T08:00:00Z';

function project(index: number, patch: Partial<FieldProject> = {}): FieldProject {
  return {
    id: `${index + 1}1111111-1111-4111-8111-111111111111`, project_name: `${employees[index].name} assignment`,
    project_number: `PRJ-TEAM-${index}`, created_by: 'indoor', registeredBy: 'Indoor employee',
    assigned_outdoor_sales_id: employees[index].id, assignedOutdoorSales: employees[index].name,
    structure_readiness: 'ready', sales_status: 'new_lead', address: 'Baghdad, Mansour', phone: '07700000000',
    next_follow_up_at: null, project_notes: 'Keep the project note', created_at: stamp, updated_at: stamp, ...patch,
  };
}

async function mockWorkspace(page: Page, state: FieldState, locale: string) {
  const writes: FieldChange[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(locale => {
    localStorage.setItem('alumex_locale', locale);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => sessionStorage.getItem('team-test-offline') !== '1' });
  }, locale);
  await page.route('**/api/**', async route => {
    const request = route.request();
    if (request.url().includes('/api/notifications')) return route.fulfill({ json: { notifications: [], userId: state.actor.id } });
    if (request.method() === 'POST') {
      const change = request.postDataJSON() as FieldChange;
      writes.push(change);
      const current = state.projects.find(project => project.id === change.projectId)!;
      if (change.action === 'rename-project') current.project_name = String(change.payload.projectName);
      if (change.action === 'reopen') current.sales_status = 'new_lead';
      if (change.action === 'edit-opening') {
        const opening = change.payload.opening as FieldState['openings'][number];
        state.openings = state.openings.map(saved => saved.id === opening.id ? { ...saved, ...opening } : saved);
      }
      current.updated_at = change.recordedAt;
      return route.fulfill({ json: { project: current } });
    }
    return route.fulfill({ json: state });
  });
  return { writes, errors };
}

for (let index = 0; index < employees.length; index++) test(`${employees[index].name} sees their teammate's assignments and My projects without another team's tasks`, async ({ page }) => {
  const teammateIndex = index % 2 === 0 ? index + 1 : index - 1;
  const actor = { ...employees[index], role: 'Outdoor Sales', outdoorTeamMemberIds: [employees[index].id, employees[teammateIndex].id] };
  const projects = employees.map((_, index) => project(index));
  const state: FieldState = { actor, projects, openings: [], queue: [], syncedAt: null, outdoorSales: employees, indoorSales: [] };
  const { errors } = await mockWorkspace(page, state, 'en');
  await page.goto('/offline?path=/dashboard');
  await expect(page.getByRole('heading', { name: 'Measurement assignments', exact: true })).toBeVisible();
  const ownTeam = [index, teammateIndex];
  for (let projectIndex = 0; projectIndex < projects.length; projectIndex++) {
    await expect(page.getByRole('heading', { name: projects[projectIndex].project_name, exact: true })).toHaveCount(ownTeam.includes(projectIndex) ? 1 : 0);
  }
  const nav = page.getByRole('navigation', { name: 'Outdoor Sales workspace', exact: true });
  await nav.getByRole('button', { name: 'My projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My projects', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/path=%2Fprojects/);
  for (let projectIndex = 0; projectIndex < projects.length; projectIndex++) {
    await expect(page.getByRole('heading', { name: projects[projectIndex].project_name, exact: true })).toHaveCount(ownTeam.includes(projectIndex) ? 1 : 0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: My projects shares measurement tasks while editing only the employee's own openings offline`, async ({ page }) => {
  const labels = locale === 'en' ? {
    projects: 'My projects', open: 'Open project', back: 'Back to my projects', editName: 'Edit project name',
    projectName: 'Project name', saveName: 'Save changes', reopen: 'Reopen measurements', editOpening: 'Edit opening 1',
    editForm: 'Edit opening measurements', width: 'Width (cm)', saveOpening: 'Save measurement changes',
  } : {
    projects: 'مشاريعي', open: 'فتح المشروع', back: 'العودة إلى مشاريعي', editName: 'تعديل اسم المشروع',
    projectName: 'اسم المشروع', saveName: 'حفظ التغييرات', reopen: 'إعادة فتح القياسات', editOpening: 'تعديل الفتحة 1',
    editForm: 'تعديل قياسات الفتحة', width: 'العرض (سم)', saveOpening: 'حفظ تعديلات القياسات',
  };
  const actor: FieldActor = { ...employees[3], role: 'Outdoor Sales', outdoorTeamMemberIds: [employees[2].id, employees[3].id] };
  const measured = project(2, { sales_status: 'ready_for_quotation', building_type: 'commercial_building' });
  const locked = project(3, { sales_status: 'quotation_in_progress', project_name: 'Quoted team project' });
  const history = project(0, { project_log_only: true, project_name: 'Reference-only visit' });
  const opening: FieldState['openings'][number] = {
    id: '55555555-5555-4555-8555-555555555555', projectId: measured.id, floor: 'GF', room: 'Bedroom', otherRoom: '',
    width: 140, height: 180, quantity: 2, structuralType: 'Window' as const, openingType: 'Sliding', hasArch: false, hasRollerShutter: false, workArea: 'internal', createdBy: actor.id,
  };
  const teammateOpening = { ...opening, id: '66666666-6666-4666-8666-666666666666', createdBy: employees[2].id, width: 210 };
  const legacyOpening = { ...opening, id: '77777777-7777-4777-8777-777777777777', createdBy: null, width: 225 };
  const facade: FieldState['openings'][number] = { ...opening, id: '88888888-8888-4888-8888-888888888888', structuralType: 'Facade', openingType: null, workArea: 'facade', facadeNumber: 1, floor: 'Whole building', room: 'Other', otherRoom: 'Facade 1', quantity: 1 };
  const teammateFacade = { ...facade, id: '99999999-9999-4999-8999-999999999999', facadeNumber: 2, otherRoom: 'Facade 2', createdBy: employees[2].id };
  const state: FieldState = { actor, projects: [measured, locked, history], openings: [opening, teammateOpening, legacyOpening, facade, teammateFacade], queue: [], syncedAt: null, outdoorSales: employees, indoorSales: [] };
  const { writes, errors } = await mockWorkspace(page, state, locale);
  await page.goto('/offline?path=/projects');
  await expect(page.getByRole('heading', { name: labels.projects, exact: true })).toBeVisible();
  await expect(page.getByText(history.project_name, { exact: true })).toHaveCount(0);
  const card = page.locator(`#project-${measured.id}`);
  await card.getByRole('link', { name: labels.open, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`path=%2Finitial-measurements%2F${measured.id}`));
  await expect(page.getByRole('button', { name: labels.reopen, exact: true })).toBeVisible();
  await page.evaluate(() => { sessionStorage.setItem('team-test-offline', '1'); window.dispatchEvent(new Event('offline')); });
  await expect(page.getByRole('button', { name: labels.editName, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: labels.reopen, exact: true }).click();
  await expect(page.getByRole('button', { name: locale === 'en' ? 'Edit opening 2' : 'تعديل الفتحة 2', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: locale === 'en' ? 'Edit opening 3' : 'تعديل الفتحة 3', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: locale === 'en' ? 'Edit facade 1' : 'تعديل واجهة 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: locale === 'en' ? 'Edit facade 2' : 'تعديل واجهة 2', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: labels.editOpening, exact: true }).click();
  const editForm = page.getByRole('form', { name: labels.editForm, exact: true });
  await editForm.getByRole('spinbutton', { name: labels.width, exact: true }).fill('155');
  await editForm.getByRole('button', { name: labels.saveOpening, exact: true }).click();
  await expect(editForm).toHaveCount(0);
  let saved = await savedFieldState(page);
  expect(saved.queue.map(change => change.action)).toEqual(['reopen', 'edit-opening']);
  expect(saved.openings.find(saved => saved.id === opening.id)).toMatchObject({ width: 155, height: 180, quantity: 2, createdBy: actor.id });
  expect(saved.projects.find(project => project.id === measured.id)).toMatchObject({ project_name: measured.project_name, sales_status: 'new_lead', project_notes: 'Keep the project note' });
  expect(writes).toHaveLength(0);
  await page.reload();
  await expect(page.getByText(new RegExp(measured.project_name))).toBeVisible();
  saved = await savedFieldState(page);
  expect(saved.queue).toHaveLength(2);
  expect(saved.openings.find(saved => saved.id === teammateOpening.id)?.width).toBe(210);
  expect(saved.openings.find(saved => saved.id === legacyOpening.id)?.width).toBe(225);
  expect(saved.openings.find(saved => saved.id === opening.id)?.width).toBe(155);
  await page.screenshot({ path: test.info().outputPath(`team-project-${locale}-edited.png`), fullPage: true });
  await page.getByRole('link', { name: labels.back, exact: true }).click();
  await page.locator(`#project-${locked.id}`).getByRole('link', { name: labels.open, exact: true }).click();
  await expect(page.getByRole('button', { name: labels.reopen, exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
