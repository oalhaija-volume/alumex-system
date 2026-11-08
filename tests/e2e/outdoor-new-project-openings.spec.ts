import { expect, test, type Page } from '@playwright/test';
import { savedFieldState } from './helpers/fieldState';
import type { FieldChange, FieldProject, FieldState } from '../../src/lib/offline/types';

test.use({ serviceWorkers: 'block' });

const actor = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Ehab', role: 'Outdoor Sales',
  outdoorRotationStartBranch: 'Karkh' as const,
};

async function firstOpening(page: Page) {
  await page.getByLabel('Floor', { exact: true }).selectOption('GF');
  await page.getByRole('combobox', { name: 'Room', exact: true }).selectOption('Office');
  await page.getByRole('combobox', { name: 'Structural type', exact: true }).selectOption('Window');
  await page.getByRole('radio', { name: 'Sliding', exact: true }).check();
  await page.getByRole('radio', { name: 'No arch', exact: true }).check();
  await page.getByLabel('Width (cm)', { exact: true }).fill('120');
  await page.getByLabel('Height (cm)', { exact: true }).fill('150');
  await page.getByRole('button', { name: 'Save & add opening', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved openings (1)', exact: true })).toBeVisible();
  await expect(page.locator('legend').filter({ hasText: /^Opening 2$/ })).toBeVisible();
  await expect(page.getByLabel('Width (cm)', { exact: true })).toHaveValue('');
}

for (const scenario of ['slow registration and stale snapshot', 'offline registration and reconnect'] as const) {
  test(`Ehab creates a ready project and saves its first opening: ${scenario}`, async ({ page }) => {
    const remote: FieldState = { actor, projects: [], openings: [], queue: [], outdoorSales: [], indoorSales: [], syncedAt: null };
    const received: FieldChange[] = [];
    const applied = new Map<string, FieldChange>();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let documentRequests = 0;
    let snapshotRequests = 0;
    page.on('request', request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++;
    });
    let connected = true;
    let holdSnapshot = false;
    let staleSnapshots = 0;
    let releaseSnapshot!: () => void;
    const snapshotGate = new Promise<void>(resolve => { releaseSnapshot = resolve; });
    let releaseRegistration!: () => void;
    const registrationGate = new Promise<void>(resolve => { releaseRegistration = resolve; });
    let releaseOpening!: () => void;
    const openingGate = new Promise<void>(resolve => { releaseOpening = resolve; });
    const disconnected = scenario === 'offline registration and reconnect';
    await page.addInitScript(() => {
      localStorage.setItem('alumex_locale', 'en');
      Reflect.deleteProperty(Navigator.prototype, 'serviceWorker');
    });
    await page.route('**/api/**', async route => {
      if (!connected) return route.abort('internetdisconnected');
      const url = new URL(route.request().url());
      if (route.request().method() === 'GET') {
        if (url.searchParams.has('session')) return route.fulfill({ json: { actor } });
        if (url.pathname === '/api/offline') snapshotRequests++;
        const snapshot = structuredClone(remote);
        if (url.pathname === '/api/offline' && holdSnapshot) {
          staleSnapshots++;
          await snapshotGate;
        }
        return route.fulfill({ json: snapshot });
      }
      // Every write is intercepted, including unexpected endpoints.
      expect(url.pathname).toBe('/api/offline');
      const change = route.request().postDataJSON() as FieldChange;
      received.push(change);
      if (change.action === 'register' && !disconnected) await registrationGate;
      if (change.action === 'opening' && !disconnected) await openingGate;
      if (!applied.has(change.id)) {
        if (change.action === 'register') {
          const project = change.payload.project as Record<string, unknown>;
          const client = change.payload.client as Record<string, unknown>;
          remote.projects.push({
            id: change.projectId, project_name: String(client.clientName), project_number: 'PRJ-EHAB-FIRST',
            created_by: actor.id, registeredBy: actor.name, original_creator_role: actor.role,
            assigned_outdoor_sales_id: null, assignedOutdoorSales: null, branch: project.branch,
            building_type: project.buildingType, address: project.address, phone: String(client.mobile),
            structure_readiness: 'ready', sales_status: 'new_lead', created_at: change.recordedAt,
            updated_at: change.recordedAt, next_follow_up_at: null, project_notes: null,
          } as FieldProject);
        } else {
          expect(change.action).toBe('opening');
          remote.openings.push({ ...change.payload, projectId: change.projectId, createdBy: actor.id } as FieldState['openings'][number]);
        }
        applied.set(change.id, change);
      }
      return route.fulfill({ json: { project: remote.projects.find(project => project.id === change.projectId) } });
    });
    try {
      await page.goto('/offline?path=/intake');
      await expect(page.locator('input[name="projectBranch"]').first()).toBeVisible();
      const initialSnapshots = snapshotRequests;
      expect(initialSnapshots).toBe(1);
      for (let index = 0; index < 3; index++) {
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await page.waitForTimeout(120);
      }
      expect(snapshotRequests).toBe(initialSnapshots);
      await page.locator('input[name="projectBranch"]').first().check();
      await page.locator('input[name="buildingType"][value="villa_house"]').check();
      await page.getByPlaceholder('Enter full name').fill('Ehab new project first opening');
      await page.getByPlaceholder('07xx xxx xxxx').fill('07700000000');
      await page.getByRole('radio', { name: /^Ready for measurements/ }).check();
      if (disconnected) {
        connected = false;
        await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }));
        await page.evaluate(() => {
          Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
          window.dispatchEvent(new Event('offline'));
        });
        await page.locator('input[autocomplete="street-address"]').fill('Baghdad, Mansour');
      } else {
        await page.getByRole('button', { name: 'Project location map', exact: true }).click({ position: { x: 80, y: 80 } });
        holdSnapshot = true;
        // Start a deliberately old empty response while still on registration.
        // Advance Date only: the refresh interval expires without replaying timers.
        await page.clock.setFixedTime(new Date(await page.evaluate(() => Date.now()) + 61000));
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect.poll(() => staleSnapshots).toBeGreaterThan(0);
      }
      const transitionSnapshots = snapshotRequests;
      await page.getByRole('button', { name: /Continue to measurements/ }).click();
      await expect(page).toHaveURL(/\/offline\?project=[\da-f-]+$/);
      await expect(page.getByRole('heading', { name: 'Initial measurements', exact: true })).toBeVisible();
      expect(documentRequests).toBe(1);
      expect(snapshotRequests).toBe(transitionSnapshots);
      const registration = (await savedFieldState(page)).queue.find(change => change.action === 'register')!;
      expect(registration).toBeDefined();
      if (!disconnected) {
        await expect.poll(() => staleSnapshots).toBeGreaterThan(0);
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await expect.poll(() => received.filter(change => change.action === 'register').length).toBeGreaterThan(0);
        releaseRegistration();
        await expect.poll(async () => (await savedFieldState(page)).queue.some(change => change.action === 'register')).toBe(false);
      }
      await firstOpening(page);
      expect(documentRequests).toBe(1);
      expect(snapshotRequests).toBe(transitionSnapshots);
      const saved = await savedFieldState(page);
      expect(saved.projects).toHaveLength(1);
      expect(saved.projects[0].created_by).toBe(actor.id);
      expect(saved.openings).toHaveLength(1);
      expect(saved.queue.map(change => change.action)).toEqual(disconnected ? ['register', 'opening'] : ['opening']);
      const expectedIds = [registration.id, ...saved.queue.filter(change => change.action === 'opening').map(change => change.id)];
      expect(saved.openings[0].projectId).toBe(saved.projects[0].id);
      if (!disconnected) {
        await expect.poll(() => staleSnapshots).toBeGreaterThan(0);
        await page.clock.setFixedTime(new Date(await page.evaluate(() => Date.now()) + 1000));
        releaseSnapshot();
        await expect.poll(async () => (await savedFieldState(page)).syncedAt).not.toBe(saved.syncedAt);
        // Registration completed after this empty snapshot started, and the
        // first opening is still waiting for its own synchronization response.
        expect(remote.projects).toHaveLength(1);
        const afterStaleSnapshot = await savedFieldState(page);
        expect(afterStaleSnapshot.projects).toHaveLength(1);
        expect(afterStaleSnapshot.openings).toHaveLength(1);
        expect(afterStaleSnapshot.unavailableProjectIds ?? []).not.toContain(saved.projects[0].id);
        await expect(page.getByRole('heading', { name: 'Saved openings (1)', exact: true })).toBeVisible();
        releaseOpening();
        holdSnapshot = false;
      } else {
        expect(received).toHaveLength(0);
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Saved openings (1)', exact: true })).toBeVisible();
        await expect(page.locator('legend').filter({ hasText: /^Opening 2$/ })).toBeVisible();
        expect((await savedFieldState(page)).queue.map(change => change.id)).toEqual(saved.queue.map(change => change.id));
        connected = true;
        await page.evaluate(() => {
          Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
          window.dispatchEvent(new Event('online'));
        });
      }
      await expect.poll(async () => (await savedFieldState(page)).queue.length, { timeout: 15000 }).toBe(0);
      expect([...applied.values()].map(change => change.action)).toEqual(['register', 'opening']);
      expect([...applied.keys()]).toEqual(expectedIds);
      // Full navigation can interrupt the registration response after dispatch.
      // Its retry must reuse the durable ID so the server applies it once.
      expect([...new Set(received.map(change => change.id))]).toEqual(expectedIds);
      expect(received.filter(change => change.action === 'opening')).toHaveLength(1);
      expect(new Set(received.filter(change => change.action === 'register').map(change => change.id))).toEqual(new Set([registration.id]));
      expect(remote.projects).toHaveLength(1);
      expect(remote.openings).toHaveLength(1);
      const synchronizedCount = received.length;
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Saved openings (1)', exact: true })).toBeVisible();
      await expect(page.locator('legend').filter({ hasText: /^Opening 2$/ })).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForTimeout(400);
      expect(received).toHaveLength(synchronizedCount);
      expect((await savedFieldState(page)).openings[0].id).toBe(saved.openings[0].id);
      await page.screenshot({ path: test.info().outputPath('new-project-first-opening.png'), fullPage: true });
      expect(errors).toEqual([]);
    } finally {
      releaseSnapshot();
      releaseRegistration();
      releaseOpening();
    }
  });
}
