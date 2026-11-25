// EZD-702a (AC-EZD-702a-1 "Sheets open from the list and the strip"; S13 Entry points "Header tab Sheets"; S13
// Layout, Controls; S13 Decision 1 set order: A3.0 Proposed is the 4th sheet, E1.0 Electrical follows A5.0 or A6.0).
// Desktop 1600 x 1000, untagged. Its own company with fixture S and a member with View projects, as phase-view.spec.ts.
import type { Locator, Page } from '@playwright/test';
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

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true });

test.describe('EZD-702a Sheets screen', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-702a AC-1 sheets open from the list and the strip', async ({ page, signInAs }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, user.membershipId, ['view_projects']);
    await signInAs(user.email);
    await page.goto(`/projects/${ids.P1}`);
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');

    await tab(page, 'Sheets').click();
    await expect(tab(page, 'Sheets')).toHaveAttribute('aria-current', 'page');
    // The permit set opens on its first sheet.
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'A0.0');

    // From the list.
    await id(page, 'sheet-row-A3.0').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'A3.0');
    await expect(id(page, 'sheet-row-A3.0')).toHaveAttribute('aria-current', 'page');
    await expect(id(page, 'sheet-thumb-A3.0')).toHaveAttribute('aria-current', 'page');
    await expect(id(page, 'sheets-position')).toHaveText(/^4 of (9|10)$/);
    await expect(id(page, 'status-sheet')).toHaveText(/^A3\.0 · 4 of (9|10)$/);

    // From the strip.
    await id(page, 'sheet-thumb-E1.0').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'E1.0');
    await expect(id(page, 'sheet-row-E1.0')).toHaveAttribute('aria-current', 'page');
    await expect(id(page, 'sheet-thumb-E1.0')).toHaveAttribute('aria-current', 'page');
    await expect(id(page, 'sheet-row-A3.0')).not.toHaveAttribute('aria-current', 'page');
    await expect(id(page, 'sheets-label')).toContainText('Electrical');

    // Previous walks back one sheet in set order.
    await id(page, 'sheets-previous').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', /^A[56]\.0$/);

    // Back to Plan and to Sheets again: the open sheet is kept.
    await tab(page, 'Plan').click();
    await expect(id(page, 'sheets-canvas')).toHaveCount(0);
    await tab(page, 'Sheets').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', /^A[56]\.0$/);
  });
});
