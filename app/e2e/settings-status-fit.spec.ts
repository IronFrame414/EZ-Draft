// EZD-424 (AC-EZD-424-1, AC-EZD-424-2; S11 disclaimer on every page; Q-0272 (a)). Untagged, so desktop only
// (1600 x 1000). The test makes its own company and member (as sheet-presets.spec.ts does), so no other test's
// rows can change what it sees. Expected values: AC-EZD-424-1 (an 80-character default department; the
// disclaimer's scroll width at most its client width; a value that does not fit is cut and keeps its full text
// in a title); D-EN Q-0208.
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

const D_EN =
  "For design and planning only. All calculations and codes must be verified by the user and a licensed professional in the project's jurisdiction.";
// 80 characters (AC-EZD-424-1).
const DEPARTMENT =
  'Department of Building Permits and Inspections, Residential Plan Review Division';
const LONG_COMPANY =
  'Worth Properties Residential Remodeling and General Contracting Services of Florida LLC';

const fits = (page: Page, selector: string) =>
  page.locator(selector).evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth }));

async function openWithDefault(
  signInAs: (email: string) => Promise<unknown>,
  page: Page,
  companyName?: string,
): Promise<void> {
  const tenant = await createTenant();
  await harnessSql()`select private.seed_submittal_profile(${tenant}::uuid)`;
  await harnessSql()`update public.submittal_profile set department = ${DEPARTMENT}
    where tenant_id = ${tenant}::uuid and is_default`;
  if (companyName !== undefined) {
    await harnessSql()`update public.tenant set name = ${companyName} where id = ${tenant}::uuid`;
  }
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, [
    'settings_sheet_presets',
    'view_projects',
    'create_projects',
  ] as never);
  await signInAs(member.email);
  await page.goto('/settings/sheet-presets');
}

async function expectDisclaimerFits(page: Page): Promise<void> {
  const d = page.getByTestId('disclaimer');
  await expect(d).toHaveCount(1);
  await expect(d).toHaveText(D_EN);
  await expect(d).toBeInViewport();
  const dw = await fits(page, '[data-testid="disclaimer"]');
  expect(dw.scroll).toBeLessThanOrEqual(dw.client);
  const bw = await fits(page, 'footer[data-settings-region="status-bar"]');
  expect(bw.scroll).toBeLessThanOrEqual(bw.client);
}

test.describe('EZD-424 settings status bar fit', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('an 80-character default department: the disclaimer fits, the department is cut with its full text in a title', async ({
    page,
    signInAs,
  }) => {
    expect(DEPARTMENT).toHaveLength(80);
    await openWithDefault(signInAs, page);
    const dept = page.locator('[data-settings-status="default"]');
    await expect(dept).toHaveAttribute('title', DEPARTMENT);
    await expect(dept).toHaveText(DEPARTMENT);
    await expectDisclaimerFits(page);
    const vw = await fits(page, '[data-settings-status="default"]');
    expect(vw.scroll).toBeGreaterThan(vw.client);
    const ellipsis = await dept.evaluate((e) => getComputedStyle(e).textOverflow);
    expect(ellipsis).toBe('ellipsis');
  });

  test('a long company name as well: the disclaimer still fits, both values keep their full text in a title', async ({
    page,
    signInAs,
  }) => {
    await openWithDefault(signInAs, page, LONG_COMPANY);
    await expect(page.locator('[data-settings-status="company"]')).toHaveAttribute(
      'title',
      LONG_COMPANY,
    );
    await expect(page.locator('[data-settings-status="default"]')).toHaveAttribute(
      'title',
      DEPARTMENT,
    );
    await expectDisclaimerFits(page);
    const cw = await fits(page, '[data-settings-status="company"]');
    expect(cw.scroll).toBeGreaterThan(cw.client);
  });
});
