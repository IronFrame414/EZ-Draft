// EZD-212b B1, B2 (vault/plans/EZD-212b.md section 4; AC-EZD-212-3, -6, -15, -18). Untagged desktop project (1600 x 1000).
// Every test makes its own company (never tenant 1) with fixture S and its own member. The canvas is read and driven
// through the `__ezdraftPlan`, `__ezdraftEditor` and `__ezdraftSelection` test hooks. Helpers are copies of
// drawing-tools.spec.ts. No import.meta or __dirname (lesson L-017).
import {
  COMPARISON_TOLERANCE_IN,
  CURRENT_SCHEMA_VERSION,
  createOpeningData,
  createWallData,
  type Point,
  type WallObject,
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

async function member(tenant: string, permissions: string[]) {
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return m;
}

async function fixtureS(permissions: string[] = EDITOR) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  return { tenant, ids, user: await member(tenant, permissions) };
}

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: {
    handle: { setView(v: View): void; modelToScreen(p: Point): Point };
  };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
  __ezdraftSelection: { ids(): string[] };
};

const editorState = (page: Page) => page.getByTestId('editor-state');
const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');

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
const moveTo = async (page: Page, x: number, y: number) => {
  const p = await at(page, x, y);
  await page.mouse.move(p.x, p.y);
};
const clickAt = async (page: Page, x: number, y: number) => {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
};

const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const selectedIds = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids());

const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

const pt = (x: number, y: number): Point => ({ x, y });
const near = (got: number, want: number, digits = 6) => expect(got).toBeCloseTo(want, digits);
// 03g equality: |got - want| <= 1/64 inch, inclusive (COMPARISON_TOLERANCE_IN); toBeCloseTo cannot express it.
const nearTol = (got: number, want: number) =>
  expect(Math.abs(got - want)).toBeLessThanOrEqual(COMPARISON_TOLERANCE_IN);

type Geo = { start: Point; end: Point };
type OpeningGeo = { center: Point; hostWallId: string | null; axis: Point | null };

// The closed ROOM of the plan (side right: S, E, N, W) and a door on E at (144,60), through the editor hook in one call
// (as drawing-tools.spec.ts addGap does).
async function seedRoomAndDoor(page: Page) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const pts = [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120)];
  const wallIds: string[] = [];
  const changes: unknown[] = [];
  let east: WallObject | null = null;
  for (let i = 0; i < pts.length; i++) {
    const made = createWallData({
      start: pts[i]!,
      end: pts[(i + 1) % pts.length]!,
      level,
      thicknessSide: 'right',
    });
    if (!made.ok) throw new Error('wall data');
    const wallId = crypto.randomUUID();
    wallIds.push(wallId);
    if (i === 1) east = { id: wallId, type: 'wall', data: made.data } as unknown as WallObject;
    changes.push({
      id: wallId,
      value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
    });
  }
  const doorId = crypto.randomUUID();
  changes.push({
    id: doorId,
    value: {
      type: 'opening',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: createOpeningData({ kind: 'door', host: east!, center: pt(144, 60) }),
    },
  });
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);
  return { wallIds, doorId, S: wallIds[0]!, E: wallIds[1]!, N: wallIds[2]!, W: wallIds[3]! };
}

const geoOf = (list: Obj[], objId: string) =>
  list.find((o) => o.id === objId)!.data.geometry as unknown as Geo;
const openingOf = async (page: Page, doorId: string) =>
  (await objects(page)).find((o) => o.id === doorId)!.data.geometry as unknown as OpeningGeo;

test.describe('EZD-212b Move tool', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-212b B1 Move the host wall away from a door', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const seed = await seedRoomAndDoor(page);
    await view(page);

    await page.keyboard.press('m');
    await expect(page.locator('[data-rail-tool="move"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(id(page, 'typed-bar-label')).toHaveText('Distance');

    await clickAt(page, 144, 100);
    expect(await selectedIds(page)).toEqual([seed.E]);
    const before = geoOf(await objects(page), seed.E);
    near(before.start.x, 144, 9);
    near(before.end.x, 144, 9);

    await clickAt(page, 144, 100);
    await moveTo(page, 200, 100);
    await page.keyboard.type('6"');
    await page.keyboard.press('Enter');

    await expect
      .poll(async () => geoOf(await objects(page), seed.E).start.x, { timeout: 15_000 })
      .toBeCloseTo(150, 9);
    const list = await objects(page);
    const e = geoOf(list, seed.E);
    near(e.start.x, 150, 9);
    near(e.start.y, 0, 9);
    near(e.end.x, 150, 9);
    near(e.end.y, 120, 9);
    const door = await openingOf(page, seed.doorId);
    near(door.center.x, 144, 9);
    near(door.center.y, 60, 9);
    expect(door.hostWallId).toBeNull();
    await saved(page);
  });

  test('EZD-212b B2 drag a door along, off and onto a wall', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const seed = await seedRoomAndDoor(page);
    await view(page);

    const drag = async (from: Point, via: Point[]) => {
      const a = await at(page, from.x, from.y);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      for (const v of via) {
        const b = await at(page, v.x, v.y);
        await page.mouse.move(b.x, b.y, { steps: 4 });
      }
      await page.mouse.up();
    };

    await drag(pt(144, 60), [pt(146, 80)]);
    await expect
      .poll(async () => Math.abs((await openingOf(page, seed.doorId)).center.y - 80))
      .toBeLessThanOrEqual(COMPARISON_TOLERANCE_IN);
    let door = await openingOf(page, seed.doorId);
    nearTol(door.center.x, 144);
    expect(door.hostWallId).toBe(seed.E);

    await drag(pt(144, 80), [pt(144, 100), pt(200, 100)]);
    await expect
      .poll(async () => Math.abs((await openingOf(page, seed.doorId)).center.y - 100))
      .toBeLessThanOrEqual(COMPARISON_TOLERANCE_IN);
    door = await openingOf(page, seed.doorId);
    nearTol(door.center.x, 144);
    expect(door.hostWallId).toBe(seed.E);

    await drag(pt(144, 100), [pt(100, 118)]);
    await expect
      .poll(async () => Math.abs((await openingOf(page, seed.doorId)).center.y - 120))
      .toBeLessThanOrEqual(COMPARISON_TOLERANCE_IN);
    door = await openingOf(page, seed.doorId);
    nearTol(door.center.x, 100);
    expect(door.hostWallId).toBe(seed.N);
  });
});
