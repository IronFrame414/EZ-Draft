// EZD-116 (AC-EZD-116-3, -4, -5, -6, -9). Untagged, so desktop only (1600 x 1000). Each test makes its own
// tenant and member through createTenant / createMember / setPermissions and never touches seeded rows.
// Expected values: Q-0697 decisions 10 (page and save need settings_defaults; the nav item is absent without
// it; no access in place, Q-0214), S15d Validation and 09o Value checks ("12 6" refused with the formats
// message; 12.5' saved as 150", shown 12' 6"), S15d:52, 66 (Save disabled with no edits; Discard), board
// S15dDefaults (Search defaults), Q-0214 offline read-only.
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

const FORMATS = 'Use 12\'6", 12\' 6 1/2", 150" or 12.5\'';
const NO_ACCESS = "You don't have access to this. Ask your supervisor.";
const OFFLINE = "Offline. Defaults can't be changed until you're back online.";

const tid = (page: Page, id: string) => page.getByTestId(id);
const rowError = (page: Page, key: string) =>
  page.locator(`[data-testid="defaults-row-error"][data-key="${key}"]`);
const rows = (page: Page) => page.locator('[data-testid="defaults-row"]');

async function stored(tenant: string): Promise<Record<string, unknown>> {
  return (await harnessSql()`select defaults from public.tenant where id = ${tenant}::uuid`)[0]
    .defaults as Record<string, unknown>;
}

async function open(
  signInAs: (email: string) => Promise<unknown>,
  page: Page,
  permissions: string[] = ['settings_defaults'],
) {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, permissions as never);
  await signInAs(member.email);
  await page.goto('/settings/defaults');
  return tenant;
}

test.describe('EZD-116 Settings > Defaults', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-3 without settings_defaults: no nav item, no access in place', async ({ page, signInAs }) => {
    await open(signInAs, page, ['settings_company']);
    await expect(tid(page, 'no-access')).toContainText(NO_ACCESS);
    await expect(tid(page, 'defaults-form')).toHaveCount(0);
    await expect(page.locator('[data-settings-nav="defaults"]')).toHaveCount(0);
  });

  test('AC-4, AC-5 refuse "12 6", save 12.5\' as 150", reload shows it, Discard restores', async ({
    page,
    signInAs,
  }) => {
    const tenant = await open(signInAs, page);
    await expect(tid(page, 'defaults-form')).toBeVisible();
    await expect(page.locator('[data-settings-nav="defaults"]')).toHaveCount(1);
    await expect(tid(page, 'defaults-save')).toBeDisabled();
    await expect(tid(page, 'defaults-input-measurement_tolerance')).toHaveAttribute(
      'placeholder',
      'Not set',
    );

    await tid(page, 'defaults-input-measurement_tolerance').fill('12 6');
    await expect(rowError(page, 'measurement_tolerance')).toHaveText(FORMATS);
    await expect(tid(page, 'defaults-save')).toBeDisabled();
    expect(await stored(tenant)).toEqual({});

    await tid(page, 'defaults-input-waste_tile').fill('100.5');
    await expect(rowError(page, 'waste_tile')).toHaveText('Enter a percent from 0 to 100');
    await tid(page, 'defaults-input-waste_tile').fill('10');
    await tid(page, 'defaults-input-measurement_tolerance').fill(`12.5'`);
    await expect(rowError(page, 'measurement_tolerance')).toHaveCount(0);
    await expect(tid(page, 'defaults-unsaved')).toBeVisible();
    await tid(page, 'defaults-save').click();
    await expect(tid(page, 'defaults-unsaved')).toBeHidden();
    expect(await stored(tenant)).toEqual({ measurement_tolerance: 150, waste_tile: 10 });

    await page.reload();
    await expect(tid(page, 'defaults-input-measurement_tolerance')).toHaveValue(`12' 6"`);
    await expect(tid(page, 'defaults-input-waste_tile')).toHaveValue('10');

    await tid(page, 'defaults-input-waste_tile').fill('25');
    await expect(tid(page, 'defaults-discard')).toBeEnabled();
    await tid(page, 'defaults-discard').click();
    await expect(tid(page, 'defaults-input-waste_tile')).toHaveValue('10');
    await expect(tid(page, 'defaults-save')).toBeDisabled();
    expect(await stored(tenant)).toEqual({ measurement_tolerance: 150, waste_tile: 10 });
  });

  test('AC-6 Search defaults filters rows by label across groups and clears back', async ({
    page,
    signInAs,
  }) => {
    await open(signInAs, page);
    await expect(tid(page, 'defaults-form')).toBeVisible();
    const all = await rows(page).count();
    await tid(page, 'defaults-search').fill('overhang');
    await expect(rows(page)).toHaveCount(4);
    await tid(page, 'defaults-search').fill('tolerance');
    // Measurement tolerance only; the other Tolerances rows are labelled by their subject.
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toHaveAttribute('data-key', 'measurement_tolerance');
    await tid(page, 'defaults-search').fill('Countertop');
    // Increments, Waste factors: rows in two groups; EZD-222: and the Countertops row of Keyboard shortcuts
    await expect(page.locator('[data-testid="defaults-group"]')).toHaveCount(3);
    await tid(page, 'defaults-search-clear').click();
    await expect(rows(page)).toHaveCount(all);
  });

  test('AC-9 offline: banner, read-only rows, Save and Discard disabled, edit kept', async ({
    page,
    signInAs,
    network,
  }) => {
    await open(signInAs, page);
    await tid(page, 'defaults-input-waste_tile').fill('9');
    await network.set(page, 'off');
    await expect(tid(page, 'defaults-offline')).toContainText(OFFLINE);
    await expect(tid(page, 'defaults-input-waste_tile')).toHaveJSProperty('readOnly', true);
    await expect(tid(page, 'defaults-save')).toBeDisabled();
    await expect(tid(page, 'defaults-discard')).toBeDisabled();
    await expect(tid(page, 'defaults-input-waste_tile')).toHaveValue('9');
    await network.set(page, 'on');
  });
});
