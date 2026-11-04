// EZD-108 T10-T21 and T23 (vault/plans/EZD-108.md sections 3, 4, 6; AC-EZD-108-1..8). Untagged, so desktop only
// (1600 x 1000). Helpers only from app/test-harness/e2e/test.ts. Every test makes its own tenant and members
// (createTenant / createMember / createPasswordMember, random emails, no seeded row changed). Texts are the
// plan's section 6 wording. Markup: section 3 data-testid rows; the unsaved prompt is EZD-103b's
// ([data-confirm], buttons Cancel, Discard, Save); the load error is EZD-015's InlineError
// ([role="alert"][data-state="error"]). Passwords are checked only by whether a sign-in succeeds (L-018).
// Stub emails are read from EMAIL_STUB_DIR. Each clean-state check runs in its own browser context.
// T23 (Q-0465 (a); R-046) uses EZD-034's same-origin stub script (window.__captchaStub), never Cloudflare.
import type { Browser, Page, Route } from '@playwright/test';
import { TURNSTILE_TEST_SITE_KEY } from '../src/server/auth/captcha-config';
import { en } from '../src/server/messages/catalogs/en';
import {
  adminDb,
  cleanup,
  cleanupTestMembers,
  closeHarness,
  createMember,
  createPasswordMember,
  createTenant,
  expect,
  harnessSql,
  randomPassword,
  readStubOutboxDir,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

const tid = (page: Page, id: string) => page.getByTestId(id);
const pathOf = (page: Page) => new URL(page.url()).pathname;
const stubMail = (email: string) =>
  readStubOutboxDir(process.env.EMAIL_STUB_DIR as string).filter(
    (m) => m.to.toLowerCase() === email.toLowerCase(),
  );

type Who = { email: string; appUserId: string; membershipId: string; password?: string };

async function makeMember(kind: 'code' | 'password', name: string | null = null): Promise<Who> {
  const tenant = await createTenant();
  let who: Who;
  if (kind === 'password') {
    const m = await createPasswordMember({ tenantId: tenant });
    who = {
      email: m.email,
      appUserId: m.appUserId,
      membershipId: m.membershipId,
      password: m.password,
    };
  } else {
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    who = { email: m.email, appUserId: m.appUserId, membershipId: m.membershipId };
  }
  await setPermissions(tenant, who.membershipId, ['settings_company']);
  if (name !== null) {
    const { error } = await adminDb().from('app_user').update({ name }).eq('id', who.appUserId);
    if (error) throw new Error(`name update failed: ${error.code}`);
  }
  return who;
}

async function openMenu(page: Page) {
  await tid(page, 'avatar-menu-trigger').click();
  await expect(tid(page, 'avatar-menu')).toBeVisible();
}

async function openProfile(page: Page) {
  await openMenu(page);
  await tid(page, 'avatar-menu-profile').click();
  await expect(tid(page, 'my-profile-dialog')).toBeVisible();
  await expect(tid(page, 'profile-language-en')).toBeVisible();
}

async function startAt(
  signInAs: (email: string) => Promise<unknown>,
  page: Page,
  who: Who,
  path = '/settings/company',
) {
  await signInAs(who.email);
  await page.goto(path);
  await expect(tid(page, 'avatar-menu-trigger')).toBeVisible();
}

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

async function fillPasswords(page: Page, current: string | null, next: string, confirm = next) {
  if (current !== null) await tid(page, 'profile-current-password').fill(current);
  await tid(page, 'profile-new-password').fill(next);
  await tid(page, 'profile-confirm-password').fill(confirm);
}

const T = en as Record<string, unknown>;
type Stub = { renders: unknown[]; resets: number; issue(): string };
const stubState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __captchaStub: Stub }).__captchaStub;
    return { renders: s.renders.length, resets: s.resets };
  });
const issueToken = (page: Page) =>
  page.evaluate(() => (window as unknown as { __captchaStub: Stub }).__captchaStub.issue());

// GET /api/profile answers as the server does plus the stub security check; any other method goes on.
async function withStubCaptcha(page: Page) {
  await page.route('**/api/profile', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const json = (await response.json()) as Record<string, unknown>;
    return route.fulfill({
      response,
      json: {
        ...json,
        captcha: { siteKey: TURNSTILE_TEST_SITE_KEY, scriptUrl: '/dev/captcha/stub' },
      },
    });
  });
}

const prompt = (page: Page) => page.locator('[data-confirm]');

// The item's icon draws: its svg use reaches a bounding box wider than 0 (plan 108 section 4, T10).
async function expectIconsDraw(page: Page, ids: string[]) {
  for (const id of ids) {
    await expect
      .poll(
        () =>
          tid(page, id)
            .locator('svg use')
            .first()
            .evaluate((el) => (el as unknown as SVGGraphicsElement).getBBox().width),
        { timeout: 5000 },
      )
      .toBeGreaterThan(0);
  }
}

test.describe('EZD-108 my profile', () => {
  test.afterAll(async () => {
    await cleanupTestMembers();
    await cleanup();
    await closeHarness();
  });

  test('T10 menu contents: name, email, then three items for an owner; no Company settings for a member without a switch', async ({
    page,
    signInAs,
  }) => {
    const owner = await makeMember('code', 'Mia Owner');
    await startAt(signInAs, page, owner);
    await openMenu(page);
    await expect(tid(page, 'avatar-menu-name')).toHaveText('Mia Owner');
    await expect(tid(page, 'avatar-menu-email')).toHaveText(owner.email);
    await expect(tid(page, 'avatar-menu').getByRole('menuitem')).toHaveText([
      'My profile',
      'Company settings',
      'Sign out',
    ]);
    const ys: number[] = [];
    for (const id of [
      'avatar-menu-name',
      'avatar-menu-email',
      'avatar-menu-profile',
      'avatar-menu-company-settings',
      'avatar-menu-sign-out',
    ]) {
      ys.push((await tid(page, id).boundingBox())?.y ?? Number.NaN);
    }
    expect(ys.every((y) => !Number.isNaN(y))).toBe(true);
    expect([...ys].sort((x, y) => x - y)).toEqual(ys);
    await expectIconsDraw(page, [
      'avatar-menu-profile',
      'avatar-menu-company-settings',
      'avatar-menu-sign-out',
    ]);
    const menuBox = await tid(page, 'avatar-menu').boundingBox();
    const headerBox = await page.locator('[data-settings-region="header"]').boundingBox();
    expect(menuBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    expect(
      Math.abs(menuBox!.x + menuBox!.width - (headerBox!.x + headerBox!.width)),
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(menuBox!.y - (headerBox!.y + headerBox!.height + 8))).toBeLessThanOrEqual(1);

    const tenant = await createTenant();
    const crew = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, crew.membershipId, []);
    const preset = await adminDb()
      .from('app_user')
      .update({ role_preset: 'crew' })
      .eq('id', crew.appUserId);
    expect(preset.error).toBeNull();
    await page.context().clearCookies();
    await startAt(signInAs, page, { ...crew }, '/settings');
    await openMenu(page);
    await expect(tid(page, 'avatar-menu-company-settings')).toHaveCount(0);
    await expect(tid(page, 'avatar-menu-profile')).toBeVisible();
    await expect(tid(page, 'avatar-menu-sign-out')).toBeVisible();
    await expectIconsDraw(page, ['avatar-menu-profile', 'avatar-menu-sign-out']);
  });

  test('T11 dialog: title, subtitle, one Profile tab and no Notifications', async ({
    page,
    signInAs,
  }) => {
    const who = await makeMember('code', 'Mia Owner');
    await startAt(signInAs, page, who);
    await openProfile(page);
    const dialog = tid(page, 'my-profile-dialog');
    await expect(dialog.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible();
    await expect(tid(page, 'my-profile-subtitle')).toHaveText(`Mia Owner · ${who.email}`);
    await expect(dialog.getByRole('tab')).toHaveCount(1);
    await expect(dialog.getByRole('tab')).toHaveText('Profile');
    await expect(tid(page, 'my-profile-tab-profile')).toHaveText('Profile');
    await expect(dialog.getByText('Notifications')).toHaveCount(0);
  });

  test('T12 EZD-108 done when: a member changes their language and it persists', async ({
    page,
    signInAs,
  }) => {
    const who = await makeMember('code');
    const other = await makeMember('code');
    await startAt(signInAs, page, who);
    await openProfile(page);
    await expect(tid(page, 'profile-language-en')).toHaveAttribute('aria-checked', 'true');
    await expect(tid(page, 'profile-save')).toBeDisabled();
    await tid(page, 'profile-language-es').click();
    await expect(tid(page, 'profile-save')).toBeEnabled();
    await tid(page, 'profile-save').click();
    await expect(tid(page, 'my-profile-dialog')).toHaveCount(0);

    await page.reload();
    await openProfile(page);
    await expect(tid(page, 'profile-language-es')).toHaveAttribute('aria-checked', 'true');
    await expect(tid(page, 'profile-language-en')).toHaveAttribute('aria-checked', 'false');

    const rows = await harnessSql()`
      select id, language from public.app_user where id in (${who.appUserId}::uuid, ${other.appUserId}::uuid)`;
    const byId = new Map(rows.map((r) => [r.id as string, r.language as string]));
    expect(byId.get(who.appUserId)).toBe('es');
    expect(byId.get(other.appUserId)).toBe('en');
  });

  test('T13 iPad drawing: an empty value shows Pencil or finger; Pencil only persists', async ({
    page,
    signInAs,
  }) => {
    const who = await makeMember('code');
    await startAt(signInAs, page, who);
    await openProfile(page);
    await expect(tid(page, 'profile-ipad-finger')).toHaveAttribute('aria-checked', 'true');
    await expect(tid(page, 'profile-ipad-pencil')).toHaveAttribute('aria-checked', 'false');
    await tid(page, 'profile-ipad-pencil').click();
    await expect(tid(page, 'profile-save')).toBeEnabled();
    await tid(page, 'profile-save').click();
    await expect(tid(page, 'my-profile-dialog')).toHaveCount(0);

    await page.reload();
    await openProfile(page);
    await expect(tid(page, 'profile-ipad-pencil')).toHaveAttribute('aria-checked', 'true');
    const rows = await harnessSql()`
      select ipad_input_mode from public.app_user where id = ${who.appUserId}::uuid`;
    expect(rows[0].ipad_input_mode).toBe('pencil');
  });

  test('T14 password messages: wrong current and mismatched new passwords show their text and send nothing', async ({
    page,
    signInAs,
    browser,
    baseURL,
  }) => {
    const who = await makeMember('password');
    const next = await randomPassword(who.email);
    await startAt(signInAs, page, who);
    await openProfile(page);
    await expect(tid(page, 'profile-password-heading')).toHaveText('Change password');

    await fillPasswords(page, `${who.password}x`, next);
    await tid(page, 'profile-password-submit').click();
    await expect(tid(page, 'profile-password-message')).toHaveText(
      'Your current password is wrong.',
    );

    await fillPasswords(page, who.password as string, next, `${next}x`);
    await tid(page, 'profile-password-submit').click();
    await expect(tid(page, 'profile-password-message')).toHaveText(
      "The new passwords don't match.",
    );

    expect(stubMail(who.email)).toHaveLength(0);
    expect(await signsInWithPassword(browser, baseURL, who.email, who.password as string)).toBe(
      true,
    );
  });

  test('T15 change password: this device stays signed in, the other session ends, the new password works', async ({
    sessions,
    browser,
    baseURL,
  }) => {
    const who = await makeMember('password');
    const next = await randomPassword(who.email);
    const [one, two] = await sessions.open([who.email, who.email]);
    await one.page.goto('/settings/company');
    await two.page.goto('/settings/company');
    await expect(tid(one.page, 'avatar-menu-trigger')).toBeVisible();
    await expect(tid(two.page, 'avatar-menu-trigger')).toBeVisible();

    await openProfile(one.page);
    await fillPasswords(one.page, who.password as string, next);
    await tid(one.page, 'profile-password-submit').click();
    await expect(tid(one.page, 'profile-password-message')).toHaveText('Password changed.');

    await one.page.reload();
    expect(pathOf(one.page).startsWith('/settings')).toBe(true);
    await expect(tid(one.page, 'avatar-menu-trigger')).toBeVisible();

    await two.page.reload();
    await two.page.waitForURL((u) => u.pathname === '/sign-in');

    expect(stubMail(who.email)).toHaveLength(1);
    expect(await signsInWithPassword(browser, baseURL, who.email, next)).toBe(true);
  });

  test('T16 sign out: the menu signs out and /settings then goes to sign-in', async ({
    page,
    signInAs,
  }) => {
    const who = await makeMember('code');
    await startAt(signInAs, page, who);
    await openMenu(page);
    await tid(page, 'avatar-menu-sign-out').click();
    await page.waitForURL((u) => u.pathname === '/sign-in');
    await page.goto('/settings');
    await page.waitForURL((u) => u.pathname === '/sign-in');
  });

  test('T17 unsaved guard: Company settings and Sign out ask first; Cancel keeps the page and the session', async ({
    page,
    signInAs,
  }) => {
    const who = await makeMember('code');
    await startAt(signInAs, page, who);
    await tid(page, 'company-name').fill('Unsaved Company Name');

    await openMenu(page);
    await tid(page, 'avatar-menu-company-settings').click();
    await expect(prompt(page)).toHaveCount(1);
    await expect(prompt(page).locator('h2')).toHaveText('Save your changes?');
    await prompt(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(prompt(page)).toHaveCount(0);
    expect(pathOf(page)).toBe('/settings/company');

    await openMenu(page);
    await tid(page, 'avatar-menu-sign-out').click();
    await expect(prompt(page)).toHaveCount(1);
    await expect(prompt(page).locator('h2')).toHaveText('Save your changes?');
    await prompt(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(prompt(page)).toHaveCount(0);
    expect(pathOf(page)).toBe('/settings/company');
    await expect(tid(page, 'company-name')).toHaveValue('Unsaved Company Name');
    await expect(tid(page, 'avatar-menu-trigger')).toBeVisible();
    const cookies = (await page.context().cookies()).filter(
      (c) => c.name.startsWith('sb-') && c.value !== '',
    );
    expect(cookies.length).toBeGreaterThan(0);
  });

  test('T18 set password: a code-only member sees two fields, sets it, and the password signs in', async ({
    page,
    signInAs,
    browser,
    baseURL,
  }) => {
    const who = await makeMember('code');
    const password = await randomPassword(who.email);
    await startAt(signInAs, page, who);
    await openProfile(page);
    const dialog = tid(page, 'my-profile-dialog');
    await expect(tid(page, 'profile-password-heading')).toHaveText('Set password');
    await expect(dialog.locator('input[type="password"]')).toHaveCount(2);
    await expect(tid(page, 'profile-current-password')).toHaveCount(0);

    await fillPasswords(page, null, password);
    await tid(page, 'profile-password-submit').click();
    await expect(tid(page, 'profile-password-message')).toHaveText(
      'Password set. You can now sign in with it.',
    );
    await expect(tid(page, 'profile-password-heading')).toHaveText('Change password');
    expect(stubMail(who.email)).toHaveLength(1);
    expect(await signsInWithPassword(browser, baseURL, who.email, password)).toBe(true);
  });

  test('T19 offline and load error: Save and password submit are disabled offline; a failed load shows Retry', async ({
    page,
    signInAs,
    network,
  }) => {
    const who = await makeMember('code');
    await startAt(signInAs, page, who);
    await openProfile(page);
    await tid(page, 'profile-language-es').click();
    await expect(tid(page, 'profile-save')).toBeEnabled();
    await network.set(page, 'off');
    await expect(tid(page, 'profile-save')).toBeDisabled();
    await expect(tid(page, 'profile-password-submit')).toBeDisabled();
    await network.set(page, 'on');
    await tid(page, 'profile-cancel').click();
    await expect(tid(page, 'my-profile-dialog')).toHaveCount(0);

    const block = (route: { abort: () => Promise<void> }) => route.abort();
    await page.route('**/api/profile', block);
    await openMenu(page);
    await tid(page, 'avatar-menu-profile').click();
    const dialog = tid(page, 'my-profile-dialog');
    const alert = dialog.locator('[role="alert"][data-state="error"]');
    await expect(alert).toContainText("Couldn't load your profile.");
    await page.unroute('**/api/profile', block);
    await alert.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(tid(page, 'profile-language-en')).toBeVisible();
    await expect(alert).toHaveCount(0);
  });

  test('T20 dialog download fails: a toast says so and no dialog opens; unblocked, it opens', async ({
    page,
    signInAs,
  }) => {
    const who = await makeMember('code');
    await startAt(signInAs, page, who);
    const block = (route: { abort: () => Promise<void> }) => route.abort();
    await page.route('**/_next/static/**', block);
    await openMenu(page);
    await tid(page, 'avatar-menu-profile').click();
    await expect(page.locator('[data-toast-viewport]')).toContainText(
      "Couldn't load your profile.",
    );
    await expect(tid(page, 'my-profile-dialog')).toHaveCount(0);

    await page.unroute('**/_next/static/**', block);
    await openMenu(page);
    await tid(page, 'avatar-menu-profile').click();
    await expect(tid(page, 'my-profile-dialog')).toBeVisible();
  });

  test('T21 menu keyboard: Enter, arrows with wrap, End, Home, Escape, ArrowUp, Tab and an outside click', async ({
    page,
    signInAs,
  }) => {
    const who = await makeMember('code');
    await startAt(signInAs, page, who);
    const trigger = tid(page, 'avatar-menu-trigger');
    const menu = tid(page, 'avatar-menu');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(tid(page, 'avatar-menu-profile')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(tid(page, 'avatar-menu-company-settings')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(tid(page, 'avatar-menu-sign-out')).toBeFocused();
    await page.keyboard.press('End');
    await expect(tid(page, 'avatar-menu-sign-out')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(tid(page, 'avatar-menu-profile')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('ArrowUp');
    await expect(tid(page, 'avatar-menu-sign-out')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(menu).toHaveCount(0);

    await trigger.click();
    await expect(menu).toBeVisible();
    await page.locator('[data-settings-region="content"]').click({ position: { x: 5, y: 5 } });
    await expect(menu).toHaveCount(0);
  });

  test('T23 security check: the widget sits above the button, a token gates and rides the change, a wrong password resets it', async ({
    sessions,
  }) => {
    const who = await makeMember('password');
    const next = await randomPassword(who.email);
    const [one] = await sessions.open([who.email]);
    const page = one.page;
    await withStubCaptcha(page);
    await page.goto('/settings');
    await expect(tid(page, 'avatar-menu-trigger')).toBeVisible();
    await openProfile(page);

    const dialog = tid(page, 'my-profile-dialog');
    const widget = dialog.getByTestId('captcha-stub-widget');
    await expect(widget).toBeVisible();
    const box = async (id: string) => (await tid(page, id).boundingBox()) as { y: number };
    const widgetBox = (await widget.boundingBox()) as { y: number };
    expect(widgetBox.y).toBeGreaterThan((await box('profile-confirm-password')).y);
    expect(widgetBox.y).toBeLessThan((await box('profile-password-submit')).y);

    await fillPasswords(page, `${who.password}x`, next);
    await expect(tid(page, 'profile-password-submit')).toBeDisabled();
    await issueToken(page);
    await expect(tid(page, 'profile-password-submit')).toBeEnabled();
    const posted = page.waitForRequest(
      (r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/profile/password',
    );
    await tid(page, 'profile-password-submit').click();
    expect((await posted).postDataJSON()).toMatchObject({ captchaToken: 'stub-token-1' });
    await expect(tid(page, 'profile-password-message')).toHaveText(
      T['error.current_password_wrong'] as string,
    );
    await expect.poll(async () => (await stubState(page)).resets).toBe(1);
    expect((await stubState(page)).renders).toBe(1);
    await expect(tid(page, 'profile-password-submit')).toBeDisabled();
  });

  test('T23 security check: a script that fails to load says so and the button stays disabled', async ({
    sessions,
  }) => {
    const who = await makeMember('password');
    const next = await randomPassword(who.email);
    const [one] = await sessions.open([who.email]);
    const page = one.page;
    await page.route('**/dev/captcha/stub', (r) => r.abort());
    await withStubCaptcha(page);
    await page.goto('/settings');
    await openProfile(page);
    await expect(tid(page, 'captcha-unavailable')).toHaveText(
      T['error.captcha_unavailable'] as string,
    );
    await fillPasswords(page, who.password as string, next);
    await expect(tid(page, 'profile-password-submit')).toBeDisabled();
  });

  test('T23 security check: a member setting a first password sees no widget and can submit', async ({
    sessions,
  }) => {
    const who = await makeMember('code');
    const next = await randomPassword(who.email);
    const [one] = await sessions.open([who.email]);
    const page = one.page;
    await withStubCaptcha(page);
    await page.goto('/settings');
    await openProfile(page);
    await expect(tid(page, 'profile-password-heading')).toHaveText('Set password');
    await fillPasswords(page, null, next);
    await expect(tid(page, 'my-profile-dialog').getByTestId('captcha')).toHaveCount(0);
    await expect(tid(page, 'profile-password-submit')).toBeEnabled();
  });

  test('T23 security check: a captcha_failed answer shows its message', async ({ sessions }) => {
    const who = await makeMember('password');
    const next = await randomPassword(who.email);
    const [one] = await sessions.open([who.email]);
    const page = one.page;
    await withStubCaptcha(page);
    await page.route('**/api/profile/password', (route) =>
      route.fulfill({
        status: 400,
        json: { error: { code: 'captcha_failed', message_key: 'error.captcha_failed' } },
      }),
    );
    await page.goto('/settings');
    await openProfile(page);
    await fillPasswords(page, who.password as string, next);
    await issueToken(page);
    await tid(page, 'profile-password-submit').click();
    await expect(tid(page, 'profile-password-message')).toHaveText(
      T['error.captcha_failed'] as string,
    );
  });
});
