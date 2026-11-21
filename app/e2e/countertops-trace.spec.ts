// EZD-412 (S04b Entry points "Countertops (K) tool on the rail"; S04b Controls "Trace cabinets | Creates tops
// automatically from cabinet runs with default overhangs | Disabled when no cabinets", "Draw outline | Click points to
// draw a custom top shape", "Click piece | Selects piece"; S04b States "No cabinets: Trace cabinets disabled with
// hint"; AC-EZD-412-1 "Trace over two runs makes pieces A and B"). Desktop 1600 x 1000. Each test makes its own
// company (never tenant 1) with fixture S and its own member. A two-run L kitchen is seeded through the editor hook:
// a back wall from (0, 0) to (144, 0) with four 36" base boxes wall to wall, and a left wall with a 30" and a 33"
// base box from y = 24; hand counts give A 144 x 25 1/2 and B 63 x 25 1/2 (Standard 1 1/2", Against wall 0).
// Helpers are copies of cabinet-run.spec.ts. No import.meta or __dirname (L-017).
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

const EDITOR = ['view_projects', 'edit_model'];
const VIEWER = ['view_projects'];

async function fixtureS(permissions: string[] = EDITOR) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, permissions as never);
  return { tenant, ids, user };
}

type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = { __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] } };

const editorState = (page: Page) => page.getByTestId('editor-state');
const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const tool = (page: Page, which: string) => page.locator(`[data-rail-tool="${which}"]`);

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

type Piece = { label: string; name: string; outline: { x: number; y: number }[] };
const pieces = (page: Page): Promise<Piece[]> =>
  page.evaluate(() =>
    (window as unknown as Window2).__ezdraftEditor
      .objects()
      .filter((o) => o.type === 'countertop_piece')
      .map((o) => {
        const d = o.data as {
          geometry: { outline: { x: number; y: number }[] };
          attributes: { label: string; name: string };
        };
        return { label: d.attributes.label, name: d.attributes.name, outline: d.geometry.outline };
      }),
  );
const size = (outline: { x: number; y: number }[]) => {
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};

// Clicks the countertop plan at a model point (the SVG's y is the model's y turned over).
async function clickTop(page: Page, x: number, y: number) {
  const s = await id(page, 'countertop-plan').evaluate(
    (svg, p) => {
      const m = (svg as SVGSVGElement).getScreenCTM();
      if (m === null) throw new Error('no CTM');
      const q = new DOMPoint(p.x, -p.y).matrixTransform(m);
      return { x: q.x, y: q.y };
    },
    { x, y },
  );
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y);
}

async function seedKitchen(page: Page, withCabinets = true) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((x) => x.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const v = (type: string, data: unknown) => ({
    type,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: data as Record<string, unknown>,
  });
  const wall = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const made = createWallData({ start, end, level, thicknessSide: 'right' });
    if (!made.ok) throw new Error('wall data');
    return { id: crypto.randomUUID(), value: v('wall', made.data) };
  };
  const back = wall({ x: 0, y: 0 }, { x: 144, y: 0 });
  const left = wall({ x: 0, y: 96 }, { x: 0, y: 0 });
  const right = wall({ x: 144, y: 0 }, { x: 144, y: 96 });
  const box = (code: string, width: number) => ({
    id: crypto.randomUUID(),
    value: v('cabinet_box', {
      status: 'new',
      level,
      attributes: {
        code,
        boxType: 'base',
        width,
        depth: 24,
        height: 34.5,
        faceLayout: 'drawer_door_1',
        hingeSide: 'left',
        finishedEnds: 'none',
        catalogItemId: null,
        finish: null,
      },
    }),
  });
  const run = (
    name: string,
    hostWallId: string,
    start: { x: number; y: number },
    axis: { x: number; y: number },
    boxes: { id: string }[],
  ) => ({
    id: crypto.randomUUID(),
    value: v('cabinet_run', {
      geometry: { hostWallId, start, axis },
      level,
      attributes: { name, base: boxes.map((b) => b.id), upper: [] },
    }),
  });
  const backBoxes = [box('B36', 36), box('B36', 36), box('SB36', 36), box('B36', 36)];
  const leftBoxes = [box('B30', 30), box('B33', 33)];
  const changes = withCabinets
    ? [
        back,
        left,
        right,
        ...backBoxes,
        ...leftBoxes,
        run('Back wall', back.id, { x: 0, y: 0 }, { x: 1, y: 0 }, backBoxes),
        run('Left return', left.id, { x: 0, y: 24 }, { x: 0, y: 1 }, leftBoxes),
      ]
    : [back, left, right];
  const done = await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    changes,
  );
  expect(done.length).toBeGreaterThan(0);
}

test.describe('EZD-412 Trace and Draw outline', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-412-1 trace over two runs makes pieces A and B; Draw outline adds C; a click selects a piece', async ({
    page,
    signInAs,
  }) => {
    const { ids: project, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, project.P1);
    await seedKitchen(page);
    await saved(page);

    await page.keyboard.press('k');
    await expect(tool(page, 'countertops')).toHaveAttribute('aria-pressed', 'true');
    await expect(id(page, 'countertops')).toBeVisible();
    await expect(id(page, 'countertop-cabinet')).toHaveCount(6);
    await expect(id(page, 'countertop-trace')).toHaveText('Trace cabinets');
    await expect(id(page, 'countertop-draw')).toHaveText('Draw outline');
    await expect(id(page, 'countertop-trace')).toBeEnabled();

    await id(page, 'countertop-trace').click();
    await expect(id(page, 'countertop-piece')).toHaveCount(2);
    const traced = await pieces(page);
    expect(traced.map((p) => [p.label, p.name])).toEqual([
      ['A', 'Back wall'],
      ['B', 'Left return'],
    ]);
    expect(size(traced[0]!.outline)).toEqual([144, 25.5]);
    expect(size(traced[1]!.outline)).toEqual([25.5, 63]);
    await saved(page);

    // Pressing Trace again adds nothing: every run has its top.
    await id(page, 'countertop-trace').click();
    await expect.poll(async () => (await pieces(page)).length).toBe(2);

    // Draw outline: four corners, then the first corner again, make piece C.
    await id(page, 'countertop-draw').click();
    await expect(id(page, 'countertop-draw')).toHaveAttribute('aria-pressed', 'true');
    await clickTop(page, 60, 60);
    await clickTop(page, 108, 60);
    await clickTop(page, 108, 84);
    await clickTop(page, 60, 84);
    await clickTop(page, 60, 60);
    await expect(id(page, 'countertop-piece')).toHaveCount(3);
    const drawn = (await pieces(page)).find((p) => p.label === 'C');
    expect(drawn).toBeDefined();
    expect(size(drawn!.outline)).toEqual([48, 24]);
    await expect(id(page, 'countertop-draw')).toHaveAttribute('aria-pressed', 'false');

    // A click on B selects it; a click off every top selects none.
    await clickTop(page, 12, 60);
    await expect(
      page.locator('[data-testid="countertop-piece"][data-selected="true"]'),
    ).toHaveAttribute('data-label', 'B');
    await clickTop(page, 130, 80);
    await expect(
      page.locator('[data-testid="countertop-piece"][data-selected="true"]'),
    ).toHaveCount(0);

    // Esc ends the tool.
    await page.keyboard.press('Escape');
    await expect(id(page, 'countertops')).toHaveCount(0);
    await saved(page);
  });

  // EZD-416 (AC-EZD-416-1 "Footer totals match the pieces"; S04b left panel and status bar). Hand counts for the
  // traced L: A 144 × 25 1/2 (3672 sq in), B 63 × 25 1/2 (1606.5 sq in): 5278.5 / 144 = 36.66 → 36.7 sq ft; exposed
  // A's front 144" + B's front 63" + B's open end 25 1/2" = 232.5" = 19.4 → 19 lf. A seam on A adds a piece and a
  // seam and leaves the area and exposed edge as they were.
  test('AC-EZD-416-1 the left panel footer and status bar match the traced pieces; a row selects its top', async ({
    page,
    signInAs,
  }) => {
    const { tenant, ids: project, user } = await fixtureS();
    await harnessSql()`insert into public.catalog_item
      (tenant_id, category, subcategory, line, name, brand, model, width, depth, height, finish)
      values (${tenant}::uuid, 'countertops', null, null, 'Quartz', null, null, null, null, null, null)`;
    await signInAs(user.email);
    await openReady(page, project.P1);
    await seedKitchen(page);
    await saved(page);

    await page.keyboard.press('k');
    await expect(id(page, 'countertop-panel')).toBeVisible();
    await expect(id(page, 'countertop-panel-counts')).toHaveText('0 pieces · 0 seams');
    await expect(id(page, 'countertop-panel-area')).toHaveText('0.0 sq ft');
    await expect(id(page, 'status-countertop-exposed')).toHaveText('0 lf');
    await expect(id(page, 'status-countertop-increment')).toHaveText('1/2"');

    await id(page, 'countertop-trace').click();
    await expect(id(page, 'countertop-panel-piece')).toHaveCount(2);
    await expect(id(page, 'countertop-panel-counts')).toHaveText('2 pieces · 0 seams');
    await expect(id(page, 'countertop-panel-area')).toHaveText('36.7 sq ft');
    await expect(id(page, 'status-countertop-exposed')).toHaveText('19 lf');
    await expect(id(page, 'countertop-panel-size')).toHaveText(['144 × 25 1/2', '63 × 25 1/2']);

    // A row selects its top on the canvas; a click on the canvas selects its row.
    await page.locator('[data-testid="countertop-panel-piece"][data-label="B"]').click();
    await expect(
      page.locator('[data-testid="countertop-piece"][data-selected="true"]'),
    ).toHaveAttribute('data-label', 'B');
    await clickTop(page, 72, 12);
    await expect(
      page.locator('[data-testid="countertop-panel-piece"][aria-pressed="true"]'),
    ).toHaveAttribute('data-label', 'A');

    // A seam on A at x = 100: three pieces, one seam, the same area and exposed edge.
    await id(page, 'countertop-seam-tool').click();
    await clickTop(page, 100.2, 12);
    await expect(id(page, 'countertop-panel-counts')).toHaveText('3 pieces · 1 seam');
    await expect(id(page, 'countertop-panel-area')).toHaveText('36.7 sq ft');
    await expect(id(page, 'status-countertop-exposed')).toHaveText('19 lf');
    await saved(page);

    // The swatch row opens the catalog picker on Countertops; a pick names the material on every top.
    await expect(id(page, 'countertop-panel-material')).toHaveText('No material chosen · 3 cm');
    await id(page, 'countertop-panel-material').click();
    await expect(id(page, 'catalog-category-countertops')).toHaveAttribute('aria-pressed', 'true');
    await id(page, 'countertop-panel-picker').getByTestId('catalog-item').filter({ hasText: 'Quartz' }).click();
    await expect(id(page, 'countertop-panel-picker')).toHaveCount(0);
    await expect(id(page, 'countertop-panel-material')).toHaveText('Quartz · 3 cm');
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            new Set(
              (window as unknown as Window2).__ezdraftEditor
                .objects()
                .filter((o) => o.type === 'countertop_piece')
                .map((o) => (o.data as { attributes: { materialItemId: string | null } }).attributes.materialItemId),
            ).size,
        ),
      )
      .toBe(1);
    await saved(page);

    // The Material tab sets the behind-range splash on every top.
    await id(page, 'countertop-panel-tab-material').click();
    await id(page, 'countertop-panel-behind').selectOption('full_height');
    await expect
      .poll(async () =>
        page.evaluate(() =>
          (window as unknown as Window2).__ezdraftEditor
            .objects()
            .filter((o) => o.type === 'countertop_piece')
            .map((o) => (o.data as { attributes: { behindRange?: string } }).attributes.behindRange),
        ),
      )
      .toEqual(['full_height', 'full_height', 'full_height']);
    await saved(page);
  });

  test('no cabinets: Trace cabinets is disabled with a hint', async ({ page, signInAs }) => {
    const { ids: project, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, project.P1);
    await seedKitchen(page, false);
    await saved(page);
    await tool(page, 'countertops').click();
    await expect(id(page, 'countertop-trace')).toBeDisabled();
    await expect(id(page, 'countertop-draw')).toBeEnabled();
    await expect(id(page, 'countertop-hint')).toHaveText(
      'Add cabinets to trace tops from them, or draw an outline.',
    );
  });

  test('a member without Edit model has the tool and sees the screen, but cannot trace or draw', async ({
    page,
    signInAs,
  }) => {
    const { ids: project, user } = await fixtureS(VIEWER);
    await signInAs(user.email);
    await openReady(page, project.P1);
    await expect(tool(page, 'countertops')).toHaveCount(1);
    await page.keyboard.press('k');
    await expect(id(page, 'countertops')).toBeVisible();
    await expect(id(page, 'countertop-trace')).toBeDisabled();
    await expect(id(page, 'countertop-draw')).toBeDisabled();
  });
});
