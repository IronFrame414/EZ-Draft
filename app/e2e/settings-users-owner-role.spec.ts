// EZD-2024 browser tests (AC-EZD-2024-3; Q-0901, Josh "901 A"): on Settings › Users a settings_users holder who
// is not an Owner-preset member is not offered the Owner role in the inspector's Role select or the Invite
// dialog, and sees an Owner's role read-only with the line "Only an Owner can give or take away the Owner role."
// (the error.owner_role_owner_only text; wording for Josh in vault/build/assumptions/EZD-2024.md). An Owner is
// offered the Owner role in both. Each test makes its own tenant and signs in with signInAs.
import type { Page } from '@playwright/test';
import { cleanup, closeHarness, createTenant, expect, test } from '../test-harness/e2e/test';
import { addUser, PRESET_KEYS } from '../test-harness/users/fixtures';
import type { PermissionKey } from '../src/lib/permissions/catalog';

const tid = (page: Page, id: string) => page.getByTestId(id);
const rowOf = (page: Page, name: string) =>
  page.locator('[data-testid="user-row"]', { hasText: name });
const optionsOf = (page: Page, id: string) =>
  tid(page, id).evaluate((el) =>
    [...(el as HTMLSelectElement).options].filter((o) => !o.disabled).map((o) => o.text),
  );
const ONLY_OWNER = 'Only an Owner can give or take away the Owner role.';
const ADMIN_KEYS: PermissionKey[] = [...PRESET_KEYS.designer, 'settings_users'];

test.describe('EZD-2024 only an Owner can give or take away the Owner role', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('O1 a non-Owner holder is not offered Owner and sees an Owner’s role read-only', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const admin = await addUser(tenant, { preset: 'designer', name: 'Adam Admin', granted: ADMIN_KEYS });
    await addUser(tenant, { preset: 'owner', name: 'Olga Owner' });
    await addUser(tenant, { preset: 'crew', name: 'Cora Crew' });
    await signInAs(admin.email);
    await page.goto('/settings/users');

    // A Crew member: every role but Owner is offered; the select can be changed.
    await rowOf(page, 'Cora Crew').click();
    await expect(tid(page, 'users-role-select')).toBeEnabled();
    expect(await optionsOf(page, 'users-role-select')).toEqual(['Designer', 'Foreman', 'Crew']);
    await expect(tid(page, 'users-role-owner-only')).toHaveCount(0);

    // Their own row: no Owner either.
    await rowOf(page, 'Adam Admin').click();
    expect(await optionsOf(page, 'users-role-select')).not.toContain('Owner');

    // An Owner: the role shows Owner, read-only, with the reason; the switches stay editable (Q-0695).
    await rowOf(page, 'Olga Owner').click();
    await expect(tid(page, 'users-role-select')).toBeDisabled();
    await expect(tid(page, 'users-role-select').locator('option:checked')).toHaveText('Owner');
    await expect(tid(page, 'users-role-owner-only')).toHaveText(ONLY_OWNER);
    await tid(page, 'user-switch-export').click();
    await expect(tid(page, 'users-save-as-new-role')).toHaveCount(0);
    await expect(tid(page, 'users-save')).toBeEnabled();

    // The Invite dialog: no Owner.
    await tid(page, 'users-reset').click();
    await tid(page, 'users-invite').click();
    await expect(tid(page, 'invite-dialog')).toBeVisible();
    expect(await optionsOf(page, 'invite-role')).toEqual(['Designer', 'Foreman', 'Crew']);
  });

  test('O2 an Owner is offered Owner in the inspector and the Invite dialog', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const owner = await addUser(tenant, { preset: 'owner', name: 'Olga Owner' });
    await addUser(tenant, { preset: 'owner', name: 'Otto Owner' });
    await addUser(tenant, { preset: 'crew', name: 'Cora Crew' });
    await signInAs(owner.email);
    await page.goto('/settings/users');

    await rowOf(page, 'Cora Crew').click();
    expect(await optionsOf(page, 'users-role-select')).toEqual([
      'Owner',
      'Designer',
      'Foreman',
      'Crew',
    ]);
    await rowOf(page, 'Otto Owner').click();
    await expect(tid(page, 'users-role-select')).toBeEnabled();
    await expect(tid(page, 'users-role-owner-only')).toHaveCount(0);

    await tid(page, 'users-invite').click();
    await expect(tid(page, 'invite-dialog')).toBeVisible();
    expect(await optionsOf(page, 'invite-role')).toEqual(['Owner', 'Designer', 'Foreman', 'Crew']);
  });
});
