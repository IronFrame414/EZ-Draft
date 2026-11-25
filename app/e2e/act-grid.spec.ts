// EZD-511 (AC-EZD-511-1 "Acceptance: ACT borders are never below half a tile."; 12 Acceptance RCP "ACT grid borders
// never below half tile"; phase-05 build gate "an ACT area is built by the browser test"; S05 Controls "Acoustical
// grid ... Grid auto-balances borders.", "Legend chip ... ACT border sizes for the selected grid"; S05 Validation "warn
// if the user overrides it"; board S05Ceiling legend "Grid balanced: borders {a} and {b}"; vault/build/assumptions.md
// EZD-511). Desktop 1600 x 1000, untagged. The test makes its own company with fixture S and its own member; the room
// is seeded and the model read through the `__ezdraftEditor` and `__ezdraftPlan` test hooks. The room is 114" x 94":
// balanced at the Defaults' half a tile (12"), 114" gives 21" borders and 94" gives 23" (the assumptions' worked
// examples), so the start is (21, 23). A light clicked at (50, 50) snaps into the tile [45, 69] x [47, 71], centre
// (57, 59). No import.meta or __dirname (L-017).
import {
  CURRENT_SCHEMA_VERSION,
  createWallData,
  newRoomAttributes,
  type Point,
} from '@ezdraft/geometry';
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

type Rgb = { r: number; g: number; b: number };
type Drawn = { surface: string; batches: Array<{ key: string; color: Rgb; order: number }> };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: { drawn(): Drawn; handle: { modelToScreen(p: Point): Point } };
  __ezdraftEditor: {
    objects(): Obj[];
    edit(changes: Array<{ id: string; value: unknown }>): string[];
  };
};
type Grid = {
  geometry: { roomId: string; start: Point };
  attributes: { module: string; direction: string; balanced: boolean };
};

async function fixtureS(permissions: string[]) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, permissions as never);
  return { ids, user };
}

const id = (page: Page, testId: string) => page.getByTestId(testId);
const drawn = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.drawn());
const objects = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

async function clickModel(page: Page, p: Point) {
  const box = await page.locator('[data-shell-region="canvas"]').boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (q) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(q),
    p,
  );
  await page.mouse.click(box.x + s.x, box.y + s.y);
}

// A closed 114 x 94 room with its four Existing walls, in one edit (as ceiling-rcp.spec.ts). Returns the room id.
async function seedRoom(page: Page): Promise<string> {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const ring: Point[] = [
    { x: 0, y: 0 },
    { x: 114, y: 0 },
    { x: 114, y: 94 },
    { x: 0, y: 94 },
  ];
  const walls = ring.map((start, i) => {
    const made = createWallData({
      start,
      end: ring[(i + 1) % 4]!,
      level,
      thicknessSide: 'right',
      status: 'existing',
    });
    if (!made.ok) throw new Error('wall data');
    return {
      id: crypto.randomUUID(),
      value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
    };
  });
  const roomId = crypto.randomUUID();
  const room = {
    id: roomId,
    value: {
      type: 'room',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: {
        geometry: { boundary: ring },
        status: 'existing',
        level,
        attributes: newRoomAttributes('Laundry'),
        closureOverride: null,
      },
    },
  };
  await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    [...walls, room],
  );
  return roomId;
}

const grids = async (page: Page) =>
  (await objects(page))
    .filter((o) => o.type === 'act_grid')
    .map((o) => ({ id: o.id, data: o.data as unknown as Grid }));
const rail = (page: Page) => page.locator('[data-shell-region="rail"]');
const tool = (page: Page, t: string) => rail(page).locator(`[data-rail-tool="${t}"]`);

test.describe('EZD-511 ACT grid', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-511-1: a placed grid balances its borders to at least half a tile; an override warns', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(['view_projects', 'edit_model']);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const roomId = await seedRoom(page);
    await id(page, 'surface-ceiling').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');

    // Acoustical grid on the rail; a click in the room places a balanced 2x2 grid and selects it.
    await tool(page, 'act-grid').click();
    await expect(tool(page, 'act-grid')).toHaveAttribute('aria-pressed', 'true');
    await clickModel(page, { x: 57, y: 47 });
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'act_grid');
    await expect(id(page, 'inspector-title')).toHaveText('Acoustical grid');
    await expect(id(page, 'act-grid-module')).toHaveValue('2x2');
    await expect(id(page, 'act-grid-direction')).toHaveValue('with_long_wall');
    const made = await grids(page);
    expect(made).toHaveLength(1);
    const grid = made[0]!;
    expect(grid.data.geometry.roomId.toLowerCase()).toBe(roomId.toLowerCase());
    expect(grid.data.attributes.balanced).toBe(true);
    expect(grid.data.geometry.start).toEqual({ x: 21, y: 23 });
    // Borders 21" and 23", both at least 12"; shown in the inspector and on the legend chip.
    await expect(id(page, 'act-grid-start-along')).toHaveValue(`1' 9"`);
    await expect(id(page, 'act-grid-start-across')).toHaveValue(`1' 11"`);
    await expect(id(page, 'legend-act-borders')).toHaveText(`Grid balanced: borders 1' 9" and 1' 11"`);

    // 2x4: across the mains (94") the tile is 48"; balanced to 47" borders, still at least 24".
    await id(page, 'act-grid-module').selectOption('2x4');
    await expect(id(page, 'legend-act-borders')).toHaveText(`Grid balanced: borders 1' 9" and 3' 11"`);
    await id(page, 'act-grid-module').selectOption('2x2');
    await expect(id(page, 'legend-act-borders')).toHaveText(`Grid balanced: borders 1' 9" and 1' 11"`);

    // Override: a 6" start along the mains leaves a 6" border, under the 12" minimum, so it warns.
    await id(page, 'act-grid-start-along').fill('6');
    await id(page, 'act-grid-start-along').press('Enter');
    await expect(id(page, 'act-grid-warning-along_main')).toHaveText(`Border 6" is under the 1' 0" minimum.`);
    await expect(id(page, 'legend-act-borders')).toHaveText(`Grid borders 6" and 1' 11"`);
    await expect.poll(async () => (await grids(page))[0]!.data.attributes.balanced).toBe(false);
    // Balance puts the balanced start back and the warning goes.
    await id(page, 'act-grid-balance').click();
    await expect(id(page, 'act-grid-warning-along_main')).toHaveCount(0);
    await expect(id(page, 'legend-act-borders')).toHaveText(`Grid balanced: borders 1' 9" and 1' 11"`);
    await expect.poll(async () => (await grids(page))[0]!.data.attributes.balanced).toBe(true);

    // A recessed light clicked in the grid snaps into the tile under it.
    await tool(page, 'recessed-light').click();
    await clickModel(page, { x: 50, y: 50 });
    await expect
      .poll(async () =>
        (await objects(page))
          .filter((o) => o.type === 'device')
          .map((o) => (o.data as { geometry: { point: Point } }).geometry.point),
      )
      .toEqual([{ x: 57, y: 59 }]);

    // Persist: after the save, a reload brings the grid back on its room, balanced.
    await saved(page);
    await page.reload();
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await expect.poll(async () => (await grids(page)).length).toBe(1);
    const back = (await grids(page))[0]!;
    expect(back.id).toBe(grid.id);
    expect(back.data.attributes.balanced).toBe(true);
    // The start mark picks the grid again.
    await id(page, 'surface-ceiling').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');
    await clickModel(page, { x: 21, y: 23 });
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'act_grid');
  });
});
