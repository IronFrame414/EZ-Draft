// EZD-107 browser tests (AC-EZD-107-1, -2, -3; PHASES slice 7 test script step 4), desktop 1600 x 1000. Each
// test makes its own tenant through app/test-harness/users/fixtures.ts and signs in with signInAs. Expected
// values: 09n "Switch counts" (Foreman 11 / 37; one unticked 10), board S15k and its approved wording ("Roles",
// "No user limit", preset summaries per Q-0695 decisions 05 row 141, "Custom · n of 37", "Preset · can't be
// changed", "New role from Foreman", "Give the role a name.", 'A role named "Foreman" already exists.',
// "Can't delete: 1 person holds this role. Move them first."), S15 Save as new role (shown only when modified;
// saves the switches as a role and assigns it), Q-0695 decisions 03 row 35 (editing a role changes its
// defaults only; delete only when nobody holds it).
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createTenant,
  expect,
  harnessSql,
  test,
} from '../test-harness/e2e/test';
import { addUser, PRESET_KEYS } from '../test-harness/users/fixtures';

const tid = (page: Page, id: string) => page.getByTestId(id);
const rowOf = (page: Page, name: string) =>
  page.locator('[data-testid="user-row"]', { hasText: name });
const cardOf = (page: Page, name: string) =>
  page.locator('[data-testid="role-card"]', { hasText: name });
const selectedRoleText = (page: Page) =>
  tid(page, 'users-role-select').evaluate((el) => {
    const s = el as HTMLSelectElement;
    return s.options[s.selectedIndex]?.text ?? '';
  });

async function roleByName(tenant: string, name: string) {
  const rows = await harnessSql()<{ id: string; default_permissions: string[] }[]>`
    select id, default_permissions from public.role
    where tenant_id = ${tenant}::uuid and name = ${name}`;
  return rows[0] ?? null;
}

async function grantedOf(membershipId: string): Promise<string[]> {
  const rows = await harnessSql()<{ k: string }[]>`
    select permission_key as k from public.user_permission
    where membership_id = ${membershipId}::uuid and granted order by permission_key`;
  return rows.map((r) => r.k);
}

test.describe('EZD-107 custom roles', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('R1 Save as new role from a modified Foreman, then give that role to a Crew member (slice 7 step 4)', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    const f = await addUser(tenant, { preset: 'foreman', name: 'Bo Field' });
    const c = await addUser(tenant, { preset: 'crew', name: 'Cal Crew' });
    await signInAs(v.email);
    await page.goto('/settings/users');

    await expect(tid(page, 'roles-row')).toContainText('Roles');
    await expect(tid(page, 'roles-row')).toContainText('No user limit');
    await expect(tid(page, 'role-card-summary')).toHaveText([
      'Everything, incl. users and settings',
      'All but delete, issue, users',
      'Field, fast renders, export',
      'Tasks, photos, measure, flag',
    ]);
    await expect(tid(page, 'role-new')).toHaveText('New role');

    await rowOf(page, 'Bo Field').click();
    await expect(tid(page, 'users-save-as-new-role')).toHaveCount(0);
    await tid(page, 'user-switch-export').click();
    await expect(tid(page, 'users-permissions-count')).toHaveText('10 of 37');
    await expect(tid(page, 'users-save-as-new-role')).toHaveText('Save as new role');
    await tid(page, 'users-save-as-new-role').click();
    const dialog = tid(page, 'new-role-dialog');
    await expect(dialog).toContainText('Save as new role');
    await expect(tid(page, 'new-role-start')).toHaveCount(0);
    await tid(page, 'new-role-name').fill('Lead carpenter');
    await tid(page, 'new-role-create').click();
    await expect(dialog).toHaveCount(0);

    // The role exists with the person's switches, and the person holds it unmodified.
    await expect(cardOf(page, 'Lead carpenter').getByTestId('role-card-summary')).toHaveText(
      'Custom · 10 of 37',
    );
    await expect(rowOf(page, 'Bo Field').getByTestId('user-role')).toHaveText('Lead carpenter');
    await expect(rowOf(page, 'Bo Field').getByTestId('user-permissions')).toHaveText('10 / 37');
    const made = await roleByName(tenant, 'Lead carpenter');
    expect([...made!.default_permissions].sort()).toEqual(
      PRESET_KEYS.foreman.filter((k) => k !== 'export').sort(),
    );
    const held = await harnessSql()<{ role_id: string }[]>`
      select role_id from public.membership where id = ${f.membershipId}::uuid`;
    expect(held[0].role_id).toBe(made!.id);

    // Assign it to someone else.
    await rowOf(page, 'Cal Crew').click();
    await tid(page, 'users-role-select').selectOption({ label: 'Lead carpenter' });
    expect(await selectedRoleText(page)).toBe('Lead carpenter');
    await expect(tid(page, 'users-permissions-count')).toHaveText('10 of 37');
    await tid(page, 'users-save').click();
    await expect(rowOf(page, 'Cal Crew').getByTestId('user-role')).toHaveText('Lead carpenter');
    await expect(rowOf(page, 'Cal Crew').getByTestId('user-permissions')).toHaveText('10 / 37');
    expect(await grantedOf(c.membershipId)).toEqual(
      PRESET_KEYS.foreman.filter((k) => k !== 'export').sort(),
    );

    // The holder count follows both assignments without a page reload (AC-3: Delete only at 0 holders).
    await cardOf(page, 'Lead carpenter').click();
    await expect(tid(page, 'role-panel-sub')).toHaveText('Custom role · 2 people');
    await expect(tid(page, 'role-delete')).toBeDisabled();
    await expect(tid(page, 'role-cant-delete')).toHaveText(
      "Can't delete: 2 people hold this role. Move them first.",
    );
  });

  test('R4 New role with unsaved role edits asks Save / Discard / Cancel first', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    await signInAs(v.email);
    await page.goto('/settings/users');
    await tid(page, 'role-new').click();
    await tid(page, 'new-role-name').fill('Draft role');
    await tid(page, 'new-role-create').click();
    await expect(tid(page, 'role-panel-name')).toHaveText('Draft role');
    await tid(page, 'role-panel').getByTestId('user-switch-export').click();
    await expect(tid(page, 'role-unsaved')).toHaveText('Unsaved: 1 change');

    // Cancel keeps the edits and opens no dialog.
    await tid(page, 'role-new').click();
    const prompt = page.locator('[data-confirm]');
    await expect(prompt).toContainText('Save your changes?');
    await prompt.getByRole('button', { name: 'Cancel' }).click();
    await expect(tid(page, 'new-role-dialog')).toHaveCount(0);
    await expect(tid(page, 'role-unsaved')).toHaveText('Unsaved: 1 change');

    // Save writes the edit, then the dialog opens.
    await tid(page, 'role-new').click();
    await page.locator('[data-confirm]').getByRole('button', { name: 'Save' }).click();
    await expect(tid(page, 'new-role-dialog')).toBeVisible();
    expect((await roleByName(tenant, 'Draft role'))!.default_permissions).toEqual(['export']);
  });

  test('R3 assigning a custom role with the Role select updates its holders; removing the holder frees Delete', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    await addUser(tenant, { preset: 'crew', name: 'Cal Crew' });
    await signInAs(v.email);
    await page.goto('/settings/users');

    await tid(page, 'role-new').click();
    await tid(page, 'new-role-name').fill('Helper');
    await tid(page, 'new-role-create').click();
    await expect(tid(page, 'role-panel-sub')).toHaveText('Custom role · 0 people');
    await expect(tid(page, 'role-delete')).toBeEnabled();

    await rowOf(page, 'Cal Crew').click();
    await tid(page, 'users-role-select').selectOption({ label: 'Helper' });
    await tid(page, 'users-save').click();
    await expect(rowOf(page, 'Cal Crew').getByTestId('user-role')).toHaveText('Helper');

    await cardOf(page, 'Helper').click();
    await expect(tid(page, 'role-panel-sub')).toHaveText('Custom role · 1 person');
    await expect(tid(page, 'role-delete')).toBeDisabled();
    await expect(tid(page, 'role-cant-delete')).toHaveText(
      "Can't delete: 1 person holds this role. Move them first.",
    );

    // Remove the holder from the More menu: the role is free again.
    await rowOf(page, 'Cal Crew').getByTestId('user-more').click();
    await tid(page, 'user-menu-remove').click();
    await page.locator('[data-confirm]').getByRole('button', { name: 'Remove' }).click();
    await expect(rowOf(page, 'Cal Crew')).toHaveCount(0);
    await cardOf(page, 'Helper').click();
    await expect(tid(page, 'role-panel-sub')).toHaveText('Custom role · 0 people');
    await expect(tid(page, 'role-cant-delete')).toHaveCount(0);
    await expect(tid(page, 'role-delete')).toBeEnabled();
  });

  test('R2 New role: blank and taken names refused; starts from a preset; edit and delete; presets read-only', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
    const f = await addUser(tenant, { preset: 'foreman', name: 'Bo Field' });
    await signInAs(v.email);
    await page.goto('/settings/users');

    // A preset opens read-only.
    await cardOf(page, 'Foreman').click();
    const panel = tid(page, 'role-panel');
    await expect(tid(page, 'role-panel-sub')).toHaveText("Preset · can't be changed");
    await expect(tid(page, 'role-preset-note')).toHaveText(
      'Presets are fixed. To change one, make a new role from it.',
    );
    await expect(panel.getByTestId('users-permissions-count')).toHaveText('11 of 37');
    await expect(panel.getByTestId('user-switch-export')).toBeDisabled();
    await expect(tid(page, 'role-name')).toHaveCount(0);
    await expect(tid(page, 'role-delete')).toHaveCount(0);
    await expect(tid(page, 'role-new-from')).toHaveText('New role from Foreman');

    // New role from Foreman: refusals under the field, then created.
    await tid(page, 'role-new-from').click();
    await expect(tid(page, 'new-role-start-foreman')).toHaveAttribute('aria-pressed', 'true');
    await tid(page, 'new-role-create').click();
    await expect(tid(page, 'new-role-name-error')).toHaveText('Give the role a name.');
    await tid(page, 'new-role-name').fill('foreman');
    await tid(page, 'new-role-create').click();
    await expect(tid(page, 'new-role-name-error')).toHaveText(
      'A role named "Foreman" already exists.',
    );
    await tid(page, 'new-role-name').fill('Site lead');
    await tid(page, 'new-role-create').click();
    await expect(tid(page, 'new-role-dialog')).toHaveCount(0);
    await expect(tid(page, 'role-panel-name')).toHaveText('Site lead');
    await expect(tid(page, 'role-panel-sub')).toHaveText('Custom role · 0 people');
    await expect(panel.getByTestId('users-permissions-count')).toHaveText('11 of 37');

    // Nothing (all off) starts at 0.
    await tid(page, 'role-new').click();
    await tid(page, 'new-role-start-nothing').click();
    await tid(page, 'new-role-name').fill('Blank slate');
    await tid(page, 'new-role-create').click();
    await expect(tid(page, 'role-panel-name')).toHaveText('Blank slate');
    await expect(panel.getByTestId('users-permissions-count')).toHaveText('0 of 37');

    // Edit Site lead: holders keep their rows; the role's defaults change.
    const site = await roleByName(tenant, 'Site lead');
    await harnessSql()`update public.membership set role_id = ${site!.id}::uuid where id = ${f.membershipId}::uuid`;
    await page.reload();
    await cardOf(page, 'Site lead').click();
    await expect(tid(page, 'role-panel-sub')).toHaveText('Custom role · 1 person');
    await expect(tid(page, 'role-cant-delete')).toHaveText(
      "Can't delete: 1 person holds this role. Move them first.",
    );
    await expect(tid(page, 'role-delete')).toBeDisabled();
    await expect(tid(page, 'role-rule')).toHaveText(
      'Changes here set the switches for people you give this role from now on. People who already hold it keep theirs.',
    );
    await panel.getByTestId('user-switch-export').click();
    await expect(tid(page, 'role-unsaved')).toHaveText('Unsaved: 1 change');
    await tid(page, 'role-save').click();
    await expect(tid(page, 'role-unsaved')).toHaveCount(0);
    await expect(cardOf(page, 'Site lead').getByTestId('role-card-summary')).toHaveText(
      'Custom · 10 of 37',
    );
    expect((await roleByName(tenant, 'Site lead'))!.default_permissions).toHaveLength(10);
    expect(await grantedOf(f.membershipId)).toEqual([...PRESET_KEYS.foreman].sort());

    // Delete Blank slate (nobody holds it): asks first.
    await cardOf(page, 'Blank slate').click();
    await expect(tid(page, 'role-cant-delete')).toHaveCount(0);
    await tid(page, 'role-delete').click();
    const confirm = page.locator('[data-confirm]');
    await expect(confirm).toContainText('Delete Blank slate?');
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(cardOf(page, 'Blank slate')).toHaveCount(0);
    await expect(tid(page, 'role-panel')).toHaveCount(0);
    expect(await roleByName(tenant, 'Blank slate')).toBeNull();
  });
});
