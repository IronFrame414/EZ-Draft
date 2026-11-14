// EZD-106 browser tests (AC-EZD-106-2, -3, -4, -5, -6, -9; PHASES slice 7 test script steps 3 and 5), desktop
// 1600 x 1000. Each test makes its own tenant through app/test-harness/users/fixtures.ts and signs in with
// signInAs. Expected values: 09n "Switch counts" (Foreman 11 / 37; one unticked 10; Reset back to 11; Crew 4),
// board S15 and Q-0695 decisions 05 row 141 ("Unsaved: 1 change from Foreman preset", "Reset to preset",
// "Foreman (modified)"), Q-0228 (prompt "Save your changes?"), Q-0706 (Copy link for active Owner-preset
// members only), S15 States Error (edits kept, Retry).
import type { Page } from '@playwright/test';
import {
  adminDb,
  cleanup,
  closeHarness,
  createTenant,
  expect,
  harnessSql,
  test,
} from '../test-harness/e2e/test';
import {
  addBulkMembers,
  addUser,
  deleteBulkUsers,
  hex8,
  PRESET_KEYS,
} from '../test-harness/users/fixtures';

const tid = (page: Page, id: string) => page.getByTestId(id);
const rowOf = (page: Page, name: string) =>
  page.locator('[data-testid="user-row"]', { hasText: name });
const selectedRoleText = (page: Page) =>
  tid(page, 'users-role-select').evaluate((el) => {
    const s = el as HTMLSelectElement;
    return s.options[s.selectedIndex]?.text ?? '';
  });

async function grantedOf(membershipId: string): Promise<string[]> {
  const rows = await harnessSql()<{ k: string }[]>`
    select permission_key as k from public.user_permission
    where membership_id = ${membershipId}::uuid and granted order by permission_key`;
  return rows.map((r) => r.k);
}

const bulkPrefixes: string[] = [];

test.describe('EZD-106 user inspector', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
      for (const p of bulkPrefixes) await deleteBulkUsers(p);
    } finally {
      await closeHarness();
    }
  });

  test('I1 untick, Reset, untick and Save: Modified pill and 10 / 37 (slice 7 step 3)', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    const f = await addUser(tenant, { preset: 'foreman', name: 'Bo Field' });
    await signInAs(v.email);
    await page.goto('/settings/users');
    await rowOf(page, 'Bo Field').click();
    await expect(tid(page, 'users-permissions-count')).toHaveText('11 of 37');
    expect(await selectedRoleText(page)).toBe('Foreman');
    await expect(tid(page, 'users-save')).toBeDisabled();
    await expect(tid(page, 'users-unsaved')).toHaveCount(0);

    await tid(page, 'user-switch-export').click();
    await expect(tid(page, 'users-permissions-count')).toHaveText('10 of 37');
    await expect(
      page.locator(
        '[data-testid="users-group"][data-group="issue_send"] [data-testid="users-group-count"]',
      ),
    ).toHaveText('0 of 4');
    expect(await selectedRoleText(page)).toBe('Foreman (modified)');
    await expect(tid(page, 'users-unsaved')).toHaveText('Unsaved: 1 change from Foreman preset');
    await expect(tid(page, 'users-reset')).toHaveText('Reset to preset');

    await tid(page, 'users-reset').click();
    await expect(tid(page, 'users-permissions-count')).toHaveText('11 of 37');
    expect(await selectedRoleText(page)).toBe('Foreman');
    await expect(tid(page, 'users-unsaved')).toHaveCount(0);
    expect(await grantedOf(f.membershipId)).toEqual([...PRESET_KEYS.foreman].sort());

    await tid(page, 'user-switch-export').click();
    await tid(page, 'users-save').click();
    await expect(tid(page, 'users-unsaved')).toHaveCount(0);
    await expect(rowOf(page, 'Bo Field').getByTestId('user-role')).toHaveText('Foreman (modified)');
    await expect(rowOf(page, 'Bo Field').getByTestId('user-permissions')).toHaveText('10 / 37');
    expect(await grantedOf(f.membershipId)).toEqual(
      PRESET_KEYS.foreman.filter((k) => k !== 'export').sort(),
    );
  });

  test('I2 choosing a role re-ticks the switches; Ctrl+S saves role and language', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    const f = await addUser(tenant, { preset: 'foreman', name: 'Bo Field', language: 'en' });
    await signInAs(v.email);
    await page.goto('/settings/users');
    await rowOf(page, 'Bo Field').click();
    await tid(page, 'users-role-select').selectOption({ label: 'Crew' });
    await expect(tid(page, 'users-permissions-count')).toHaveText('4 of 37');
    await tid(page, 'users-language-es').click();
    await expect(tid(page, 'users-language-es')).toHaveAttribute('aria-pressed', 'true');
    await expect(tid(page, 'users-unsaved')).toHaveText('Unsaved: 9 changes from Crew preset');
    await page.keyboard.press('Control+s');
    await expect(tid(page, 'users-unsaved')).toHaveCount(0);
    await expect(rowOf(page, 'Bo Field').getByTestId('user-role')).toHaveText('Crew');
    await expect(rowOf(page, 'Bo Field').getByTestId('user-language')).toHaveText('ES');
    expect(await grantedOf(f.membershipId)).toEqual([...PRESET_KEYS.crew].sort());
  });

  test('I3 the only holder cannot untick their own Users switch (slice 7 step 5)', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    await signInAs(v.email);
    await page.goto('/settings/users');
    await rowOf(page, 'Zed Owner').click();
    await tid(page, 'user-switch-settings_users').click();
    await tid(page, 'users-save').click();
    await expect(tid(page, 'users-inspector-error')).toContainText(
      'At least one active person must keep the Users + permissions page switch.',
    );
    await expect(tid(page, 'users-permissions-count')).toHaveText('36 of 37');
    expect(await grantedOf(v.membershipId)).toContain('settings_users');
  });

  test('I4 a failed save keeps the edits and shows Retry', async ({ page, signInAs }) => {
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    const c = await addUser(tenant, { preset: 'crew', name: 'Cal Crew' });
    await signInAs(v.email);
    await page.goto('/settings/users');
    await rowOf(page, 'Cal Crew').click();
    await tid(page, 'user-switch-export').click();
    await page.route(`**/api/settings/users/${c.membershipId}`, (route) =>
      route.fulfill({ status: 500, body: '{}' }),
    );
    await tid(page, 'users-save').click();
    const error = tid(page, 'users-inspector-error');
    await expect(error).toContainText("Couldn't save. Your changes are still here.");
    await expect(tid(page, 'users-permissions-count')).toHaveText('5 of 37');
    await page.unroute(`**/api/settings/users/${c.membershipId}`);
    await error.getByRole('button', { name: 'Retry' }).click();
    await expect(tid(page, 'users-unsaved')).toHaveCount(0);
    expect(await grantedOf(c.membershipId)).toEqual([...PRESET_KEYS.crew, 'export'].sort());
  });

  test('I5 changing the selection with edits asks Save, Discard or Cancel', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    const c = await addUser(tenant, { preset: 'crew', name: 'Cal Crew' });
    await signInAs(v.email);
    await page.goto('/settings/users');
    await rowOf(page, 'Cal Crew').click();
    await tid(page, 'user-switch-export').click();
    await rowOf(page, 'Zed Owner').click();
    const dialog = page.locator('[data-confirm]');
    await expect(dialog).toContainText('Save your changes?');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(tid(page, 'users-inspector-name')).toHaveText('Cal Crew');
    await expect(tid(page, 'users-permissions-count')).toHaveText('5 of 37');

    await rowOf(page, 'Zed Owner').click();
    await page.locator('[data-confirm-discard]').click();
    await expect(tid(page, 'users-inspector-name')).toHaveText('Zed Owner');
    await rowOf(page, 'Cal Crew').click();
    await expect(tid(page, 'users-permissions-count')).toHaveText('4 of 37');
    expect(await grantedOf(c.membershipId)).toEqual([...PRESET_KEYS.crew].sort());
  });

  test('I6 More menu: Deactivate, Reactivate, then Remove after the confirm', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    const c = await addUser(tenant, { preset: 'crew', name: 'Cal Crew' });
    await signInAs(v.email);
    await page.goto('/settings/users');
    const row = () => rowOf(page, 'Cal Crew');

    await row().getByTestId('user-more').click();
    await tid(page, 'user-menu-deactivate').click();
    await expect(row()).toHaveAttribute('data-status', 'deactivated');
    await expect(row().getByTestId('user-deactivated')).toHaveText('Deactivated');

    await row().getByTestId('user-more').click();
    await expect(tid(page, 'user-menu-deactivate')).toHaveCount(0);
    await tid(page, 'user-menu-reactivate').click();
    await expect(row()).toHaveAttribute('data-status', 'active');

    await row().getByTestId('user-more').click();
    await tid(page, 'user-menu-remove').click();
    const dialog = page.locator('[data-confirm]');
    await expect(dialog).toContainText('Remove Cal Crew?');
    await dialog.getByRole('button', { name: 'Remove' }).click();
    await expect(row()).toHaveCount(0);
    const left =
      await harnessSql()`select 1 from public.membership where id = ${c.membershipId}::uuid`;
    expect(left).toHaveLength(0);
  });

  test('I7 a selected invite shows its details, Resend and Cancel invite; Copy link for the Owner preset only', async ({
    sessions,
  }) => {
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    const { data: role, error } = await adminDb()
      .from('role')
      .insert({ tenant_id: tenant, name: 'Office lead', default_permissions: ['settings_users'] })
      .select('id')
      .single();
    expect(error).toBeNull();
    const lead = await addUser(tenant, {
      customRoleId: role!.id as string,
      granted: ['settings_users'],
      name: 'Lee Office',
    });
    const inv = await addUser(tenant, {
      status: 'invited',
      preset: 'crew',
      name: null,
      invitedAgo: '1 day',
    });
    const [owner, office] = await sessions.open([v.email, lead.email]);
    for (const [s, copy] of [
      [owner, 1],
      [office, 0],
    ] as const) {
      await s.page.goto('/settings/users');
      await s.page.locator(`[data-membership-id="${inv.membershipId}"]`).click();
      await expect(s.page.getByTestId('users-invite-details')).toContainText(
        `Invite sent to ${inv.email}`,
      );
      await expect(s.page.getByTestId('users-inspector-resend')).toBeVisible();
      await expect(s.page.getByTestId('users-inspector-cancel-invite')).toBeVisible();
      await expect(s.page.getByTestId('users-inspector-copy-link')).toHaveCount(copy);
      await expect(s.page.getByTestId('user-switch-export')).toBeEnabled();
    }
  });
  test('I8 a search that hides the edited row keeps the edits until the prompt is answered', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    const c = await addUser(tenant, { preset: 'crew', name: 'Cal Crew' });
    await signInAs(v.email);
    await page.goto('/settings/users');
    await rowOf(page, 'Cal Crew').click();
    await tid(page, 'user-switch-export').click();
    await tid(page, 'users-search').fill('Zed');
    await expect(page.getByTestId('user-row')).toHaveCount(1);
    await expect(tid(page, 'users-inspector-name')).toHaveText('Cal Crew');
    await expect(tid(page, 'users-permissions-count')).toHaveText('5 of 37');
    await expect(tid(page, 'users-unsaved')).toHaveText('Unsaved: 1 change from Crew preset');

    await rowOf(page, 'Zed Owner').click();
    const dialog = page.locator('[data-confirm]');
    await expect(dialog).toContainText('Save your changes?');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(tid(page, 'users-inspector-name')).toHaveText('Cal Crew');
    await expect(tid(page, 'users-permissions-count')).toHaveText('5 of 37');

    await rowOf(page, 'Zed Owner').click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(tid(page, 'users-inspector-name')).toHaveText('Zed Owner');
    expect(await grantedOf(c.membershipId)).toEqual([...PRESET_KEYS.crew, 'export'].sort());
  });

  test('I9 Next on a long list keeps the edited member and asks before another row is selected', async ({
    page,
    signInAs,
  }) => {
    const prefix = `bulk-${hex8()}`;
    bulkPrefixes.push(prefix);
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Aa Owner' });
    await addBulkMembers(tenant, 54, prefix);
    await signInAs(v.email);
    await page.goto('/settings/users');
    await expect(page.getByTestId('user-row')).toHaveCount(50);
    await rowOf(page, 'Aa Owner').click();
    await tid(page, 'users-language-es').click();
    await tid(page, 'users-next').click();
    await expect(page.getByTestId('user-row')).toHaveCount(5);
    await expect(tid(page, 'users-inspector-name')).toHaveText('Aa Owner');
    await expect(tid(page, 'users-language-es')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('user-row').first().click();
    const dialog = page.locator('[data-confirm]');
    await expect(dialog).toContainText('Save your changes?');
    await page.locator('[data-confirm-discard]').click();
    await expect(tid(page, 'users-inspector-name')).not.toHaveText('Aa Owner');
    const lang = await harnessSql()<{ language: string }[]>`
      select language from public.app_user where id = ${v.appUserId}::uuid`;
    expect(lang[0].language).toBe('en');
  });
});
