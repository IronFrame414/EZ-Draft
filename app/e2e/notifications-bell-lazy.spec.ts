// EZD-332 N1-N3 (vault/plans/EZD-332.md sections 3, 4; AC-EZD-332-1, -2; Q-0579 (b); ticket row Done when). Untagged,
// so desktop 1600 x 1000. Each test makes a fresh tenant and an all-scope member holding view_projects, as
// notifications-bell.spec.ts does. Mount wait: two finished GET /api/notifications (mount fetch and first-join
// resync: D16, EZD-318 D1).
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  signedInJsContents,
  test,
} from '../test-harness/e2e/test';

// Mount wait (plan section 4): count finished GET /api/notifications requests.
function countNotificationGets(page: Page): () => number {
  let count = 0;
  page.on('requestfinished', (req) => {
    if (req.method() === 'GET' && new URL(req.url()).pathname === '/api/notifications') count++;
  });
  return () => count;
}

async function newMember() {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, ['view_projects']);
  return { tenant, member };
}

test.describe('EZD-332 notification bell loads its list on first open', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-332 N1 the page with the bell loads no zod and no list code before the bell is opened', async ({
    page,
    browser,
    signInAs,
  }) => {
    test.setTimeout(120000);
    const { member } = await newMember();
    await signInAs(member.email);

    const gets = countNotificationGets(page);
    await page.goto('/dev/notifications');
    await expect.poll(gets).toBe(2);
    await expect(page.getByTestId('notification-bell')).toBeVisible();

    const state = await page.context().storageState();
    const contents = await signedInJsContents(browser, state, '/dev/notifications');
    expect('error' in contents).toBe(false);
    const keys = Object.keys((contents.details as { modules: Record<string, number> }).modules);

    expect(keys.filter((k) => k === 'pkg:zod')).toEqual([]);
    expect(keys.filter((k) => k.startsWith('app:lazy/notification-panel/'))).toEqual([]);
    expect(keys.filter((k) => k === 'app:lib/notifications/time.ts')).toEqual([]);
    // Controls: the bell is measured, and Realtime still loads with the page.
    expect(keys).toContain('app:components/notifications/NotificationBell.tsx');
    expect(keys).toContain('pkg:@supabase/realtime-js');
  });

  test('EZD-332 N2 a new notification lights the bell live and the first click downloads and shows the list', async ({
    page,
    signInAs,
  }) => {
    const { member } = await newMember();
    await signInAs(member.email);

    const gets = countNotificationGets(page);
    await page.goto('/dev/notifications');
    await expect.poll(gets).toBe(2);
    await expect(page.getByTestId('notification-bell')).toBeVisible();

    // A window marker: it survives only while the page is not reloaded.
    await page.evaluate(() => {
      (window as Window & { ezd332Marker?: number }).ezd332Marker = 1;
    });
    await page.getByTestId('dev-notify-render_finished').click();
    await expect(page.getByTestId('notification-bell-dot')).toBeVisible();
    await expect(page.getByTestId('notification-bell')).toHaveAttribute(
      'aria-label',
      'Notifications, 1 new',
    );
    expect(
      await page.evaluate(() => (window as Window & { ezd332Marker?: number }).ezd332Marker),
    ).toBe(1);

    const bodies: Promise<string>[] = [];
    page.on('response', (r) => {
      const path = new URL(r.url()).pathname;
      if (path.startsWith('/_next/static/') && path.endsWith('.js')) {
        bodies.push(r.text().catch(() => ''));
      }
    });
    await page.getByTestId('notification-bell').click();
    await expect(page.getByTestId('notification-item')).toHaveCount(1);
    await expect(page.getByTestId('notification-item-title')).toHaveText(
      'Photoreal render finished',
    );
    expect((await Promise.all(bodies)).some((b) => b.includes('notification-item-title'))).toBe(
      true,
    );
  });

  test('EZD-332 N3 a failed list download shows the inline error, and Retry loads the list', async ({
    page,
    signInAs,
  }) => {
    const { member } = await newMember();
    await signInAs(member.email);

    const gets = countNotificationGets(page);
    await page.goto('/dev/notifications');
    await expect.poll(gets).toBe(2);
    await expect(page.getByTestId('notification-bell')).toBeVisible();

    const block = (route: { abort: () => Promise<void> }) => route.abort();
    await page.route('**/_next/static/**', block);
    await page.getByTestId('notification-bell').click();
    const panel = page.getByTestId('notification-panel');
    await expect(panel).toBeVisible();
    const error = panel.getByTestId('notification-error');
    await expect(error).toContainText('Notifications could not load');
    await expect(page.getByTestId('notification-item')).toHaveCount(0);
    await expect(page.getByTestId('notification-empty')).toHaveCount(0);

    await page.unroute('**/_next/static/**', block);
    await error.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('notification-empty')).toHaveText(/No notifications yet/);
    await expect(page.getByTestId('notification-error')).toHaveCount(0);
  });
});
