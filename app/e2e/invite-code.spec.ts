// EZD-138 browser tests (AC-EZD-138-1, -2, -3, -4, -5), desktop 1600 x 1000. Expected values: board S15j and its
// approved wording (pending row "Code 482 913" after Copy link for the last sender and Owners, nothing for anyone
// else with the Users switch; "Have an invite code?", "Join with an invite code", "Invite code", "Join", "Back to
// sign in", W9 one message, W10 locked); Q-0216 (last sender and Owners); Q-0695 decisions 10 row 61 (shown
// again after a reload, the invitee lands on Projects, single use, five wrong codes lock the code); Q-0035 (no
// everyday sign-in code or link is shown). Each test makes its own tenant.
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createTenant,
  expect,
  harnessSql,
  test,
  waitForAuthEmail,
} from '../test-harness/e2e/test';
import { addUser, hex8, PRESET_KEYS } from '../test-harness/users/fixtures';

const tid = (page: Page, id: string) => page.getByTestId(id);
const pendingRow = (page: Page) => page.locator('[data-testid="user-row"][data-status="invited"]');
const W9 = "That email and code don't match an open invite. Check both and try again.";
const W10 =
  'Too many wrong codes. This code is locked. Ask the person who invited you to resend the invite.';

async function statusOf(email: string): Promise<string | null> {
  const rows = await harnessSql()<{ status: string }[]>`
    select m.status from public.membership m join public.app_user u on u.id = m.user_id
    where u.email = ${email}`;
  return rows[0]?.status ?? null;
}

// Sends an invite from the Users page and answers the link and the code the dialog shows ("482 913").
async function sendInvite(page: Page, email: string): Promise<{ link: string; code: string }> {
  await page.goto('/settings/users');
  await tid(page, 'users-invite').click();
  await tid(page, 'invite-email').fill(email);
  await tid(page, 'invite-role').selectOption({ label: 'Crew' });
  await tid(page, 'invite-send').click();
  await expect(tid(page, 'invite-dialog')).toHaveAttribute('data-state-name', 'sent');
  const link = await tid(page, 'invite-link').inputValue();
  const code = (await tid(page, 'invite-code').textContent()) ?? '';
  await tid(page, 'invite-done').click();
  return { link, code };
}

async function usersJson(
  page: Page,
): Promise<{ text: string; rows: { membershipId: string; status: string; invite: unknown }[] }> {
  return page.evaluate(async () => {
    const res = await fetch('/api/settings/users', { credentials: 'same-origin' });
    const text = await res.text();
    return { text, rows: JSON.parse(text).rows };
  });
}

async function openInviteCode(page: Page) {
  await page.goto('/sign-in');
  await tid(page, 'sign-in-invite-code').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Join with an invite code');
}

test.describe('EZD-138 invite link and code', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('V1 the sender and the Owner see the code on the pending row, again after a reload; another Users holder does not (AC-1, AC-5)', async ({
    sessions,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    const owner = await addUser(tenant, { preset: 'owner', name: 'Ada Owner' });
    const keys = [...PRESET_KEYS.designer, 'settings_users'] as const;
    const sender = await addUser(tenant, {
      preset: 'designer',
      name: 'Sam Sender',
      granted: [...keys],
    });
    const other = await addUser(tenant, {
      preset: 'designer',
      name: 'Olga Other',
      granted: [...keys],
    });
    const [s, o, x] = await sessions.open([sender.email, owner.email, other.email]);

    const email = `luis.${hex8()}@example.com`;
    const sent = await sendInvite(s.page, email);
    expect(sent.code).toMatch(/^[0-9]{3} [0-9]{3}$/);
    await expect(pendingRow(s.page).getByTestId('user-invite-code')).toHaveText(
      `Code ${sent.code}`,
    );
    await s.page.reload();
    await expect(pendingRow(s.page).getByTestId('user-invite-code')).toHaveText(
      `Code ${sent.code}`,
    );
    const fromApi = await usersJson(s.page);
    const row = fromApi.rows.find((r) => r.status === 'invited');
    expect(row?.invite).toEqual({ link: sent.link, code: sent.code.replace(' ', '') });

    await o.page.goto('/settings/users');
    await expect(pendingRow(o.page).getByTestId('user-invite-code')).toHaveText(
      `Code ${sent.code}`,
    );

    await x.page.goto('/settings/users');
    await expect(pendingRow(x.page)).toHaveCount(1);
    await expect(pendingRow(x.page).getByTestId('user-resend')).toBeVisible();
    await expect(pendingRow(x.page).getByTestId('user-invite-code')).toHaveCount(0);
    const otherApi = await usersJson(x.page);
    expect(otherApi.rows.every((r) => r.invite === null)).toBe(true);
    expect(otherApi.text).not.toContain(sent.code.replace(' ', ''));
    expect(otherApi.text).not.toContain(new URL(sent.link).pathname);
  });

  test('V2 the invitee joins with email and code and lands on Projects; the code then refuses (AC-2, AC-4)', async ({
    page,
    sessions,
    browser,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    const owner = await addUser(tenant, { preset: 'owner', name: 'Bea Owner' });
    const [so] = await sessions.open([owner.email]);
    const email = `nina.${hex8()}@example.com`;
    const { code } = await sendInvite(so.page, email);
    const digits = code.replace(' ', '');
    const wrong = String((Number(digits) + 1) % 1_000_000).padStart(6, '0');

    await openInviteCode(page);
    await expect(
      page.getByText(
        'Use the email the invite was sent to and the 6-digit code from the invite email.',
      ),
    ).toBeVisible();
    await expect(tid(page, 'invite-code-submit')).toHaveText('Join');
    // Back to sign in and in again.
    await tid(page, 'invite-code-back').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to EZ Draft');
    await tid(page, 'sign-in-invite-code').click();

    // A wrong code and an unknown email: the one message.
    await tid(page, 'invite-code-email').fill(email);
    await tid(page, 'invite-code-code').fill(wrong);
    await tid(page, 'invite-code-submit').click();
    await expect(tid(page, 'invite-code-form')).toHaveAttribute('data-tries', '1');
    await expect(tid(page, 'invite-code-error')).toHaveText(W9);
    await tid(page, 'invite-code-email').fill(`nobody.${hex8()}@example.com`);
    await tid(page, 'invite-code-code').fill(digits);
    await tid(page, 'invite-code-submit').click();
    await expect(tid(page, 'invite-code-form')).toHaveAttribute('data-tries', '2');
    await expect(tid(page, 'invite-code-error')).toHaveText(W9);

    // The right email and the code as the dialog shows it.
    await tid(page, 'invite-code-email').fill(email);
    await tid(page, 'invite-code-code').fill(code);
    await tid(page, 'invite-code-submit').click();
    await page.waitForURL((u) => u.pathname === '/');
    expect(await statusOf(email)).toBe('active');

    // Single use: the same code in another browser gets the one message.
    const again = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    try {
      const p = await again.newPage();
      await openInviteCode(p);
      await tid(p, 'invite-code-email').fill(email);
      await tid(p, 'invite-code-code').fill(digits);
      await tid(p, 'invite-code-submit').click();
      await expect(tid(p, 'invite-code-form')).toHaveAttribute('data-tries', '1');
      await expect(tid(p, 'invite-code-error')).toHaveText(W9);
    } finally {
      await again.close();
    }
  });

  test('V3 the fifth wrong code locks the code (W10) and Join stays off until a field changes (AC-4)', async ({
    page,
    sessions,
  }) => {
    const tenant = await createTenant();
    const owner = await addUser(tenant, { preset: 'owner', name: 'Cy Owner' });
    const [so] = await sessions.open([owner.email]);
    const email = `omar.${hex8()}@example.com`;
    const { code } = await sendInvite(so.page, email);
    const digits = code.replace(' ', '');
    const wrong = String((Number(digits) + 1) % 1_000_000).padStart(6, '0');
    // Four wrong codes already typed.
    await harnessSql()`update public.invite i set code_tries = 4 from public.membership m
      join public.app_user u on u.id = m.user_id where i.membership_id = m.id and u.email = ${email}`;

    await openInviteCode(page);
    await tid(page, 'invite-code-email').fill(email);
    await tid(page, 'invite-code-code').fill(wrong);
    await tid(page, 'invite-code-submit').click();
    await expect(tid(page, 'invite-code-form')).toHaveAttribute('data-tries', '1');
    await expect(tid(page, 'invite-code-error')).toHaveText(W10);
    await expect(tid(page, 'invite-code-submit')).toBeDisabled();
    await tid(page, 'invite-code-code').fill(digits);
    await expect(tid(page, 'invite-code-submit')).toBeEnabled();
    await tid(page, 'invite-code-submit').click();
    await expect(tid(page, 'invite-code-form')).toHaveAttribute('data-tries', '2');
    await expect(tid(page, 'invite-code-error')).toHaveText(W10);
    expect(await statusOf(email)).toBe('invited');
  });

  test('V4 no everyday sign-in code or link of another person is on the Users page or in its API answer (AC-3)', async ({
    page,
    sessions,
  }) => {
    const tenant = await createTenant();
    const owner = await addUser(tenant, { preset: 'owner', name: 'Dee Owner' });
    const member = await addUser(tenant, { preset: 'crew', name: 'Max Member' });
    const [so] = await sessions.open([owner.email]);

    // The member asks for an everyday sign-in email.
    await page.goto('/sign-in');
    await tid(page, 'sign-in-email').fill(member.email);
    const after = new Date();
    await tid(page, 'sign-in-submit').click();
    await tid(page, 'sign-in-code').waitFor({ state: 'visible' });
    const mail = await waitForAuthEmail(member.email, { after });
    const secrets = [
      mail.code,
      ...[...new URL(mail.link).searchParams.values()].filter((v) => v.length >= 16),
    ];
    expect(secrets.length).toBeGreaterThan(1);

    await so.page.goto('/settings/users');
    await expect(
      so.page.locator('[data-testid="user-row"]', { hasText: 'Max Member' }),
    ).toBeVisible();
    const html = await so.page.content();
    const api = await usersJson(so.page);
    for (const value of secrets) {
      expect(html).not.toContain(value);
      expect(api.text).not.toContain(value);
    }
  });
});
