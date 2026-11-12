import { devices, expect, test, type Page } from '@playwright/test';
import type { FieldProject, FieldState } from '../../src/lib/offline/types';

// The saved workspace accepts device browsers; vary viewport widths under that identity.
test.use({ serviceWorkers: 'block', userAgent: devices['Pixel 7'].userAgent });

const ali = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Ali' };
const rana = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Rana' };
const inactive = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Hamza' };
const indoorId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function project(index: number, values: Partial<FieldProject>): FieldProject {
  return {
    id: `11111111-1111-4111-8111-11111111111${index}`,
    project_number: `PRJ-OUTDOOR-${index}`,
    project_name: 'Project',
    address: 'Baghdad',
    phone: null,
    branch: 'Karkh',
    created_at: '2026-10-12T09:00:00Z',
    updated_at: '2026-11-12T09:00:00Z',
    created_by: indoorId,
    registeredBy: 'Fatma',
    original_creator_role: 'Indoor Sales',
    structure_readiness: 'ready',
    sales_status: 'new_lead',
    next_follow_up_at: null,
    project_notes: null,
    assigned_outdoor_sales_id: ali.id,
    assignedOutdoorSales: ali.name,
    ...values,
  };
}

const projects = [
  project(0, {
    project_name: 'Ali current', created_by: ali.id, registeredBy: ali.name, original_creator_role: 'Outdoor Sales',
    assigned_outdoor_sales_id: rana.id, assignedOutdoorSales: rana.name,
  }),
  project(1, {
    project_name: 'Ali legacy', created_at: '2026-09-02T09:00:00Z',
    legacy_outdoor_sales_id: ali.id, legacyOutdoorSalesOwner: ali.name,
    assigned_outdoor_sales_id: rana.id, assignedOutdoorSales: rana.name,
  }),
  project(2, {
    project_name: 'Rana house', created_by: rana.id, registeredBy: rana.name, original_creator_role: 'Outdoor Sales',
    created_at: '2026-10-18T09:00:00Z',
  }),
  project(3, { project_name: 'Indoor registration only', created_at: '2026-10-20T09:00:00Z' }),
  project(4, {
    project_name: 'Historical Hamza', created_at: '2026-08-01T09:00:00Z',
    legacy_outdoor_sales_id: inactive.id, legacyOutdoorSalesOwner: inactive.name,
  }),
];

const labels = {
  en: {
    region: 'Projects by Outdoor Sales', all: 'All salespeople', order: 'Registration date order',
    filters: 'Project filters', month: 'Created month', clear: 'Clear filters',
  },
  ar: {
    region: 'المشاريع حسب موظف المبيعات الخارجية', all: 'جميع موظفي المبيعات الخارجية', order: 'ترتيب تاريخ التسجيل',
    filters: 'تصفية المشاريع', month: 'شهر الإنشاء', clear: 'مسح عوامل التصفية',
  },
} as const;

async function setup(page: Page, path: string, locale: keyof typeof labels, role = 'Indoor Sales') {
  const actor = { id: indoorId, name: 'Fatma', role, branch: 'Karkh' as const };
  const state: FieldState = {
    actor, projects, queue: [], openings: [], syncedAt: null, indoorSales: [actor], outdoorSales: [ali, rana],
  };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(locale => {
    localStorage.setItem('alumex_locale', locale);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  }, locale);
  await page.route('**/api/**', route => new URL(route.request().url()).pathname === '/api/outdoor-sales-coverage'
    ? route.fulfill({ json: { asOf: '2026-11-12T09:00:00Z', staff: [] } })
    : route.fulfill({ status: 503, json: { error: 'Offline fixture' } }));
  await page.goto(`/offline?path=${encodeURIComponent(path)}`);
  await page.evaluate(async state => {
    localStorage.setItem('alumex-field-active', state.actor.id);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('alumex-field-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('accounts');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('accounts', 'readwrite');
        transaction.objectStore('accounts').put(state, state.actor.id);
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
    window.dispatchEvent(new Event('field-change'));
  }, state);
  await expect(page.getByRole('region', { name: labels[locale].region, exact: true })).toBeVisible();
  return errors;
}

function namedProject(page: Page, name: string) {
  return page.getByRole('heading', { name, exact: true });
}

for (const locale of ['en', 'ar'] as const) {
  for (const path of ['/dashboard', '/projects']) {
    test(`${locale} ${path}: salesperson credit, dates, order and reset`, async ({ page }, testInfo) => {
      const errors = await setup(page, path, locale);
      const filter = page.getByRole('region', { name: labels[locale].region, exact: true });
      const aliButton = filter.getByRole('button', { name: ali.name, exact: true });
      await expect(aliButton).toContainText('2');
      await expect(filter.getByRole('button', { name: inactive.name, exact: true })).toBeVisible();
      await aliButton.click();
      await expect(aliButton).toHaveAttribute('aria-pressed', 'true');
      await expect(namedProject(page, 'Ali current')).toBeVisible();
      await expect(namedProject(page, 'Ali legacy')).toBeVisible();
      for (const name of ['Rana house', 'Indoor registration only', 'Historical Hamza']) {
        await expect(namedProject(page, name)).toHaveCount(0);
      }
      // Registration dates stay visible without opening project details.
      await expect(page.locator(`time[datetime="${projects[0].created_at}"]`).first()).toBeVisible();
      await expect(page.locator(`time[datetime="${projects[0].created_at}"]`).first()).toHaveText('12/10/2026, 12:00');
      await expect(page.locator(`time[datetime="${projects[1].created_at}"]`).first()).toBeVisible();

      const visibleNames = page.getByRole('heading', { name: /^Ali (current|legacy)$/ });
      await expect(visibleNames).toHaveText(['Ali current', 'Ali legacy']);
      await filter.getByRole('combobox', { name: labels[locale].order, exact: true }).selectOption('oldest');
      await expect(visibleNames).toHaveText(['Ali legacy', 'Ali current']);
      await filter.getByRole('combobox', { name: labels[locale].order, exact: true }).selectOption('newest');
      await expect(visibleNames).toHaveText(['Ali current', 'Ali legacy']);

      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      if (testInfo.project.name === 'mobile-chromium') {
        await page.setViewportSize({ width: 390, height: 900 });
        await filter.screenshot({ path: `artifacts/outdoor-project-filter-20261112/${locale}-${path.slice(1)}.png` });
      }

      await filter.getByRole('button', { name: rana.name, exact: true }).click();
      await expect(namedProject(page, 'Rana house')).toBeVisible();
      await expect(namedProject(page, 'Ali current')).toHaveCount(0);
      await expect(namedProject(page, 'Ali legacy')).toHaveCount(0);
      await filter.getByRole('button', { name: labels[locale].all, exact: true }).click();
      for (const project of projects) await expect(namedProject(page, project.project_name)).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test(`${locale} dashboard: salesperson combines with month and search and clears`, async ({ page }) => {
    const errors = await setup(page, '/dashboard', locale);
    const outdoorFilter = page.getByRole('region', { name: labels[locale].region, exact: true });
    await outdoorFilter.getByRole('button', { name: ali.name, exact: true }).click();
    const projectFilters = page.getByRole('region', { name: labels[locale].filters, exact: true });
    await projectFilters.locator('summary').click();
    await projectFilters.getByRole('combobox', { name: labels[locale].month, exact: true }).selectOption('2026-10');
    await expect(namedProject(page, 'Ali current')).toBeVisible();
    await expect(namedProject(page, 'Ali legacy')).toHaveCount(0);
    await expect(namedProject(page, 'Rana house')).toHaveCount(0);
    await page.getByRole('searchbox').fill('legacy');
    await expect(namedProject(page, 'Ali current')).toHaveCount(0);
    await expect(namedProject(page, 'Ali legacy')).toHaveCount(0);
    await projectFilters.getByRole('button').click();
    await expect(outdoorFilter.getByRole('button', { name: labels[locale].all, exact: true })).toHaveAttribute('aria-pressed', 'true');
    for (const project of projects) await expect(namedProject(page, project.project_name)).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const role of ['Admin', 'Sales Manager']) {
  test(`${role}: outdoor salesperson filtering is available on the dashboard`, async ({ page }) => {
    const errors = await setup(page, '/dashboard', 'en', role);
    const filter = page.getByRole('region', { name: labels.en.region, exact: true });
    await filter.getByRole('button', { name: ali.name, exact: true }).click();
    await expect(namedProject(page, 'Ali current')).toBeVisible();
    await expect(namedProject(page, 'Ali legacy')).toBeVisible();
    await expect(namedProject(page, 'Rana house')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
