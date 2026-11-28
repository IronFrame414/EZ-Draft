// EZD-1415 (AC-EZD-1415-1 "An L-shaped room can be drawn and each wall selected on a phone"; S17b Room chips,
// + Room, Shape picker, Walls mode, Wall letter (tap) "Selected wall cobalt"). Phone project only (390 x 844).
// Every test makes its own company (never tenant 1) with one project and a member with View projects and Send field
// measurement, as project-offline.spec.ts does.
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  expectTouchTargets,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

async function setup() {
  const tenant = await createTenant();
  const [project] = await createProjects(tenant, 1);
  const a = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, a.membershipId, ['view_projects', 'send_field_measurement']);
  return { project: project as string, a };
}

// EZD-2004 (audit A11): a measured wall's name goes on with its length ("Wall A, 12 feet"), so match the start.
const wall = (page: Page, letter: string) => page.getByRole('button', { name: new RegExp(`^Wall ${letter}(, |$)`) });
const wallField = (page: Page) => page.locator('[data-field="wall"]');

test.describe('EZD-1415 Field measure: shapes and walls', () => {
  test.afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  test(
    'EZD-1415 done when: an L-shaped room can be drawn and each wall selected on a phone (AC-EZD-1415-1)',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      const { project, a } = await setup();
      await signInAs(a.email);
      await page.goto(`/projects/${project}/field-measure`);
      await expect(page.getByRole('heading', { name: 'Field measure' })).toBeVisible();
      await expect(page.getByText('Pick a shape')).toBeVisible();

      // + Room, picked name: the new room is the active chip.
      await page.locator('[data-add-room]').click();
      await page.getByRole('button', { name: 'Kitchen', exact: true }).click();
      const kitchen = page.getByRole('button', { name: 'Kitchen', exact: true });
      await expect(kitchen).toHaveAttribute('aria-pressed', 'true');

      // The save that carries the L-shape (an earlier save may carry the Kitchen alone).
      const savedL = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/projects/${project}/field-measure`) &&
          r.request().method() === 'PUT' &&
          (r.request().postData() ?? '').includes('"shape":"l"'),
      );
      await page.getByRole('button', { name: 'L-shape' }).click();
      await expect(page.getByRole('button', { name: 'L-shape' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('shape-canvas')).toHaveAttribute('data-walls', '6');
      await expect(page.getByTestId('walls-done')).toHaveText('0 / 6');

      const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
      for (const letter of letters) {
        await wall(page, letter).tap();
        await expect(wall(page, letter)).toHaveAttribute('aria-pressed', 'true');
        for (const other of letters.filter((l) => l !== letter)) {
          await expect(wall(page, other)).toHaveAttribute('aria-pressed', 'false');
        }
        await expect(wallField(page)).toContainText(`Wall ${letter}`);
      }
      await expectTouchTargets(page, page.getByTestId('field-measure'));

      // The room is saved: after a reload the Kitchen is still an L-shape.
      expect((await savedL).status()).toBe(200);
      await page.reload();
      await page.getByRole('button', { name: 'Kitchen', exact: true }).click();
      await expect(page.getByRole('button', { name: 'L-shape' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('shape-canvas')).toHaveAttribute('data-walls', '6');
    },
  );

  test(
    'EZD-1415 Walls mode: taps add lettered walls and a tap on the first corner closes',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      const { project, a } = await setup();
      await signInAs(a.email);
      await page.goto(`/projects/${project}/field-measure`);
      await page.getByRole('button', { name: 'Walls', exact: true }).click();
      const svg = page.getByTestId('shape-canvas').locator('svg');
      const box = await svg.boundingBox();
      if (box === null) throw new Error('no canvas');
      // View box 360 x 240 starting at (-30, -30): canvas point (x, y) is at ((x + 30) / 360, (y + 30) / 240).
      const at = (x: number, y: number) => ({
        x: box.x + ((x + 30) / 360) * box.width,
        y: box.y + ((y + 30) / 240) * box.height,
      });
      for (const [x, y] of [
        [20, 20],
        [250, 24],
        [246, 150],
        [20, 154],
      ] as const) {
        const p = at(x, y);
        await page.touchscreen.tap(p.x, p.y);
      }
      await expect(page.getByTestId('shape-canvas')).toHaveAttribute('data-walls', '3');
      await expect(page.getByTestId('shape-canvas')).toHaveAttribute('data-closed', 'false');
      const first = at(20, 20);
      await page.touchscreen.tap(first.x, first.y);
      await expect(page.getByTestId('shape-canvas')).toHaveAttribute('data-closed', 'true');
      await expect(page.getByTestId('shape-canvas')).toHaveAttribute('data-walls', '4');
      await expect(wall(page, 'D')).toHaveAttribute('aria-pressed', 'true');
      await wall(page, 'B').tap();
      await expect(wallField(page)).toContainText('Wall B');
    },
  );
});
