// EZD-110b T17-T19 (vault/plans/EZD-110b.md section 4; AC-EZD-110-1, -2, -3, -4, -7; Q-0422, Q-0425, Q-0086,
// Q-0403). Untagged, so desktop 1600 x 1000. Each test makes a fresh tenant and an all-scope member holding
// view_projects. Rows are inserted with harnessSql() as in the plan's Fixtures paragraph (no email jobs).
import type { Page } from '@playwright/test';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

async function insertRow(
  tenantId: string,
  userId: string,
  projectId: string | null,
  k: number,
  read = false,
): Promise<string> {
  const rows = await harnessSql()<{ id: string }[]>`
    insert into public.notification (tenant_id, user_id, kind, project_id, payload, link, created_at, read_at)
    values (${tenantId}::uuid, ${userId}::uuid, 'render_finished', ${projectId}::uuid, '{}'::jsonb, '/',
      now() - make_interval(secs => ${k}::double precision), ${read ? harnessSql()`now()` : null})
    returning id`;
  return rows[0].id;
}

// Mount wait (plan section 4): count finished GET /api/notifications requests; the mount fetch and the first-join
// resync make 2 (D16, EZD-318 D1).
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

test.describe('EZD-110b notifications bell', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-110b T17 a sent notification lights the bell without a reload and opens and reads on click', async ({
    page,
    signInAs,
  }) => {
    const { member } = await newMember();
    await signInAs(member.email);

    await page.goto('/dev/notifications');
    await page.getByTestId('dev-notify-render_finished').click();

    await expect(page.getByTestId('notification-bell-dot')).toBeVisible();
    await expect(page.getByTestId('notification-bell')).toHaveAttribute(
      'aria-label',
      'Notifications, 1 new',
    );

    await page.getByTestId('notification-bell').click();
    await expect(page.getByTestId('notification-item')).toHaveCount(1);
    await expect(page.getByTestId('notification-item-title')).toHaveText(
      'Photoreal render finished',
    );
    await expect(page.getByTestId('notification-item')).toHaveAttribute('data-unread', 'true');

    await page.getByTestId('notification-item').click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/');

    await expect
      .poll(async () => {
        const { data } = await adminDb()
          .from('notification')
          .select('read_at')
          .eq('user_id', member.appUserId);
        return data?.length === 1 && data[0].read_at !== null;
      })
      .toBe(true);
  });

  test('EZD-110b T18 the list shows 20, Show older loads 25, Mark all read clears, a second member sees none', async ({
    page,
    signInAs,
    sessions,
  }) => {
    const { tenant, member } = await newMember();
    const expected: string[] = [];
    for (let k = 0; k < 25; k++) expected.push(await insertRow(tenant, member.appUserId, null, k));
    const landing = countNotificationGets(page);
    await signInAs(member.email);
    await expect.poll(landing).toBe(2);

    const gets = countNotificationGets(page);
    await page.goto('/dev/notifications');
    await expect.poll(() => gets()).toBe(2);
    await page.getByTestId('notification-bell').click();
    const items = page.getByTestId('notification-item');
    await expect(items).toHaveCount(20);
    await expect(items.first()).toHaveAttribute('data-notification-id', expected[0]);

    await page.getByTestId('notification-show-older').click();
    await expect(items).toHaveCount(25);
    const listed = await items.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-notification-id')),
    );
    expect(listed).toEqual(expected);

    await page.getByTestId('notification-mark-all').click();
    await expect(page.locator('[data-testid="notification-item"][data-unread="true"]')).toHaveCount(
      0,
    );
    await expect(page.getByTestId('notification-bell-dot')).toHaveCount(0);
    await expect(page.getByTestId('notification-bell')).toHaveAttribute(
      'aria-label',
      'Notifications',
    );

    const other = await newMember();
    const [second] = await sessions.open([other.member.email]);
    await second.page.goto('/dev/notifications');
    await second.page.getByTestId('notification-bell').click();
    await expect(second.page.getByTestId('notification-empty')).toHaveText(/No notifications yet/);
  });

  test('EZD-110b T19 a gone project and a lost permission show a toast and keep the page', async ({
    page,
    signInAs,
  }) => {
    const { tenant, member } = await newMember();
    const [goneProject, otherProject] = await createProjects(tenant, 2);
    const goneRow = await insertRow(tenant, member.appUserId, goneProject, 1, true);
    const lostRow = await insertRow(tenant, member.appUserId, otherProject, 0);
    const landing = countNotificationGets(page);
    await signInAs(member.email);
    await expect.poll(landing).toBe(2);

    const gets = countNotificationGets(page);
    await page.goto('/dev/notifications');
    await expect.poll(() => gets()).toBe(2);
    const startUrl = page.url();
    await page.getByTestId('notification-bell').click();
    await expect(page.getByTestId('notification-item')).toHaveCount(2);

    const goneItem = page.locator(
      `[data-testid="notification-item"][data-notification-id="${goneRow}"]`,
    );
    await expect(goneItem).toHaveAttribute('data-unread', 'false');

    await harnessSql()`delete from public.project where id = ${goneProject}::uuid`;
    await goneItem.click();
    const toasts = page.locator('[data-toast-viewport] > [data-toast]');
    await expect(toasts.filter({ hasText: 'That job no longer exists.' })).toHaveCount(1);
    expect(page.url()).toBe(startUrl);

    await setPermissions(tenant, member.membershipId, []);
    await page
      .locator(`[data-testid="notification-item"][data-notification-id="${lostRow}"]`)
      .click();
    await expect(toasts.filter({ hasText: "You don't have permission to do that." })).toHaveCount(
      1,
    );
    expect(page.url()).toBe(startUrl);
  });
});
