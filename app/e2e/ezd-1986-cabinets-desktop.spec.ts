// EZD-1986 (AC-EZD-1986-1, -2; audit F9 in audit/ui-live-2026-11-24/REPORT.md, screen desktop-S03-tool-cabinets.png
// vs board S04Cabinets). Desktop 1600 x 1000. With the Cabinets tool open on a floor that has a room but no cabinet
// run, the room stays visible on the plan: the canvas pixels at each wall are the same as with the Select tool, no
// panel or prompt sits over a wall, and the empty cabinet screen paints no background. The TK / LR / CM trim codes
// sit in the code column, left-aligned with the codes above, and the row's name lines up with the other names. The
// Cabinets rail tooltip, with the pointer still on the tool after the click, does not cover the library's rows.
// The test makes its own company with fixture S and its own member; the room is seeded through the `__ezdraftEditor`
// test hook (as act-grid.spec.ts). No import.meta or __dirname (L-017).
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

type Obj = { id: string; type: string; data: Record<string, unknown> };
type View = { x: number; y: number; ppi: number };
type Window2 = {
  __ezdraftEditor: {
    objects(): Obj[];
    edit(changes: Array<{ id: string; value: unknown }>): string[];
  };
  __ezdraftPlan: { handle: { setView(v: View): void; modelToScreen(p: Point): Point } };
};
type Box = { x: number; y: number; width: number; height: number };

test.use({ viewport: { width: 1600, height: 1000 } });

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const tool = (page: Page, which: string) => page.locator(`[data-rail-tool="${which}"]`);
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

// A closed 114 x 94 room with its four Existing walls, in one edit (as act-grid.spec.ts).
const RING: Point[] = [
  { x: 0, y: 0 },
  { x: 114, y: 0 },
  { x: 114, y: 94 },
  { x: 0, y: 94 },
];
async function seedRoom(page: Page) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const walls = RING.map((start, i) => {
    const made = createWallData({
      start,
      end: RING[(i + 1) % 4]!,
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
        geometry: { boundary: RING },
        status: 'existing',
        level,
        attributes: newRoomAttributes('Kitchen'),
        closureOverride: null,
      },
    },
  };
  await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    [...walls, room],
  );
}

// The middle of each wall, in page pixels.
async function wallMiddles(page: Page): Promise<Point[]> {
  const region = await page.locator('[data-shell-region="canvas"]').boundingBox();
  if (!region) throw new Error('canvas region has no box');
  const mids = RING.map((a, i) => {
    const b = RING[(i + 1) % 4]!;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  });
  const screen = await page.evaluate(
    (ps) => ps.map((p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p)),
    mids,
  );
  return screen.map((s) => ({ x: region.x + s.x, y: region.y + s.y }));
}

const inside = (p: Point, b: Box) =>
  p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
async function boxOf(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}
// A 24 x 24 px shot of the page around a point.
const shotAt = (page: Page, p: Point) =>
  page.screenshot({
    clip: { x: Math.round(p.x) - 12, y: Math.round(p.y) - 12, width: 24, height: 24 },
  });

test.describe('EZD-1986 Cabinets tool on desktop', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-1986-1, -2: the room stays visible, TK / LR / CM share the code column, the tooltip is off the rows', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model'] as never);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await seedRoom(page);
    await saved(page);

    // The room in the middle of the canvas: model (0, 0) at region px (128, 384), 8/3 px per inch (as
    // cabinet-run.spec.ts), so the 114" x 94" room spans about 304 x 251 px.
    await page.evaluate(() =>
      (window as unknown as Window2).__ezdraftPlan.handle.setView({ x: -48, y: 144, ppi: 8 / 3 }),
    );
    await page.mouse.move(800, 990);
    const walls = await wallMiddles(page);
    const before = [];
    for (const w of walls) before.push(await shotAt(page, w));

    // The Cabinets tool, clicked on the rail as the audit did; the pointer stays on the tool.
    const button = await tool(page, 'cabinets').elementHandle();
    await tool(page, 'cabinets').click();
    await expect(tool(page, 'cabinets')).toHaveAttribute('aria-pressed', 'true');
    // Nothing else changes: the rail is the same rail (not remounted), so the pressed button keeps its place.
    expect(await button!.evaluate((e) => e.isConnected)).toBe(true);
    await expect(id(page, 'cabinet-library')).toBeVisible();
    await expect(id(page, 'cabinet-run-empty')).toHaveText('Drag boxes or Auto-fill run');

    // The rail tooltip does not cover a row of the library.
    const tip = page.locator('[data-rail-tool="cabinets"] + [data-rail-tooltip]');
    if (await tip.isVisible()) {
      const t = await boxOf(tip);
      const rows = page.locator('[data-shell-region="left-panel"] li');
      for (let i = 0; i < (await rows.count()); i += 1) {
        expect(overlaps(t, await boxOf(rows.nth(i))), `tooltip over library row ${i}`).toBe(false);
      }
    }

    // The room stays visible: every wall is in the canvas, under no panel and not under the prompt; the empty
    // cabinet screen paints nothing; and the canvas pixels at each wall are what the Select tool showed.
    const canvas = await boxOf(page.locator('[data-shell-region="canvas"]'));
    const left = await boxOf(page.locator('[data-shell-region="left-panel"]'));
    const inspector = await boxOf(page.locator('[data-shell-region="inspector"]'));
    const prompt = await boxOf(id(page, 'cabinet-run-empty'));
    for (const w of walls) {
      expect(inside(w, canvas)).toBe(true);
      expect(inside(w, left)).toBe(false);
      expect(inside(w, inspector)).toBe(false);
      expect(inside(w, prompt)).toBe(false);
    }
    await expect(id(page, 'cabinet-run')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.mouse.move(800, 990);
    for (let i = 0; i < walls.length; i += 1) {
      expect(await shotAt(page, walls[i]!), `wall ${i} looks as with Select`).toEqual(before[i]);
    }

    // TK / LR / CM share one column: the code column of the other rows, left-aligned with their codes, and the
    // row's name starts where the other names start.
    const trimRow = id(page, 'cabinet-library-trim-row');
    await expect(trimRow).toBeVisible();
    const f3 = page.locator('[data-testid="cabinet-library-row"][data-code="F3"]');
    const f3Code = await boxOf(f3.locator('span').first());
    const f3Name = await boxOf(f3.getByText('Filler, scribe'));
    const name = await boxOf(trimRow.getByText('Toe kick, light rail, crown'));
    const codes = await Promise.all(
      ['toe_kick', 'light_rail', 'crown'].map((k) => boxOf(id(page, `cabinet-library-trim-${k}`))),
    );
    expect(Math.abs(codes[0]!.x - f3Code.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(name.x - f3Name.x)).toBeLessThanOrEqual(1);
    for (const c of codes) {
      expect(c.x).toBeGreaterThanOrEqual(f3Code.x - 1);
      expect(c.x + c.width).toBeLessThanOrEqual(name.x);
    }
  });
});
