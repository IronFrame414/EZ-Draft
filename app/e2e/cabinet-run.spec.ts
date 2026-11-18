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
  __ezdraftPlan: {
    handle: {
      setView(v: View): void;
      modelToScreen(p: { x: number; y: number }): { x: number; y: number };
    };
  };
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
  const s = await page.evaluate(
    (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
    { x, y },
  );
  await page.mouse.move(region.x + s.x, region.y + s.y);
  await page.mouse.click(region.x + s.x, region.y + s.y);
}
const planSelection = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids());
const countOf = (page: Page, type: string) =>
  page.evaluate(
    (t) =>
      (window as unknown as Window2).__ezdraftEditor.objects().filter((o) => o.type === t).length,
    type,
  );

const CODES = ['F3', 'B15', 'DW24', 'SB36', 'B18', 'B21', 'W1530', 'W3030'];

// Seeds the wall and the run; returns the member ids by code.
async function seedRun(page: Page): Promise<Record<string, string>> {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((x) => x.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const made = createWallData({
    start: { x: 0, y: 0 },
    end: { x: 117.5, y: 0 },
    level,
    thicknessSide: 'right',
  });
  if (!made.ok) throw new Error('wall data');
  const wallId = crypto.randomUUID();
  const ids: Record<string, string> = Object.fromEntries(
    CODES.map((c) => [c, crypto.randomUUID()]),
  );
  const v = (type: string, data: Record<string, unknown>) => ({
    type,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data,
  });
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
    {
      id: ids.SB36,
      value: v('cabinet_box', boxData('SB36', 'sink_base', 36, 'false_drawer_doors_2')),
    },
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
  const done = await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    changes,
  );
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

  test('a view-only user opens the cabinet run screen from the rail', async ({
    page,
    signInAs,
  }) => {
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

// EZD-405 (AC-EZD-405-1 "Dragging a B15 edge one step relabels it B18"; S04 Controls "Drag box side edge | Resizes width
// in the run increment (3") | Code updates (e.g. B15 to B18)", "Shift+click box", "Drag box | Reorders within the run",
// "Chain dimension text | Click to type an exact width", "Delete / Backspace", "Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z"). Board
// S04's run as above; the drawing is in inches, so B15's elevation box is 15" wide on screen and one step is a fifth of it.
const objOf = (page: Page, objectId: string) =>
  page.evaluate(
    (i) =>
      (window as unknown as Window2).__ezdraftEditor.objects().find((o) => o.id === i)?.data
        .attributes ?? null,
    objectId,
  ) as Promise<{ code: string; width: number } | null>;
const chainWidths = (page: Page) =>
  page
    .locator('[data-chain-id]')
    .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-width'))));

test.describe('EZD-405 Box editing on canvas', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-405-1 dragging the B15 right edge one 3" step relabels it B18; undo and redo', async ({
    page,
    signInAs,
  }) => {
    const { ids: project, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, project.P1);
    const ids = await seedRun(page);
    await saved(page);
    await page.keyboard.press('c');
    await expect(id(page, 'cabinet-run-name')).toHaveText('Back wall run');

    const b15 = await box(page, ids.B15, 'elevation').boundingBox();
    const edge = await page.locator(`[data-edge-of="${ids.B15}"][data-edge="right"]`).boundingBox();
    if (!b15 || !edge) throw new Error('B15 has no box');
    const step = (b15.width / 15) * 3;
    const y = edge.y + edge.height / 2;
    await page.mouse.move(edge.x + edge.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(edge.x + edge.width / 2 + step / 2, y, { steps: 4 });
    await page.mouse.move(edge.x + edge.width / 2 + step, y, { steps: 4 });
    // Live while dragging: the plan strip already reads B18.
    await expect(box(page, ids.B15, 'plan').locator('text')).toHaveText('B18');
    await page.mouse.up();

    await expect(box(page, ids.B15, 'plan').locator('text')).toHaveText('B18');
    await expect.poll(() => objOf(page, ids.B15)).toMatchObject({ code: 'B18', width: 18 });
    expect(await chainWidths(page)).toEqual([3, 18, 24, 36, 18, 21]);
    await expect.poll(() => selectedIn(page, 'elevation')).toEqual([ids.B15]);
    await saved(page);

    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => objOf(page, ids.B15)).toMatchObject({ code: 'B15', width: 15 });
    expect(await chainWidths(page)).toEqual([3, 15, 24, 36, 18, 21]);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(() => objOf(page, ids.B15)).toMatchObject({ code: 'B18', width: 18 });
    await saved(page);
    // Saved: the relabelled box comes back after a reload.
    await page.reload();
    await openReady(page, project.P1);
    expect(await objOf(page, ids.B15)).toMatchObject({ code: 'B18', width: 18 });
  });

  test('typed chain width, drag to reorder, Shift+click and Delete', async ({ page, signInAs }) => {
    const { ids: project, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, project.P1);
    const ids = await seedRun(page);
    await saved(page);
    await page.keyboard.press('c');
    await expect(id(page, 'cabinet-run-name')).toHaveText('Back wall run');

    // The 21" chain text: type 24 and Enter; B21 becomes B24.
    await page.locator(`[data-chain-id="${ids.B21}"] text`).click();
    await expect(id(page, 'cabinet-dim-input')).toBeFocused();
    await id(page, 'cabinet-dim-input').fill('24');
    await page.keyboard.press('Enter');
    await expect.poll(() => objOf(page, ids.B21)).toMatchObject({ code: 'B24', width: 24 });
    await expect(id(page, 'cabinet-dim-entry')).toHaveCount(0);

    // B15 dragged onto the middle of SB36's right half lands after SB36; the others shift.
    const b15 = await box(page, ids.B15, 'elevation').boundingBox();
    const sb36 = await box(page, ids.SB36, 'elevation').boundingBox();
    if (!b15 || !sb36) throw new Error('no boxes');
    await page.mouse.move(b15.x + b15.width / 2, b15.y + b15.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb36.x + sb36.width * 0.8, b15.y + b15.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => chainWidths(page)).toEqual([3, 24, 36, 15, 18, 24]);

    // Shift+click takes two boxes; Delete removes both, and the run total drops by 33".
    await box(page, ids.B15, 'elevation').click();
    await box(page, ids.B18, 'elevation').click({ modifiers: ['Shift'] });
    await expect.poll(() => selectedIn(page, 'elevation')).toEqual([ids.B15, ids.B18]);
    await page.keyboard.press('Delete');
    await expect.poll(() => chainWidths(page)).toEqual([3, 24, 36, 24]);
    await expect(id(page, 'cabinet-run-counts')).toHaveText('3 boxes · 1 filler');
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => chainWidths(page)).toEqual([3, 24, 36, 15, 18, 24]);
    await saved(page);
  });

  test('a view-only user gets no edge handles and no edits', async ({ page, signInAs }) => {
    const { tenant, ids: project, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, project.P1);
    const ids = await seedRun(page);
    await saved(page);
    await setPermissions(tenant, user.membershipId, VIEWER as never);
    await page.reload();
    await openReady(page, project.P1);
    await tool(page, 'cabinets').click();
    await expect(id(page, 'cabinet-run-name')).toHaveText('Back wall run');
    await expect(page.locator('[data-edge]')).toHaveCount(0);
    await box(page, ids.B15, 'elevation').click();
    await page.keyboard.press('Delete');
    expect(await chainWidths(page)).toEqual([3, 15, 24, 36, 18, 21]);
  });
});

// EZD-410 (AC-EZD-410-1 "A wall move that strands a cabinet flags it red"; S04 Validation "Hosted cabinet left off a
// wall after a wall move: red 'Not on a wall' flag"). Board S04's run as above, its start on the wall line at (0,0).
// The wall is moved 6" with the Move tool (as move.spec.ts B1); the run stays where it stands, off the wall.
const resolved = (page: Page, prop: 'color' | 'stroke', token: string) =>
  page.evaluate(
    ([p, tk]) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      el.style.setProperty(p, `var(${tk})`);
      document.querySelector('svg')!.appendChild(el);
      const v = getComputedStyle(el).getPropertyValue(p);
      el.remove();
      return v;
    },
    [prop, token] as const,
  );
// Moves the pointer to a model point (the view clickPlan sets) without clicking.
async function hoverPlan(page: Page, x: number, y: number) {
  const region = await page.locator('[data-shell-region="canvas"]').boundingBox();
  if (!region) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
    { x, y },
  );
  await page.mouse.move(region.x + s.x, region.y + s.y, { steps: 4 });
}
const wallStartY = (page: Page) =>
  page.evaluate(() => {
    const w = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'wall');
    return (w?.data.geometry as { start: { y: number } } | undefined)?.start.y ?? null;
  });

test.describe('EZD-410 Cabinet flags and states', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-410-1 moving the host wall 6" away flags the run red: Not on a wall; undo clears it', async ({
    page,
    signInAs,
  }) => {
    const { ids: project, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, project.P1);
    const ids = await seedRun(page);
    await saved(page);

    // On its wall: no flag, no box flagged.
    await page.keyboard.press('c');
    await expect(id(page, 'cabinet-run-name')).toHaveText('Back wall run');
    await expect(id(page, 'cabinet-run-not-on-wall')).toHaveCount(0);
    await expect(page.locator('[data-flagged="true"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(id(page, 'cabinet-run')).toHaveCount(0);

    // Move the wall 6" off the run.
    await page.keyboard.press('m');
    await expect(tool(page, 'move')).toHaveAttribute('aria-pressed', 'true');
    await clickPlan(page, 60, 0);
    await expect.poll(() => planSelection(page)).toHaveLength(1);
    await clickPlan(page, 60, 0);
    await hoverPlan(page, 60, 40);
    await page.keyboard.type('6"');
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => Math.abs((await wallStartY(page)) ?? 0), { timeout: 15_000 })
      .toBeCloseTo(6, 9);
    await saved(page);

    await page.keyboard.press('Escape');
    await page.keyboard.press('c');
    await expect(id(page, 'cabinet-run-name')).toHaveText('Back wall run');
    const flag = id(page, 'cabinet-run-not-on-wall');
    await expect(flag).toHaveText('Not on a wall');
    // Red: the flag text and the boxes' outlines take the red tokens.
    expect(await flag.evaluate((e) => getComputedStyle(e).color)).toBe(
      await resolved(page, 'color', '--ez-red-text'),
    );
    const red = await resolved(page, 'stroke', '--ez-red');
    for (const code of ['B15', 'SB36', 'W3030']) {
      for (const v of ['plan', 'elevation'] as const) {
        await expect(box(page, ids[code]!, v)).toHaveAttribute('data-flagged', 'true');
        expect(
          await box(page, ids[code]!, v)
            .locator('rect')
            .first()
            .evaluate((e) => getComputedStyle(e).stroke),
        ).toBe(red);
      }
    }

    // Undo puts the wall back: the run is on it again.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => wallStartY(page)).toBe(0);
    await expect(flag).toHaveCount(0);
    await expect(page.locator('[data-flagged="true"]')).toHaveCount(0);
  });
});
