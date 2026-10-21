import { expect, test } from '@playwright/test';
import type { FieldState } from '../../src/lib/offline/types';
import type { NotificationItem } from '../../src/lib/notifications/delivery';

test.use({ serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36' });

type AudioProof = Window & { notificationNotes: number[] };
const projectId = '11111111-1111-4111-8111-111111111111';

for (const [role, locale] of [['Outdoor Sales', 'en'], ['Outdoor Sales', 'ar'], ['Indoor Sales', 'en'], ['Indoor Sales', 'ar']]) {
  test(`${locale}: ${role} receives a linked notification and one two-note chime without extra controls`, async ({ page }) => {
    const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Sales employee', role, branch: 'Karkh' as const };
    const outdoor = role === 'Outdoor Sales';
    const state: FieldState = {
      actor, projects: [{ id: projectId, branch: 'Karkh', project_name: 'Notification Villa', project_number: 'PRJ-NOTICE', created_by: actor.id, registeredBy: actor.name,
        structure_readiness: 'ready', sales_status: 'new_lead', assigned_outdoor_sales_id: outdoor ? actor.id : null,
        address: 'Baghdad', phone: null, next_follow_up_at: null, project_notes: null, created_at: '2026-10-21T08:00:00Z', updated_at: '2026-10-21T08:00:00Z' }],
      openings: [], queue: [], syncedAt: null, outdoorSales: [], indoorSales: [],
    };
    const notifications: NotificationItem[] = [];
    const patches: { notificationId?: string; all?: boolean }[] = [];
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(locale => {
      localStorage.setItem('alumex_locale', locale);
      (window as unknown as AudioProof).notificationNotes = [];
      // Exercise the real browser audio graph, recording oscillator starts as proof.
      const original = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        const oscillator = original.call(this);
        const start = oscillator.start.bind(oscillator);
        oscillator.start = when => { (window as unknown as AudioProof).notificationNotes.push(oscillator.frequency.value); start(when); };
        return oscillator;
      };
    }, locale);
    let reads = 0;
    await page.route('**/api/**', route => route.fulfill({ json: state }));
    await page.route('**/api/notifications', route => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON();
        patches.push(body);
        for (const item of notifications) if (body.all || item.id === body.notificationId) item.read_at = new Date().toISOString();
        return route.fulfill({ json: { ok: true } });
      }
      reads++;
      return route.fulfill({ json: { userId: actor.id, role, notifications, unreadCount: notifications.filter(item => !item.read_at).length, remindersAvailable: true } });
    });
    await page.goto('/offline?path=/dashboard');
    await expect.poll(() => reads).toBeGreaterThan(0);
    const bell = page.locator('summary').filter({ has: page.locator('svg') });
    await expect(bell).toHaveCount(1);
    await bell.click(); // An ordinary interaction unlocks audio; no test-sound control.
    await expect(page.getByText(locale === 'en' ? 'No notifications.' : 'لا توجد إشعارات.', { exact: true })).toBeVisible();
    await bell.click();
    expect(await page.evaluate(() => (window as unknown as AudioProof).notificationNotes)).toEqual([]);

    const kinds = outdoor
      ? [['measurementAssigned', 'New measurement assignment', 'مهمة قياسات جديدة']]
      : [['projectFollowUpAssigned', 'New project to follow up', 'مشروع جديد للمتابعة'], ['measurementVisitReturned', 'Arrange another measurement visit', 'تنسيق زيارة أخرى لأخذ القياسات'], ['followUpDue', 'Follow-up is due', 'حان موعد المتابعة']];
    for (const [index, [key, en, ar]] of kinds.entries()) {
      notifications.unshift({ id: `22222222-2222-4222-8222-22222222222${index}`, title_key: `crm.notifications.${key}`,
        link_path: outdoor ? `/initial-measurements/${projectId}` : `/mini-crm#project-${projectId}`, read_at: null, created_at: new Date().toISOString(), payload: { project_name: 'Notification Villa' } });
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      const alert = page.getByRole('status').filter({ has: page.getByRole('link', { name: new RegExp(locale === 'en' ? en : ar) }) });
      await expect(alert).toBeVisible();
      await expect.poll(() => page.evaluate(() => (window as unknown as AudioProof).notificationNotes.length)).toBe((index + 1) * 2);
      expect(await page.evaluate(() => (window as unknown as AudioProof).notificationNotes.slice(-2))).toEqual([880, 660]);
      const before = reads;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect.poll(() => reads).toBeGreaterThan(before);
      expect(await page.evaluate(() => (window as unknown as AudioProof).notificationNotes.length)).toBe((index + 1) * 2);
      await page.screenshot({ path: test.info().outputPath(`notification-${role}-${locale}-${index}.png`), fullPage: false });
      if (index < kinds.length - 1) await alert.getByRole('button', { name: locale === 'en' ? 'Dismiss notification' : 'إغلاق الإشعار' }).click();
      else {
        await alert.getByRole('link').click();
        await expect(page).toHaveURL(outdoor ? new RegExp(`path=%2Finitial-measurements%2F${projectId}`) : /path=%2Fmini-crm/);
        await expect.poll(() => patches.length).toBeGreaterThan(0);
        expect(patches.at(-1)?.notificationId).toBe(notifications[0].id);
        if (!outdoor) await expect(page.locator(`#project-${projectId}`)).toBeFocused();
      }
    }
    await page.reload();
    await expect(bell).toBeVisible();
    await bell.click();
    expect(await page.evaluate(() => (window as unknown as AudioProof).notificationNotes)).toEqual([]);
    await expect(page.getByRole('button', { name: /test sound|اختبار الصوت/i })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    expect(await page.title()).toMatch(/Alumex|ألومكس/);
  });
}
