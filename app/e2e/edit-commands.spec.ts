// EZD-217 B1-B5 (vault/plans/EZD-217.md section 4; AC-EZD-217-1 to -4, -8 to -10, -12 to -16; ticket Done when).
// B1-B3 untagged (desktop 1600 x 1000); B4, B5 are @ipad. Every test makes its own company (never tenant 1) with
// fixture S (P1 "bravo" starts with the floor "Floor 1") and its own member. The helpers are copies of
// `drawing-tools.spec.ts`. The editor hook `__ezdraftEditor` is absent for a view-only member, so B3 reads the walls
// after the member is an editor again. No import.meta or __dirname (lesson L-017).
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
    handle: {
      setView(v: View): void;
      modelToScreen(p: Point): Point;
      getViewCenter(): Point | null;
      getHoveredId(): string | null;
    };
  };
  __ezdraftSelection: { ids(): string[] };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
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
const clickAt = async (page: Page, x: number, y: number) => {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
};
const tapAt = async (page: Page, x: number, y: number) => {
  const p = await at(page, x, y);
  await page.touchscreen.tap(p.x, p.y);
};

const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const wallsIn = (list: Obj[]) => list.filter((o) => o.type === 'wall');
const wallIds = async (page: Page) => wallsIn(await objects(page)).map((w) => w.id);
const sorted = (list: string[]) => [...list].sort();
type Geo = { start: Point; end: Point };
const geo = (o: Obj) => o.data.geometry as Geo;
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// addWalls: the four walls (0,0)->(144,0)->(144,120)->(0,120)->(0,0) through the editor hook.
async function addWalls(page: Page) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const pt = (x: number, y: number): Point => ({ x, y });
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
}

const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

// The first wall of the four: (0,0) -> (144,0).
async function firstWallId(page: Page): Promise<string> {
  const w = wallsIn(await objects(page)).find(
    (o) => near(geo(o).start.x, 0) && near(geo(o).start.y, 0) && near(geo(o).end.x, 144),
  );
  if (!w) throw new Error('no first wall');
  return w.id;
}

// B1 set-up to the first reload: the walls added, saved, the page opened again and the view set.
async function seeded(page: Page, signInAs: (email: string) => Promise<unknown>) {
  const { tenant, ids, user } = await fixtureS();
  await signInAs(user.email);
  await openReady(page, ids.P1);
  await addWalls(page);
  await saved(page);
  await page.reload();
  await openReady(page, ids.P1);
  await view(page);
  return { tenant, ids, user };
}

test.describe('EZD-217 edit commands', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-217 B1 Delete, undo and redo a wall; nothing to undo after reload', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(90_000);
    const { ids } = await seeded(page, signInAs);
    const four = await wallIds(page);
    expect(four).toHaveLength(4);
    const w1 = await firstWallId(page);

    await clickAt(page, 72, 0);
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await wallIds(page)).length).toBe(3);
    expect(await wallIds(page)).not.toContain(w1);

    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await wallIds(page)).length).toBe(4);
    expect(await wallIds(page)).toContain(w1);

    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(async () => (await wallIds(page)).length).toBe(3);
    expect(await wallIds(page)).not.toContain(w1);
    const three = sorted(await wallIds(page));
    await saved(page);

    await page.reload();
    await openReady(page, ids.P1);
    await view(page);
    expect(sorted(await wallIds(page))).toEqual(three);
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(500);
    expect(sorted(await wallIds(page))).toEqual(three);
  });

  test('EZD-217 B2 copy and paste at the cursor', async ({ page, signInAs }) => {
    test.setTimeout(90_000);
    await seeded(page, signInAs);
    const before = await wallIds(page);
    await clickAt(page, 72, 0);
    await page.keyboard.press('ControlOrMeta+c');
    const target = await at(page, 72, -96);
    await page.mouse.move(target.x, target.y);
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(async () => (await wallIds(page)).length).toBe(5);
    const added = wallsIn(await objects(page)).filter((w) => !before.includes(w.id));
    expect(added).toHaveLength(1);
    const g = geo(added[0]!);
    expect(near(g.start.x, 0) && near(g.start.y, -96)).toBe(true);
    expect(near(g.end.x, 144) && near(g.end.y, -96)).toBe(true);
  });

  test("EZD-217 B3 a view-only member's keys change nothing", async ({ page, signInAs }) => {
    test.setTimeout(90_000);
    const { tenant, ids, user } = await seeded(page, signInAs);
    const four = sorted(await wallIds(page));
    expect(four).toHaveLength(4);
    const w1 = await firstWallId(page);
    await setPermissions(tenant, user.membershipId, VIEWER as never);
    await page.reload();
    await openReady(page, ids.P1);
    await view(page);
    await clickAt(page, 72, 0);
    await page.keyboard.press('Delete');
    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    await page.waitForTimeout(500);
    expect(
      await page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids()),
    ).toEqual([w1]);
    expect(
      await page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.handle.getHoveredId()),
    ).toBe(w1);
    await setPermissions(tenant, user.membershipId, EDITOR as never);
    await page.reload();
    await openReady(page, ids.P1);
    expect(sorted(await wallIds(page))).toEqual(four);
  });

  test('EZD-217 B4 the tablet bar', { tag: ['@ipad'] }, async ({ page, signInAs }) => {
    test.setTimeout(90_000);
    await seeded(page, signInAs);
    const bar = id(page, 'edit-bar');
    const order = await bar
      .locator('button')
      .evaluateAll((list) => list.map((b) => b.getAttribute('data-testid')));
    expect(order).toEqual([
      'edit-undo',
      'edit-redo',
      'edit-delete',
      'edit-duplicate',
      'select-more',
      'select-all',
      'edit-copy',
      'edit-paste',
    ]);
    for (const name of ['undo', 'redo', 'delete', 'duplicate', 'copy', 'paste']) {
      await expect(id(page, `edit-${name}`)).toBeDisabled();
    }

    await tapAt(page, 72, 0);
    await id(page, 'edit-delete').tap();
    await expect.poll(async () => (await wallIds(page)).length).toBe(3);
    await id(page, 'edit-undo').tap();
    await expect.poll(async () => (await wallIds(page)).length).toBe(4);
    await id(page, 'edit-redo').tap();
    await expect.poll(async () => (await wallIds(page)).length).toBe(3);
    await id(page, 'edit-undo').tap();
    await expect.poll(async () => (await wallIds(page)).length).toBe(4);

    const centre = () =>
      page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.handle.getViewCenter());
    const lastAdded = async (known: string[]) => {
      const added = wallsIn(await objects(page)).filter((w) => !known.includes(w.id));
      expect(added).toHaveLength(1);
      const g = geo(added[0]!);
      return { x: (g.start.x + g.end.x) / 2, y: (g.start.y + g.end.y) / 2 };
    };

    await tapAt(page, 72, 0);
    await id(page, 'edit-copy').tap();
    const beforePaste = await wallIds(page);
    await id(page, 'edit-paste').tap();
    await expect.poll(async () => (await wallIds(page)).length).toBe(5);
    const c = await centre();
    const pasted = await lastAdded(beforePaste);
    expect(near(pasted.x, c!.x, 1e-6) && near(pasted.y, c!.y, 1e-6)).toBe(true);

    const beforeDuplicate = await wallIds(page);
    await id(page, 'edit-duplicate').tap();
    await expect.poll(async () => (await wallIds(page)).length).toBe(6);
    const duplicated = await lastAdded(beforeDuplicate);
    expect(near(duplicated.x, c!.x, 1e-6) && near(duplicated.y, c!.y, 1e-6)).toBe(true);

    expect(await expectTouchTargets(page, bar)).toBe(8);
  });

  test('EZD-217 B5 the view-only tablet bar', { tag: ['@ipad'] }, async ({ page, signInAs }) => {
    test.setTimeout(90_000);
    const { tenant, ids, user } = await seeded(page, signInAs);
    await setPermissions(tenant, user.membershipId, VIEWER as never);
    await page.reload();
    await openReady(page, ids.P1);
    await view(page);
    await expect(id(page, 'select-more')).toHaveCount(1);
    await expect(id(page, 'select-all')).toHaveCount(1);
    for (const name of ['undo', 'redo', 'delete', 'duplicate', 'copy', 'paste']) {
      await expect(id(page, `edit-${name}`)).toHaveCount(0);
    }
  });
});
