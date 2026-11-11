// EZD-104 B1-B10 (vault/plans/EZD-104.md sections 3, 4, 6; AC-EZD-104-1..7). Untagged tests are desktop only;
// B8 is @ipad. Each test makes its own tenant and members through EZD-006's fixtures and
// app/test-harness/users/fixtures.ts, signs in with signInAs, and never touches seeded rows. Test ids and en
// texts: plan sections 3 and 6 (the board text, Q-0695 05 row 141, Q-0719 (a)); counts and labels: 09n
// "Switch counts", "Status bar"; last-active labels: Q-0706. Text constants: middle dot, em dash, en dash (L-042).
import type { Page } from '@playwright/test';
import {
  adminDb,
  CREW_EMAIL,
  cleanup,
  closeHarness,
  createTenant,
  expect,
  expectTouchTargets,
  harnessSql,
  test,
} from '../test-harness/e2e/test';
import {
  addBulkMembers,
  addUser,
  deleteBulkUsers,
  hex8,
  lastActiveOf,
} from '../test-harness/users/fixtures';

const DOT = '·';
const DASH = '—';
const EN_DASH = '–';
const NO_ACCESS_EN = "You don't have access to this. Ask your supervisor.";
const LOAD_FAILED = "Couldn't load users.";
const COSTS_NOTE =
  'Company costs are hidden everywhere for users without "See company costs", and sell prices, markup and totals for users without "See sell prices", including exports and the field pack.';

const tid = (page: Page, id: string) => page.getByTestId(id);
const rows = (page: Page) => page.getByTestId('user-row');
const rowOf = (page: Page, name: string) =>
  page.locator('[data-testid="user-row"]', { hasText: name });
const status = (page: Page, id: 'users' | 'languages') =>
  page.locator(`[data-settings-status="${id}"]`);

// The B1 tenant: viewer V (Owner, Zed Owner), D (Designer, Ann Lee, en), F (Foreman + see_company_costs, Bo Field, es).
async function b1Tenant(opts: { fEmail?: string; dActive?: string; fActive?: string } = {}) {
  const tenant = await createTenant();
  const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner', language: 'en' });
  const d = await addUser(tenant, {
    preset: 'designer',
    name: 'Ann Lee',
    language: 'en',
    lastActiveAgo: opts.dActive,
  });
  const f = await addUser(tenant, {
    preset: 'foreman',
    granted: [
      'view_projects',
      'create_projects',
      'add_markup',
      'run_fast_renders',
      'export',
      'edit_field_tasks',
      'check_off_tasks',
      'photo_notes',
      'flag_conflict',
      'send_field_measurement',
      'settings_libraries',
      'see_company_costs',
    ],
    name: 'Bo Field',
    language: 'es',
    email: opts.fEmail,
    lastActiveAgo: opts.fActive,
  });
  return { tenant, v, d, f };
}

const bulkPrefixes: string[] = [];

test.describe('EZD-104 users table', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
      for (const p of bulkPrefixes) await deleteBulkUsers(p);
    } finally {
      await closeHarness();
    }
  });

  test('B1 rows show role, language, switches and last active', async ({ page, signInAs }) => {
    const { v } = await b1Tenant();
    await signInAs(v.email);
    await page.goto('/settings/users');
    await expect(rows(page)).toHaveCount(3);
    const names = ['Ann Lee', 'Bo Field', 'Zed Owner'];
    const avatars = ['AL', 'BF', 'ZO'];
    const roles = ['Designer', 'Foreman (modified)', 'Owner'];
    const tones = ['designer', 'foreman', 'owner'];
    const langs = ['EN', 'ES', 'EN'];
    const switches = ['26 / 37', '12 / 37', '37 / 37'];
    for (let i = 0; i < 3; i++) {
      const row = rows(page).nth(i);
      await expect(row.getByTestId('user-name')).toHaveText(names[i]);
      await expect(row.getByTestId('user-avatar')).toHaveText(avatars[i]);
      await expect(row.getByTestId('user-role')).toHaveText(roles[i]);
      await expect(row.getByTestId('user-role')).toHaveAttribute('data-tone', tones[i]);
      await expect(row.getByTestId('user-language')).toHaveText(langs[i]);
      await expect(row.getByTestId('user-permissions')).toHaveText(switches[i]);
    }
    await expect(rows(page).nth(2).getByTestId('user-role')).toHaveCSS(
      'background-color',
      'rgb(20, 23, 28)',
    );
  });

  test('B2 search filters as typed; no match', async ({ page, signInAs }) => {
    const { v } = await b1Tenant({ fEmail: `bo.field.${hex8()}@example.com` });
    await signInAs(v.email);
    await page.goto('/settings/users');
    await expect(rows(page)).toHaveCount(3);
    await tid(page, 'users-search').fill('ann');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first().getByTestId('user-name')).toHaveText('Ann Lee');
    await tid(page, 'users-search').fill('BO.FIELD');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first().getByTestId('user-name')).toHaveText('Bo Field');
    await tid(page, 'users-search').fill('zzz');
    await expect(tid(page, 'users-no-match')).toHaveText('No users match');
    await expect(tid(page, 'users-table')).toHaveCount(0);
    await expect(tid(page, 'users-invite-prompt')).toHaveCount(0);
    await tid(page, 'users-search').fill('');
    await expect(rows(page)).toHaveCount(3);
    await expect(tid(page, 'users-search')).toHaveAttribute('maxlength', '1000');
  });

  test('B3 pending row: Invite pending, sent date, dashed pill, Resend; Copy link for Owner preset only', async ({
    sessions,
  }) => {
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    const { data: role, error } = await adminDb()
      .from('role')
      .insert({ tenant_id: tenant, name: 'Office lead', default_permissions: ['settings_users'] })
      .select('id')
      .single();
    if (error || !role) throw new Error(`role insert failed: ${error?.message}`);
    const w = await addUser(tenant, {
      customRoleId: role.id as string,
      granted: ['settings_users'],
      name: 'Wes Lead',
    });
    const c = await addUser(tenant, {
      status: 'invited',
      preset: 'crew',
      name: null,
      invitedAgo: '2 days',
    });
    const stored = await harnessSql()<{ invited_at: Date }[]>`
      select invited_at from public.membership where id = ${c.membershipId}::uuid`;
    const invitedIso = stored[0].invited_at.toISOString();

    const [ownerSession, leadSession] = await sessions.open([v.email, w.email]);
    for (const [who, p] of [
      ['V', ownerSession.page],
      ['W', leadSession.page],
    ] as const) {
      await p.goto('/settings/users');
      const pending = p.locator('[data-testid="user-row"][data-status="invited"]');
      await expect(pending, who).toHaveCount(1);
      await expect(pending.getByTestId('user-name'), who).toHaveText('Invite pending');
      const date = await p.evaluate((iso) => {
        const d = new Date(iso);
        const base = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
        return d.getFullYear() === new Date().getFullYear() ? base : `${base}, ${d.getFullYear()}`;
      }, invitedIso);
      await expect(pending.getByTestId('user-sub'), who).toHaveText(
        `${c.email} ${DOT} sent ${date}`,
      );
      const pill = pending.getByTestId('user-role');
      await expect(pill, who).toHaveAttribute('data-tone', 'pending');
      await expect(pill, who).toHaveCSS('border-top-style', 'dashed');
      await expect(pending.getByTestId('user-resend'), who).toHaveCount(1);
      await expect(pending.getByTestId('user-copy-link'), who).toHaveCount(who === 'V' ? 1 : 0);
    }
  });

  test('B4 Up and Down move the selection and load the inspector; one member shows Invite your team', async ({
    page,
    signInAs,
    sessions,
  }) => {
    const { v } = await b1Tenant();
    await signInAs(v.email);
    await page.goto('/settings/users');
    await expect(rows(page)).toHaveCount(3);
    await expect(tid(page, 'users-inspector-empty')).toHaveText('Select a user');

    const selected = async (index: number | null) => {
      for (let i = 0; i < 3; i++)
        await expect(rows(page).nth(i)).toHaveAttribute(
          'aria-selected',
          i === index ? 'true' : 'false',
        );
    };
    await rows(page).nth(0).click();
    await selected(0);
    await expect(tid(page, 'users-inspector-name')).toHaveText('Ann Lee');
    await page.keyboard.press('ArrowDown');
    await selected(1);
    await expect(tid(page, 'users-inspector-name')).toHaveText('Bo Field');
    await page.keyboard.press('ArrowDown');
    await selected(2);
    await page.keyboard.press('ArrowDown');
    await selected(2);
    await page.keyboard.press('ArrowUp');
    await selected(1);

    await tid(page, 'users-inspector-close').click();
    await selected(null);
    await expect(tid(page, 'users-inspector-empty')).toHaveText('Select a user');

    await rowOf(page, 'Bo Field').click();
    await expect(tid(page, 'users-inspector-name')).toHaveText('Bo Field');
    await tid(page, 'users-search').fill('ann');
    await expect(rows(page)).toHaveCount(1);
    await expect(tid(page, 'users-inspector-empty')).toHaveText('Select a user');
    await expect(rowOf(page, 'Ann Lee')).toHaveAttribute('aria-selected', 'false');

    const tenant2 = await createTenant();
    const solo = await addUser(tenant2, { preset: 'owner', name: 'Solo Owner' });
    const [soloSession] = await sessions.open([solo.email]);
    await soloSession.page.goto('/settings/users');
    await expect(soloSession.page.getByTestId('user-row')).toHaveCount(1);
    await expect(soloSession.page.getByTestId('users-invite-team')).toHaveText('Invite your team');
  });

  test('B5 loading skeleton, error with Retry, no access', async ({ page, signInAs, sessions }) => {
    const { v } = await b1Tenant();
    await signInAs(v.email);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/settings/users**', async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto('/settings/users');
    await expect(page.locator('[data-testid="users-body"] [data-skeleton-group]')).toBeVisible();
    await expect(status(page, 'users')).toHaveCount(0);
    release();
    await expect(rows(page)).toHaveCount(3);
    await expect(status(page, 'users')).toHaveText(`3 active ${DOT} 0 invited`);

    await page.unroute('**/api/settings/users**');
    await page.route('**/api/settings/users**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
        }),
      }),
    );
    await tid(page, 'users-search').fill('a');
    const alert = page.locator('[data-testid="users-body"] [role="alert"][data-state="error"]');
    await expect(alert).toContainText(LOAD_FAILED);
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(status(page, 'users')).toHaveText(`3 active ${DOT} 0 invited`);

    await page.unroute('**/api/settings/users**');
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(rows(page)).toHaveCount(3);

    const [crew] = await sessions.open([CREW_EMAIL]);
    const res = await crew.page.goto('/settings/users');
    expect(res?.status()).toBe(200);
    expect(new URL(crew.page.url()).pathname).toBe('/settings/users');
    await expect(crew.page.getByTestId('no-access')).toHaveText(NO_ACCESS_EN);
  });

  test('B6 status bar counts', async ({ page, signInAs }) => {
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner', language: 'en' });
    await addUser(tenant, { preset: 'crew', name: 'Al One', language: 'en' });
    await addUser(tenant, { preset: 'crew', name: 'Bea Two', language: 'en' });
    await addUser(tenant, { preset: 'crew', name: 'Cy Three', language: 'es' });
    await addUser(tenant, { status: 'invited', preset: 'crew', name: null, language: 'es' });
    await addUser(tenant, {
      status: 'deactivated',
      preset: 'crew',
      name: 'Dee Gone',
      language: 'es',
    });
    await signInAs(v.email);
    await page.goto('/settings/users');
    await expect(status(page, 'users')).toHaveText(`4 active ${DOT} 1 invited`);
    await expect(status(page, 'languages')).toHaveText(`EN 3 ${DOT} ES 2`);
    await expect(page.locator('[data-settings-region="status-bar"]')).not.toContainText('Sync');
  });

  test("B7 last active labels and the viewer's own touch", async ({ page, signInAs }) => {
    const { v } = await b1Tenant({ dActive: '12 minutes 30 seconds' });
    await harnessSql()`update public.membership set last_active_at = null where id = ${v.membershipId}::uuid`;
    await signInAs(v.email);
    await page.goto('/settings/users');
    await expect(rowOf(page, 'Zed Owner').getByTestId('user-last-active')).toHaveText('Now');
    await expect.poll(async () => (await lastActiveOf(v.membershipId)) !== null).toBe(true);
    await expect(rowOf(page, 'Ann Lee').getByTestId('user-last-active')).toHaveText('12 min ago');
    await expect(rowOf(page, 'Bo Field').getByTestId('user-last-active')).toHaveText(DASH);
  });

  test('B8 touch targets @ipad', { tag: ['@ipad'] }, async ({ page, signInAs, sessions }) => {
    const prefix = `bulk-${hex8()}`;
    bulkPrefixes.push(prefix);
    const t1 = await createTenant();
    const v = await addUser(t1, { preset: 'owner', name: 'Zed Owner' });
    await addUser(t1, { status: 'invited', preset: 'crew', name: null });
    await addBulkMembers(t1, 54, prefix);
    await signInAs(v.email);
    await page.goto('/settings/users');
    const main = page.locator('main[data-settings-page="users"]');
    await expect(rows(page)).toHaveCount(50);
    expect(await expectTouchTargets(page, main)).toBe(4);
    await tid(page, 'users-next').click();
    await expect(rows(page)).toHaveCount(6);
    await tid(page, 'users-table').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await expectTouchTargets(page, main)).toBe(6);
    await rowOf(page, 'Zed Owner').click();
    await expect(tid(page, 'users-inspector-name')).toHaveText('Zed Owner');
    expect(await expectTouchTargets(page, page.getByTestId('users-inspector'))).toBe(1);

    const t2 = await createTenant();
    const solo = await addUser(t2, { preset: 'owner', name: 'Solo Owner' });
    const [soloSession] = await sessions.open([solo.email]);
    await soloSession.page.goto('/settings/users');
    await expect(soloSession.page.getByTestId('user-row')).toHaveCount(1);
    const soloMain = soloSession.page.locator('main[data-settings-page="users"]');
    expect(await expectTouchTargets(soloSession.page, soloMain)).toBe(3);
  });

  test('B9 pager over 50 rows keeps the search', async ({ page, signInAs }) => {
    const prefix = `bulk-${hex8()}`;
    bulkPrefixes.push(prefix);
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    await addBulkMembers(tenant, 54, prefix);
    await signInAs(v.email);
    await page.goto('/settings/users');
    await expect(rows(page)).toHaveCount(50);
    await expect(tid(page, 'users-range')).toHaveText(`1${EN_DASH}50 of 55`);
    await expect(tid(page, 'users-prev')).toBeDisabled();
    await expect(tid(page, 'users-next')).toBeEnabled();

    await tid(page, 'users-next').click();
    await expect(rows(page)).toHaveCount(5);
    await expect(tid(page, 'users-range')).toHaveText(`51${EN_DASH}55 of 55`);
    await expect(tid(page, 'users-next')).toBeDisabled();

    await tid(page, 'users-prev').click();
    await expect(tid(page, 'users-range')).toHaveText(`1${EN_DASH}50 of 55`);

    await tid(page, 'users-search').fill('bulk');
    await expect(tid(page, 'users-range')).toHaveText(`1${EN_DASH}50 of 54`);
    await tid(page, 'users-next').click();
    await expect(rows(page)).toHaveCount(4);
    await expect(tid(page, 'users-range')).toHaveText(`51${EN_DASH}54 of 54`);
    await expect(tid(page, 'users-search')).toHaveValue('bulk');
  });

  test('B10 costs info note under the table, in every state', async ({
    page,
    signInAs,
    sessions,
  }) => {
    const { v } = await b1Tenant();
    await signInAs(v.email);
    await page.goto('/settings/users');
    await expect(rows(page)).toHaveCount(3);
    const note = tid(page, 'users-costs-note');
    await expect(note).toHaveAttribute('role', 'note');
    await expect(note).toHaveText(COSTS_NOTE);
    await expect(note).toHaveCSS('background-color', 'rgb(246, 247, 249)');
    const placed = await page.evaluate(() => {
      const main = document.querySelector('main[data-settings-page="users"]');
      const body = document.querySelector('[data-testid="users-body"]');
      const found = document.querySelector('[data-testid="users-costs-note"]');
      if (!main || !body || !found) return false;
      const footer = document.querySelector('[data-testid="users-footer"]');
      return (
        main.contains(found) &&
        !body.contains(found) &&
        footer !== null &&
        body.nextElementSibling === footer &&
        footer.contains(found)
      );
    });
    expect(placed).toBe(true);

    await page.route('**/api/settings/users**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
        }),
      }),
    );
    await page.goto('/settings/users');
    await expect(
      page.locator('[data-testid="users-body"] [role="alert"][data-state="error"]'),
    ).toContainText(LOAD_FAILED);
    await expect(tid(page, 'users-costs-note')).toBeVisible();

    const [crew] = await sessions.open([CREW_EMAIL]);
    await crew.page.goto('/settings/users');
    await expect(crew.page.getByTestId('no-access')).toBeVisible();
    await expect(crew.page.getByTestId('users-costs-note')).toHaveCount(0);
  });
});
