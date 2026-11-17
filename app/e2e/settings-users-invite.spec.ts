// EZD-105 browser tests (AC-EZD-105-1, -2, -3, -4, -5, -6; PHASES slice 7 test script steps 1 and 2; the ticket
// row's Done-when "Invite arrives by email; Copy link works; accepting turns the row active"), desktop 1600 x 1000.
// Each test makes its own tenant through app/test-harness/users/fixtures.ts and signs in with signInAs. Expected
// values: boards S15j and S15j states wording (Invite user, Pick a role, English preselected, the Project access
// line, "Invite sent", "Invite sent to", Copy link, "Invite code", "The link and code work for 7 days, until",
// the refusal lines W16-W19), S15 Row: Copy link toast "Link copied", S15 D13 (Foreman starts on Listed),
// Q-0695 decisions 10 row 61 (GET of the link accepts nothing; Accept does and lands on Projects).
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createTenant,
  expect,
  harnessSql,
  readStubOutboxDir,
  test,
} from '../test-harness/e2e/test';
import { addUser, hex8 } from '../test-harness/users/fixtures';

const tid = (page: Page, id: string) => page.getByTestId(id);
const stubMail = (email: string) =>
  readStubOutboxDir(process.env.EMAIL_STUB_DIR as string).filter(
    (m) => m.to.toLowerCase() === email.toLowerCase(),
  );
const pendingRow = (page: Page) => page.locator('[data-testid="user-row"][data-status="invited"]');

async function statusOf(email: string): Promise<string | null> {
  const rows = await harnessSql()<{ status: string }[]>`
    select m.status from public.membership m join public.app_user u on u.id = m.user_id
    where u.email = ${email}`;
  return rows[0]?.status ?? null;
}

async function openInvite(page: Page) {
  await page.goto('/settings/users');
  await tid(page, 'users-invite').click();
  await expect(tid(page, 'invite-dialog')).toBeVisible();
}

test.describe('EZD-105 invite user', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('V1 invite a Foreman in Spanish, open the copied link in another browser, Accept: the row turns active (slice 7 steps 1, 2)', async ({
    page,
    signInAs,
    browser,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    const company = `Invite Co ${hex8()}`;
    await harnessSql()`update public.tenant set name = ${company} where id = ${tenant}::uuid`;
    const owner = await addUser(tenant, { preset: 'owner', name: 'Ada Owner' });
    await signInAs(owner.email);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await openInvite(page);

    // Just opened: English preselected, Pick a role, the Project access line.
    await expect(tid(page, 'invite-language-en')).toHaveAttribute('aria-pressed', 'true');
    await expect(tid(page, 'invite-email')).toHaveAttribute('placeholder', 'name@company.com');
    await expect(tid(page, 'invite-role').locator('option:checked')).toHaveText('Pick a role');
    await expect(tid(page, 'invite-access-default')).toHaveText(
      'Foreman, Crew and custom roles start on Listed projects. Owner and Designer start on All projects.',
    );

    const email = `luis.${hex8()}@example.com`;
    await tid(page, 'invite-email').fill(email);
    await tid(page, 'invite-name').fill('Luis Ortega');
    await tid(page, 'invite-role').selectOption({ label: 'Owner' });
    await expect(tid(page, 'invite-access-all')).toHaveAttribute('aria-pressed', 'true');
    await tid(page, 'invite-role').selectOption({ label: 'Foreman' });
    await expect(tid(page, 'invite-access-listed')).toHaveAttribute('aria-pressed', 'true');
    await tid(page, 'invite-language-es').click();
    await tid(page, 'invite-send').click();

    // Sent: the link with Copy link, the code and the end date.
    await expect(tid(page, 'invite-dialog')).toHaveAttribute('data-state-name', 'sent');
    await expect(page.getByRole('heading', { name: 'Invite sent' })).toBeVisible();
    await expect(tid(page, 'invite-sent-to')).toHaveText(`Invite sent to ${email}`);
    const link = await tid(page, 'invite-link').inputValue();
    expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
    await expect(tid(page, 'invite-code')).toHaveText(/^[0-9]{3} [0-9]{3}$/);
    await expect(tid(page, 'invite-expiry')).toContainText('The link and code work for 7 days, until');
    await tid(page, 'invite-copy-link').click();
    await expect(page.getByText('Link copied')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

    // One invite email, carrying the same link.
    await expect.poll(() => stubMail(email).length).toBe(1);
    expect(stubMail(email)[0].text).toContain(link);

    await tid(page, 'invite-done').click();
    await expect(tid(page, 'invite-dialog')).toHaveCount(0);
    await expect(pendingRow(page)).toHaveCount(1);
    await expect(pendingRow(page).getByTestId('user-name')).toHaveText('Invite pending');
    await expect(pendingRow(page).getByTestId('user-resend')).toBeVisible();
    await expect(pendingRow(page).getByTestId('user-copy-link')).toBeVisible();
    await expect(pendingRow(page).getByTestId('user-role')).toHaveText('Foreman');
    expect(await statusOf(email)).toBe('invited');

    // The invitee opens the link in another browser: the page shows Accept and accepts nothing.
    const origin = new URL(page.url()).origin;
    const other = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    try {
      const invitee = await other.newPage();
      const res = await invitee.goto(origin + new URL(link).pathname);
      expect(res?.headers()['referrer-policy']).toBe('no-referrer');
      await expect(invitee.getByTestId('invite-title')).toHaveText(`Join ${company} on EZ Draft`);
      await expect(invitee.getByTestId('invite-accept')).toBeVisible();
      expect(await statusOf(email)).toBe('invited');
      await invitee.getByTestId('invite-accept').click();
      await invitee.waitForURL((u) => !u.pathname.startsWith('/invite'));
      expect(new URL(invitee.url()).pathname).toBe('/');
      expect(await statusOf(email)).toBe('active');

      // The same link again: refused.
      await invitee.goto(origin + new URL(link).pathname);
      await expect(invitee.getByTestId('invite-invalid')).toBeVisible();
    } finally {
      await other.close();
    }

    await page.reload();
    await expect(pendingRow(page)).toHaveCount(0);
    const joined = page.locator('[data-testid="user-row"]', { hasText: 'Luis Ortega' });
    await expect(joined).toHaveAttribute('data-status', 'active');
  });

  test('V2 a refused email shows its line under Email and nothing is written', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const other = await createTenant();
    const owner = await addUser(tenant, { preset: 'owner', name: 'Bea Owner' });
    const elsewhere = await addUser(other, { preset: 'crew', name: 'Elsewhere' });
    await signInAs(owner.email);
    await openInvite(page);
    await tid(page, 'invite-role').selectOption({ label: 'Crew' });

    await tid(page, 'invite-email').fill('luis.ortega@example');
    await tid(page, 'invite-send').click();
    await expect(tid(page, 'invite-refusal')).toHaveText(
      'Enter a full email address, like name@company.com.',
    );

    await tid(page, 'invite-email').fill(owner.email);
    await tid(page, 'invite-send').click();
    await expect(tid(page, 'invite-refusal')).toHaveText('This person is already on your team.');

    await tid(page, 'invite-email').fill(elsewhere.email);
    await tid(page, 'invite-send').click();
    await expect(tid(page, 'invite-refusal')).toHaveText(
      'This email is already used by another company in EZ Draft. Ask for a different email.',
    );
    await expect(tid(page, 'invite-dialog')).toHaveAttribute('data-state-name', 'form');
    const [{ n }] = await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.membership where tenant_id = ${tenant}::uuid`;
    expect(n).toBe(1);
  });

  test('V3 Resend and Cancel invite on the pending row', async ({ page, signInAs }) => {
    const tenant = await createTenant();
    const owner = await addUser(tenant, { preset: 'owner', name: 'Cy Owner' });
    await signInAs(owner.email);
    await openInvite(page);
    const email = `pending.${hex8()}@example.com`;
    await tid(page, 'invite-email').fill(email);
    await tid(page, 'invite-role').selectOption({ label: 'Crew' });
    await tid(page, 'invite-send').click();
    const first = await tid(page, 'invite-link').inputValue();
    await tid(page, 'invite-done').click();

    await pendingRow(page).getByTestId('user-resend').click();
    await expect(page.getByText(`Invite sent to ${email}`)).toBeVisible();
    await expect.poll(() => stubMail(email).length).toBe(2);
    expect(stubMail(email).some((m) => m.text.includes(first))).toBe(true);
    expect(stubMail(email).filter((m) => m.text.includes(first))).toHaveLength(1);

    await pendingRow(page).getByTestId('user-more').click();
    await tid(page, 'user-menu-cancel-invite').click();
    await page.getByRole('button', { name: 'Cancel invite' }).last().click();
    await expect(pendingRow(page)).toHaveCount(0);
    expect(await statusOf(email)).toBeNull();
  });
});
