// EZD-423 (AC-EZD-423-1 to -3; 11 Budgets "editor before its lazy parts 500 KB"; 11 rule 7). Untagged, so desktop
// 1600 x 1000. Fixture S (P1 "bravo" starts with "Floor 1") in its own company with its own member. The size and
// contents are measured as EZD-120c B11 measures them; the drawing engine loads on the first input, and
// the first input is acted on as before. Geometry: the EZD-210b B-row gap walls (09j Closure row 2) and the
// EZD-210b D3 four-wall click chain closing on its start point (one room); the EZD-210b B4 typed 12'6" by 10'
// rectangle.
import { CURRENT_SCHEMA_VERSION, createWallData, type Point } from '@ezdraft/geometry';
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  signedInJsContents,
  signedInJsSize,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

// The editor budget (11 Budgets, EZD-120c B11). AC-EZD-423-1's 25,000 bytes of room were measured at this ticket's
// gate and are printed here; a lasting 475,000 limit would take back the room later tickets were given
// (vault/build/assumptions.md EZD-423).
const EDITOR_LIMIT = 500_000;
// The engine files that now load with the drawing-engine lazy module.
const MOVED = [
  'app:editor/tools/drawing-controller.ts',
  'app:editor/tools/wall-chain.ts',
  'app:editor/tools/room-rect.ts',
  'app:editor/tools/opening-tool.ts',
  'app:editor/tools/move-tool.ts',
  'app:editor/tools/selection-edit.ts',
];

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: { handle: { setView(v: View): void; modelToScreen(p: Point): Point } };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
};

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model'] as never);
  return { ids, user };
}

const id = (page: Page, testId: string) => page.getByTestId(testId);
const pt = (x: number, y: number): Point => ({ x, y });

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
  // Through the test hook, not user input: model (0,0) at region px (128, 384), 8/3 px per inch.
  await page.evaluate(() =>
    (window as unknown as Window2).__ezdraftPlan.handle.setView({ x: -48, y: 144, ppi: 8 / 3 }),
  );
}

async function at(page: Page, x: number, y: number): Promise<Point> {
  const box = await page.locator('[data-shell-region="canvas"]').boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
    { x, y },
  );
  return { x: box.x + s.x, y: box.y + s.y };
}

// Holds every script fetched from now on until `release()`: the lazy chunks the first input asks for, so the input
// is made while the engine is still loading.
async function holdScripts(page: Page) {
  let release: () => void = () => {};
  const open = new Promise<void>((r) => (release = r));
  let held = 0;
  await page.route('**/_next/static/chunks/**', async (route) => {
    held++;
    await open;
    await route.continue();
  });
  return { release, held: () => held };
}

const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());

async function addWalls(page: Page, pts: Point[]) {
  const floors = (await objects(page)).filter((o) => o.type === 'floor');
  const level = floors[0]!.id;
  const changes = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const made = createWallData({ start: pts[i]!, end: pts[i + 1]!, level, thicknessSide: 'right' });
    if (!made.ok) throw new Error('wall data');
    changes.push({
      id: crypto.randomUUID(),
      value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
    });
  }
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);
}

test.describe('EZD-423 editor download room', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-423 A1 the editor route holds the drawing shell and no drawing engine code, within 500,000 compressed bytes', async ({
    page,
    browser,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const state = await page.context().storageState();
    const url = `/projects/${ids.P1}`;
    const contents = await signedInJsContents(browser, state, url, 'editor');
    expect('error' in contents).toBe(false);
    expect('value' in contents ? contents.value : -1).toBe(0);
    const modules = Object.keys(
      (contents.details as { modules?: Record<string, number> }).modules ?? {},
    );
    expect(modules).toContain('app:editor/tools/drawing-shell.ts');
    for (const file of MOVED) expect(modules).not.toContain(file);
    const size = await signedInJsSize(browser, state, url);
    expect('error' in size).toBe(false);
    console.log(`EZD-423 editor route compressed JavaScript: ${'value' in size ? size.value : 'error'} bytes`);
    expect('value' in size ? size.value : Infinity).toBeLessThanOrEqual(EDITOR_LIMIT);
  });

  test('EZD-423 A2 before any input the gap box shows; W and the first clicks draw the walls and close the room', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addWalls(page, [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120), pt(0, 0.5)]);
    // Before the engine: the gap box, from the shell.
    await expect(id(page, 'gap-box')).toHaveCount(1);
    // en.ts office.tools.gap.size '{size} gap'.
    await expect(id(page, 'gap-pill')).toHaveText('1/2" gap');

    // The page's first input is the W key; the clicks made while the engine is still loading are not lost. The
    // screen points are read first (the mapping does not move while drawing).
    const corners = [pt(176, -24), pt(272, -24), pt(272, -120), pt(176, -120), pt(176, -24)];
    const points = [];
    for (const c of corners) points.push(await at(page, c.x, c.y));
    const scripts = await holdScripts(page);
    await page.keyboard.press('w');
    for (const p of points) await page.mouse.click(p.x, p.y);
    await expect.poll(scripts.held).toBeGreaterThan(0);
    expect((await objects(page)).filter((o) => o.type === 'wall')).toHaveLength(4);
    scripts.release();
    await expect(page.locator('[data-rail-tool="wall"]')).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => (await objects(page)).filter((o) => o.type === 'wall').length)
      .toBe(4 + 4);
    await expect
      .poll(async () => (await objects(page)).filter((o) => o.type === 'room').length)
      .toBe(1);
    // The gap box stays once the engine has it.
    await expect(id(page, 'gap-box')).toHaveCount(1);
  });

  test('EZD-423 A4 R, a click and a typed size made while the engine loads draw the EZD-210b B4 rectangle', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const corner = await at(page, 0, 0);
    const scripts = await holdScripts(page);
    await page.keyboard.press('r');
    await expect(page.locator('[data-rail-tool="room-rect"]')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.click(corner.x, corner.y);
    await page.keyboard.type('12\'6"');
    await page.keyboard.press('Tab');
    await page.keyboard.type("10'");
    await page.keyboard.press('Enter');
    await expect.poll(scripts.held).toBeGreaterThan(0);
    expect((await objects(page)).filter((o) => o.type === 'wall')).toHaveLength(0);
    scripts.release();
    await expect
      .poll(async () => (await objects(page)).filter((o) => o.type === 'wall').length)
      .toBe(4);
    const ends = (await objects(page))
      .filter((o) => o.type === 'wall')
      .map((o) => (o.data.geometry as { end: Point }).end);
    expect(ends).toEqual(
      expect.arrayContaining([pt(150, 0), pt(150, -120), pt(0, -120), pt(0, 0)]),
    );
    expect((await objects(page)).filter((o) => o.type === 'room')).toHaveLength(1);
  });

  test('EZD-423 A3 a drag that is the first input moves the wall', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addWalls(page, [pt(0, 0), pt(120, 0)]);
    const from = await at(page, 60, 0);
    const to = await at(page, 60, 48);
    const startY = async () => {
      const wall = (await objects(page)).find((o) => o.type === 'wall')!;
      return (wall.data.geometry as { start: Point }).start.y;
    };
    const scripts = await holdScripts(page);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(scripts.held).toBeGreaterThan(0);
    expect(await startY()).toBe(0);
    scripts.release();
    await expect.poll(startY).toBe(48);
  });
});
