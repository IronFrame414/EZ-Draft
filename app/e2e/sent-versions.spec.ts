// EZD-121 S1 (AC-EZD-121-1, -5, -6). Desktop 1600 x 1000, its own company with fixture S
// (app/test-harness/projects-fixture.ts: P1 "bravo", client "Zed Co"; P2 "Alpha"). Expected values: Q-0700 05
// row "Versions labels" (header "Working copy", then "Working copy · Version N sent"; card "Working copy", then
// "Version N"), R24 #26 (Version 1, then Version 2), U+00B7 separator (board S03 / S20).
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

const SENDER = ['view_projects', 'edit_model', 'send_to_client'];
const id = (page: Page, testId: string) => page.getByTestId(testId);
const card = (page: Page, projectId: string) =>
  page.locator(`[data-testid="project-card"][data-project-id="${projectId}"]`);

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
}

async function sendOnce(page: Page) {
  await id(page, 'header-share').click();
  await expect(id(page, 'send-dialog')).toHaveAttribute('data-send-state', 'ready');
  await id(page, 'send-submit').click();
  await expect(id(page, 'send-dialog')).toHaveAttribute('data-send-state', 'sent');
  await id(page, 'send-cancel').click();
  await expect(id(page, 'send-dialog')).toHaveCount(0);
}

test.describe('EZD-121 sent versions', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-121 S1 @smoke two sends number Version 1 and 2 in the header and on the card', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, SENDER as never);
    await signInAs(m.email);

    await page.goto('/');
    await expect(card(page, ids.P1).getByTestId('project-card-version')).toHaveText('Working copy');

    await openReady(page, ids.P1);
    await expect(id(page, 'editor-version')).toHaveText('Working copy');
    await sendOnce(page);
    await expect(id(page, 'editor-version')).toHaveText('Working copy · Version 1 sent');
    await sendOnce(page);
    await expect(id(page, 'editor-version')).toHaveText('Working copy · Version 2 sent');

    await openReady(page, ids.P1);
    await expect(id(page, 'editor-version')).toHaveText('Working copy · Version 2 sent');

    await page.goto('/');
    await expect(card(page, ids.P1).getByTestId('project-card-version')).toHaveText('Version 2');
    await expect(card(page, ids.P2).getByTestId('project-card-version')).toHaveText('Working copy');
  });
});
