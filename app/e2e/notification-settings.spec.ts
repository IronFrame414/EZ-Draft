// EZD-140 T9-T12 (vault/plans/EZD-140.md sections 3, 4, 6, D8-D10; AC-EZD-140-1 to -4). Untagged, so desktop
// 1600 x 1000. Helpers only from app/test-harness/e2e/test.ts. Every test makes its own tenant and a member with
// view_projects (no seeded row changed). Notifications are sent with POST /api/dev/notifications (EZD-110 D12);
// stub emails are read from EMAIL_STUB_DIR and filtered to the member. Texts are the plan's section 6 wording and
// the EZD-110 catalog titles; the load error is EZD-015's InlineError ([role="alert"]).
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  harnessSql,
  readStubOutboxDir,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

const KINDS = [
  'client_response',
  'field_conflict',
  'field_measurements_received',
  'render_finished',
  'edit_request',
  'sync_conflict',
  'cleanup_due',
  'render_allowance_refilled',
  'field_pack_issued',
];

const tid = (page: Page, id: string) => page.getByTestId(id);
const stubMail = (email: string) =>
  readStubOutboxDir(process.env.EMAIL_STUB_DIR as string).filter(
    (m) => m.to.toLowerCase() === email.toLowerCase(),
  );
const emailSwitch = (page: Page, kind: string) => tid(page, `notification-setting-email-${kind}`);
const inAppSwitch = (page: Page, kind: string) => tid(page, `notification-setting-in-app-${kind}`);

async function newMember() {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, ['view_projects']);
  return { tenant, member };
}

async function openMyProfile(page: Page) {
  await tid(page, 'avatar-menu-trigger').click();
  await expect(tid(page, 'avatar-menu')).toBeVisible();
  await tid(page, 'avatar-menu-profile').click();
  await expect(tid(page, 'my-profile-dialog')).toBeVisible();
}

async function openNotificationsTab(page: Page) {
  await openMyProfile(page);
  await tid(page, 'my-profile-tab-notifications').click();
  await expect(tid(page, 'notification-settings')).toBeVisible();
}

async function startAt(page: Page, signInAs: (email: string) => Promise<unknown>, email: string) {
  await signInAs(email);
  await page.goto('/settings');
  await expect(tid(page, 'avatar-menu-trigger')).toBeVisible();
}

async function send(page: Page, kind: string, params: Record<string, string> = {}) {
  const res = await page.request.post('/api/dev/notifications', { data: { kind, params } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { notification: { id: string } }).notification.id;
}

async function saveAndWait(page: Page) {
  await expect(tid(page, 'profile-save')).toBeEnabled();
  await tid(page, 'profile-save').click();
  await expect(tid(page, 'my-profile-dialog')).toHaveCount(0);
}

test.describe('EZD-140 notification settings', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-140 T9 done when: Email off for one kind stops that email and the bell still shows it', async ({
    page,
    signInAs,
  }) => {
    const { member } = await newMember();
    await startAt(page, signInAs, member.email);
    await openNotificationsTab(page);

    await expect(tid(page, 'notification-setting-row')).toHaveCount(9);
    await expect(
      tid(page, 'notification-settings').locator('[role="switch"][aria-checked="true"]'),
    ).toHaveCount(18);

    await emailSwitch(page, 'render_finished').click();
    await expect(emailSwitch(page, 'render_finished')).toHaveAttribute('aria-checked', 'false');
    await saveAndWait(page);
    await expect(page.locator('[data-toast-viewport]')).toContainText('Profile saved.');

    await page.goto('/dev/notifications');
    const renderId = await send(page, 'render_finished');
    await send(page, 'field_conflict');

    await expect.poll(() => stubMail(member.email).length, { timeout: 20000 }).toBe(1);
    expect(stubMail(member.email)[0].subject).toBe('Field conflict to resolve');

    await tid(page, 'notification-bell').click();
    await expect(tid(page, 'notification-item')).toHaveCount(2);
    await expect(
      tid(page, 'notification-item-title').filter({ hasText: 'Photoreal render finished' }),
    ).toHaveCount(1);

    expect(stubMail(member.email)).toHaveLength(1);
    const jobs = await harnessSql()`
      select id from public.job
      where kind = 'notification_email' and payload ->> 'notificationId' = ${renderId}`;
    expect(jobs).toHaveLength(0);
  });

  test('EZD-140 T10 In app off hides that kind from the bell but its email is still sent', async ({
    page,
    signInAs,
  }) => {
    const { member } = await newMember();
    await startAt(page, signInAs, member.email);
    await openNotificationsTab(page);
    await inAppSwitch(page, 'edit_request').click();
    await expect(inAppSwitch(page, 'edit_request')).toHaveAttribute('aria-checked', 'false');
    await saveAndWait(page);

    await page.goto('/dev/notifications');
    await send(page, 'edit_request', { name: 'Mia' });
    await send(page, 'field_conflict');

    await expect.poll(() => stubMail(member.email).length, { timeout: 20000 }).toBe(2);

    await tid(page, 'notification-bell').click();
    await expect(tid(page, 'notification-item')).toHaveCount(1);
    await expect(tid(page, 'notification-item-title')).toHaveText('Field conflict to resolve');
    await expect(tid(page, 'notification-item-title').filter({ hasText: 'edit' })).toHaveCount(0);
  });

  test('EZD-140 T11 one Save keeps the notification switches and the language across a reload', async ({
    page,
    signInAs,
  }) => {
    const { tenant, member } = await newMember();
    const second = await createMember({ tenantId: tenant, scope: 'all' });
    await startAt(page, signInAs, member.email);
    await openMyProfile(page);
    await expect(tid(page, 'profile-language-en')).toBeVisible();
    await tid(page, 'profile-language-es').click();
    await tid(page, 'my-profile-tab-notifications').click();
    await expect(tid(page, 'notification-settings')).toBeVisible();
    await emailSwitch(page, 'field_conflict').click();
    await saveAndWait(page);

    await page.reload();
    await expect(tid(page, 'avatar-menu-trigger')).toBeVisible();
    await openMyProfile(page);
    await expect(tid(page, 'profile-language-es')).toHaveAttribute('aria-checked', 'true');
    await tid(page, 'my-profile-tab-notifications').click();
    await expect(tid(page, 'notification-setting-row')).toHaveCount(9);
    await expect(emailSwitch(page, 'field_conflict')).toHaveAttribute('aria-checked', 'false');
    await expect(
      tid(page, 'notification-settings').locator('[role="switch"][aria-checked="true"]'),
    ).toHaveCount(17);
    for (const kind of KINDS) {
      await expect(inAppSwitch(page, kind)).toHaveAttribute('aria-checked', 'true');
      if (kind !== 'field_conflict')
        await expect(emailSwitch(page, kind)).toHaveAttribute('aria-checked', 'true');
    }

    const mine = await harnessSql()`
      select kind from public.notification_setting
      where tenant_id = ${tenant}::uuid and user_id = ${member.appUserId}::uuid`;
    expect(mine).toHaveLength(9);
    const theirs = await harnessSql()`
      select kind from public.notification_setting
      where tenant_id = ${tenant}::uuid and user_id = ${second.appUserId}::uuid`;
    expect(theirs).toHaveLength(0);
  });

  test('EZD-140 T12 states: a load failure with Retry, Save off while offline, a failed save keeps the flip', async ({
    page,
    signInAs,
    network,
  }) => {
    const { member } = await newMember();
    await startAt(page, signInAs, member.email);

    const block = (route: { abort: () => Promise<void> }) => route.abort();
    await page.route('**/api/profile/notifications', block);
    await openMyProfile(page);
    await tid(page, 'my-profile-tab-notifications').click();
    const alert = tid(page, 'notification-settings').locator('[role="alert"]');
    await expect(alert).toContainText("Couldn't load your notification settings.");
    await page.unroute('**/api/profile/notifications', block);
    await alert.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(tid(page, 'notification-setting-row')).toHaveCount(9);
    await expect(alert).toHaveCount(0);

    await emailSwitch(page, 'cleanup_due').click();
    await expect(emailSwitch(page, 'cleanup_due')).toHaveAttribute('aria-checked', 'false');
    await expect(tid(page, 'profile-save')).toBeEnabled();
    await network.set(page, 'off');
    await expect(tid(page, 'profile-save')).toBeDisabled();
    await network.set(page, 'on');

    await page.route('**/api/profile/notifications', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
            }),
          })
        : route.continue(),
    );
    await expect(tid(page, 'profile-save')).toBeEnabled();
    await tid(page, 'profile-save').click();
    await expect(tid(page, 'profile-save-error')).toHaveText(
      "Couldn't save your profile. Try again.",
    );
    await expect(emailSwitch(page, 'cleanup_due')).toHaveAttribute('aria-checked', 'false');
    await expect(tid(page, 'my-profile-dialog')).toBeVisible();
  });
});
