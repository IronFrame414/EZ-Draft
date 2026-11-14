// EZD-231 (04 Tool rail "Measure | Shift+L | Distance between two points; no model change"; S06 Measure "Allowed in
// view only"; AC-EZD-231-1 to -3). Desktop 1600 x 1000. Each test makes its own company (never tenant 1) with fixture S
// and its own member. One 12' 6" wall (150", from the AC) is seeded through the editor hook; the canvas is driven
// through the `__ezdraftPlan` and `__ezdraftEditor` hooks. Helpers are copies of chips.spec.ts. No import.meta or
// __dirname (L-017).
import { CURRENT_SCHEMA_VERSION, createWallData, type Point } from '@ezdraft/geometry';
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

const EDITOR = ['view_projects', 'edit_model'];
const VIEWER = ['view_projects'];

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, EDITOR as never);
  return { tenant, ids, user };
}

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: { handle: { setView(v: View): void; modelToScreen(p: Point): Point } };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
};

const editorState = (page: Page) => page.getByTestId('editor-state');
const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const tool = (page: Page, which: string) => page.locator(`[data-rail-tool="${which}"]`);

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

// view: model (0,0) at region px (128, 384); 8/3 px per inch.
async function view(page: Page) {
  await page.evaluate(() =>
    (window as unknown as Window2).__ezdraftPlan.handle.setView({ x: -48, y: 144, ppi: 8 / 3 }),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen({ x: 0, y: 0 }),
      ),
    )
    .toEqual({ x: 128, y: 384 });
}

async function at(page: Page, x: number, y: number): Promise<Point> {
  const box = await canvasRegion(page).boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
    { x, y },
  );
  return { x: box.x + s.x, y: box.y + s.y };
}
const clickAt = async (page: Page, x: number, y: number) => {
  const p = await at(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
};

// Sorted by id: a reload may list the objects in another order.
const objects = async (page: Page): Promise<Obj[]> =>
  (await page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects())).sort(
    (a, b) => a.id.localeCompare(b.id),
  );
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

// One 150" wall from (0,0) to (150,0) on the open floor.
async function seedWall(page: Page) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((x) => x.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const made = createWallData({
    start: { x: 0, y: 0 },
    end: { x: 150, y: 0 },
    level,
    thicknessSide: 'right',
  });
  if (!made.ok) throw new Error('wall data');
  const change = {
    id: crypto.randomUUID(),
    value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
  };
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), [change]);
}

// Clicks a pixel or so off each end of the wall; the points snap to the ends.
async function measureWall(page: Page) {
  await clickAt(page, 0.4, 0.3);
  await clickAt(page, 149.6, -0.3);
}

test.describe('EZD-231 Measure tool', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-231-1, -2 an editor measures a 12\' 6" wall as 12\' 6"; the model is unchanged', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await seedWall(page);
    await saved(page);
    await view(page);
    const before = await objects(page);

    const measure = tool(page, 'measure');
    await expect(measure).toBeEnabled();
    await measure.click();
    await expect(measure).toHaveAttribute('aria-pressed', 'true');
    await measureWall(page);
    await expect(id(page, 'measure-readout')).toHaveText('12\' 6"');
    await expect(id(page, 'tool-band')).not.toHaveAttribute('display', 'none');

    expect(await objects(page)).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(id(page, 'measure-readout')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    expect(await objects(page)).toEqual(before);

    // Read back after a reload: nothing was saved by measuring.
    await page.reload();
    await openReady(page, ids.P1);
    expect(await objects(page)).toEqual(before);
  });

  test('AC-EZD-231-3 a view-only user can measure', async ({ page, signInAs }) => {
    const { tenant, ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await seedWall(page);
    await saved(page);
    await setPermissions(tenant, user.membershipId, VIEWER as never);
    await page.reload();
    await openReady(page, ids.P1);
    await view(page);

    await expect(tool(page, 'wall')).toHaveCount(0);
    await expect(tool(page, 'measure')).toBeEnabled();
    await page.keyboard.press('Shift+L');
    await expect(tool(page, 'measure')).toHaveAttribute('aria-pressed', 'true');
    await measureWall(page);
    await expect(id(page, 'measure-readout')).toHaveText('12\' 6"');
  });
});
