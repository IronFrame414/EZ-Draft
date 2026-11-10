// EZD-210b B1-B10 (vault/plans/EZD-210b.md section 4; AC-EZD-207-6, -7, AC-EZD-210-1 to -11; Slice 4 test script
// steps 2, 3, 6, 7). B1-B9 untagged (desktop 1600 x 1000); B10 is @surface. Every test makes its own company (never
// tenant 1) with fixture S (P1 "bravo" starts with the floor "Floor 1") and its own member. The canvas is read and
// driven through the `__ezdraftPlan` and `__ezdraftEditor` test hooks. Typing uses page.keyboard (P209). No
// import.meta or __dirname (lesson L-017).
import {
  CURRENT_SCHEMA_VERSION,
  createWallData,
  roomLabelText,
  type Point,
} from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
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

const EDITOR = ['view_projects', 'edit_model'];
const VIEWER = ['view_projects'];
const LOAD_ROUTE = '**/api/projects/*/model';
const ACROSS = 'That wall runs across the gap. Pick a wall that runs the same way as the gap.';

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
    stats(): { glyphs: number };
  };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
  __EZD_PERF__: { commits: number };
};

const editorState = (page: Page) => page.getByTestId('editor-state');
const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const rail = (page: Page) => page.locator('[data-shell-region="rail"]');
const tool = (page: Page, which: 'select' | 'wall' | 'room-rect') =>
  page.locator(`[data-rail-tool="${which}"]`);

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

// at(x, y): the page point of a model point (canvas region box + the handle's modelToScreen).
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
const wallsIn = (list: Obj[]) => list.filter((o) => o.type === 'wall');
const roomsIn = (list: Obj[]) => list.filter((o) => o.type === 'room');
const label = (room: Obj) =>
  roomLabelText(
    (room.data.attributes as { name: string }).name,
    (room.data.geometry as { boundary: Point[] }).boundary,
  );
const glyphs = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.stats().glyphs);

type Seg = [Point, Point];
const pt = (x: number, y: number): Point => ({ x, y });
function expectWalls(list: Obj[], want: Seg[]) {
  const walls = wallsIn(list);
  expect(walls).toHaveLength(want.length);
  for (const [s, e] of want) {
    const found = walls.some((w) => {
      const g = w.data.geometry as { start: Point; end: Point };
      return (
        Math.abs(g.start.x - s.x) < 1e-9 &&
        Math.abs(g.start.y - s.y) < 1e-9 &&
        Math.abs(g.end.x - e.x) < 1e-9 &&
        Math.abs(g.end.y - e.y) < 1e-9
      );
    });
    expect(found, `wall ${JSON.stringify([s, e])}`).toBe(true);
  }
}

// addGap: the GAP walls (0,0)->(144,0)->(144,120)->(0,120)->(0,0.5) through the editor hook (09j Closure row 2).
async function addGap(page: Page) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const pts = [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120), pt(0, 0.5)];
  const changes = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const made = createWallData({
      start: pts[i]!,
      end: pts[i + 1]!,
      level,
      thicknessSide: 'right',
    });
    if (!made.ok) throw new Error('wall data');
    changes.push({
      id: crypto.randomUUID(),
      value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
    });
  }
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);
}

const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

// Repo root: nearest folder upward from the working directory holding pnpm-workspace.yaml.
function repoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error('no pnpm-workspace.yaml above ' + process.cwd());
    dir = up;
  }
}

// The typed chain of B5 and B7 up to the fourth wall's length, which each test types itself.
async function typedChainStart(page: Page) {
  await page.keyboard.press('w');
  await clickAt(page, 0, 0);
  await moveTo(page, 60, 0);
  await page.keyboard.type("12'");
  await page.keyboard.press('Enter');
  await moveTo(page, 144, 50);
  await page.keyboard.type("10'");
  await page.keyboard.press('Tab');
  await page.keyboard.type('90');
  await page.keyboard.press('Enter');
  await moveTo(page, 94, 120);
  await page.keyboard.type("12'");
  await page.keyboard.press('Tab');
  await page.keyboard.type('90');
  await page.keyboard.press('Enter');
  await moveTo(page, 0, 70);
}

test.describe('EZD-210b drawing tools', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-210b B1 the rail has Select, Wall, Room rectangle, Door and Window; W, R, Esc and a click pick the tool', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await expect(rail(page)).toHaveCount(1);
    const tools = rail(page).locator('[data-rail-tool]');
    await expect(tools).toHaveCount(5);
    await expect(tools.nth(0)).toHaveAttribute('data-rail-tool', 'select');
    await expect(tools.nth(1)).toHaveAttribute('data-rail-tool', 'wall');
    await expect(tools.nth(2)).toHaveAttribute('data-rail-tool', 'room-rect');
    await expect(tools.nth(3)).toHaveAttribute('data-rail-tool', 'door');
    await expect(tools.nth(4)).toHaveAttribute('data-rail-tool', 'window');
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-label', 'Wall');
    await expect(tool(page, 'room-rect')).toHaveAttribute('aria-label', 'Room rectangle');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-keyshortcuts', 'W');
    await expect(tool(page, 'room-rect')).toHaveAttribute('aria-keyshortcuts', 'R');
    for (const which of ['wall', 'room-rect'] as const) {
      await expect(tool(page, which)).toHaveAttribute('aria-pressed', 'false');
      await expect(tool(page, which)).toBeEnabled();
    }
    for (const region of ['left-panel', 'inspector'])
      await expect(page.locator(`[data-shell-region="${region}"]`)).toHaveCount(0);

    await page.keyboard.press('w');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(page, 'room-rect')).toHaveAttribute('aria-pressed', 'false');
    await expect(id(page, 'typed-bar-label')).toHaveText('Length');
    await page.keyboard.press('r');
    await expect(tool(page, 'room-rect')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'false');
    await expect(id(page, 'typed-bar-label')).toHaveText('Width');
    await page.keyboard.press('Escape');
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'false');
    await expect(tool(page, 'room-rect')).toHaveAttribute('aria-pressed', 'false');
    await expect(id(page, 'typed-bar')).toHaveCount(0);
    await tool(page, 'wall').click();
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'true');
  });

  test('EZD-210b B2 while the model loads the rail is there and disabled', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(LOAD_ROUTE, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(`/projects/${ids.P1}`);
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'loading');
    await expect(rail(page)).toHaveCount(1);
    await expect(tool(page, 'wall')).toBeDisabled();
    await expect(tool(page, 'room-rect')).toBeDisabled();
    await page.keyboard.press('w');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'false');
    await expect(tool(page, 'room-rect')).toHaveAttribute('aria-pressed', 'false');
    release();
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
    await expect(tool(page, 'wall')).toBeEnabled();
    await expect(tool(page, 'room-rect')).toBeEnabled();
  });

  test('EZD-210b B3 a view-only member has only Select on the rail, no drawing tools, and still sees the gap', async ({
    page,
    signInAs,
  }) => {
    const { tenant, ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addGap(page);
    await saved(page);
    await setPermissions(tenant, user.membershipId, VIEWER as never);
    await page.reload();
    await openReady(page, ids.P1);
    await page.keyboard.press('w');
    await expect(rail(page)).toHaveCount(1);
    await expect(rail(page).locator('[data-rail-tool]')).toHaveCount(1);
    await expect(tool(page, 'wall')).toHaveCount(0);
    await expect(id(page, 'typed-bar')).toHaveCount(0);
    await expect(id(page, 'gap-box')).toHaveCount(1);
    await expect(id(page, 'gap-pill')).toHaveText('1/2" gap');
    await expect(id(page, 'gap-box').getByRole('button')).toHaveCount(0);
    await expect(id(page, 'gap-title')).toHaveCount(0);
  });

  test('EZD-210b B4 slice 4 step 2: a typed 12 feet 6 inches by 10 feet rectangle grows right and down', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await view(page);
    await page.keyboard.press('r');
    await clickAt(page, 0, 0);
    await page.keyboard.type('12\'6"');
    await page.keyboard.press('Tab');
    await page.keyboard.type("10'");
    await page.keyboard.press('Enter');
    await expect.poll(async () => wallsIn(await objects(page)).length).toBe(4);
    const list = await objects(page);
    expectWalls(list, [
      [pt(0, 0), pt(150, 0)],
      [pt(150, 0), pt(150, -120)],
      [pt(150, -120), pt(0, -120)],
      [pt(0, -120), pt(0, 0)],
    ]);
    const rooms = roomsIn(list);
    expect(rooms).toHaveLength(1);
    expect((rooms[0]!.data.attributes as { name: string }).name).toBe('Room 1');
    expect(label(rooms[0]!)).toBe('ROOM 1 · 125 SF');
    await expect.poll(() => glyphs(page)).toBe(11);
    await expect(id(page, 'gap-box')).toHaveCount(0);
    await expect(tool(page, 'room-rect')).toHaveAttribute('aria-pressed', 'true');
  });

  test('EZD-210b B5 a typed 12 by 10 feet chain closes into a room', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await view(page);
    await typedChainStart(page);
    await page.keyboard.type("10'");
    await page.keyboard.press('Tab');
    await page.keyboard.type('90');
    await page.keyboard.press('Enter');
    await expect.poll(async () => wallsIn(await objects(page)).length).toBe(4);
    const list = await objects(page);
    const rooms = roomsIn(list);
    expect(rooms).toHaveLength(1);
    expect(label(rooms[0]!)).toBe('ROOM 1 · 120 SF');
    await expect.poll(() => glyphs(page)).toBe(11);
    await expect(id(page, 'gap-box')).toHaveCount(0);
    await expect(id(page, 'typed-bar-value')).toHaveText('10\' 0"');
  });

  test('EZD-210b B6 slice 4 step 3: a click chain shows the angle and endpoint markers, closes, and a double-click ends it', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await view(page);
    await page.keyboard.press('w');
    await clickAt(page, 0, 0);
    await moveTo(page, 60, 3);
    const marker = id(page, 'snap-marker');
    await expect(marker).toHaveAttribute('data-snap-kind', 'angle');
    await expect(marker).toHaveAttribute('data-shape', 'arc');
    // At 0 degrees the arc marker is a level line (height 0), so toBeVisible cannot pass; check attributes.
    await expect(marker).not.toHaveAttribute('display', 'none');
    await expect(marker).not.toHaveAttribute('hidden', /^/);
    await expect(marker).toHaveAttribute('d', 'M 128 384 L 144 384');
    await clickAt(page, 120, 0);
    await clickAt(page, 120, 96);
    await clickAt(page, 0, 96);
    const start = await at(page, 0, 0);
    await page.mouse.move(start.x + 3, start.y + 2);
    await expect(marker).toHaveAttribute('data-snap-kind', 'endpoint');
    await expect(marker).toHaveAttribute('data-shape', 'square');
    await page.mouse.click(start.x + 3, start.y + 2);
    await expect.poll(async () => wallsIn(await objects(page)).length).toBe(4);
    let rooms = roomsIn(await objects(page));
    expect(rooms).toHaveLength(1);
    expect(label(rooms[0]!)).toBe('ROOM 1 · 80 SF');

    await clickAt(page, 201, 0);
    await clickAt(page, 321, 0);
    const end = await at(page, 321, 96);
    await page.mouse.dblclick(end.x, end.y);
    await moveTo(page, 400, 0);
    await expect.poll(async () => wallsIn(await objects(page)).length).toBe(6);
    rooms = roomsIn(await objects(page));
    expect(rooms).toHaveLength(1);
    await expect(id(page, 'tool-band')).toBeHidden();
  });

  test('EZD-210b B7 slice 4 steps 7 and 6: a chain that misses by half an inch keeps its gap; pick a wall to absorb it', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(90_000);
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await view(page);
    await typedChainStart(page);
    await page.keyboard.type('9\' 11 1/2"');
    await page.keyboard.press('Tab');
    await page.keyboard.type('90');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    const gapShown = async () => {
      const list = await objects(page);
      expect(wallsIn(list)).toHaveLength(4);
      expect(roomsIn(list)).toHaveLength(0);
      await expect(id(page, 'gap-box')).toHaveCount(1);
      await expect(id(page, 'gap-pill')).toHaveText('1/2" gap');
      await expect(id(page, 'gap-pick')).toHaveText('Pick the wall that absorbs it');
      await expect(id(page, 'gap-keep')).toHaveText('Keep the room out of square');
    };
    await saved(page);
    await gapShown();
    await page.reload();
    await openReady(page, ids.P1);
    await view(page);
    await gapShown();

    await id(page, 'gap-pick').click();
    await expect(id(page, 'gap-hint')).toBeVisible();
    await expect(id(page, 'gap-pick')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(id(page, 'gap-pick')).toHaveCount(1);
    await gapShown();

    await id(page, 'gap-pick').click();
    await moveTo(page, 72, 0);
    await clickAt(page, 72, 0);
    await expect(id(page, 'gap-alert')).toHaveText(ACROSS);
    expect(roomsIn(await objects(page))).toHaveLength(0);

    await moveTo(page, 0, 60);
    await clickAt(page, 0, 60);
    await expect.poll(async () => roomsIn(await objects(page)).length).toBe(1);
    expect(label(roomsIn(await objects(page))[0]!)).toBe('ROOM 1 · 120 SF');
    await expect(id(page, 'gap-box')).toHaveCount(0);
    await expect.poll(() => glyphs(page)).toBe(11);
  });

  test('EZD-210b B8 keeping the room out of square saves who kept it, and the box stays gone after a reload', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await view(page);
    await addGap(page);
    await id(page, 'gap-keep').click();
    await expect.poll(async () => roomsIn(await objects(page)).length).toBe(1);
    await saved(page);
    const check = async () => {
      const rooms = roomsIn(await objects(page));
      expect(rooms).toHaveLength(1);
      const o = rooms[0]!.data.closureOverride as { who: string };
      expect(o.who).toBe(user.appUserId);
      expect(label(rooms[0]!)).toBe('ROOM 1 · 120 SF');
      await expect(id(page, 'gap-box')).toHaveCount(0);
    };
    await check();
    await page.reload();
    await openReady(page, ids.P1);
    await check();
  });

  test('EZD-210b B9 pointer moves update the band with no React commit', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(60_000);
    await page.addInitScript({
      path: path.join(repoRoot(), 'scripts', 'perf', 'page-hooks.browser.js'),
    });
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await view(page);
    await page.keyboard.press('w');
    await clickAt(page, 0, 0);
    const commits = () => page.evaluate(() => (window as unknown as Window2).__EZD_PERF__.commits);
    // Stable read: two reads in a row equal, polled every 100 ms for up to 5000 ms.
    const stable = async (): Promise<number> => {
      let last = -1;
      await expect
        .poll(
          async () => {
            const now = await commits();
            const same = now === last;
            last = now;
            return same;
          },
          { intervals: [100], timeout: 5000 },
        )
        .toBe(true);
      return last;
    };
    const before = await stable();
    for (let i = 0; i < 50; i++) await moveTo(page, i % 2 === 0 ? 60 : 96, i % 2 === 0 ? 30 : 72);
    await expect(id(page, 'tool-band')).toHaveAttribute('d', 'M 128 384 L 384 192');
    expect(await stable()).toBe(before);
  });

  test(
    'EZD-210b B10 rail buttons and gap buttons are touch targets',
    { tag: ['@surface'] },
    async ({ page, signInAs }) => {
      const { ids, user } = await fixtureS();
      await signInAs(user.email);
      await openReady(page, ids.P1);
      await addGap(page);
      await view(page);
      expect(await expectTouchTargets(page, rail(page))).toBe(5);
      expect(await expectTouchTargets(page, id(page, 'gap-box'))).toBe(2);
    },
  );
});
