// EZD-709 (AC-EZD-709-1, AC-EZD-709-2). Untagged, so desktop only (1600 x 1000). Each test makes its own tenant
// and member through createTenant / createMember / setPermissions and never touches seeded rows. Expected values:
// S15b Permissions (settings_title_block; no access in place without it, Q-0214), S15b Controls (the company
// switch; preview size toggle 24x36 / 11x17; Preview "Updates on change"; Save disabled with no edits), S15b
// Validation (missing company name and license listed as warnings), S15b States (offline read-only).
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
const OFFLINE = "Offline. Title block settings can't be changed until you're back online.";

const tid = (page: Page, id: string) => page.getByTestId(id);

async function open(
  signInAs: (email: string) => Promise<unknown>,
  page: Page,
  opts: { permissions?: string[]; license?: string | null } = {},
) {
  const tenant = await createTenant();
  const license = opts.license === undefined ? 'CGC000001' : opts.license;
  await harnessSql()`update public.tenant set license_no = ${license} where id = ${tenant}::uuid`;
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, (opts.permissions ?? ['settings_title_block']) as never);
  await signInAs(member.email);
  await page.goto('/settings/title-block');
  return tenant;
}

test.describe('EZD-709 Settings > Title block', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('without settings_title_block: no nav item, no access in place', async ({ page, signInAs }) => {
    await open(signInAs, page, { permissions: ['settings_company'] });
    await expect(tid(page, 'no-access')).toContainText(NO_ACCESS);
    await expect(tid(page, 'title-block-form')).toHaveCount(0);
    await expect(page.locator('[data-settings-nav="title_block"]')).toHaveCount(0);
  });

  test('AC-EZD-709-1: the preview updates on change, before Save; Save stores the switch', async ({
    page,
    signInAs,
  }) => {
    const tenant = await open(signInAs, page);
    await expect(tid(page, 'title-block-form')).toBeVisible();
    await expect(tid(page, 'title-block-complete')).toContainText('Company fields complete.');
    await expect(tid(page, 'title-block-save')).toBeDisabled();
    await expect(tid(page, 'title-block-dirty')).toHaveText('No unsaved changes');

    const preview = tid(page, 'title-block-preview');
    const company = tid(page, 'title-block-preview-company-block');
    await expect(preview).toHaveAttribute('data-size', '24x36');
    await expect(company).toContainText('CGC000001');

    // The switch: the company block leaves the preview at once, with nothing saved yet.
    const show = tid(page, 'title-block-show-company');
    await expect(show).toHaveAttribute('aria-checked', 'true');
    await show.click();
    await expect(show).toHaveAttribute('aria-checked', 'false');
    await expect(company).toHaveCount(0);
    await expect(tid(page, 'title-block-preview-seal')).toBeVisible();
    await expect(tid(page, 'title-block-preview-stamp')).toBeVisible();
    await expect(tid(page, 'title-block-save')).toBeEnabled();
    expect((await harnessSql()`select title_block from public.tenant where id = ${tenant}::uuid`)[0].title_block).toEqual(
      {},
    );

    // The size toggle.
    await tid(page, 'title-block-size-11x17').click();
    await expect(preview).toHaveAttribute('data-size', '11x17');
    await expect(tid(page, 'title-block-size-11x17')).toHaveAttribute('aria-checked', 'true');

    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/settings/title-block') && r.request().method() === 'PATCH',
    );
    await tid(page, 'title-block-save').click();
    expect((await saved).status()).toBe(200);
    await expect(tid(page, 'title-block-save')).toBeDisabled();
    expect((await harnessSql()`select title_block from public.tenant where id = ${tenant}::uuid`)[0].title_block).toEqual(
      { show_company: false },
    );

    await page.reload();
    await expect(tid(page, 'title-block-show-company')).toHaveAttribute('aria-checked', 'false');
    await expect(tid(page, 'title-block-preview-company-block')).toHaveCount(0);
  });

  test('AC-EZD-709-2: a missing license is listed', async ({ page, signInAs }) => {
    await open(signInAs, page, { license: null });
    const missing = tid(page, 'title-block-missing');
    await expect(missing).toContainText('Company fields missing: License number.');
    await expect(missing.locator('[data-missing-field]')).toHaveText(['License number']);
    await expect(tid(page, 'title-block-complete')).toHaveCount(0);
  });

  test('offline: banner, switch read-only, Save disabled', async ({ page, signInAs, network }) => {
    await open(signInAs, page);
    await expect(tid(page, 'title-block-form')).toBeVisible();
    await tid(page, 'title-block-show-company').click();
    await network.set(page, 'off');
    await expect(tid(page, 'title-block-offline')).toContainText(OFFLINE);
    await expect(tid(page, 'title-block-show-company')).toBeDisabled();
    await expect(tid(page, 'title-block-save')).toBeDisabled();
    await network.set(page, 'on');
  });
});
