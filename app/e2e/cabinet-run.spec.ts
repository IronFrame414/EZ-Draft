// EZD-404 (S04 Layout; S04 Controls "Click box (plan strip or elevation) | Selects that box; same box highlights in both
// views"; S04 Permissions "View projects: view runs, plan strip, elevation"; AC-EZD-404-1, -2). Desktop 1600 x 1000.
// Each test makes its own company (never tenant 1) with fixture S and its own member. Board S04's back wall run (a 3"
// filler, B15, DW24, SB36, B18, B21 = 117"; two uppers) on a 117 1/2" wall is seeded through the editor hook. Helpers
// are copies of measure.spec.ts. No import.meta or __dirname (L-017).
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

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, EDITOR as never);
  return { tenant, ids, user };
}

type Obj = { id: string; type: string; data: Record<string, unknown> };
type View = { x: number; y: number; ppi: number };
type Window2 = {
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
  __ezdraftPlan: { handle: { setView(v: View): void; modelToScreen(p: { x: number; y: number }): { x: number; y: number } } };
  __ezdraftSelection: { ids(): string[] };
};

const editorState = (page: Page) => page.getByTestId('editor-state');
const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const tool = (page: Page, which: string) => page.locator(`[data-rail-tool="${which}"]`);
const box = (page: Page, cabinetId: string, view: 'plan' | 'elevation') =>
  page.locator(`[data-cabinet-id="${cabinetId}"][data-view="${view}"]`);
const selectedIn = (page: Page, view: 'plan' | 'elevation') =>
  page
    .locator(`[data-view="${view}"][data-selected="true"]`)
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-cabinet-id')));

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

// Clicks the plan at a model point (view: model (0,0) at region px (128, 384), 8/3 px per inch; as measure.spec.ts).
async function clickPlan(page: Page, x: number, y: number) {
  await page.evaluate(() =>
    (window as unknown as Window2).__ezdraftPlan.handle.setView({ x: -48, y: 144, ppi: 8 / 3 }),
  );
  const region = await page.locator('[data-shell-region="canvas"]').boundingBox();
  if (!region) throw new Error('canvas region has no box');
  const s = await page.evaluate((p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p), { x, y });
  await page.mouse.move(region.x + s.x, region.y + s.y);
  await page.mouse.click(region.x + s.x, region.y + s.y);
}
const planSelection = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids());
const countOf = (page: Page, type: string) =>
  page.evaluate((t) => (window as unknown as Window2).__ezdraftEditor.objects().filter((o) => o.type === t).length, type);

const CODES = ['F3', 'B15', 'DW24', 'SB36', 'B18', 'B21', 'W1530', 'W3030'];

// Seeds the wall and the run; returns the member ids by code.
async function seedRun(page: Page): Promise<Record<string, string>> {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor.objects().find((x) => x.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const made = createWallData({ start: { x: 0, y: 0 }, end: { x: 117.5, y: 0 }, level, thicknessSide: 'right' });
  if (!made.ok) throw new Error('wall data');
  const wallId = crypto.randomUUID();
  const ids: Record<string, string> = Object.fromEntries(CODES.map((c) => [c, crypto.randomUUID()]));
  const v = (type: string, data: Record<string, unknown>) => ({ type, schemaVersion: CURRENT_SCHEMA_VERSION, data });
  const attrs = { catalogItemId: null, finish: null };
  const boxData = (code: string, boxType: string, width: number, faceLayout: string) => ({
    status: 'new',
    level,
    attributes: {
      code,
      boxType,
      width,
      depth: boxType === 'wall' ? 12 : 24,
      height: boxType === 'wall' ? 30 : 34.5,
      faceLayout,
      hingeSide: 'left',
      finishedEnds: 'none',
      ...attrs,
    },
  });
  const changes = [
    { id: wallId, value: v('wall', made.data as unknown as Record<string, unknown>) },
    {
      id: ids.F3,
      value: v('cabinet_filler', {
        status: 'new',
        level,
        attributes: { code: 'F3', width: 3, depth: 24, height: 34.5, scribe: 0.5, ...attrs },
      }),
    },
    { id: ids.B15, value: v('cabinet_box', boxData('B15', 'base', 15, 'drawer_door_1')) },
    { id: ids.DW24, value: v('cabinet_box', boxData('DW24', 'appliance_panel', 24, 'panel')) },
    { id: ids.SB36, value: v('cabinet_box', boxData('SB36', 'sink_base', 36, 'false_drawer_doors_2')) },
    { id: ids.B18, value: v('cabinet_box', boxData('B18', 'base', 18, 'drawer_door_1')) },
    { id: ids.B21, value: v('cabinet_box', boxData('B21', 'base', 21, 'drawer_door_1')) },
    { id: ids.W1530, value: v('cabinet_box', boxData('W1530', 'wall', 15, 'door_1')) },
    { id: ids.W3030, value: v('cabinet_box', boxData('W3030', 'wall', 30, 'doors_2')) },
    {
      id: crypto.randomUUID(),
      value: v('cabinet_run', {
        geometry: { hostWallId: wallId, start: { x: 0, y: 0 }, axis: { x: 1, y: 0 } },
        level,
        attributes: {
          name: 'Back wall run',
          base: ['F3', 'B15', 'DW24', 'SB36', 'B18', 'B21'].map((c) => ids[c]),
          upper: [ids.W1530, ids.W3030],
        },
      }),
    },
  ];
  const done = await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);
  expect(done.length).toBeGreaterThan(0);
  return ids;
}

test.describe('EZD-404 Plan strip and elevation', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-404-1, -2 a box clicked in either view is drawn selected in both; the chain adds to 117"', async ({
    page,
    signInAs,
  }) => {
    const { ids: project, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, project.P1);
    const ids = await seedRun(page);
    await saved(page);

    await page.keyboard.press('c');
    await expect(tool(page, 'cabinets')).toHaveAttribute('aria-pressed', 'true');
    await expect(id(page, 'cabinet-run-name')).toHaveText('Back wall run');
    await expect(id(page, 'cabinet-run-counts')).toHaveText('5 boxes · 1 filler');
    await expect(id(page, 'status-cabinet-view')).toHaveText('Plan + elevation A');

    // AC-EZD-404-2: the chain widths in order, adding to the run total.
    const chain = await page
      .locator('[data-chain-id]')
      .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-width'))));
    expect(chain).toEqual([3, 15, 24, 36, 18, 21]);
    expect(chain.reduce((a, b) => a + b, 0)).toBe(117);

    // AC-EZD-404-1: a click in the plan strip marks the box in both views.
    await box(page, ids.SB36, 'plan').click();
    await expect.poll(() => selectedIn(page, 'plan')).toEqual([ids.SB36]);
    await expect.poll(() => selectedIn(page, 'elevation')).toEqual([ids.SB36]);
    // Drawn blue: the selected outline takes the cobalt stroke, the others keep theirs.
    const stroke = (cabinetId: string) =>
      box(page, cabinetId, 'elevation')
        .locator('rect')
        .first()
        .evaluate((e) => getComputedStyle(e).stroke);
    expect(await stroke(ids.SB36)).not.toBe(await stroke(ids.B15));

    // ... and a click in the elevation moves it, in both views.
    await box(page, ids.B18, 'elevation').click();
    await expect.poll(() => selectedIn(page, 'plan')).toEqual([ids.B18]);
    await expect.poll(() => selectedIn(page, 'elevation')).toEqual([ids.B18]);
    // A click on B15 in the plan strip, near the wall where W1530 lies over it, picks B15, not the upper.
    const b15 = await box(page, ids.B15, 'plan').boundingBox();
    if (!b15) throw new Error('B15 has no box');
    await page.mouse.click(b15.x + b15.width / 2, b15.y + 3);
    await expect.poll(() => selectedIn(page, 'plan')).toEqual([ids.B15]);
    await expect.poll(() => selectedIn(page, 'elevation')).toEqual([ids.B15]);
    await box(page, ids.W3030, 'elevation').click();
    await expect.poll(() => selectedIn(page, 'plan')).toEqual([ids.W3030]);

    // Esc clears the selection, then ends the tool.
    await page.keyboard.press('Escape');
    await expect.poll(() => selectedIn(page, 'elevation')).toEqual([]);
    await expect(tool(page, 'cabinets')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    await expect(id(page, 'cabinet-run')).toHaveCount(0);
  });

  test('the plan under the screen is never edited: a selected wall survives C, Delete, Ctrl+A, Backspace', async ({
    page,
    signInAs,
  }) => {
    const { ids: project, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, project.P1);
    await seedRun(page);
    await saved(page);
    expect(await countOf(page, 'wall')).toBe(1);

    await clickPlan(page, 60, 0);
    await expect.poll(() => planSelection(page)).toHaveLength(1);
    await page.keyboard.press('c');
    await expect(id(page, 'cabinet-run-name')).toHaveText('Back wall run');
    await expect.poll(() => planSelection(page)).toEqual([]);
    await page.keyboard.press('Delete');
    await page.keyboard.press('ControlOrMeta+a');
    await expect.poll(() => planSelection(page)).toEqual([]);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('ControlOrMeta+v');
    expect(await countOf(page, 'wall')).toBe(1);
    expect(await countOf(page, 'cabinet_box')).toBe(7);
    expect(await countOf(page, 'cabinet_run')).toBe(1);
  });

  test('a view-only user opens the cabinet run screen from the rail', async ({ page, signInAs }) => {
    const { tenant, ids: project, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, project.P1);
    const ids = await seedRun(page);
    await saved(page);
    await setPermissions(tenant, user.membershipId, VIEWER as never);
    await page.reload();
    await openReady(page, project.P1);

    await expect(tool(page, 'wall')).toHaveCount(0);
    await tool(page, 'cabinets').click();
    await expect(id(page, 'cabinet-run-name')).toHaveText('Back wall run');
    await box(page, ids.B15, 'elevation').click();
    await expect.poll(() => selectedIn(page, 'plan')).toEqual([ids.B15]);
  });
});
