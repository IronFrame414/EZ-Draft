// EZD-414 (AC-EZD-414-1 "The Seating preset sets 12" and labels the side "seating""; S04b Controls "Click edge",
// "Overhang chip on edge | Click to type a value | Seating overhang shows as filled chip", "Overhang inputs Front / Left
// / Right / Back", "Preset chip Seating 12"; board S04bCountertops). Desktop 1600 x 1000. Each test makes its own
// company (never tenant 1) with fixture S and its own member. The board island is seeded through the editor hook
// before its seating side is set (as app/src/editor/countertops/test-fixture.ts islandModel): cabinets 73 1/2 × 24
// under a top at 1 1/2" all round, x 0 to 76.5, y 120 to 147. Hand counts: the back (side 1, y = 120) at 12" moves
// out 10.5 to y = 109.5, making the board's 76 1/2 × 37 1/2. Helpers are copies of countertops-top-schedule.spec.ts.
// No import.meta or __dirname (L-017).
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
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

async function fixtureS(permissions: string[]) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, permissions as never);
  return { tenant, ids, user };
}

type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = { __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] } };
type P = { x: number; y: number };
type Edge = { kind: string; overhang: number };
type PieceData = { geometry: { outline: P[] }; attributes: { edges: Edge[] } };

const editorState = (page: Page) => page.getByTestId('editor-state');
const id = (page: Page, testId: string): Locator => page.getByTestId(testId);

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

async function seedIsland(page: Page): Promise<string> {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((x) => x.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const pieceId = crypto.randomUUID();
  const edge = { kind: 'exposed', overhang: 1.5, backsplashHeight: null, profileId: null };
  const change = {
    id: pieceId,
    value: {
      type: 'countertop_piece',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: {
        geometry: {
          outline: [
            { x: 0, y: 120 },
            { x: 76.5, y: 120 },
            { x: 76.5, y: 147 },
            { x: 0, y: 147 },
          ],
        },
        status: 'new',
        level,
        attributes: {
          label: 'C',
          name: 'Island',
          materialItemId: null,
          thickness: 3 / 2.54,
          edges: [edge, edge, edge, edge],
        },
      },
    },
  };
  const done = await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit([c]), change);
  expect(done.length).toBeGreaterThan(0);
  return pieceId;
}

const pieceData = (page: Page, pieceId: string) =>
  page.evaluate(
    (pid) =>
      (window as unknown as Window2).__ezdraftEditor.objects().find((o) => o.id === pid)
        ?.data as unknown as PieceData,
    pieceId,
  );
const chip = (page: Page, edge: number) =>
  page.locator(`[data-testid="countertop-overhang-chip"][data-label="C"][data-edge="${edge}"]`);

test.describe('EZD-414 Edges and overhangs', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-414-1 the Seating preset sets 12" and labels the side seating', async ({ page, signInAs }) => {
    const { ids: project, user } = await fixtureS(EDITOR);
    await signInAs(user.email);
    await openReady(page, project.P1);
    const pieceId = await seedIsland(page);
    await saved(page);

    await page.keyboard.press('k');
    await expect(id(page, 'countertops')).toBeVisible();
    // No cabinets under this top, so the screen keeps the EZD-412 no-cabinets hint (the edge hint shows with cabinets).
    await expect(chip(page, 0)).toHaveText('1 1/2');

    // Click the back edge's chip: the edge is picked and the inspector marks the Back side.
    await chip(page, 0).click();
    await page.keyboard.press('Escape');
    await expect(id(page, 'countertop-piece-inspector')).toBeVisible();
    await expect(id(page, 'countertop-inspector-title')).toHaveText('Island top');
    const back = page.locator('[data-testid="countertop-side"][data-side="back"]');
    await expect(back).toHaveAttribute('data-active', 'true');
    await expect(id(page, 'countertop-preset-seating')).toHaveText('Seating 12');

    await id(page, 'countertop-preset-seating').click();
    await expect(back.getByTestId('countertop-side-label')).toHaveText('Back · seating');
    await expect(id(page, 'countertop-side-input-back')).toHaveValue('12"');
    await expect(id(page, 'countertop-preset-seating')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 0)).toHaveAttribute('data-kind', 'seating');
    await expect(chip(page, 0)).toHaveText('12" seating');
    await expect(id(page, 'countertop-cabinets')).toContainText('73 1/2 × 24');

    const data = await pieceData(page, pieceId);
    expect(data.attributes.edges[0]).toMatchObject({ kind: 'seating', overhang: 12 });
    expect(data.geometry.outline).toEqual([
      { x: 0, y: 109.5 },
      { x: 76.5, y: 109.5 },
      { x: 76.5, y: 147 },
      { x: 0, y: 147 },
    ]);
    await saved(page);
  });

  test('a chip on the plan takes a typed overhang; undo puts it back', async ({ page, signInAs }) => {
    const { ids: project, user } = await fixtureS(EDITOR);
    await signInAs(user.email);
    await openReady(page, project.P1);
    const pieceId = await seedIsland(page);
    await saved(page);

    await page.keyboard.press('k');
    await chip(page, 2).click();
    const input = id(page, 'countertop-overhang-input');
    await expect(input).toBeFocused();
    await input.fill('2');
    await input.press('Enter');
    await expect(chip(page, 2)).toHaveText('2');
    // 1 1/2" to 2": the front (y = 147) moves out 0.5 to y = 147.5.
    let data = await pieceData(page, pieceId);
    expect(data.attributes.edges[2]).toMatchObject({ kind: 'exposed', overhang: 2 });
    expect(data.geometry.outline[2]).toEqual({ x: 76.5, y: 147.5 });

    await page.keyboard.press('ControlOrMeta+z');
    await expect(chip(page, 2)).toHaveText('1 1/2');
    data = await pieceData(page, pieceId);
    expect(data.attributes.edges[2]).toMatchObject({ kind: 'exposed', overhang: 1.5 });
  });

});
