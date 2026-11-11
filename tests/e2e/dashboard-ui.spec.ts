import { expect, test, type Locator, type Page } from '@playwright/test';
import enMessages from '../../messages/en.json';
import arMessages from '../../messages/ar.json';
import type { FieldProject, FieldState } from '../../src/lib/offline/types';

type Locale = 'en' | 'ar';
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ranaId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const aliId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac';
const targetName = 'مشروع المنصور السكني Al-Mansour Residence — واجهات الألمنيوم والزجاج';
const artifactDir = 'artifacts/dashboard-ui-20261111';
const stageCases = [
  { id: 'site', label: 'Awaiting site readiness', sales_status: 'new_lead', structure_readiness: 'not_ready' },
  { id: 'measurement-delayed', label: 'Visit needs rescheduling', sales_status: 'new_lead', measurement_delayed: true },
  { id: 'measurements', label: 'Initial measurements', sales_status: 'new_lead', pending: true },
  { id: 'quotation-preparation', label: 'Ready for quotation', sales_status: 'ready_for_quotation' },
  { id: 'quotation-response', label: 'Quotation awaiting response', sales_status: 'quotation_in_progress' },
  { id: 'contract-preparation', label: 'Quotation approved', sales_status: 'quotation_approved' },
  { id: 'contract-signature', label: 'Contract awaiting signature', sales_status: 'contract_generated' },
  { id: 'handoff', label: 'Signed · Operations handoff', sales_status: 'contract_signed' },
  { id: 'operations', label: 'Operations started', sales_status: 'transferred_to_operations', status: 'Production' },
  { id: 'client-cancelled', label: 'Cancelled by client', sales_status: 'cancelled', client_cancelled_at: '2026-11-01T09:00:00Z' },
  { id: 'closed', label: 'Closed', sales_status: 'closed' },
] as const;

function term(locale: Locale, value: string) {
  const terms: Record<string, string> = (locale === 'ar' ? arMessages : enMessages).terms;
  return terms[value] ?? value;
}

function fixture(role = 'Admin'): FieldState {
  const actor = { id: actorId, name: 'Dashboard QA', role, branch: 'Karkh' as const };
  const projects: FieldProject[] = stageCases.map((stage, index) => ({
    structure_readiness: 'ready',
    ...stage,
    id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`,
    project_name: index === 4 ? targetName : `${stage.label} · مشروع ${index + 1}`,
    project_number: `PRJ-UI-${String(index + 1).padStart(4, '0')}`,
    branch: 'Karkh',
    address: 'بغداد، المنصور · Baghdad, Al-Mansour, Building 42',
    phone: '07701234567',
    created_at: index % 2 ? '2026-10-10T09:00:00Z' : '2026-11-01T09:00:00Z',
    updated_at: '2026-11-10T09:00:00Z',
    created_by: index % 2 ? aliId : ranaId,
    registeredBy: index % 2 ? 'علي Ali' : 'رنا Rana',
    assigned_outdoor_sales_id: aliId,
    assignedOutdoorSales: 'علي Ali',
    follow_up_owner_id: actorId,
    followUpOwner: 'Dashboard QA',
    next_follow_up_at: index === 4 ? '2026-11-10T09:00:00Z' : null,
    project_notes: 'Latest follow-up note محفوظة للاختبار',
  }));
  projects.push(...[
    ['Office Annex', '2026-11-02T09:00:00Z', ranaId, 'رنا Rana', '2026-11-12T09:00:00Z'],
    ['Old showroom', '2026-10-02T09:00:00Z', ranaId, 'رنا Rana', '2026-11-09T09:00:00Z'],
    ['Riverside tower', '2026-11-03T09:00:00Z', aliId, 'علي Ali', null],
  ].map(([project_name, created_at, created_by, registeredBy, next_follow_up_at], index) => ({
    ...projects[4], id: `cccccccc-cccc-4ccc-8ccc-${String(index).padStart(12, '0')}`,
    project_name: project_name!, project_number: `PRJ-UI-EXTRA-${index + 1}`,
    created_at: created_at!, created_by: created_by!, registeredBy: registeredBy!, next_follow_up_at,
  })));
  return { actor, projects, indoorSales: [actor], outdoorSales: [{ id: aliId, name: 'علي Ali' }], queue: [], openings: [], syncedAt: '2026-11-11T09:00:00Z' };
}

async function saveState(page: Page, state: FieldState) {
  await page.evaluate(async saved => {
    localStorage.setItem('alumex-field-active', saved.actor.id);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('alumex-field-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('accounts');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('accounts', 'readwrite');
        transaction.objectStore('accounts').put(saved, saved.actor.id);
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
    window.dispatchEvent(new Event('field-change'));
  }, state);
}

async function dashboard(page: Page, locale: Locale, role = 'Admin', deleteFailure = false) {
  const state = fixture(role);
  const errors: string[] = [];
  const mutations: { path: string; method: string; body: unknown }[] = [];
  const coverageReads: string[] = [];
  const historyReads: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-11T09:00:00Z'));
  await page.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      mutations.push({ path, method: request.method(), body: request.postDataJSON() });
      if (path === '/api/workspace' && request.method() === 'DELETE') {
        if (deleteFailure) return route.fulfill({ status: 409, json: { error: 'Unable to delete this project. Refresh and try again.' } });
        const { projectId } = request.postDataJSON();
        state.projects = state.projects.filter(project => project.id !== projectId);
        return route.fulfill({ json: { ok: true, cleanupPending: false } });
      }
      return route.fulfill({ status: 405, json: { error: 'Dashboard QA blocks unplanned writes.' } });
    }
    if (path === '/api/outdoor-sales-coverage') {
      coverageReads.push(path);
      return route.fulfill({ json: { asOf: '2026-11-11T09:00:00Z', staff: [
        { id: ranaId, name: 'رنا Rana', branch: 'Karkh' }, { id: aliId, name: 'علي Ali', branch: 'Rasafa' },
      ] } });
    }
    if (path.endsWith('/follow-ups')) {
      historyReads.push(path);
      const project = state.projects.find(item => path.includes(item.id));
      return route.fulfill({ json: { project, entries: [{
        id: 'history-qa', action: 'follow-up', note: 'Customer called · تم التواصل مع العميل',
        recordedAt: '2026-11-10T09:00:00Z', recordedBy: 'Dashboard QA', followUpType: 'call',
        followUpOwner: 'Dashboard QA', nextFollowUp: project?.next_follow_up_at ?? null,
      }] } });
    }
    if (path === '/api/workspace' || path === '/api/offline') return route.fulfill({ json: state });
    return route.fulfill({ status: 503, json: { error: 'Isolated dashboard QA fixture' } });
  });
  await page.goto('/offline?path=/dashboard');
  await saveState(page, state);
  await expect(page.getByRole('heading', { name: targetName, exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  const filters = page.getByRole('region', { name: term(locale, 'Project filters'), exact: true });
  const overview = page.getByRole('region', { name: term(locale, 'Project overview'), exact: true });
  const stages = page.getByRole('region', { name: term(locale, 'Filter by project stage'), exact: true });
  const projects = page.getByRole('region', { name: term(locale, 'Projects'), exact: true });
  return { state, filters, overview, stages, projects, errors, mutations, coverageReads, historyReads };
}

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }))).toEqual({ viewport: page.viewportSize()!.width, content: page.viewportSize()!.width });
}

async function assertInsideViewport(locator: Locator, page: Page) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}

for (const locale of ['en', 'ar'] as const) test(`${locale}: dashboard layout, combined filters, stages, disclosures and action routes`, async ({ page }, testInfo) => {
  const { state, filters, overview, stages, projects, errors, mutations, coverageReads, historyReads } = await dashboard(page, locale);
  const tr = (value: string) => term(locale, value);
  const panel = filters.locator('details');
  const summary = panel.locator('summary');
  const stage = filters.getByRole('combobox', { name: tr('Project stage'), exact: true });
  const priority = filters.getByRole('combobox', { name: tr('Project priority'), exact: true });
  const month = filters.getByRole('combobox', { name: tr('Created month'), exact: true });
  const creator = filters.getByRole('combobox', { name: tr('Created by'), exact: true });
  const search = filters.getByRole('searchbox');
  await expect(search).toBeVisible();
  await expect(stage).toBeHidden();
  await expect(overview.getByRole('button')).toHaveCount(4);
  const overviewBounds = await overview.boundingBox();
  expect(overviewBounds!.y + overviewBounds!.height).toBeLessThanOrEqual((await filters.boundingBox())!.y);
  await expect(projects.locator('article')).toHaveCount(14);
  await expect(stages.getByRole('button', { name: new RegExp(tr('Quotation awaiting response')) })).toContainText('4');
  for (const item of stageCases) await expect(stages.getByRole('button', { name: new RegExp(tr(item.label)) })).toBeVisible();
  await expect.poll(() => coverageReads.length).toBeGreaterThan(0);
  const coverage = page.locator('details').filter({ has: page.locator('#outdoor-sales-coverage-title') });
  await expect(coverage).toHaveCount(1);
  await expect(coverage).not.toHaveAttribute('open');
  await coverage.locator('summary').click();
  await expect(page.locator('#outdoor-sales-coverage-title')).toBeVisible();
  await coverage.locator('summary').click();

  await page.locator('h1').evaluate(element => element.scrollIntoView({ block: 'start' }));
  await documentFontsReady(page);
  await page.screenshot({ path: `${artifactDir}/${testInfo.project.name}-${locale}-overview.png` });
  const dashboardSection = page.locator('h1').locator('xpath=ancestor::section[1]');
  const font = await dashboardSection.evaluate(element => getComputedStyle(element).fontFamily);
  if (locale === 'ar') {
    expect(font.toLowerCase()).toContain('arabic');
    expect(await page.evaluate(() => [...document.fonts].some(face => face.family.toLowerCase().includes('arabic') && face.status === 'loaded'))).toBe(true);
    // The new font belongs to the dashboard only; shared shell typography stays intact.
    expect((await page.locator('body > div').first().evaluate(element => getComputedStyle(element).fontFamily)).toLowerCase()).not.toContain('noto sans arabic');
  } else expect(font.toLowerCase()).not.toContain('arabic');
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  for (const width of [375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await assertNoOverflow(page);
    await assertInsideViewport(search, page);
    await assertInsideViewport(projects.locator('article').first(), page);
  }
  await page.setViewportSize(testInfo.project.name === 'desktop' ? { width: 1440, height: 1100 } : { width: 390, height: 1000 });
  if (testInfo.project.name === 'mobile') {
    expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const stageButton of await stages.getByRole('button', { pressed: false }).all()) expect((await stageButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }

  // Every stage retains the existing primary action route, including the
  // leadership Operations handoff and the cancelled/closed record routes.
  const expectedRoutes = [
    `/mini-crm#project-${state.projects[0].id}`, `/mini-crm#project-${state.projects[1].id}`,
    `/initial-measurements/${state.projects[2].id}`, `/quotation/${state.projects[3].id}`,
    `/quotation/${state.projects[4].id}`, `/quotation/${state.projects[5].id}`,
    `/contract/${state.projects[6].id}`, '/operations', '/operations',
    `/projects#project-${state.projects[9].id}`, `/projects/${state.projects[10].id}/follow-ups`,
  ];
  for (let index = 0; index < expectedRoutes.length; index++) {
    await expect(projects.locator('article').nth(index).getByRole('heading').getByRole('link')).toHaveAttribute('href', expectedRoutes[index]);
  }
  const target = projects.getByRole('article', { name: targetName, exact: true });
  await target.screenshot({ path: `${artifactDir}/${testInfo.project.name}-${locale}-project.png` });
  await expect(target.getByRole('link', { name: tr('Follow up'), exact: true })).toHaveAttribute('href', `/mini-crm#project-${state.projects[4].id}`);
  await expect(target.getByRole('button', { name: tr('Delete project'), exact: true })).toBeEnabled();
  await expect(projects.locator('article').nth(2).getByRole('button', { name: tr('Delete project'), exact: true })).toBeDisabled();
  page.once('dialog', dialog => void dialog.dismiss());
  await target.getByRole('button', { name: tr('Delete project'), exact: true }).click();
  expect(mutations).toEqual([]);

  await summary.click();
  await search.fill('Al-Mansour');
  await stage.selectOption('quotation-response');
  await priority.selectOption('overdue');
  await month.selectOption('2026-11');
  await creator.selectOption(ranaId);
  await expect(projects.locator('article')).toHaveCount(1);
  await expect(target).toBeVisible();
  await summary.click();
  await expect(search).toBeVisible();
  await expect(stage).toBeHidden();
  await expect(projects.locator('article')).toHaveCount(1);
  await summary.click();
  await expect(stage).toHaveValue('quotation-response');
  await expect(priority).toHaveValue('overdue');
  await expect(month).toHaveValue('2026-11');
  await expect(creator).toHaveValue(ranaId);
  await expect(search).toHaveValue('Al-Mansour');
  await filters.screenshot({ path: `${artifactDir}/${testInfo.project.name}-${locale}-filters.png` });
  await filters.getByRole('button', { name: tr('Clear filters'), exact: true }).click();
  await expect(stage).toHaveValue('all');
  await expect(priority).toHaveValue('all');
  await expect(month).toHaveValue('');
  await expect(creator).toHaveValue('');
  await expect(search).toHaveValue('');
  await expect(projects.locator('article')).toHaveCount(14);

  const quotationStage = stages.getByRole('button', { name: new RegExp(tr('Quotation awaiting response')) });
  await quotationStage.click();
  await expect(quotationStage).toHaveAttribute('aria-pressed', 'true');
  await expect(stage).toHaveValue('quotation-response');
  await expect(projects.locator('article')).toHaveCount(4);
  await quotationStage.click();
  await expect(stage).toHaveValue('all');
  await expect(projects.locator('article')).toHaveCount(14);
  await overview.getByRole('button', { name: new RegExp(tr('Overdue follow-ups')) }).click();
  await expect(priority).toHaveValue('overdue');
  await expect(projects.locator('article')).toHaveCount(2);
  await quotationStage.click();
  await expect(priority).toHaveValue('all');
  await expect(projects.locator('article')).toHaveCount(4);
  await overview.getByRole('button', { name: new RegExp(tr('Signed / Operations')) }).click();
  await expect(stage).toHaveValue('all');
  await expect(priority).toHaveValue('operations');
  await expect(projects.locator('article')).toHaveCount(2);
  await filters.getByRole('button', { name: tr('Clear filters'), exact: true }).click();

  const details = target.getByRole('button', { name: tr('Project details'), exact: true });
  await details.click();
  await expect(details).toHaveAttribute('aria-expanded', 'true');
  await expect(target.getByRole('link', { name: '07701234567', exact: true })).toHaveAttribute('href', 'tel:07701234567');
  await expect(target.getByRole('link', { name: '07701234567', exact: true })).toHaveAttribute('dir', 'ltr');
  await summary.click();
  await summary.click();
  await expect(details).toHaveAttribute('aria-expanded', 'true');
  state.projects[4] = { ...state.projects[4], address: 'Refreshed address · العنوان المحدث', updated_at: '2026-11-11T09:01:00Z' };
  await saveState(page, state);
  await expect(target.getByText('Refreshed address · العنوان المحدث', { exact: true })).toBeVisible();
  await expect(details).toHaveAttribute('aria-expanded', 'true');
  const history = target.getByRole('button', { name: tr('Follow-up history'), exact: true });
  await history.click();
  await expect(history).toHaveAttribute('aria-expanded', 'true');
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await expect(target.getByText('Customer called · تم التواصل مع العميل', { exact: true })).toBeVisible();
  expect(historyReads.length).toBeGreaterThan(0);
  await summary.click();
  await summary.click();
  state.projects[4] = { ...state.projects[4], updated_at: '2026-11-11T09:02:00Z' };
  await saveState(page, state);
  await expect(history).toHaveAttribute('aria-expanded', 'true');
  await expect(target.getByRole('button', { name: tr('Print follow-ups'), exact: true })).toBeEnabled();
  await assertNoOverflow(page);
  await target.screenshot({ path: `${artifactDir}/${testInfo.project.name}-${locale}-history.png` });
  expect(errors).toEqual([]);
  expect(mutations).toEqual([]);
});

async function documentFontsReady(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

for (const role of ['CEO', 'Indoor Sales']) test(`${role}: leadership coverage and project actions retain permission rules`, async ({ page }) => {
  const { state, projects, coverageReads, errors, mutations } = await dashboard(page, 'en', role);
  await expect(projects.getByRole('button', { name: 'Delete project', exact: true })).toHaveCount(0);
  const coverage = page.locator('details').filter({ has: page.locator('#outdoor-sales-coverage-title') });
  if (role === 'CEO') {
    await expect(coverage).toHaveCount(1);
    await expect(coverage).not.toHaveAttribute('open');
    await expect.poll(() => coverageReads.length).toBeGreaterThan(0);
    await coverage.locator('summary').click();
    await expect(page.locator('#outdoor-sales-coverage-title')).toBeVisible();
    await expect(projects.locator('article').nth(7).getByRole('heading').getByRole('link')).toHaveAttribute('href', '/operations');
  } else {
    await expect(coverage).toHaveCount(0);
    expect(coverageReads).toEqual([]);
    await expect(projects.locator('article').nth(7).getByRole('heading').getByRole('link')).toHaveAttribute('href', `/contract/${state.projects[7].id}`);
  }
  expect(errors).toEqual([]);
  expect(mutations).toEqual([]);
});

test('Admin: mocked deletion failures preserve the project, successful deletion updates counts', async ({ page }) => {
  const first = await dashboard(page, 'en', 'Admin', true);
  const row = first.projects.getByRole('article', { name: targetName, exact: true });
  page.once('dialog', dialog => void dialog.accept());
  await row.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to delete this project.' })).toBeVisible();
  await expect(row).toBeVisible();
  expect(first.mutations).toEqual([{ path: '/api/workspace', method: 'DELETE', body: { projectId: first.state.projects[4].id, confirmed: true } }]);
  // All network mutations are intercepted by this isolated fixture.
  await page.unroute('**/api/**');
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/workspace' && route.request().method() === 'DELETE') {
      first.state.projects = first.state.projects.filter(project => project.id !== first.state.projects[4].id);
      return route.fulfill({ json: { ok: true, cleanupPending: false } });
    }
    return route.fulfill({ json: path === '/api/outdoor-sales-coverage' ? { asOf: '2026-11-11T09:00:00Z', staff: [] } : first.state });
  });
  page.once('dialog', dialog => void dialog.accept());
  await row.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(first.projects.locator('article')).toHaveCount(13);
  await expect(first.overview.getByRole('button', { name: /Total projects/ })).toContainText('13');
  expect(first.errors).toEqual([]);
});
