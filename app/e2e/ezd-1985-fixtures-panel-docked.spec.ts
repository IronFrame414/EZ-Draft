// EZD-1985 (AC-EZD-1985-1; Q-0809 (a); audit/ui-live-2026-11-24 F12b): the Fixtures tool panel docks on the right in
// the inspector place, beside the canvas and not over it, and at 1600 × 1000 and 1180 × 820 (sizes from the AC) the
// panel ends inside the window and its Width and Depth fields can be shown whole (the panel scrolls inside itself).
// Local stack, real sign-in (as fixtures-tool.spec.ts).
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

async function editorUser() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model'] as never);
  return { ids, user };
}

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(page.getByTestId('plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

const SIZES = [
  { width: 1600, height: 1000 },
  { width: 1180, height: 820 },
] as const;

test.describe('EZD-1985 Fixtures panel docked on the right', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  for (const size of SIZES) {
    test(`EZD-1985 AC-1 at ${size.width} × ${size.height} the panel sits right of the canvas and Width and Depth are in the window`, async ({
      page,
      signInAs,
    }) => {
      await page.setViewportSize(size);
      const { ids, user } = await editorUser();
      await signInAs(user.email);
      await openReady(page, ids.P1);

      await page.keyboard.press('f');
      await expect(page.locator('[data-rail-tool="fixtures"]')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      const inspector = page.locator('[data-shell-region="inspector"]');
      const panel = inspector.getByTestId('fixtures-panel');
      await expect(panel).toBeVisible();
      // Not over the drawing: nothing of the panel is inside the canvas region.
      await expect(page.locator('[data-shell-region="canvas"]').getByTestId('fixtures-panel')).toHaveCount(0);

      const canvasBox = await page.locator('[data-shell-region="canvas"]').boundingBox();
      const panelBox = await panel.boundingBox();
      const inspectorBox = await inspector.boundingBox();
      if (!canvasBox || !panelBox || !inspectorBox) throw new Error('a region has no box');
      // Beside the canvas, on its right.
      expect(panelBox.x).toBeGreaterThanOrEqual(canvasBox.x + canvasBox.width);
      // At the right edge: the inspector column is the last thing before the window's right edge (body padding only).
      expect(inspectorBox.x + inspectorBox.width).toBeGreaterThan(size.width - 40);
      expect(inspectorBox.x + inspectorBox.width).toBeLessThanOrEqual(size.width);
      // The panel ends inside the window; anything taller scrolls inside it.
      expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(size.height);

      // The default choice is a fixture (Toilet), so its Width and Depth fields show.
      for (const testId of ['fixture-width', 'fixture-depth']) {
        const field = panel.getByTestId(testId);
        await field.scrollIntoViewIfNeeded();
        await expect(field).toBeInViewport({ ratio: 1 });
      }
      await expect(panel.getByText('Width', { exact: true })).toBeInViewport();
      await expect(panel.getByText('Depth', { exact: true })).toBeInViewport();
    });
  }
});
