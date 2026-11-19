// EZD-218 (AC-EZD-218-1 to -5; S03 Controls — left panel; S03 Decisions "The layer filter is a lock icon on each layer
// row"; 03 Q-0664 "View default" (eyes and locks reset on reload), "Rooms gain …"; Q-0673 (c); Q-0677 (a); PHASES
// Slice 6 Josh's script steps 2 and 3). Desktop 1600 x 1000, untagged. Every test makes its own company (never tenant
// 1) with fixture S and its own member, as phase-view.spec.ts. The model is seeded and read through the
// `__ezdraftEditor`, `__ezdraftPlan` and `__ezdraftSelection` test hooks. No import.meta or __dirname (L-017).
import {
  CURRENT_SCHEMA_VERSION,
  createWallData,
  newRoomAttributes,
  type Point,
} from '@ezdraft/geometry';
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

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, EDITOR as never);
  return { ids, user };
}

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: {
    handle: {
      setView(v: View): void;
      getView(): View;
      modelToScreen(p: Point): Point;
      wallAt(screen: Point): string | null;
    };
  };
  __ezdraftEditor: {
    objects(): Obj[];
    edit(changes: Array<{ id: string; value: unknown }>): string[];
  };
  __ezdraftSelection: { ids(): string[] };
};

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });
const selected = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids());
const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
  await page.evaluate(() =>
    (window as unknown as Window2).__ezdraftPlan.handle.setView({ x: -48, y: 168, ppi: 8 / 3 }),
  );
}

async function screenOf(page: Page, p: Point): Promise<Point> {
  const box = await canvasRegion(page).boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (q) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(q),
    p,
  );
  return { x: box.x + s.x, y: box.y + s.y };
}

async function clickAt(page: Page, p: Point) {
  const s = await screenOf(page, p);
  await page.mouse.click(s.x, s.y);
}

const wallAt = (page: Page, p: Point) =>
  page.evaluate((q) => {
    const h = (window as unknown as Window2).__ezdraftPlan.handle;
    return h.wallAt(h.modelToScreen(q));
  }, p);

// A closed 144 × 120 room "Kitchen" with its four walls outside it (thickness to the right walking counter-clockwise),
// all Existing, in one edit. 144 × 120 = 17,280 sq in = 120 sf.
async function seedRoom(page: Page): Promise<{ room: string; walls: string[] }> {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const ring: Point[] = [
    { x: 0, y: 0 },
    { x: 144, y: 0 },
    { x: 144, y: 120 },
    { x: 0, y: 120 },
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
  const room = {
    id: crypto.randomUUID(),
    value: {
      type: 'room',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: {
        geometry: { boundary: ring },
        status: 'existing',
        level,
        attributes: newRoomAttributes('Kitchen'),
        closureOverride: null,
      },
    },
  };
  const changes = [...walls, room];
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);
  return { room: room.id, walls: walls.map((w) => w.id) };
}

const INSIDE: Point = { x: 72, y: 60 };

test.describe('EZD-218 left panel: Layers and Rooms', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-218 B1 tabs, eyes and the Rooms list; a click inside a room selects it; Delete leaves it', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);

    // AC-1: Layers and Rooms, Layers open; EZD-122 adds Versions after them (Q-0673 (c) "until EZD-122").
    const panel = page.locator('[data-shell-region="left-panel"]');
    await expect(panel).toHaveAttribute('aria-label', 'Left panel');
    await expect(panel.getByRole('tab')).toHaveText(['Layers', 'Rooms', 'Versions']);
    await expect(id(page, 'left-panel-tab-layers')).toHaveAttribute('aria-selected', 'true');

    const { room, walls } = await seedRoom(page);
    await saved(page);
    await expect(id(page, 'room-row')).toHaveText(['Kitchen120 sf']);

    // AC-5: a click inside the room away from its walls selects the room; within 10 px a wall still wins.
    await clickAt(page, INSIDE);
    await expect.poll(() => selected(page)).toEqual([room]);
    await expect(id(page, 'inspector-title')).toHaveText('Kitchen');

    // Delete with only the room selected leaves the model unchanged.
    const before = (await objects(page)).length;
    await page.keyboard.press('Delete');
    expect((await objects(page)).length).toBe(before);
    expect((await objects(page)).some((o) => o.id === room)).toBe(true);

    await page.keyboard.press('Escape');
    await clickAt(page, { x: 72, y: 2 });
    await expect.poll(() => selected(page)).toEqual([walls[0]]);

    // AC-2: the Existing eye hides the walls and the room; the Rooms eye hides the room only.
    await id(page, 'layer-eye-existing').click();
    await expect.poll(() => wallAt(page, { x: 72, y: -2 })).toBeNull();
    await expect.poll(() => selected(page)).toEqual([]);
    await id(page, 'layer-eye-existing').click();
    await expect.poll(() => wallAt(page, { x: 72, y: -2 })).toBe(walls[0]);
    await id(page, 'layer-eye-rooms').click();
    await expect(id(page, 'layer-eye-rooms')).toHaveAttribute('data-on', 'false');
    await clickAt(page, INSIDE);
    await expect.poll(() => selected(page)).toEqual([]);
    expect(await wallAt(page, { x: 72, y: -2 })).toBe(walls[0]);
  });

  test('EZD-218 B2 Slice 6 step 2: lock Rooms; a click, box and Select all skip the room; locks reset on reload', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const { room, walls } = await seedRoom(page);
    await saved(page);

    await id(page, 'layer-lock-rooms').click();
    await expect(id(page, 'layer-lock-rooms')).toHaveAttribute('data-locked', 'true');
    await clickAt(page, INSIDE);
    await expect.poll(() => selected(page)).toEqual([]);

    // A right-to-left (touch) box inside the room, away from its walls.
    const from = await screenOf(page, { x: 130, y: 60 });
    const to = await screenOf(page, { x: 20, y: 100 });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => selected(page)).toEqual([]);

    await page.keyboard.press('ControlOrMeta+a');
    await expect.poll(async () => [...(await selected(page))].sort()).toEqual([...walls].sort());

    // Unlocked, the same box takes the room (Q-0677 (a): a press inside a room starts a box).
    await id(page, 'layer-lock-rooms').click();
    await clickAt(page, { x: 200, y: 60 });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => selected(page)).toEqual([room]);

    // AC-3: eyes and locks belong to the device session and reset on reload.
    await id(page, 'layer-lock-rooms').click();
    await id(page, 'layer-eye-rooms').click();
    await page.reload();
    await openReady(page, ids.P1);
    await expect(id(page, 'layer-lock-rooms')).toHaveAttribute('data-locked', 'false');
    await expect(id(page, 'layer-eye-rooms')).toHaveAttribute('data-on', 'true');
    await clickAt(page, INSIDE);
    await expect.poll(() => selected(page)).toEqual([room]);
  });

  test('EZD-218 B3 Slice 6 step 3: a row click selects and zooms; the type Bath persists after a reload', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const { room } = await seedRoom(page);
    await saved(page);

    const viewBefore = await page.evaluate(() =>
      (window as unknown as Window2).__ezdraftPlan.handle.getView(),
    );
    await id(page, 'room-row').click();
    await expect.poll(() => selected(page)).toEqual([room]);
    const viewAfter = await page.evaluate(() =>
      (window as unknown as Window2).__ezdraftPlan.handle.getView(),
    );
    expect(viewAfter).not.toEqual(viewBefore);

    await id(page, 'left-panel-tab-rooms').click();
    await expect(id(page, 'room-fields')).toHaveAttribute('data-room-id', room);
    await expect(id(page, 'room-area')).toHaveText('120 sf');
    await id(page, 'room-type').selectOption('bath');
    await id(page, 'room-ceiling-type').selectOption('tray');
    await id(page, 'room-floor-finish').fill('Porcelain tile');
    await id(page, 'room-floor-finish').press('Enter');
    await id(page, 'room-name').fill('Hall bath');
    await id(page, 'room-name').press('Enter');
    await expect(id(page, 'room-row')).toHaveText(['Hall bath120 sf']);
    await saved(page);

    await page.reload();
    await openReady(page, ids.P1);
    await expect(id(page, 'left-panel-tab-layers')).toHaveAttribute('aria-selected', 'true');
    await id(page, 'left-panel-tab-rooms').click();
    await id(page, 'room-row').click();
    await expect(id(page, 'room-type')).toHaveValue('bath');
    await expect(id(page, 'room-ceiling-type')).toHaveValue('tray');
    await expect(id(page, 'room-floor-finish')).toHaveValue('Porcelain tile');
    await expect(id(page, 'room-name')).toHaveValue('Hall bath');
  });
});
