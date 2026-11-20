// EZD-413 (S04b Controls "Seam | Click across a piece to split it; seam drawn red dashed | Pieces relabel (A, B, C)",
// "Cutout | Place a sink or cooktop cutout"; phase-04 EZD-413 "a typed W × D"; AC-EZD-413-1 "A seam yields two
// relabeled pieces"; AC-EZD-413-2 "a typed 30" × 16" cutout draws at that size"; vault/build/assumptions.md
// EZD-413). Desktop 1600 x 1000. Each test makes its own company (never tenant 1) with fixture S and its own member.
// The EZD-412 two-run L kitchen is seeded through the editor hook and traced: A 144 x 25 1/2 (x 0 to 144, y 0 to
// 25 1/2) and B 63 x 25 1/2. Hand counts: a seam clicked on A at x = 100.2 rounds to x = 100 on the 1/2" increment
// and makes A 100 x 25 1/2 and B 44 x 25 1/2; the old B becomes C. Helpers are copies of countertops-trace.spec.ts.
// No import.meta or __dirname (L-017).
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
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

type Cut = { kind: string; width: number; depth: number; center: { x: number; y: number } };
const cutouts = (page: Page): Promise<Cut[]> =>
  page.evaluate(() =>
    (window as unknown as Window2).__ezdraftEditor
      .objects()
      .filter((o) => o.type === 'countertop_piece')
      .flatMap((o) => ((o.data as { attributes: { cutouts?: Cut[] } }).attributes.cutouts ?? [])),
  );

// The drawn size of a cutout in inches: its polygon's box on screen over the plan's scale.
const drawnSize = (page: Page, cutoutId: string) =>
  id(page, 'countertop-plan').evaluate((svg, cid) => {
    const m = (svg as SVGSVGElement).getScreenCTM();
    const poly = svg.querySelector(`[data-testid="countertop-cutout"][data-id="${cid}"] polygon`);
    if (m === null || poly === null) throw new Error('no cutout');
    const r = poly.getBoundingClientRect();
    return [r.width / Math.abs(m.a), r.height / Math.abs(m.d)];
  }, cutoutId);

async function tracedKitchen(page: Page) {
  await seedKitchen(page);
  await saved(page);
  await page.keyboard.press('k');
  await expect(id(page, 'countertops')).toBeVisible();
  await id(page, 'countertop-trace').click();
  await expect(id(page, 'countertop-piece')).toHaveCount(2);
}

test.describe('EZD-413 Seams and cutouts', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-413-1 a seam yields two relabeled pieces, drawn red dashed', async ({ page, signInAs }) => {
    const { ids: project, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, project.P1);
    await tracedKitchen(page);

    await expect(id(page, 'countertop-seam-tool')).toHaveText('Seam');
    await id(page, 'countertop-seam-tool').click();
    await expect(id(page, 'countertop-seam-tool')).toHaveAttribute('aria-pressed', 'true');
    await expect(id(page, 'countertop-hint')).toHaveText('Click across a piece to split it.');
    await clickTop(page, 100.2, 12);
    await expect(id(page, 'countertop-piece')).toHaveCount(3);
    const after = (await pieces(page)).sort((a, b) => a.label.localeCompare(b.label));
    expect(after.map((p) => [p.label, size(p.outline)])).toEqual([
      ['A', [100, 25.5]],
      ['B', [44, 25.5]],
      ['C', [25.5, 63]],
    ]);
    await expect(id(page, 'countertop-seam')).toHaveCount(1);
    const stroke = await id(page, 'countertop-seam')
      .locator('line')
      .evaluate((l) => getComputedStyle(l).strokeDasharray);
    expect(stroke).not.toBe('none');
    await saved(page);

    // Undo puts A back whole and B back as B.
    await page.keyboard.press('Control+z');
    await expect(id(page, 'countertop-piece')).toHaveCount(2);
    expect((await pieces(page)).map((p) => p.label).sort()).toEqual(['A', 'B']);
    await expect(id(page, 'countertop-seam')).toHaveCount(0);

    // Esc turns the Seam tool off.
    await page.keyboard.press('Escape');
    await expect(id(page, 'countertop-seam-tool')).toHaveAttribute('aria-pressed', 'false');
  });

  test('AC-EZD-413-2 a typed 30" x 16" cutout draws at that size', async ({ page, signInAs }) => {
    const { ids: project, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, project.P1);
    await tracedKitchen(page);

    await expect(id(page, 'countertop-cutout-tool')).toHaveText('Cutout');
    await id(page, 'countertop-cutout-tool').click();
    await id(page, 'countertop-cutout-sink').click();
    await id(page, 'countertop-cutout-width').fill('30');
    await id(page, 'countertop-cutout-depth').fill('16');
    await clickTop(page, 60, 12);
    await expect(id(page, 'countertop-cutout')).toHaveCount(1);
    const sink = id(page, 'countertop-cutout');
    await expect(sink).toHaveAttribute('data-kind', 'sink');
    await expect(sink).toHaveAttribute('data-width', '30');
    await expect(sink).toHaveAttribute('data-depth', '16');
    await expect(sink).toHaveText('SINK');
    const sinkId = (await sink.getAttribute('data-id'))!;
    const [w, d] = await drawnSize(page, sinkId);
    expect(w).toBeCloseTo(30, 1);
    expect(d).toBeCloseTo(16, 1);
    expect(await cutouts(page)).toEqual([
      expect.objectContaining({ kind: 'sink', width: 30, depth: 16, center: { x: 60, y: 12 } }),
    ]);

    // A cooktop placed at its starting size, then typed to 30 x 16, draws at 30 x 16.
    await id(page, 'countertop-cutout-cooktop').click();
    await clickTop(page, 110, 12);
    await expect(id(page, 'countertop-cutout')).toHaveCount(2);
    const cook = page.locator('[data-testid="countertop-cutout"][data-kind="cooktop"]');
    await expect(cook).toHaveAttribute('data-selected', 'true');
    await expect(id(page, 'countertop-cutout-width')).toHaveValue('30');
    await expect(id(page, 'countertop-cutout-depth')).toHaveValue('21');
    await id(page, 'countertop-cutout-depth').fill('16');
    await id(page, 'countertop-cutout-depth').press('Enter');
    await expect(cook).toHaveAttribute('data-depth', '16');
    const [cw, cd] = await drawnSize(page, (await cook.getAttribute('data-id'))!);
    expect(cw).toBeCloseTo(30, 1);
    expect(cd).toBeCloseTo(16, 1);
    await saved(page);
  });

  test('a member without Edit model cannot seam or place a cutout', async ({ page, signInAs }) => {
    const { ids: project, user } = await fixtureS(VIEWER);
    await signInAs(user.email);
    await openReady(page, project.P1);
    await page.keyboard.press('k');
    await expect(id(page, 'countertops')).toBeVisible();
    await expect(id(page, 'countertop-seam-tool')).toBeDisabled();
    await expect(id(page, 'countertop-cutout-tool')).toBeDisabled();
  });
});
