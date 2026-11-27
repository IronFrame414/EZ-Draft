// EZD-614 (S15e Appliance rating defaults; board S15eCatalog; Q-0766). Untagged, so desktop only (1600 x 1000). Each
// test makes its own tenant and member and never touches seeded rows. Expected values: S15e Permissions (the page needs
// settings_catalog; no access in place without it, Q-0214), board S15eCatalog ("Appliance rating defaults", "Owner
// enters", TYPE / VOLTS / AMPS, "+ Add appliance type", Save), S15e Controls (Save "Disabled with no edits"), Q-0766
// (add, edit and delete rows) and 09s row 7 (dishwasher 120 V, 10 A).
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

const NO_ACCESS = "You don't have access to this. Ask your supervisor.";

const tid = (page: Page, id: string) => page.getByTestId(id);

async function open(
  signInAs: (email: string) => Promise<unknown>,
  page: Page,
  permissions: string[] = ['settings_catalog'],
) {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, permissions as never);
  await signInAs(member.email);
  await page.goto('/settings/catalog');
  return tenant;
}

const stored = async (tenant: string) =>
  (
    await harnessSql()`select appliance_type, name, volts, amps::text as amps from public.appliance_rating_default
      where tenant_id = ${tenant}::uuid order by appliance_type`
  ).map((r) => ({ ...r }));

test.describe('EZD-614 Settings > Catalog, Appliance rating defaults', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('without settings_catalog: no access in place', async ({ page, signInAs }) => {
    await open(signInAs, page, ['settings_company']);
    await expect(tid(page, 'no-access')).toContainText(NO_ACCESS);
    await expect(tid(page, 'appliance-ratings')).toHaveCount(0);
    await expect(page.locator('[data-settings-nav="catalog"]')).toHaveCount(0);
  });

  test('the owner adds, edits and removes rows; each save is stored for the load calc', async ({
    page,
    signInAs,
  }) => {
    const tenant = await open(signInAs, page);
    const card = tid(page, 'appliance-ratings');
    await expect(card).toContainText('Appliance rating defaults');
    await expect(card).toContainText('Owner enters');
    await expect(tid(page, 'appliance-ratings-empty')).toBeVisible();
    await expect(tid(page, 'appliance-ratings-save')).toBeDisabled();

    await tid(page, 'appliance-ratings-add').selectOption('dishwasher');
    const row = page.locator('[data-testid="appliance-rating-row"][data-type="dishwasher"]');
    await expect(row.getByTestId('appliance-rating-name')).toHaveValue('Dishwasher');
    await expect(row.getByTestId('appliance-rating-volts')).toHaveValue('120');
    await expect(tid(page, 'appliance-ratings-unsaved')).toBeVisible();
    // Amps not entered yet: Save stays off.
    await expect(tid(page, 'appliance-ratings-save')).toBeDisabled();
    await row.getByTestId('appliance-rating-amps').fill('10');
    await tid(page, 'appliance-ratings-add').selectOption('range');
    const range = page.locator('[data-testid="appliance-rating-row"][data-type="range"]');
    await expect(range.getByTestId('appliance-rating-volts')).toHaveValue('240');
    await range.getByTestId('appliance-rating-amps').fill('48.75');

    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/settings/appliance-ratings') && r.request().method() === 'PUT',
    );
    await tid(page, 'appliance-ratings-save').click();
    expect((await saved).status()).toBe(200);
    await expect(tid(page, 'appliance-ratings-save')).toBeDisabled();
    expect(await stored(tenant)).toEqual([
      { appliance_type: 'dishwasher', name: 'Dishwasher', volts: 120, amps: '10.00' },
      { appliance_type: 'range', name: 'Range, electric', volts: 240, amps: '48.75' },
    ]);

    // The saved list shows after a reload, in the Add order.
    await page.reload();
    await expect(page.locator('[data-testid="appliance-rating-row"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="appliance-rating-row"]').first()).toHaveAttribute(
      'data-type',
      'range',
    );

    // Edit one and remove the other.
    await row.getByTestId('appliance-rating-amps').fill('12');
    await range.getByTestId('appliance-rating-remove').click();
    const again = page.waitForResponse(
      (r) => r.url().endsWith('/api/settings/appliance-ratings') && r.request().method() === 'PUT',
    );
    await tid(page, 'appliance-ratings-save').click();
    expect((await again).status()).toBe(200);
    expect(await stored(tenant)).toEqual([
      { appliance_type: 'dishwasher', name: 'Dishwasher', volts: 120, amps: '12.00' },
    ]);
  });

  test('amps that are not a number above 0 show the line and keep Save off; Discard puts the saved list back', async ({
    page,
    signInAs,
  }) => {
    const tenant = await open(signInAs, page);
    await harnessSql()`insert into public.appliance_rating_default (tenant_id, appliance_type, name, volts, amps)
      values (${tenant}::uuid, 'dryer', 'Dryer, electric', 240, 22.5)`;
    await page.reload();
    const amps = page.locator('[data-type="dryer"]').getByTestId('appliance-rating-amps');
    await expect(amps).toHaveValue('22.5');
    await amps.fill('0');
    await expect(page.locator('[data-type="dryer"]')).toContainText(
      'Enter amps above 0, with up to 2 decimals.',
    );
    await expect(tid(page, 'appliance-ratings-save')).toBeDisabled();
    await tid(page, 'appliance-ratings-discard').click();
    await expect(amps).toHaveValue('22.5');
    await expect(tid(page, 'appliance-ratings-save')).toBeDisabled();
  });
});
