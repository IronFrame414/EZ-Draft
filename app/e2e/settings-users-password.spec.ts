// EZD-105b B1-B4 (AC-EZD-105b-1, -2, -3; Q-0096 P3, P4, P7, P10; Q-0733 (a); 11 Accessibility 44 px). B1-B3
// are desktop only; B4 (touch targets) is @ipad, the coarse-pointer project where the 44 px rule applies. Each test makes its own tenant through EZD-006's fixtures and app/test-harness/users/fixtures.ts. Texts:
// vault/plans/EZD-105b.md section 6. Stub emails are read from EMAIL_STUB_DIR.
import type { Browser, Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createTenant,
  expect,
  expectTouchTargets,
  readStubOutboxDir,
  test,
} from '../test-harness/e2e/test';
import { addUser, PRESET_KEYS } from '../test-harness/users/fixtures';

const tid = (page: Page, id: string) => page.getByTestId(id);
const rowOf = (page: Page, name: string) =>
  page.locator('[data-testid="user-row"]', { hasText: name });
const stubMail = (email: string) =>
  readStubOutboxDir(process.env.EMAIL_STUB_DIR as string).filter(
    (m) => m.to.toLowerCase() === email.toLowerCase(),
  );
const PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789]{16}$/;
const SUBJECT = 'A new password was set for your EZ Draft account';

async function signsInWithPassword(
  browser: Browser,
  baseURL: string | undefined,
  email: string,
  password: string,
): Promise<boolean> {
  const context = await browser.newContext({ baseURL, viewport: { width: 1600, height: 1000 } });
  try {
    const page = await context.newPage();
    await page.goto('/sign-in');
    await page.getByTestId('sign-in-email').fill(email);
    await page.getByTestId('sign-in-password').fill(password);
    await page.getByTestId('sign-in-password-submit').click();
    return await page
      .waitForURL((u) => u.pathname !== '/sign-in', { timeout: 8000 })
      .then(
        () => true,
        () => false,
      );
  } finally {
    await context.close();
  }
}

test.describe('EZD-105b Owner-set password', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('B1 an Owner sets a member password, sees it once, the member is signed out and emailed', async ({
    sessions,
    browser,
    baseURL,
  }) => {
    const tenant = await createTenant();
    const o = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    const d = await addUser(tenant, { preset: 'designer', name: 'Ann Lee' });
    const [member, owner] = await sessions.open([d.email, o.email]);
    await member.page.goto('/settings/company');
    await expect(tid(member.page, 'avatar-menu-trigger')).toBeVisible();
    const page = owner.page;
    await page.goto('/settings/users');

    // The More menu item, after Edit; it is not shown on the Owner's own row.
    await rowOf(page, 'Zed Owner').getByTestId('user-more').click();
    await expect(tid(page, 'user-more-menu')).toBeVisible();
    await expect(tid(page, 'user-menu-set-password')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await rowOf(page, 'Ann Lee').getByTestId('user-more').click();
    const menu = tid(page, 'user-more-menu');
    await expect(menu.getByRole('menuitem').nth(1)).toHaveText('Set password');
    await tid(page, 'user-menu-set-password').click();
    const dialog = tid(page, 'set-password-dialog');
    await expect(dialog).toHaveAttribute('data-step', 'confirm');
    await expect(dialog).toContainText('Set a password for Ann Lee');
    await expect(dialog.locator('input, textarea')).toHaveCount(0);
    await tid(page, 'set-password-cancel').click();
    await expect(dialog).toHaveCount(0);

    // The inspector's Password section.
    await rowOf(page, 'Ann Lee').click();
    await expect(tid(page, 'users-inspector-name')).toHaveText('Ann Lee');
    const section = tid(page, 'users-password');
    await expect(section).toContainText('Password');
    await tid(page, 'user-set-password').click();
    await expect(dialog).toHaveAttribute('data-step', 'confirm');
    await expect(dialog).toContainText(
      'EZ Draft makes a new 16-character password for Ann Lee. They are signed out on every device and get an email that their password was set.',
    );
    await tid(page, 'set-password-confirm').click();

    await expect(dialog).toHaveAttribute('data-step', 'shown');
    await expect(dialog).toContainText('New password for Ann Lee');
    await expect(dialog).toContainText("Copy it now and give it to Ann Lee. You won't see it again.");
    const value = tid(page, 'set-password-value');
    const password = (await value.textContent()) ?? '';
    expect(password).toMatch(PATTERN);
    await expect(value).toHaveCSS('font-size', '16px');
    await expect(value).toHaveCSS('user-select', 'all');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await tid(page, 'set-password-copy').click();
    await expect(page.getByText('Password copied')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(password);
    await tid(page, 'set-password-done').click();
    await expect(dialog).toHaveCount(0);

    // Signed out on every device; emailed; the shown password works.
    await member.page.reload();
    await member.page.waitForURL((u) => u.pathname === '/sign-in');
    await expect.poll(() => stubMail(d.email).length).toBe(1);
    expect(stubMail(d.email)[0].subject).toBe(SUBJECT);
    expect(stubMail(d.email)[0].text).not.toContain(password);
    expect(await signsInWithPassword(browser, baseURL, d.email, password)).toBe(true);
  });

  test('B2 no Set password for a settings_users holder without the Owner preset', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const s = await addUser(tenant, {
      preset: 'designer',
      name: 'Sam Office',
      granted: [...PRESET_KEYS.designer, 'settings_users'],
    });
    await addUser(tenant, { preset: 'designer', name: 'Ann Lee' });
    await signInAs(s.email);
    await page.goto('/settings/users');
    await rowOf(page, 'Ann Lee').click();
    await expect(tid(page, 'users-inspector-name')).toHaveText('Ann Lee');
    await expect(tid(page, 'users-role-select')).toBeVisible();
    await expect(tid(page, 'user-set-password')).toHaveCount(0);
    await rowOf(page, 'Ann Lee').getByTestId('user-more').click();
    await expect(tid(page, 'user-menu-edit')).toBeVisible();
    await expect(tid(page, 'user-menu-set-password')).toHaveCount(0);
  });

  test('B3 errors and offline in the dialog', async ({ page, signInAs, context }) => {
    const tenant = await createTenant();
    const o = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    await addUser(tenant, { preset: 'designer', name: 'Ann Lee' });
    await signInAs(o.email);
    await page.goto('/settings/users');
    await rowOf(page, 'Ann Lee').click();
    await tid(page, 'user-set-password').click();
    const dialog = tid(page, 'set-password-dialog');

    // A refusal from the server shows its line and keeps the confirm step.
    await page.route('**/api/settings/users/*/password', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'password_target_refused', message_key: 'error.password_target_refused' },
        }),
      }),
    );
    await tid(page, 'set-password-confirm').click();
    await expect(tid(page, 'set-password-error')).toHaveText("You can't set a password for this person.");
    await expect(dialog).toHaveAttribute('data-step', 'confirm');

    await page.unroute('**/api/settings/users/*/password');
    await page.route('**/api/settings/users/*/password', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );
    await tid(page, 'set-password-confirm').click();
    await expect(tid(page, 'set-password-error')).toHaveText("Couldn't set the password. Try again.");
    await expect(tid(page, 'set-password-confirm')).toBeEnabled();

    // Offline: confirm disabled with the offline line.
    await context.setOffline(true);
    await expect(tid(page, 'set-password-offline')).toHaveText(
      "You're offline. Connect to set a password.",
    );
    await expect(tid(page, 'set-password-confirm')).toBeDisabled();
    await context.setOffline(false);

    // A 200 whose email failed still shows the password, with the line.
    await page.unroute('**/api/settings/users/*/password');
    await page.route('**/api/settings/users/*/password', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ password: 'Ab3dEf6hJk8mNp9q', emailSent: false }),
      }),
    );
    await tid(page, 'set-password-confirm').click();
    await expect(tid(page, 'set-password-value')).toHaveText('Ab3dEf6hJk8mNp9q');
    await expect(tid(page, 'set-password-email-failed')).toHaveText(
      "We couldn't email Ann Lee. Tell them their password was changed.",
    );
  });

  test('B4 touch targets @ipad', { tag: ['@ipad'] }, async ({ page, signInAs }) => {
    const tenant = await createTenant();
    const o = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    await addUser(tenant, { preset: 'designer', name: 'Ann Lee' });
    await signInAs(o.email);
    await page.goto('/settings/users');
    await rowOf(page, 'Ann Lee').getByTestId('user-more').click();
    const menu = tid(page, 'user-more-menu');
    await expect(tid(page, 'user-menu-set-password')).toBeVisible();
    expect(await expectTouchTargets(page, menu)).toBeGreaterThanOrEqual(1);
    await page.keyboard.press('Escape');
    await rowOf(page, 'Ann Lee').click();
    const section = tid(page, 'users-password');
    await section.scrollIntoViewIfNeeded();
    expect(await expectTouchTargets(page, section)).toBe(1);
    await tid(page, 'user-set-password').click();
    const dialog = tid(page, 'set-password-dialog');
    await expect(dialog).toHaveAttribute('data-step', 'confirm');
    expect(await expectTouchTargets(page, dialog)).toBe(2);
    await page.route('**/api/settings/users/*/password', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ password: 'Ab3dEf6hJk8mNp9q', emailSent: true }),
      }),
    );
    await tid(page, 'set-password-confirm').click();
    await expect(dialog).toHaveAttribute('data-step', 'shown');
    expect(await expectTouchTargets(page, dialog)).toBe(2);
  });
});
