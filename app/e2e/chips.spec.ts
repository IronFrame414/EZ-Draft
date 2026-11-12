// EZD-212c B1-B6 (vault/plans/EZD-212c.md section 4; AC-EZD-212-1, -2, -8, -10, -12, -13, -19; Josh's Slice 5 step 6).
// B1-B5 untagged (desktop 1600 x 1000); B6 is @surface (run with scripts/ui-run.mjs). Every test makes its own company
// (never tenant 1) with fixture S and its own member. The canvas is read and driven through the `__ezdraftPlan`,
// `__ezdraftEditor` and `__ezdraftSelection` test hooks. Helpers are copies of move.spec.ts and drawing-tools.spec.ts.
// Coordinates read back after a pointer drag compare within 1/64 inch inclusive (03g). No import.meta or __dirname (L-017).
import {
  COMPARISON_TOLERANCE_IN,
  CURRENT_SCHEMA_VERSION,
  createOpeningData,
  createWallData,
  roomLabelText,
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
  __ezdraftPlan: {
    handle: { setView(v: View): void; modelToScreen(p: Point): Point };
  };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
  __ezdraftSelection: { ids(): string[] };
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
  await page.mouse.click(p.x, p.y);
};
const downAt = async (page: Page, x: number, y: number) => {
  const p = await at(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
};
const moveSteps = async (page: Page, x: number, y: number) => {
  const p = await at(page, x, y);
  await page.mouse.move(p.x, p.y, { steps: 4 });
};
const drag = async (page: Page, from: Point, to: Point) => {
  await downAt(page, from.x, from.y);
  await moveSteps(page, to.x, to.y);
  await page.mouse.up();
};

const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const selectedIds = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids());
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

const pt = (x: number, y: number): Point => ({ x, y });
// 03g equality: |got - want| <= 1/64 inch, inclusive (COMPARISON_TOLERANCE_IN); toBeCloseTo cannot express it.
const nearTol = (got: number, want: number) =>
  expect(Math.abs(got - want)).toBeLessThanOrEqual(COMPARISON_TOLERANCE_IN);

type Geo = { start: Point; end: Point };
const geoOf = (list: Obj[], objId: string) =>
  list.find((o) => o.id === objId)!.data.geometry as unknown as Geo;
const label = (room: Obj) =>
  roomLabelText(
    (room.data.attributes as { name: string }).name,
    (room.data.geometry as { boundary: Point[] }).boundary,
  );

// Seeds the closed ROOM of the plan (side right: S, E, N, W), optionally the partition P (60,0)-(60,120) with
// thicknessSide 'center' and a door on S at centre (100, 0), through the editor hook in one call (as move.spec.ts
// seedRoomAndDoor does).
async function seed(page: Page, o: { part?: boolean; doorOnS?: boolean } = {}) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((x) => x.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const pts = [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120)];
  const wallIds: string[] = [];
  const changes: unknown[] = [];
  let south: WallObject | null = null;
  const add = (start: Point, end: Point, side: 'right' | 'center') => {
    const made = createWallData({ start, end, level, thicknessSide: side });
    if (!made.ok) throw new Error('wall data');
    const wallId = crypto.randomUUID();
    wallIds.push(wallId);
    if (wallIds.length === 1) south = { id: wallId, type: 'wall', data: made.data } as unknown as WallObject;
    changes.push({
      id: wallId,
      value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
    });
  };
  for (let i = 0; i < pts.length; i++) add(pts[i]!, pts[(i + 1) % pts.length]!, 'right');
  if (o.part === true) add(pt(60, 0), pt(60, 120), 'center');
  let doorId: string | null = null;
  if (o.doorOnS === true) {
    doorId = crypto.randomUUID();
    changes.push({
      id: doorId,
      value: {
        type: 'opening',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: createOpeningData({ kind: 'door', host: south!, center: pt(100, 0) }),
      },
    });
  }
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);
  return { S: wallIds[0]!, E: wallIds[1]!, N: wallIds[2]!, W: wallIds[3]!, P: wallIds[4] ?? '', doorId };
}

test.describe('EZD-212c handles and chips', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-212c B1 chip typed 60 inches', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const s = await seed(page, { part: true });
    await view(page);

    await clickAt(page, 60, 60);
    expect(await selectedIds(page)).toEqual([s.P]);
    await expect(id(page, 'selection-chip-left')).toHaveText('4\' 10"');
    await expect(id(page, 'selection-chip-right')).toHaveText('6\' 10"');
    const chip = id(page, 'selection-chip-left');
    await expect(chip).toHaveCSS('height', '26px');
    await expect(chip).toHaveCSS('font-size', '13px');
    const fonts = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="selection-chips"]')!;
      const probe = document.createElement('span');
      probe.style.fontFamily = 'var(--ez-font-mono)';
      root.appendChild(probe);
      const want = getComputedStyle(probe).fontFamily;
      probe.remove();
      const got = getComputedStyle(
        document.querySelector('[data-testid="selection-chip-left"]')!,
      ).fontFamily;
      return { want, got };
    });
    expect(fonts.got).toBe(fonts.want);

    await chip.click();
    await expect(id(page, 'typed-box-label')).toHaveText('Distance');
    await expect(id(page, 'typed-box-input')).toBeFocused();
    await page.keyboard.type('60"');
    await page.keyboard.press('Enter');

    await expect
      .poll(async () => geoOf(await objects(page), s.P).start.x, { timeout: 15_000 })
      .toBeGreaterThan(62);
    const list = await objects(page);
    const p = geoOf(list, s.P);
    nearTol(p.start.x, 62.25);
    nearTol(p.start.y, 0);
    nearTol(p.end.x, 62.25);
    nearTol(p.end.y, 120);
    const labels = list.filter((o) => o.type === 'room').map(label);
    expect(labels.some((l) => l.endsWith('50 SF'))).toBe(true);
    expect(labels.some((l) => l.endsWith('66 SF'))).toBe(true);
    await expect(id(page, 'selection-chip-left')).toHaveText('5\' 0"');
    await saved(page);
  });

  test('EZD-212c B2 drag a handle; type during a drag', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const s = await seed(page);
    await view(page);

    await clickAt(page, 144, 60);
    expect(await selectedIds(page)).toEqual([s.E]);
    await expect(id(page, 'resize-handle')).toHaveCount(2);
    await expect(id(page, 'resize-handle').nth(0)).toBeVisible();
    await expect(id(page, 'resize-handle').nth(1)).toBeVisible();

    await downAt(page, 146.25, 120);
    await moveSteps(page, 144, 132);
    await expect(id(page, 'typed-bar-label')).toHaveText('Length');
    await expect(page.locator('[data-testid="resize-handle"][data-active="true"]')).toHaveCount(1);
    await page.mouse.up();
    await expect
      .poll(async () => geoOf(await objects(page), s.E).end.y, { timeout: 15_000 })
      .toBeGreaterThan(131);
    let list = await objects(page);
    nearTol(geoOf(list, s.E).start.y, 0);
    nearTol(geoOf(list, s.E).end.x, 144);
    nearTol(geoOf(list, s.E).end.y, 132);
    nearTol(geoOf(list, s.N).start.y, 132);
    nearTol(geoOf(list, s.N).end.x, 0);
    nearTol(geoOf(list, s.N).end.y, 132);
    nearTol(geoOf(list, s.W).start.y, 132);
    nearTol(geoOf(list, s.W).end.y, 0);
    await expect(id(page, 'typed-bar')).toHaveCount(0);

    await downAt(page, 146.25, 132);
    await moveSteps(page, 144, 140);
    await page.keyboard.type("13'");
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => geoOf(await objects(page), s.E).end.y, { timeout: 15_000 })
      .toBeGreaterThan(155);
    await page.mouse.up();
    list = await objects(page);
    nearTol(geoOf(list, s.E).end.x, 144);
    nearTol(geoOf(list, s.E).end.y, 156);
    nearTol(geoOf(list, s.N).start.y, 156);
    nearTol(geoOf(list, s.N).end.y, 156);
  });

  test('EZD-212c B3 refused chip entry stays open', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const s = await seed(page, { part: true });
    await view(page);

    await clickAt(page, 60, 60);
    await id(page, 'selection-chip-left').click();
    await page.keyboard.type('abc');
    await page.keyboard.press('Enter');
    await expect(id(page, 'typed-bar-error')).toHaveText(REFUSED);
    await expect(id(page, 'typed-box')).toBeVisible();
    const p = geoOf(await objects(page), s.P);
    nearTol(p.start.x, 60);
    nearTol(p.end.x, 60);
    await page.keyboard.press('Escape');
    await expect(id(page, 'typed-box')).toHaveCount(0);
    await expect(id(page, 'typed-bar')).toHaveCount(0);
  });

  test('EZD-212c B4 view-only', async ({ page, signInAs }) => {
    const { tenant, ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const s = await seed(page, { part: true });
    await saved(page);
    await setPermissions(tenant, user.membershipId, VIEWER as never);
    await page.reload();
    await openReady(page, ids.P1);
    await view(page);

    await clickAt(page, 60, 60);
    expect(await selectedIds(page)).toEqual([s.P]);
    await expect(tool(page, 'move')).toHaveCount(0);
    await expect(id(page, 'resize-handle')).toHaveCount(2);
    await expect(id(page, 'resize-handle').nth(0)).toHaveAttribute('display', 'none');
    await expect(id(page, 'resize-handle').nth(1)).toHaveAttribute('display', 'none');
    const left = id(page, 'selection-chip-left');
    expect(await left.evaluate((el) => el.tagName)).toBe('SPAN');
    await expect(left).toHaveText('4\' 10"');

    await drag(page, pt(60, 60), pt(72, 60));
    await drag(page, pt(60, 120), pt(60, 130));
    await expect(id(page, 'typed-bar')).toHaveCount(0);
    await expect(left).toHaveText('4\' 10"');
    await expect(id(page, 'resize-handle').nth(0)).toHaveAttribute('display', 'none');
    await expect(id(page, 'resize-handle').nth(1)).toHaveAttribute('display', 'none');
    // A viewer has no editor handle (window.__ezdraftEditor is installed only with a sync session),
    // so restore the editor permissions and read the saved project back as the editor.
    await setPermissions(tenant, user.membershipId, EDITOR as never);
    await page.reload();
    await openReady(page, ids.P1);
    const p = geoOf(await objects(page), s.P);
    nearTol(p.start.x, 60);
    nearTol(p.start.y, 0);
    nearTol(p.end.x, 60);
    nearTol(p.end.y, 120);
  });

  test('EZD-212c B5 opening chips, several, Move drag', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const s = await seed(page, { part: true, doorOnS: true });
    await view(page);

    await clickAt(page, 100, -2);
    expect(await selectedIds(page)).toEqual([s.doorId]);
    await expect(id(page, 'opening-chip-left')).toHaveText('1\' 8"');
    await expect(id(page, 'opening-chip-right')).toHaveText('2\' 2"');
    await expect(id(page, 'selection-chip-left')).toBeHidden();

    const p = await at(page, 60, 60);
    await page.keyboard.down('Shift');
    await page.mouse.click(p.x, p.y);
    await page.keyboard.up('Shift');
    expect((await selectedIds(page)).length).toBe(2);
    for (const slot of [
      'opening-chip-left',
      'opening-chip-right',
      'selection-chip-left',
      'selection-chip-right',
      'size-chip',
    ]) {
      await expect(id(page, slot)).toBeHidden();
    }

    await clickAt(page, 20, 60);
    await clickAt(page, 60, 60);
    expect(await selectedIds(page)).toEqual([s.P]);
    await page.keyboard.press('m');
    await downAt(page, 60, 60);
    await moveSteps(page, 66, 60);
    await expect(id(page, 'selection-chip-left')).toHaveText('5\' 4"');
    await expect(id(page, 'selection-chip-right')).toHaveText('6\' 4"');
    await page.mouse.up();
    await expect
      .poll(async () => geoOf(await objects(page), s.P).start.x, { timeout: 15_000 })
      .toBeGreaterThan(65);
    const g = geoOf(await objects(page), s.P);
    nearTol(g.start.x, 66);
    nearTol(g.end.x, 66);
  });

  test(
    'EZD-212c B6 tablet Next field and Cancel',
    { tag: ['@surface'] },
    async ({ page, signInAs }) => {
      const { ids, user } = await fixtureS();
      await signInAs(user.email);
      await openReady(page, ids.P1);
      await seed(page, { part: true });
      await view(page);

      const tap = async (x: number, y: number) => {
        const p = await at(page, x, y);
        for (const type of ['pointerdown', 'pointerup']) {
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
      };
      const pressedSelect = () =>
        expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');

      await tool(page, 'wall').tap();
      expect(await expectTouchTargets(page, id(page, 'typed-bar'))).toBe(3);
      const next = id(page, 'typed-bar-next');
      await expect(next).toHaveText('Next field');
      await expect(id(page, 'typed-bar-cancel')).toHaveText('Cancel');
      await expect(id(page, 'typed-bar-tab')).toHaveCount(0);
      await expect(next).toHaveCSS('min-height', '44px');
      await expect(next).toHaveCSS('font-size', '14px');
      await expect(next).toHaveCSS('font-weight', '500');
      await next.tap();
      await expect(id(page, 'typed-box-label')).toHaveText('Angle');
      await id(page, 'typed-bar-cancel').tap();
      await pressedSelect();
      await expect(id(page, 'typed-bar')).toHaveCount(0);

      await tool(page, 'room-rect').tap();
      expect(await expectTouchTargets(page, id(page, 'typed-bar'))).toBe(3);
      await expect(id(page, 'typed-bar-next')).toHaveText('Next field');
      await expect(id(page, 'typed-bar-cancel')).toHaveText('Cancel');
      await expect(id(page, 'typed-bar-tab')).toHaveCount(0);
      await id(page, 'typed-bar-cancel').tap();
      await pressedSelect();
      await expect(id(page, 'typed-bar')).toHaveCount(0);

      await tap(60, 60);
      expect(await expectTouchTargets(page, id(page, 'selection-chips'))).toBe(2);
      await tool(page, 'move').tap();
      await expect(id(page, 'typed-bar-next')).toBeVisible();
      await id(page, 'typed-bar-cancel').tap();
      await pressedSelect();
      expect(await selectedIds(page)).toEqual([]);
    },
  );
});
