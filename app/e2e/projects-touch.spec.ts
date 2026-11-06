// EZD-330 sections 3 and 4 (vault/plans/EZD-330.md); AC-EZD-330-1. Untagged, so desktop 1600 x 1000. Each test makes
// its own company (never tenant 1) and a member with only view_projects, on fixture S (app/test-harness/projects-fixture.ts).
// Expected values: plan section 4 (counts from EZD-117a B5; 5 sort options from PROJECT_SORTS); the counts that include the
// six card links are EZD-338 section 4: 13 in T1 = 6 tabs + sort + 6 card links (EZD-120c step 8 made each card an <a href>),
// 14 in T2 = 13 + the Retry button of projects-error, 6 in projects-grid (each card link passes the 44 px check); 44 px
// from 11 Non-functional requirements via expectTouchTargets (EZD-014c); paddings from the board
// S01 CSS (vault/mockups/html/project/S01Projects.dc.html: `.b` line 19, `.ft` line 23).
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  expectTouchTargets,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

// The six status tabs, in the order of PROJECT_TABS (projects.ts:14): All, then PROJECT_STATUSES.
const TAB_IDS = [
  'all',
  'draft',
  'client_review',
  'permit_submitted',
  'approved',
  'in_build',
] as const;

// A member who may view projects and nothing else (plan section 3, member setup).
async function viewer(tenant: string) {
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, ['view_projects'] as never);
  return m;
}

test.describe('EZD-330 Projects page touch targets', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('T1 EZD-330 counts shown: every control in main passes the touch-target check and keeps the board padding (EZD-338)', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    await seedFixtureS(tenant);
    const m = await viewer(tenant);
    await signInAs(m.email);
    await page.goto('/');

    await expect(page.getByTestId('projects-tab-count')).toHaveText(['6', '2', '1', '1', '1', '1']);
    // EZD-338 section 4 (T1 main): main holds 6 tabs, the sort trigger and 6 card links (EZD-120c step 8); no projects-new
    // for a viewer. Header and avatar menu are outside main (EZD-117b plan section 3 'View wiring', 'Board states').
    expect(await expectTouchTargets(page, page.locator('main'))).toBe(13);
    // EZD-338 section 4 (T1 grid): each of the 6 card links passes the 44 px check and is inside the viewport.
    expect(await expectTouchTargets(page, page.getByTestId('projects-grid'))).toBe(6);

    for (const tab of TAB_IDS) {
      const el = page.getByTestId(`projects-tab-${tab}`);
      await expect(el).toHaveCSS('padding-top', '7px');
      await expect(el).toHaveCSS('padding-left', '12px');
    }
    const sort = page.getByTestId('projects-sort');
    await expect(sort).toHaveCSS('padding-top', '9px');
    await expect(sort).toHaveCSS('padding-left', '14px');
  });

  test('T2 EZD-330 before counts load: the All tab still passes (EZD-338)', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    await seedFixtureS(tenant);
    const m = await viewer(tenant);
    await signInAs(m.email);
    await page.route('**/api/projects/counts', (route) => route.abort());
    await page.goto('/');

    await expect(page.getByTestId('project-card')).toHaveCount(6);
    await expect(page.getByTestId('projects-tab-count')).toHaveCount(0);
    // EZD-117b plan section 3 'Board states': countsStatus 'error' shows projects-error with InlineError Retry in main.
    await expect(page.getByTestId('projects-error')).toBeVisible();
    // EZD-338 section 4 (T2 main): 6 tabs + sort + 6 card links + Retry = 14.
    expect(await expectTouchTargets(page, page.locator('main'))).toBe(14);
    // EZD-338 section 4 (T2 grid): the 6 card links still pass the 44 px check.
    expect(await expectTouchTargets(page, page.getByTestId('projects-grid'))).toBe(6);
  });

  test('T3 EZD-330 sort menu items pass the touch-target check', async ({ page, signInAs }) => {
    const tenant = await createTenant();
    await seedFixtureS(tenant);
    const m = await viewer(tenant);
    await signInAs(m.email);
    await page.goto('/');

    await page.getByTestId('projects-sort').click();
    await expect(page.getByTestId('projects-sort-menu')).toBeVisible();
    expect(await expectTouchTargets(page, page.getByTestId('projects-sort-menu'))).toBe(5);
  });
});
