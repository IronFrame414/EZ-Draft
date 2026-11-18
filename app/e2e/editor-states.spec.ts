// EZD-225 E1-E4 (AC-EZD-225-1 to -4; S03 States lines 139, 143, 145, 147; S06:48, 100; Q-0697 decisions 05, 10;
// Q-0630 rows 9, 27; Q-0214). Untagged, so desktop 1600 x 1000. Every test makes its own company (never tenant 1)
// with fixture S (P1 "bravo", the floor "Floor 1") and its own members, each in their own browser (sessions) where
// two people are needed. Expected text: board S06 ("Editing tools paused while view only", Request edit) and
// en.ts office.inspector.not_on_wall ("Not on a wall"). The lock UI loads on the first user input in the editor
// (11 rule 7), so each page moves the mouse once it is ready (copied from edit-lock.spec.ts). The red colour of a
// hosted item off its wall is EZD-204b's (its own tests); here the door is made unhosted and clicked.
import {
  CURRENT_SCHEMA_VERSION,
  createOpeningData,
  createWallData,
  type Point,
} from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
import {
  adminDb,
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
// The drawing tools of the plan editor's rail (tool-defs DRAWING_RAIL_TOOLS); Select and Measure are not drawing tools.
const DRAWING = ['move', 'wall', 'room-rect', 'door', 'window', 'fixtures', 'sketch'];
const NOTE = 'Editing tools paused while view only';
const LOAD_ROUTE = '**/api/projects/*/model';

async function member(tenant: string, permissions: string[], name: string) {
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, permissions as never);
  const { error } = await adminDb().from('app_user').update({ name }).eq('id', m.appUserId);
  if (error) throw new Error(`name update failed: ${error.code}`);
  return m;
}

type Obj = { id: string; type: string; data: Record<string, unknown> };
type View = { x: number; y: number; ppi: number };
type Window2 = {
  __ezdraftPlan: { handle: { setView(v: View): void; modelToScreen(p: Point): Point } };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
  __ezdraftSelection: { ids(): string[] };
};

const tid = (page: Page, id: string): Locator => page.getByTestId(id);
const rail = (page: Page) => page.locator('[data-shell-region="rail"]');
const tool = (page: Page, id: string) => page.locator(`[data-rail-tool="${id}"]`);
const aside = (page: Page) => page.locator('[data-shell-region="inspector"]');
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const pt = (x: number, y: number): Point => ({ x, y });

// Opens the project, waits for the plan, then gives it the first input that loads the lock UI.
async function open(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(tid(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
  await page.mouse.move(800, 500);
  await page.mouse.move(810, 510);
}

// view: model (0,0) at region px (128, 384); 8/3 px per inch (copied from inspector.spec.ts).
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

async function clickAt(page: Page, x: number, y: number) {
  const box = await canvasRegion(page).boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
    { x, y },
  );
  await page.mouse.click(box.x + s.x, box.y + s.y);
}

const selectedIds = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids());
const objects = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const saved = (page: Page) =>
  expect(tid(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

async function wallDeleted(projectId: string, objectId: string): Promise<boolean> {
  const { data, error } = await adminDb()
    .from('model_object')
    .select('deleted')
    .eq('project_id', projectId)
    .eq('object_id', objectId)
    .single();
  if (error) throw new Error(`model_object read failed: ${error.code}`);
  return data.deleted as boolean;
}

const make = (id: string, type: string, data: unknown) => ({
  id,
  value: { type, schemaVersion: CURRENT_SCHEMA_VERSION, data },
});

// One wall W1 (0,0)->(144,0) through the holder's editor; returns its id.
async function addWall(page: Page): Promise<string> {
  await page.waitForFunction(() => '__ezdraftEditor' in window);
  const floor = (await objects(page)).find((o) => o.type === 'floor');
  if (!floor) throw new Error('no floor');
  const w = createWallData({
    start: pt(0, 0),
    end: pt(144, 0),
    level: floor.id,
    thicknessSide: 'right',
  });
  if (!w.ok) throw new Error('wall data');
  const id = crypto.randomUUID();
  await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    [make(id, 'wall', w.data)],
  );
  return id;
}

// W1 click spot (a point on its body, as inspector.spec.ts SPOT.W1).
const W1_SPOT = pt(20, -2.25);

test.describe('EZD-225 editor states', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-225 E1 AC-1 the skeleton shows while the project loads and every tool stays disabled', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const user = await member(tenant, EDITOR, 'Alex Holder');
    await signInAs(user.email);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(LOAD_ROUTE, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(`/projects/${ids.P1}`);
    await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'loading');
    await expect(tid(page, 'editor-state').locator('[data-skeleton]').first()).toBeVisible();
    const buttons = rail(page).locator('[data-rail-tool]');
    await expect(buttons.first()).toBeVisible();
    const n = await buttons.count();
    expect(n).toBeGreaterThanOrEqual(DRAWING.length + 2);
    for (let i = 0; i < n; i += 1) await expect(buttons.nth(i)).toBeDisabled();
    release();
    await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await expect(tool(page, 'select')).toBeEnabled();
    for (const id of DRAWING) await expect(tool(page, id)).toBeEnabled();
    await expect(tid(page, 'tools-paused-note')).toHaveCount(0);
  });

  test('EZD-225 E2 AC-2 without Edit model: no drawing tools, no Request edit; Select and a read-only inspector', async ({
    sessions,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const a = await member(tenant, EDITOR, 'Alex Holder');
    const v = await member(tenant, VIEWER, 'Vic Viewer');
    const [A, V] = await sessions.open([a.email, v.email]);
    await open(A.page, ids.P1);
    await expect(tid(A.page, 'stop-editing')).toBeVisible();
    const wall = await addWall(A.page);
    await saved(A.page);

    await open(V.page, ids.P1);
    // The banner shows (Alex holds the lock) without Request edit (S03:145; Q-0697 decisions 10).
    await expect(tid(V.page, 'lock-banner')).toBeVisible();
    await expect(tid(V.page, 'lock-request-edit')).toHaveCount(0);
    // Hidden, not greyed (Q-0214; Q-0697 decisions 05): Select, Cabinets (EZD-404, view only) and Measure, nothing paused, no note.
    await expect(rail(V.page).locator('[data-rail="top"] [data-rail-tool]')).toHaveCount(3);
    await expect(tool(V.page, 'select')).toBeEnabled();
    await expect(tool(V.page, 'measure')).toBeEnabled();
    for (const id of DRAWING) await expect(tool(V.page, id)).toHaveCount(0);
    await expect(rail(V.page).locator('[data-rail-paused]')).toHaveCount(0);
    await expect(tid(V.page, 'tools-paused-note')).toHaveCount(0);

    // Select works (Q-0630 row 9); the inspector shows the wall as text, with no field to type in.
    await view(V.page);
    await clickAt(V.page, W1_SPOT.x, W1_SPOT.y);
    await expect.poll(() => selectedIds(V.page)).toEqual([wall]);
    await expect(aside(V.page).getByTestId('inspector')).toBeVisible();
    await expect(aside(V.page).locator('input, textarea, select')).toHaveCount(0);
    // A drawing key does nothing (S06:82): Select stays the active tool.
    await V.page.keyboard.press('w');
    await expect(tool(V.page, 'select')).toHaveAttribute('aria-pressed', 'true');
  });

  test('EZD-225 E3 AC-3 a locked project: amber banner, drawing tools paused at 55% with the note; Select works', async ({
    sessions,
  }) => {
    test.setTimeout(180_000);
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const a = await member(tenant, EDITOR, 'Alex Holder');
    const b = await member(tenant, EDITOR, 'Bea Editor');
    const [A, B] = await sessions.open([a.email, b.email]);
    await open(A.page, ids.P1);
    await expect(tid(A.page, 'stop-editing')).toBeVisible();
    await expect(tid(A.page, 'tools-paused-note')).toHaveCount(0);
    const wall = await addWall(A.page);
    await saved(A.page);

    await open(B.page, ids.P1);
    await expect(tid(B.page, 'lock-banner')).toBeVisible();
    await expect(tid(B.page, 'lock-request-edit')).toBeVisible();
    // S06:48, board line 93: the drawing tools show, disabled, at 55%; the note says why (board line 100).
    for (const id of DRAWING) {
      const button = tool(B.page, id);
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute('data-rail-paused', '');
      await expect(button).toHaveCSS('opacity', '0.55');
    }
    // EZD-404: Cabinets only views (S04 Permissions), so it is not paused either.
    for (const id of ['select', 'cabinets', 'measure']) {
      await expect(tool(B.page, id)).toBeEnabled();
      await expect(tool(B.page, id)).not.toHaveAttribute('data-rail-paused', '');
    }
    await expect(tid(B.page, 'tools-paused-note')).toHaveText(NOTE);

    // Selecting still works (S06 States); the inspector is read only; drawing keys do nothing (S06:82).
    await view(B.page);
    await clickAt(B.page, W1_SPOT.x, W1_SPOT.y);
    await expect.poll(() => selectedIds(B.page)).toEqual([wall]);
    await expect(aside(B.page).locator('input, textarea, select')).toHaveCount(0);
    await B.page.keyboard.press('w');
    await expect(tool(B.page, 'select')).toHaveAttribute('aria-pressed', 'true');
    // Delete does nothing (S03:17): the wall stays selected and its row stays live.
    await B.page.keyboard.press('Delete');
    await expect.poll(() => selectedIds(B.page)).toEqual([wall]);
    expect(await wallDeleted(ids.P1, wall)).toBe(false);
    // Measuring still works (S06 States; Q-0697 decisions 05).
    await tool(B.page, 'measure').click();
    await expect(tool(B.page, 'measure')).toHaveAttribute('aria-pressed', 'true');
    await B.page.keyboard.press('Escape');

    // The holder releases to Bea's request: Alex's own tools pause in place (S03:143; S06:78).
    await tid(B.page, 'lock-request-edit').click();
    await expect(tid(A.page, 'holder-prompt')).toBeVisible();
    await tid(A.page, 'holder-prompt-release').click();
    await expect(tid(A.page, 'tools-paused-note')).toHaveText(NOTE);
    for (const id of DRAWING) await expect(tool(A.page, id)).toBeDisabled();
    await expect(tool(A.page, 'select')).toBeEnabled();
    await A.page.keyboard.press('w');
    await expect(tool(A.page, 'select')).toHaveAttribute('aria-pressed', 'true');
  });

  test('EZD-225 E4 AC-4 clicking a door that is not on a wall shows "Not on a wall" in the inspector', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const user = await member(tenant, EDITOR, 'Alex Holder');
    await signInAs(user.email);
    await open(page, ids.P1);
    const wallId = await addWall(page);
    const wallObj = (await objects(page)).find((o) => o.id === wallId);
    if (!wallObj) throw new Error('no wall');
    const door = createOpeningData({
      kind: 'door',
      host: { id: wallId, type: 'wall', data: wallObj.data as never },
      center: pt(72, 0),
    });
    // The door, then off its wall (as a wall move leaves it, S03:152): no host, 60" below the wall.
    const doorId = crypto.randomUUID();
    const off = {
      ...door,
      geometry: { ...door.geometry, center: pt(72, -60), hostWallId: null, axis: pt(1, 0) },
    };
    await page.evaluate(
      (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
      [make(doorId, 'opening', off)],
    );
    await saved(page);
    await view(page);
    await clickAt(page, 72, -60);
    await expect.poll(() => selectedIds(page)).toEqual([doorId]);
    const flag = aside(page).getByTestId('inspector-not-on-wall');
    await expect(flag).toBeVisible();
    await expect(flag).toContainText('Not on a wall');
  });
});
