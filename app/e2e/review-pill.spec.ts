// EZD-127 E1 (AC-EZD-127-1 "A test review item shows on the pill and on the card"; 04 Header card "N to review"
// pill (amber), "Opens a review list", "Hidden when N = 0"; phase-01 EZD-127 "same count on the project card").
// Desktop 1600 x 1000. Its own company (never tenant 1), one project and one member with View projects only (the
// pill shows to every viewer). The test review item is opened and resolved as a source feature does, through
// private.add_review_item / private.resolve_review_item. Expected text: "1 to review" (04 row; mockups S14 and S20
// "2 to review"), the card's "1 to review" and "Nothing to review" (EZD-121), the list line "Field conflicts" (04
// row).
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

const card = (page: Page, projectId: string) =>
  page
    .locator(`[data-testid="project-card"][data-project-id="${projectId}"]`)
    .getByTestId('project-card-open');

test.describe('EZD-127 review pill', () => {
  // waitForResponse sees the count read only when the service worker does not answer it first (as EZD-128).
  test.use({ serviceWorkers: 'block' });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-127 E1 a test review item shows on the pill and on the card, and both clear when it is resolved', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    const [project] = await createProjects(tenant, 1);
    const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, m.membershipId, ['view_projects']);
    await harnessSql()`select private.add_review_item(${project}::uuid, 'field_conflict', 'e2e-1')`;
    await signInAs(m.email);

    await page.goto('/');
    await expect(card(page, project)).toHaveText('1 to review');
    await expect(card(page, project)).toHaveAttribute('data-has-items', 'true');

    await page.goto(`/projects/${project}`);
    await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
    const pill = page.getByTestId('review-pill');
    await expect(pill).toHaveText('1 to review');
    await expect(pill).toHaveAttribute('aria-expanded', 'false');
    await pill.click();
    const list = page.getByTestId('review-list');
    await expect(list).toBeVisible();
    await expect(pill).toHaveAttribute('aria-expanded', 'true');
    const groups = list.getByTestId('review-group');
    await expect(groups).toHaveCount(1);
    await expect(groups.first()).toHaveAttribute('data-source', 'field_conflict');
    await expect(groups.first()).toContainText('Field conflicts');
    await expect(groups.first()).toContainText('1');
    // The list sits below the pill.
    const pillBox = await pill.boundingBox();
    const listBox = await list.boundingBox();
    expect(pillBox && listBox && listBox.y >= pillBox.y + pillBox.height).toBe(true);
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(pill).toBeFocused();

    await harnessSql()`select private.resolve_review_item(${project}::uuid, 'field_conflict', 'e2e-1')`;
    // Hidden at 0: wait for the editor's count read (the stored count, now 0), then no pill.
    const read = page.waitForResponse(
      (r) => r.url().endsWith(`/api/projects/${project}/review`) && r.status() === 200,
    );
    await page.reload();
    expect(await (await read).json()).toEqual({ count: 0 });
    await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await expect(page.getByTestId('review-pill')).toHaveCount(0);

    await page.goto('/');
    await expect(card(page, project)).toHaveText('Nothing to review');
  });
});
