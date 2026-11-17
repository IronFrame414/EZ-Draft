// EZD-131 (S15h; AC-EZD-131-1; mockup S15hLibraries), desktop. Each test makes its own tenant with a member who
// holds the Libraries switch (settings_libraries) and signs in with signInAs. Expected values: the S15h tab
// list and mockup tab labels; each tab's empty state (vault/build/assumptions.md EZD-131 wording); Add
// abbreviation on Symbols + abbreviations (S15h: abbreviations may be added); saved groups renamed or deleted
// (S15h Layout); offline read-only is not covered here.
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

const tid = (page: Page, id: string) => page.getByTestId(id);
const tab = (page: Page, id: string) =>
  page.locator(`[data-testid="libraries-tab"][data-tab="${id}"]`);

const EMPTY: [string, string, string][] = [
  ['notes', 'Notes', 'No notes yet'],
  ['symbols', 'Symbols + abbreviations', 'No company abbreviations yet'],
  ['details', 'Details', 'No details yet'],
  ['hatches', 'Hatches', 'No custom hatches yet'],
  ['parts', 'Parts', 'No parts yet'],
  ['saved_groups', 'Saved groups', 'No saved groups yet'],
  ['task_templates', 'Field task templates', 'No field task templates yet'],
];

async function openLibraries(signInAs: (email: string) => Promise<unknown>, page: Page) {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, ['settings_libraries']);
  await signInAs(member.email);
  await page.goto('/settings/libraries');
  await expect(page.locator('main h1')).toHaveText('Libraries');
  return tenant;
}

test.describe('EZD-131 libraries', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-131 done when: every tab opens with its empty state, and an added abbreviation persists', async ({
    page,
    signInAs,
  }) => {
    const tenant = await openLibraries(signInAs, page);
    await expect(page.locator('main')).toContainText(
      'Company content reused across projects. Editing a library item never changes copies already placed in projects.',
    );

    for (const [id, label, empty] of EMPTY) {
      await tab(page, id).click();
      await expect(tab(page, id)).toHaveText(label);
      await expect(tab(page, id)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator(`[data-testid="libraries-empty"][data-tab="${id}"]`)).toContainText(
        empty,
      );
    }

    await tab(page, 'symbols').click();
    await tid(page, 'libraries-add').click();
    await expect(tid(page, 'library-inspector-title')).toHaveText('New abbreviation');
    // A blank meaning is refused in place.
    await tid(page, 'library-field-name').fill('GFCI');
    await tid(page, 'library-save').click();
    await expect(tid(page, 'library-form-error')).toHaveText('Enter what the abbreviation means.');
    await tid(page, 'library-field-meaning').fill('Ground-fault circuit interrupter');
    await tid(page, 'library-save').click();
    await expect(tid(page, 'library-row-name')).toHaveText(['GFCI']);
    await expect(tid(page, 'library-inspector-title')).toHaveText('GFCI');

    await page.reload();
    await tab(page, 'symbols').click();
    await expect(tid(page, 'library-row-name')).toHaveText(['GFCI']);
    await expect(tid(page, 'library-row-meaning')).toHaveText(['Ground-fault circuit interrupter']);
    const rows = await harnessSql()<{ name: string; data: { meaning: string } }[]>`
      select name, data from public.library_item
      where tenant_id = ${tenant}::uuid and kind = 'abbreviation'`;
    expect(rows).toEqual([{ name: 'GFCI', data: { meaning: 'Ground-fault circuit interrupter' } }]);

    // Search filters the current tab.
    await tid(page, 'libraries-search').fill('AFCI');
    await expect(tid(page, 'libraries-no-match')).toHaveText('Nothing matches "AFCI".');
    await tid(page, 'libraries-search').fill('circuit');
    await expect(tid(page, 'library-row-name')).toHaveText(['GFCI']);
  });

  test('a saved group is renamed and deleted from its tab', async ({ page, signInAs }) => {
    const tenant = await createTenant();
    await harnessSql()`insert into public.library_item (tenant_id, kind, name)
      values (${tenant}::uuid, 'saved_group', 'Vanity set')`;
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['settings_libraries']);
    await signInAs(member.email);
    await page.goto('/settings/libraries');

    await tab(page, 'saved_groups').click();
    await tid(page, 'library-row').filter({ hasText: 'Vanity set' }).click();
    await tid(page, 'library-field-name').fill('Double vanity');
    await tid(page, 'library-save').click();
    await expect(tid(page, 'library-row-name')).toHaveText(['Double vanity']);

    await tid(page, 'library-delete').click();
    const confirm = page.locator('[data-confirm]');
    await expect(confirm).toContainText('Delete Double vanity?');
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(
      page.locator('[data-testid="libraries-empty"][data-tab="saved_groups"]'),
    ).toBeVisible();
    const left =
      await harnessSql()`select id from public.library_item where tenant_id = ${tenant}::uuid`;
    expect(left).toHaveLength(0);
  });

  test('without the Libraries switch the page shows the no-access line in place', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['settings_company']);
    await signInAs(member.email);
    await page.goto('/settings/libraries');
    await expect(tid(page, 'no-access')).toBeVisible();
    await expect(tid(page, 'libraries-panel')).toHaveCount(0);
  });
});
