// EZD-211b B1-B6 (vault/plans/EZD-211b.md section 4; AC-EZD-211-1 to -20; Slice 5 test script steps 1, 2). B1-B3, B5, B6
// run on desktop; B4 is @surface. Every test makes its own company (never tenant 1) with fixture S and its own member.
// The canvas is read and driven through the `__ezdraftPlan`, `__ezdraftEditor` and `__ezdraftSelection` test hooks.
// No import.meta or __dirname (lesson L-017).
import { CURRENT_SCHEMA_VERSION, createWallData, type Point } from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
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
const REFUSED = 'Use 12\'6", 12\' 6 1/2", 150" or 12.5\'';

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
  __ezdraftPlan: { handle: { setView(v: View): void; modelToScreen(p: Point): Point } };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
  __ezdraftSelection: { ids(): string[] };
};

const editorState = (page: Page) => page.getByTestId('editor-state');
const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const rail = (page: Page) => page.locator('[data-shell-region="rail"]');
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
const openingsIn = async (page: Page) => (await objects(page)).filter((o) => o.type === 'opening');
async function opening(page: Page): Promise<Obj> {
  const list = await openingsIn(page);
  expect(list).toHaveLength(1);
  return list[0]!;
}
type Attrs = Record<string, unknown>;
const attrs = (o: Obj) => (o.data as { attributes: Attrs }).attributes;
const center = (o: Obj) => (o.data as { geometry: { center: Point } }).geometry.center;
const hostOf = (o: Obj) => (o.data as { geometry: { hostWallId: string } }).geometry.hostWallId;

const pt = (x: number, y: number): Point => ({ x, y });

// addW: the closed 12 by 10 foot walls (0,0) (144,0) (144,120) (0,120) (0,0) through the editor hook; returns the
// first wall's id.
async function addW(page: Page): Promise<string> {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const pts = [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120), pt(0, 0)];
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
  return changes[0]!.id;
}

const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

async function touch(page: Page, type: string, x: number, y: number) {
  const p = await at(page, x, y);
  await page.evaluate(
    ({ type, x, y }) => {
      const el = document.querySelector('[data-testid="plan-input"]');
      if (!el) throw new Error('no plan-input');
      el.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x,
          clientY: y,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { type, x: p.x, y: p.y },
  );
}

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

test.describe('EZD-211b door and window tools', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-211b B1 slice 5 step 1: D, hover, Tab, type 36, reload', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const wallId = await addW(page);
    await view(page);
    const tools = rail(page).locator('[data-rail-tool]');
    await expect(tools.nth(4)).toHaveAttribute('data-rail-tool', 'door');
    await expect(tools.nth(5)).toHaveAttribute('data-rail-tool', 'window');
    await expect(tool(page, 'door')).toHaveAttribute('aria-label', 'Door');
    await expect(tool(page, 'door')).toHaveAttribute('aria-keyshortcuts', 'D');
    await expect(tool(page, 'window')).toHaveAttribute('aria-label', 'Window');
    await expect(tool(page, 'window')).toHaveAttribute('aria-keyshortcuts', 'N');

    await page.keyboard.press('d');
    await expect(tool(page, 'door')).toHaveAttribute('aria-pressed', 'true');
    await moveTo(page, 60, 2);
    await expect(id(page, 'opening-preview')).toBeVisible();
    await page.keyboard.type('36');
    await expect(id(page, 'typed-bar-label')).toHaveText('Offset left');
    await page.keyboard.press('Tab');
    await expect(id(page, 'typed-bar-label')).toHaveText('Offset right');
    await page.keyboard.press('Tab');
    await expect(id(page, 'typed-bar-label')).toHaveText('Width');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await openingsIn(page)).length).toBe(1);
    const check = async () => {
      const o = await opening(page);
      expect(attrs(o).kind).toBe('door');
      near(center(o).x, 54);
      near(center(o).y, 0);
      expect(hostOf(o).toLowerCase()).toBe(wallId.toLowerCase());
      expect(attrs(o).number).toBe(1);
      expect(attrs(o).width).toBe(36);
      expect(attrs(o).height).toBe(80);
      return o;
    };
    const o = await check();
    expect(await selectedIds(page)).toEqual([o.id]);
    await expect(tool(page, 'door')).toHaveAttribute('aria-pressed', 'true');
    await saved(page);
    await page.reload();
    await openReady(page, ids.P1);
    const again = await check();
    expect(again.id).toBe(o.id);
  });

  test('EZD-211b B2 chips, Space, hinge dot, Space-drag', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addW(page);
    await view(page);
    await page.keyboard.press('d');
    await moveTo(page, 60, 2);
    await expect(id(page, 'opening-chip-left')).toHaveText('3\' 6"');
    await expect(id(page, 'opening-chip-right')).toHaveText('5\' 6"');
    await expect(id(page, 'opening-chip-left')).toHaveCSS('height', '26px');
    await expect(id(page, 'opening-chip-left')).toHaveCSS('font-size', '13px');
    await expect(id(page, 'opening-dims')).not.toHaveAttribute('display', 'none');
    await expect(id(page, 'opening-ticks')).not.toHaveAttribute('display', 'none');
    await expect(id(page, 'opening-dims')).toHaveAttribute('d', /\S/);
    await expect(id(page, 'opening-ticks')).toHaveAttribute('d', /\S/);
    const leaf = id(page, 'opening-preview').locator('path[data-part="leaf"]');
    const before = await leaf.getAttribute('d');
    await page.keyboard.press('Space');
    await expect.poll(() => leaf.getAttribute('d')).not.toBe(before);
    await clickAt(page, 60, 2);
    await expect.poll(async () => (await openingsIn(page)).length).toBe(1);
    let o = await opening(page);
    expect(attrs(o).swing).toBe('right');
    near(center(o).x, 60);
    near(center(o).y, 0);

    const dot = id(page, 'door-hinge-dot');
    const box = await canvasRegion(page).boundingBox();
    if (!box) throw new Error('canvas region has no box');
    const cx = Number(await dot.getAttribute('cx'));
    const cy = Number(await dot.getAttribute('cy'));
    await page.mouse.move(box.x + cx, box.y + cy);
    await expect(id(page, 'door-tooltip')).toHaveText('Click to flip hand');
    await page.mouse.click(box.x + cx, box.y + cy);
    await expect.poll(async () => attrs(await opening(page)).hand).toBe('right');
    o = await opening(page);
    near(center(o).x, 60);
    near(center(o).y, 0);

    await moveTo(page, 72, 60);
    await page.keyboard.down('Space');
    await page.mouse.down();
    const here = await at(page, 72, 60);
    await page.mouse.move(here.x + 50, here.y, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen({ x: 0, y: 0 }),
        ),
      )
      .toEqual({ x: 178, y: 384 });
    expect(attrs(await opening(page)).swing).toBe('right');
    await saved(page);
  });

  test('EZD-211b B3 slice 5 step 2: a window at a typed offset', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addW(page);
    await view(page);
    await page.keyboard.press('n');
    await expect(tool(page, 'window')).toHaveAttribute('aria-pressed', 'true');
    await moveTo(page, 100, 2);
    await page.keyboard.type('24');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await openingsIn(page)).length).toBe(1);
    const o = await opening(page);
    expect(attrs(o).kind).toBe('window');
    near(center(o).x, 42);
    near(center(o).y, 0);
    expect(attrs(o).sillHeight).toBe(36);
    expect(attrs(o).width).toBe(36);
    expect(attrs(o).height).toBe(48);
    expect(attrs(o).swing).toBeNull();
    expect(attrs(o).hand).toBeNull();
    await saved(page);
  });

  test(
    'EZD-211b B4 tablet press, drag, lift, chip tap',
    { tag: ['@surface'] },
    async ({ page, signInAs }) => {
      const { ids, user } = await fixtureS();
      await signInAs(user.email);
      await openReady(page, ids.P1);
      await addW(page);
      await view(page);
      await tool(page, 'door').tap();
      await touch(page, 'pointerdown', 30, 0);
      await touch(page, 'pointermove', 60, 0);
      await touch(page, 'pointermove', 90, 0);
      await expect(id(page, 'opening-chip-left')).toHaveText('6\' 0"');
      await expect(id(page, 'opening-chip-right')).toHaveText('3\' 0"');
      await touch(page, 'pointerup', 90, 0);
      await expect.poll(async () => (await openingsIn(page)).length).toBe(1);
      const o = await opening(page);
      near(center(o).x, 90);
      near(center(o).y, 0);
      expect(await expectTouchTargets(page, rail(page).locator('[data-rail="top"]'))).toBe(7);
      expect(await expectTouchTargets(page, rail(page).locator('[data-rail="bottom"]'))).toBe(1);
      expect(await expectTouchTargets(page, id(page, 'opening-chips'))).toBe(2);
      await id(page, 'opening-chip-left').tap();
      await expect(id(page, 'typed-box')).toBeVisible();
      await expect(id(page, 'typed-bar-label')).toHaveText('Offset left');
      await expect(id(page, 'typed-box-input')).toBeFocused();
      await saved(page);
    },
  );

  test('EZD-211b B5 a view-only member has no Door or Window and no preview', async ({
    page,
    signInAs,
  }) => {
    const { tenant, ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addW(page);
    await saved(page);
    await setPermissions(tenant, user.membershipId, VIEWER as never);
    await page.reload();
    await openReady(page, ids.P1);
    await view(page);
    await page.keyboard.press('d');
    await page.keyboard.press('n');
    await moveTo(page, 60, 2);
    await expect(page.locator('[data-rail-tool="door"]')).toHaveCount(0);
    await expect(page.locator('[data-rail-tool="window"]')).toHaveCount(0);
    await expect(id(page, 'opening-preview')).toBeHidden();
    await setPermissions(tenant, user.membershipId, EDITOR as never);
    await page.reload();
    await openReady(page, ids.P1);
    expect(await openingsIn(page)).toHaveLength(0);
  });

  test('EZD-211b B6 a chip types an offset; refused text keeps the box open', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addW(page);
    await view(page);
    await page.keyboard.press('d');
    await clickAt(page, 60, 2);
    await expect.poll(async () => (await openingsIn(page)).length).toBe(1);
    const placed = await opening(page);
    await id(page, 'opening-chip-right').click();
    await expect(id(page, 'typed-bar-label')).toHaveText('Offset right');
    await expect(id(page, 'typed-box-input')).toBeFocused();
    await page.keyboard.type('abc');
    await page.keyboard.press('Enter');
    await expect(id(page, 'typed-bar-error')).toHaveText(REFUSED);
    await expect(id(page, 'typed-box')).toBeVisible();
    const still = await opening(page);
    near(center(still).x, 60);
    near(center(still).y, 0);
    await page.keyboard.press('Escape');
    await id(page, 'opening-chip-left').click();
    await page.keyboard.type('24');
    await page.keyboard.press('Enter');
    await expect.poll(async () => center(await opening(page)).x).toBeCloseTo(42, 9);
    const moved = await opening(page);
    expect(moved.id).toBe(placed.id);
    near(center(moved).y, 0);
    expect(await selectedIds(page)).toEqual([placed.id]);
    await saved(page);
  });
});
