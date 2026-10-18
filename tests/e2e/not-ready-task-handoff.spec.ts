import { expect, test } from '@playwright/test';
import { savedFieldState } from './helpers/fieldState';
import type { FieldChange, FieldState } from '../../src/lib/offline/types';

test.use({ serviceWorkers: 'block' });

for (const locale of ['en', 'ar']) for (const offline of [false, true]) test(`${locale}: not-ready registration ${offline ? 'offline' : 'online'} stays out of tasks until CRM assignment`, async ({ page }) => {
  const outdoor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Outdoor employee', role: 'Outdoor Sales' };
  const indoor = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Indoor employee', role: 'Indoor Sales', branch: 'Karkh' as const };
  const state: FieldState = { actor: outdoor, projects: [], openings: [], queue: [], syncedAt: null, outdoorSales: [outdoor], indoorSales: [indoor] };
  const writes: FieldChange[] = [];
  await page.addInitScript(locale => localStorage.setItem('alumex_locale', locale), locale);
  await page.route('**/api/**', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: state });
    const change = route.request().postDataJSON() as FieldChange;
    writes.push(change);
    // Mirror persistence from the queued operation, retaining readiness and assignment.
    state.projects = (await savedFieldState(page)).projects.map(project => ({ ...project, project_number: 'PRJ-CRM', pending: false }));
    return route.fulfill({ json: { project: state.projects.find(project => project.id === change.projectId) } });
  });
  await page.goto('/offline?path=/intake');
  await page.locator('input[name="buildingType"][value="villa_house"]').check();
  await page.locator('input[autocomplete="name"]').fill('Waiting for CRM');
  await page.locator('input[type="tel"]').fill('07700000000');
  await expect(page.locator('input[name="readiness"]:checked')).toHaveCount(0);
  if (offline) {
    await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')); });
    await page.locator('input[autocomplete="street-address"]').fill('Baghdad, Mansour');
  } else {
    await page.getByRole('button', { name: locale === 'en' ? 'Project location map' : 'خريطة موقع المشروع', exact: true }).click({ position: { x: 80, y: 80 } });
  }
  await page.getByRole('button', { name: locale === 'en' ? /Save registration/ : /حفظ التسجيل/ }).click();
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  expect((await savedFieldState(page)).projects).toHaveLength(0);
  await page.locator('input[value="not_ready"]').check();
  await page.locator('#readiness-note').fill('Walls unfinished');
  await page.getByRole('button', { name: locale === 'en' ? /Save registration/ : /حفظ التسجيل/ }).click();
  await expect(page.getByRole('heading', { name: locale === 'en' ? 'Registration saved' : 'تم حفظ التسجيل', exact: true })).toBeVisible();
  expect((await savedFieldState(page)).projects[0]).toMatchObject({structure_readiness:'not_ready',assigned_outdoor_sales_id:null});
  const nav = page.getByRole('navigation', { name: locale === 'en' ? 'Outdoor Sales workspace' : 'مساحة عمل المبيعات الخارجية' });
  await nav.getByRole('button', { name: locale === 'en' ? 'Measurement assignments' : 'مهام القياسات', exact: true }).click();
  await expect(page.getByRole('heading', { name: locale === 'en' ? 'Measurement assignments' : 'مهام القياسات', exact: true })).toBeVisible();
  await expect(page.getByText('Waiting for CRM', { exact: true })).toHaveCount(0);
  await expect(nav.getByRole('status')).toHaveCount(0);
  if (offline) {
    expect(writes).toHaveLength(0);
    expect((await savedFieldState(page)).queue).toHaveLength(1);
    await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); window.dispatchEvent(new Event('online')); });
  }
  await expect.poll(async () => (await savedFieldState(page)).queue.length).toBe(0);
  expect(writes).toHaveLength(1);
  const unassigned={...state.projects[0],id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',project_name:'Unassigned registration',structure_readiness:'ready'};
  state.projects.push(unassigned);
  await page.reload();
  await expect(page.getByText('Unassigned registration',{exact:true})).toHaveCount(0);
  await expect(page.getByText(locale === 'en' ? 'No measurement tasks waiting.' : 'لا توجد مهام قياسات بانتظار التنفيذ.', { exact: true })).toBeVisible();
  await expect(page.getByText('Waiting for CRM', { exact: true })).toHaveCount(0);

  // Indoor Sales performs the real CRM action; registration itself does not assign a task.
  state.actor = indoor;
  await page.goto('/offline?path=/mini-crm');
  const row = page.locator('article').filter({ hasText: 'Waiting for CRM' });
  await expect(row.getByText('Walls unfinished', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: locale === 'en' ? 'Assign measurements' : 'تعيين موظف للقياسات', exact: true }).click();
  const form = row.getByRole('form', { name: locale === 'en' ? 'Assign measurements' : 'تعيين موظف للقياسات', exact: true });
  await form.getByRole('combobox', { name: locale === 'en' ? 'Measurements by' : 'المسؤول عن القياسات', exact: true }).selectOption(outdoor.id);
  await form.getByRole('button', { name: locale === 'en' ? 'Assign & mark site ready' : 'تعيين الموظف وتأكيد جاهزية الموقع', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].action).toBe('ready');
  expect(writes[1].userId).toBe(indoor.id);
  expect(writes[1].payload.assignedOutdoorSalesId).toBe(outdoor.id);
  await expect.poll(async () => (await savedFieldState(page)).queue.length).toBe(0);
  state.actor = outdoor;
  await page.goto('/offline?path=/dashboard');
  await expect(page.getByRole('heading', { name: 'Waiting for CRM', exact: true })).toBeVisible();
  await expect(nav.getByRole('status')).toHaveText(locale === 'en' ? '1' : '١');
  await page.screenshot({ path: test.info().outputPath('crm-assigned-task.png'), fullPage: true });
});
