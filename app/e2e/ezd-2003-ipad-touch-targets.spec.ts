// EZD-2003 (AC-EZD-2003-1, AC-EZD-2003-2; vault/plans/audit-a11y-ipad-2026-11-27.md A22 to A26): on the iPad profile (1180 x
// 820, touch) every control of the cabinet run screen (header, tile bar, box menu, box and run inspectors, their
// pickers, the cabinet schedule, the Auto-fill bar), the countertops screen (tools, cutout form, left panel, piece
// inspector, Edit offered edges, Top schedule), Import review, the plan's edit menu and its save dialog, and the small
// editor controls (rail More, review list, Help, inspector More, the pin photo button, the beam spacing pill and the
// catalog categories) has a tap area of at least 44 x 44 px (11 Non-functional requirements: "44 px minimum on
// touch"), measured with the repo's expectTouchTargets. The roots are the panels, bars, menus and dialogs; the
// drawings (elevation, plan strip, countertop plan) are not controls of this list. A root taller than the screen is
// checked region by region, as EZD-1980's spec does. AC-EZD-2003-3: the desktop test reads the desktop sizes of the
// same controls, which this ticket leaves as they were. Every test makes its own company (never tenant 1) and its own
// members. Seeds are copies of cabinet-run.spec.ts and countertops-edge-profile.spec.ts. No import.meta or
// __dirname (lesson L-017).
import { randomUUID } from 'node:crypto';
import {
  CURRENT_SCHEMA_VERSION,
  createOpeningData,
  createWallData,
  newRoomAttributes,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  adminDb,
  createMember,
  createTenant,
  expect,
  expectTouchTargets,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { TOUCH_TARGET_SELECTOR } from '../test-harness/touch-targets';
import { seedFixtureS } from '../test-harness/projects-fixture';
import { en } from '../src/server/messages/catalogs/en';

const EDITOR = ['view_projects', 'edit_model'];
const tid = (page: Page, id: string): Locator => page.getByTestId(id);
const REGION_ATTR = 'data-ezd2003-region';
// A region is at most this tall, so centred on the iPad screen (820 px) it clears the headers and footers.
const REGION_MAX = 440;

type Obj = { id: string; type: string; data: Record<string, unknown> };
type View = { x: number; y: number; ppi: number };
type Window2 = {
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
  __ezdraftPlan: { handle: { setView(v: View): void; modelToScreen(p: Point): Point } };
};

// Checks every visible control under `root` with expectTouchTargets, region by region; returns the count checked.
async function expectAllTouchTargets(page: Page, root: Locator): Promise<number> {
  const { total, regions } = await root.evaluate(
    (rootEl, { selector, attr, max }) => {
      const visible = (el: Element) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return !(
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          r.width <= 0 ||
          r.height <= 0
        );
      };
      const targets = Array.from(rootEl.querySelectorAll(selector)).filter(visible);
      const chosen = new Set<Element>();
      for (const t of targets) {
        let region: Element = t.parentElement ?? rootEl;
        let up = region.parentElement;
        while (up && rootEl.contains(up) && up.getBoundingClientRect().height <= max) {
          region = up;
          up = up.parentElement;
        }
        chosen.add(region);
      }
      // Keep the outermost regions only, so no control is checked twice.
      const outer = [...chosen].filter((r) => ![...chosen].some((o) => o !== r && o.contains(r)));
      document.querySelectorAll(`[${attr}]`).forEach((e) => e.removeAttribute(attr));
      outer.forEach((r, i) => r.setAttribute(attr, String(i)));
      return { total: targets.length, regions: outer.length };
    },
    { selector: TOUCH_TARGET_SELECTOR, attr: REGION_ATTR, max: REGION_MAX },
  );
  expect(total, 'controls on the screen').toBeGreaterThan(0);
  let checked = 0;
  for (let i = 0; i < regions; i++) {
    const region = page.locator(`[${REGION_ATTR}="${i}"]`);
    await region.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    checked += await expectTouchTargets(page, region);
  }
  expect(checked, 'every control was checked').toBe(total);
  return checked;
}

async function editor(permissions: string[], catalog = false) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, permissions as never);
  if (catalog) await harnessSql()`select private.seed_catalog_generic_line(${tenant}::uuid)`;
  return { tenant, ids, user };
}

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(tid(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}
const saved = (page: Page) =>
  expect(tid(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

const floorId = (page: Page) =>
  page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((x) => x.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
const v = (type: string, data: Record<string, unknown>) => ({
  type,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data,
});
const edit = async (page: Page, changes: unknown[]) => {
  const done = await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    changes,
  );
  expect(done.length).toBeGreaterThan(0);
};

// Board S04's back wall run (F3, B15, DW24, SB36, B18, B21; W1530, W3030) on a 117 1/2" wall, or the same run empty.
async function seedRun(page: Page, empty = false): Promise<Record<string, string>> {
  const level = await floorId(page);
  const made = createWallData({
    start: { x: 0, y: 0 },
    end: { x: 117.5, y: 0 },
    level,
    thicknessSide: 'right',
  });
  if (!made.ok) throw new Error('wall data');
  const wallId = crypto.randomUUID();
  const codes = ['F3', 'B15', 'DW24', 'SB36', 'B18', 'B21', 'W1530', 'W3030'];
  const ids: Record<string, string> = Object.fromEntries(
    codes.map((c) => [c, crypto.randomUUID()]),
  );
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
  const boxes = [
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
  ];
  await edit(page, [
    { id: wallId, value: v('wall', made.data as unknown as Record<string, unknown>) },
    ...(empty ? [] : boxes),
    {
      id: crypto.randomUUID(),
      value: v('cabinet_run', {
        geometry: { hostWallId: wallId, start: { x: 0, y: 0 }, axis: { x: 1, y: 0 } },
        level,
        attributes: {
          name: 'Back wall run',
          base: empty ? [] : ['F3', 'B15', 'DW24', 'SB36', 'B18', 'B21'].map((c) => ids[c]),
          upper: empty ? [] : [ids.W1530, ids.W3030],
        },
      }),
    },
  ]);
  return ids;
}

// The board island (76 1/2 x 37 1/2, seating back, every other side exposed), piece C.
async function seedIsland(page: Page): Promise<void> {
  const level = await floorId(page);
  const edge = (kind: string) => ({
    kind,
    overhang: kind === 'seating' ? 12 : 1.5,
    backsplashHeight: null,
    profileId: null,
  });
  await edit(page, [
    {
      id: crypto.randomUUID(),
      value: v('countertop_piece', {
        geometry: {
          outline: [
            { x: 0, y: 120 },
            { x: 76.5, y: 120 },
            { x: 76.5, y: 157.5 },
            { x: 0, y: 157.5 },
          ],
        },
        status: 'new',
        level,
        attributes: {
          label: 'C',
          name: 'Island',
          materialItemId: null,
          thickness: 3 / 2.54,
          edges: [edge('exposed'), edge('exposed'), edge('seating'), edge('exposed')],
        },
      }),
    },
  ]);
}

const elevationBox = (page: Page, cabinetId: string) =>
  page.locator(`[data-cabinet-id="${cabinetId}"][data-view="elevation"]`);

// A cabinet picker layer: its × close, the category column (checked from the picker's top: the column is as tall as
// the item list beside it) and the items, region by region.
async function checkCatalogPicker(page: Page, picker: Locator) {
  const close = picker.getByRole('button', { name: en['office.cabinets.close'], exact: true });
  await expect(close).toBeVisible();
  await close.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  expect(await expectTouchTargets(page, close.locator('xpath=..'))).toBeGreaterThanOrEqual(1);
  const categories = picker.getByRole('navigation');
  await expect(categories.getByRole('button').first()).toBeVisible();
  await categories.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  expect(await expectTouchTargets(page, categories)).toBeGreaterThanOrEqual(2);
  // The item list (a picker may list none, as the run's finish picker over the Generic line, which has no finish).
  const items = categories.locator('xpath=following-sibling::*[1]');
  if ((await items.locator(TOUCH_TARGET_SELECTOR).count()) > 0)
    await expectAllTouchTargets(page, items);
}

// The page point of a model point, with the plan view of edit-menu.spec.ts (model (0,0) at region px (128, 384)).
async function at(page: Page, x: number, y: number): Promise<Point> {
  await page.evaluate(() =>
    (window as unknown as Window2).__ezdraftPlan.handle.setView({ x: -48, y: 144, ppi: 8 / 3 }),
  );
  const box = await page.locator('[data-shell-region="canvas"]').boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
    { x, y },
  );
  return { x: box.x + s.x, y: box.y + s.y };
}

// Opens the left panel when the iPad layout has it folded.
async function openLeftPanel(page: Page, inside: Locator) {
  if (await inside.isVisible()) return;
  await page
    .getByRole('button', { name: en['common.shell.left_panel_toggle'], exact: true })
    .click();
  await expect(inside).toBeVisible();
}

// A 144" wall along y = 0 with a door centred at x = 72 (edit-menu.spec.ts).
async function seedDoor(page: Page): Promise<void> {
  const level = await floorId(page);
  const made = createWallData({ start: { x: 0, y: 0 }, end: { x: 144, y: 0 }, level });
  if (!made.ok) throw new Error('wall data');
  const wall: WallObject = { id: crypto.randomUUID(), type: 'wall', data: made.data };
  await edit(page, [
    { id: wall.id, value: v('wall', wall.data as unknown as Record<string, unknown>) },
    {
      id: crypto.randomUUID(),
      value: v(
        'opening',
        createOpeningData({
          kind: 'door',
          host: wall,
          center: { x: 72, y: 0 },
        }) as unknown as Record<string, unknown>,
      ),
    },
  ]);
}

// The vaulted 12' x 10' family room of ceiling-rcp.spec.ts (ridge along y = 60).
async function seedVaultedRoom(page: Page): Promise<void> {
  const level = await floorId(page);
  const ring: Point[] = [
    { x: 0, y: 0 },
    { x: 144, y: 0 },
    { x: 144, y: 120 },
    { x: 0, y: 120 },
  ];
  const walls = ring.map((start, i) => {
    const made = createWallData({
      start,
      end: ring[(i + 1) % 4]!,
      level,
      thicknessSide: 'right',
      status: 'existing',
    });
    if (!made.ok) throw new Error('wall data');
    return {
      id: crypto.randomUUID(),
      value: v('wall', made.data as unknown as Record<string, unknown>),
    };
  });
  await edit(page, [
    ...walls,
    {
      id: crypto.randomUUID(),
      value: v('room', {
        geometry: { boundary: ring },
        status: 'existing',
        level,
        attributes: {
          ...newRoomAttributes('Family room'),
          ceilingType: 'vaulted',
          ceiling: {
            heightsBy: 'pitch',
            wallHeights: [],
            pointHeights: [],
            pitch: 9.4,
            ridge: { start: { x: 0, y: 60 }, end: { x: 144, y: 60 }, height: 156 },
          },
        },
        closureOverride: null,
      }),
    },
  ]);
}

// A finished import of the room-12x10 fixture (import-finish.spec.ts), with the east wall at 70% so it is to check.
async function makeImport(tenant: string, project: string, appUserId: string): Promise<string> {
  const wall = (
    n: number,
    side: string,
    conf: number,
    sx: number,
    sy: number,
    ex: number,
    ey: number,
  ) => ({
    id: `w${n}`,
    type: 'wall',
    number: n,
    side,
    confidence: conf,
    geometry: { start: { x: sx, y: sy }, end: { x: ex, y: ey } },
    thickness: 4.5,
  });
  const items = [
    wall(1, 'south', 95, 144, 0, 0, 0),
    wall(2, 'east', 70, 144, 120, 144, 0),
    wall(3, 'north', 95, 0, 120, 144, 120),
    wall(4, 'west', 95, 0, 0, 0, 120),
    {
      id: 'r1',
      type: 'room',
      number: 1,
      confidence: 95,
      boundary: [
        { x: 0, y: 0 },
        { x: 144, y: 0 },
        { x: 144, y: 120 },
        { x: 0, y: 120 },
      ],
      closed: true,
      areaSqIn: 17280,
    },
  ];
  const fileId = randomUUID();
  const file = await adminDb()
    .from('source_file')
    .insert({
      id: fileId,
      tenant_id: tenant,
      project_id: project,
      kind: 'polycam_dxf',
      storage_path: `${tenant}/${project}/${fileId}`,
      original_name: 'family-room.dxf',
      content_type: 'image/vnd.dxf',
      size_bytes: 10,
      uploaded_at: new Date().toISOString(),
    });
  if (file.error) throw file.error;
  const job = await adminDb()
    .from('job')
    .insert({
      tenant_id: tenant,
      project_id: project,
      kind: 'import',
      payload: { sourceFileIds: [fileId] },
      status: 'done',
      max_attempts: 3,
      run_after: '2099-01-01T00:00:00Z',
      created_by: appUserId,
      finished_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (job.error) throw job.error;
  const jobId = (job.data as { id: string }).id;
  const session = await adminDb().from('import_session').insert({
    tenant_id: tenant,
    project_id: project,
    source_file_id: fileId,
    job_id: jobId,
    source_kind: 'scan',
    status: 'ready',
    items,
    summary: {},
  });
  if (session.error) throw session.error;
  return jobId;
}

test.describe('EZD-2003 touch targets of at least 44 px on iPad', () => {
  const importTenants: string[] = [];
  test.afterAll(async () => {
    try {
      for (const t of importTenants)
        await harnessSql()`delete from public.job where tenant_id = ${t}::uuid`;
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'EZD-2003 Cabinets: the run header, tile bar, box menu, inspectors, pickers and schedule are at least 44 px @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { ids: project, user } = await editor([...EDITOR, 'export'], true);
      await signInAs(user.email);
      await openReady(page, project.P1);
      const ids = await seedRun(page);
      await saved(page);
      await page.keyboard.press('c');
      await expect(tid(page, 'cabinet-run-name')).toHaveText('Back wall run');

      // The run header: run name, elevation picker, fit chip, Auto-fill.
      await expect(tid(page, 'cabinet-elevation-picker')).toBeVisible();
      expect(
        await expectAllTouchTargets(page, tid(page, 'cabinet-run-header')),
      ).toBeGreaterThanOrEqual(3);

      // The tile bar: Add tile, then its size, start and pattern fields.
      await expect(tid(page, 'cabinet-tile-add')).toBeVisible();
      await expectAllTouchTargets(page, tid(page, 'cabinet-tile-bar'));
      await tid(page, 'cabinet-tile-add').click();
      await expect(tid(page, 'cabinet-tile-pattern')).toBeVisible();
      expect(
        await expectAllTouchTargets(page, tid(page, 'cabinet-tile-bar')),
      ).toBeGreaterThanOrEqual(3);

      // The box menu (right click on a box): Swap, Duplicate, Delete. It opens at the tap inside the scrolling
      // screen, so its rows are checked scrolled into view.
      await elevationBox(page, ids.SB36!).click({ button: 'right' });
      await expect(tid(page, 'cabinet-menu')).toBeVisible();
      expect(await expectAllTouchTargets(page, tid(page, 'cabinet-menu'))).toBeGreaterThanOrEqual(
        3,
      );
      await page.keyboard.press('Escape');
      await expect(tid(page, 'cabinet-menu')).toHaveCount(0);

      // The box inspector: status, size fields, face segments, item, finish, Swap and Schedule; then the swap list.
      await elevationBox(page, ids.SB36!).click();
      await expect(tid(page, 'box-inspector-title')).toHaveText('SB36 · Sink base');
      await expect(tid(page, 'box-inspector-schedule')).toBeVisible();
      expect(await expectAllTouchTargets(page, tid(page, 'box-inspector'))).toBeGreaterThanOrEqual(
        8,
      );
      await tid(page, 'box-inspector-swap').click();
      await expect(tid(page, 'box-inspector-swap-item').first()).toBeVisible();
      await expectAllTouchTargets(page, tid(page, 'box-inspector'));
      await tid(page, 'box-inspector-swap').click();

      // The catalog picker the item link opens: its × close, the category column (at the picker's top; the column is
      // as tall as the item list, so it is checked from there) and the items.
      await tid(page, 'box-inspector-item').click();
      const picker = tid(page, 'box-inspector-picker');
      await expect(picker).toBeVisible();
      await checkCatalogPicker(page, picker);
      await picker.getByRole('button', { name: en['office.cabinets.close'], exact: true }).click();
      await expect(picker).toHaveCount(0);

      // The cabinet schedule: × close and Export CSV.
      await tid(page, 'box-inspector-schedule').click();
      await expect(tid(page, 'cabinet-schedule-export')).toBeVisible();
      expect(
        await expectAllTouchTargets(page, tid(page, 'cabinet-schedule')),
      ).toBeGreaterThanOrEqual(2);
      await tid(page, 'cabinet-schedule-close').click();
      await expect(tid(page, 'cabinet-schedule')).toHaveCount(0);

      // The run inspector: the two tiles and Schedule; then the finish picker with its × close.
      await tid(page, 'cabinet-run-name').click();
      await expect(tid(page, 'run-inspector-title')).toHaveText('Back wall run');
      expect(await expectAllTouchTargets(page, tid(page, 'run-inspector'))).toBeGreaterThanOrEqual(
        3,
      );
      await tid(page, 'run-inspector-finish').click();
      await expect(tid(page, 'run-inspector-picker')).toBeVisible();
      await checkCatalogPicker(page, tid(page, 'run-inspector-picker'));
    },
  );

  // EZD-2040 (AC-EZD-2040-1): the GitHub runner's Linux fonts are narrower than the Mac's, and there the elevation
  // picker (a select as wide as its letter) measured 39 px wide. This test draws the Cabinets controls' text at 9 px
  // (the screen's own text is 12 to 14 px), which is narrower than any font of either machine, so a control that is
  // only as wide as its text shows here on the Mac as well. The limit is the same 44 px.
  // AC-EZD-2040-2: the failing name, from CI run 46105428945 (both attempts, check-failures.log), is
  // 'SELECT "A" tap area 39x44', the elevation picker of the run header; EZD-1913b's registry move did not cause it
  // and the registry layout is untouched.
  // AC-EZD-2040-3: this test and the EZD-2003 Cabinets test above run in the local gate and in the CI e2e job on the
  // merge to develop.
  test(
    'EZD-2040 Cabinets: the header, tile bar, box menu, inspectors and schedule stay at least 44 px with narrower text @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { ids: project, user } = await editor([...EDITOR, 'export'], true);
      await signInAs(user.email);
      await openReady(page, project.P1);
      const ids = await seedRun(page);
      await saved(page);
      await page.keyboard.press('c');
      await expect(tid(page, 'cabinet-run-name')).toHaveText('Back wall run');
      const narrow = async (id: string) => {
        await tid(page, id).evaluate((root) => {
          for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))])
            (el as HTMLElement).style.setProperty('font-size', '9px', 'important');
        });
        return expectAllTouchTargets(page, tid(page, id));
      };

      await expect(tid(page, 'cabinet-elevation-picker')).toBeVisible();
      expect(await narrow('cabinet-run-header')).toBeGreaterThanOrEqual(3);

      await tid(page, 'cabinet-tile-add').click();
      await expect(tid(page, 'cabinet-tile-pattern')).toBeVisible();
      expect(await narrow('cabinet-tile-bar')).toBeGreaterThanOrEqual(3);

      await elevationBox(page, ids.SB36!).click({ button: 'right' });
      await expect(tid(page, 'cabinet-menu')).toBeVisible();
      expect(await narrow('cabinet-menu')).toBeGreaterThanOrEqual(3);
      await page.keyboard.press('Escape');
      await expect(tid(page, 'cabinet-menu')).toHaveCount(0);

      await elevationBox(page, ids.SB36!).click();
      await expect(tid(page, 'box-inspector-title')).toHaveText('SB36 · Sink base');
      await expect(tid(page, 'box-inspector-schedule')).toBeVisible();
      expect(await narrow('box-inspector')).toBeGreaterThanOrEqual(8);
      await tid(page, 'box-inspector-swap').click();
      await expect(tid(page, 'box-inspector-swap-item').first()).toBeVisible();
      await narrow('box-inspector');
      await tid(page, 'box-inspector-swap').click();

      await tid(page, 'box-inspector-schedule').click();
      await expect(tid(page, 'cabinet-schedule-export')).toBeVisible();
      expect(await narrow('cabinet-schedule')).toBeGreaterThanOrEqual(2);
      await tid(page, 'cabinet-schedule-close').click();
      await expect(tid(page, 'cabinet-schedule')).toHaveCount(0);

      await tid(page, 'cabinet-run-name').click();
      await expect(tid(page, 'run-inspector-title')).toHaveText('Back wall run');
      expect(await narrow('run-inspector')).toBeGreaterThanOrEqual(3);
    },
  );

  test(
    'EZD-2003 Cabinets: the Auto-fill bar is at least 44 px @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { ids: project, user } = await editor(EDITOR);
      await signInAs(user.email);
      await openReady(page, project.P1);
      await seedRun(page, true);
      await saved(page);
      await page.keyboard.press('c');
      await tid(page, 'cabinet-auto-fill').click();
      await expect(tid(page, 'cabinet-auto-fill-confirm')).toBeVisible();
      expect(
        await expectTouchTargets(page, tid(page, 'cabinet-auto-fill-bar')),
      ).toBeGreaterThanOrEqual(2);
    },
  );

  test(
    'EZD-2003 Countertops: tools, cutout form, panel, piece inspector, Edit offered edges and Top schedule are at least 44 px @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { ids: project, user } = await editor([
        ...EDITOR,
        'send_to_client',
        'see_sell_prices',
        'export',
      ]);
      await signInAs(user.email);
      await openReady(page, project.P1);
      await seedIsland(page);
      await saved(page);
      await page.keyboard.press('k');
      await expect(tid(page, 'countertops')).toBeVisible();
      await page
        .locator('[data-testid="countertop-overhang-chip"][data-label="C"][data-edge="0"]')
        .click();
      await page.keyboard.press('Escape');
      await expect(tid(page, 'countertop-inspector-title')).toHaveText('Island top');

      // The bar: tools and the edge profile pill, then the cutout kinds and sizes, then the typed length of Draw.
      const bar = tid(page, 'countertop-trace').locator('xpath=../..');
      await expect(tid(page, 'edge-profile-pill')).toBeVisible();
      await tid(page, 'countertop-cutout-tool').click();
      await expect(tid(page, 'countertop-cutout-width')).toBeVisible();
      expect(await expectAllTouchTargets(page, bar)).toBeGreaterThanOrEqual(9);
      await tid(page, 'countertop-cutout-tool').click();
      await tid(page, 'countertop-draw').click();
      // The typed length box shows once the first corner is placed (here near the plan's lower left).
      const plan = await tid(page, 'countertop-plan').boundingBox();
      if (!plan) throw new Error('countertop plan has no box');
      await page.mouse.click(plan.x + plan.width * 0.15, plan.y + plan.height * 0.85);
      await expect(tid(page, 'countertop-length')).toBeVisible();
      expect(await expectAllTouchTargets(page, bar)).toBeGreaterThanOrEqual(6);
      await page.keyboard.press('Escape');
      await expect(tid(page, 'countertop-length')).toHaveCount(0);
      if ((await tid(page, 'countertop-draw').getAttribute('aria-pressed')) === 'true') {
        await tid(page, 'countertop-draw').click();
      }

      // The left panel (folded on iPad until its toggle opens it), on each of its tabs.
      const panel = tid(page, 'countertop-panel');
      await openLeftPanel(page, panel);
      for (const tab of await page.locator('[data-testid^="countertop-panel-tab-"]').all()) {
        await tab.click();
        await expectAllTouchTargets(page, panel);
      }

      // The piece inspector: side inputs, presets, edge profile select, Edit offered edges, Top schedule.
      await expect(tid(page, 'countertop-top-schedule')).toBeVisible();
      expect(
        await expectAllTouchTargets(page, tid(page, 'countertop-inspector')),
      ).toBeGreaterThanOrEqual(8);

      // Edit offered edges: ticks, rates, × close, Cancel and Save.
      await tid(page, 'countertop-edit-offered').click();
      await expect(tid(page, 'edit-offered-save')).toBeVisible();
      expect(
        await expectAllTouchTargets(page, tid(page, 'edit-offered-edges')),
      ).toBeGreaterThanOrEqual(10);
      await tid(page, 'edit-offered-close').click();
      await expect(tid(page, 'edit-offered-edges')).toHaveCount(0);

      // Top schedule: × close and Export.
      await tid(page, 'countertop-top-schedule').click();
      await expect(tid(page, 'top-schedule-close')).toBeVisible();
      expect(await expectAllTouchTargets(page, tid(page, 'top-schedule'))).toBeGreaterThanOrEqual(
        1,
      );
    },
  );
  // AC-EZD-2003-3: with a mouse the controls keep their desktop sizes (the values in the desktop CSS rules: 30 px
  // segments, 40 px footer buttons, 32 px menu rows; the native tick box with no drawn box; the run header 16 px
  // below the canvas top, the screen's own padding).
  test('EZD-2003 desktop: cabinet and countertop controls keep their desktop sizes', async ({
    page,
    signInAs,
  }) => {
    const height = (l: Locator) => l.evaluate((el) => el.getBoundingClientRect().height);
    const { ids: project, user } = await editor([...EDITOR, 'send_to_client', 'see_sell_prices']);
    await signInAs(user.email);
    await openReady(page, project.P1);
    const ids = await seedRun(page);
    await seedIsland(page);
    await saved(page);

    await page.keyboard.press('c');
    await expect(tid(page, 'cabinet-run-name')).toHaveText('Back wall run');
    const screen = await tid(page, 'cabinet-run').boundingBox();
    const header = await tid(page, 'cabinet-run-header').boundingBox();
    expect(Math.round(header!.y - screen!.y)).toBe(16);
    await elevationBox(page, ids.SB36!).click({ button: 'right' });
    expect(await height(tid(page, 'cabinet-menu').getByRole('menuitem').first())).toBe(32);
    await page.keyboard.press('Escape');
    await elevationBox(page, ids.SB36!).click();
    expect(await height(tid(page, 'box-inspector-schedule'))).toBe(40);
    expect(await height(tid(page, 'box-inspector-face').getByRole('button').first())).toBe(30);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    await page.keyboard.press('k');
    await page
      .locator('[data-testid="countertop-overhang-chip"][data-label="C"][data-edge="0"]')
      .click();
    await page.keyboard.press('Escape');
    await tid(page, 'countertop-edit-offered').click();
    const tick = tid(page, 'edit-offered-tick').first();
    await expect(tick).toBeVisible();
    expect(await height(tick)).toBeLessThan(20);
    await expect(tick.locator('xpath=following-sibling::span[1]')).toBeHidden();
    expect(await height(tid(page, 'edit-offered-save'))).toBe(40);
  });

  test(
    'EZD-2003 Import review: rows, modes, group Accept and the typed length box are at least 44 px @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { tenant, ids: project, user } = await editor(EDITOR);
      importTenants.push(tenant);
      const jobId = await makeImport(tenant, project.P1, user.appUserId);
      await signInAs(user.email);
      await page.goto(`/projects/${project.P1}/import/${jobId}`);
      await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', {
        timeout: 60_000,
      });
      // One by one: the to-check row and the east wall's typed length box.
      await page.locator('[data-testid=import-review-mode][data-mode=one_by_one]').click();
      await expect(tid(page, 'import-review-row').first()).toBeVisible();
      await expect(tid(page, 'import-review-typed')).toBeVisible();
      expect(await expectAllTouchTargets(page, tid(page, 'import-review'))).toBeGreaterThanOrEqual(
        6,
      );
      // A typed 10' on the selected 12' 0" wall (tolerance 1/2") leaves the room open: a conflict line in the list.
      await expect(tid(page, 'import-review-scan')).toHaveText(`12' 0"`);
      await tid(page, 'import-review-typed').fill(`10'`);
      await tid(page, 'import-review-typed').press('Enter');
      await expect(tid(page, 'import-review-conflict').first()).toBeVisible();
      expect(await expectAllTouchTargets(page, tid(page, 'import-review'))).toBeGreaterThanOrEqual(
        7,
      );
      // By room: the group Accept.
      await page.locator('[data-testid=import-review-mode][data-mode=by_room]').click();
      await expect(tid(page, 'import-review-accept-room').first()).toBeVisible();
      expect(await expectAllTouchTargets(page, tid(page, 'import-review'))).toBeGreaterThanOrEqual(
        6,
      );
    },
  );

  test(
    "EZD-2003 Edit menu: the plan's menu rows, the save-group dialog and the inspector More are at least 44 px @ipad",
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { ids: project, user } = await editor(EDITOR);
      await signInAs(user.email);
      await openReady(page, project.P1);
      await seedDoor(page);
      await saved(page);

      // The menu a right click (a finger-hold on iPad) opens on the door.
      const door = await at(page, 72, 0);
      await page.mouse.click(door.x, door.y, { button: 'right' });
      await expect(tid(page, 'context-menu')).toBeVisible();
      expect(await expectTouchTargets(page, tid(page, 'context-menu'))).toBeGreaterThanOrEqual(9);

      // Save as group: the name box, Cancel and Save.
      await tid(page, 'menu-save-group').click();
      await expect(tid(page, 'save-group-dialog')).toBeVisible();
      expect(await expectTouchTargets(page, tid(page, 'save-group-dialog'))).toBeGreaterThanOrEqual(
        3,
      );
      await page.keyboard.press('Escape');
      await expect(tid(page, 'save-group-dialog')).toHaveCount(0);

      // The inspector footer's More, and the menu it opens.
      await expect(tid(page, 'inspector-more')).toBeVisible();
      await tid(page, 'inspector-more').evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await expectTouchTargets(page, tid(page, 'inspector-more').locator('xpath=..'));
      await tid(page, 'inspector-more').click();
      await expect(tid(page, 'more-menu')).toBeVisible();
      expect(await expectTouchTargets(page, tid(page, 'more-menu'))).toBeGreaterThanOrEqual(6);
    },
  );

  test(
    'EZD-2003 small editor controls: review list, rail More, Help, pin photo, beam spacing are at least 44 px @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { ids: project, user } = await editor(EDITOR);
      await harnessSql()`select private.add_review_item(${project.P1}::uuid, 'field_conflict', 'e2e-2003')`;
      await signInAs(user.email);
      await openReady(page, project.P1);

      // The review list under the review pill.
      await tid(page, 'review-pill').click();
      await expect(tid(page, 'review-group').first()).toBeVisible();
      await expectTouchTargets(page, tid(page, 'review-list'));
      await page.keyboard.press('Escape');
      await expect(tid(page, 'review-list')).toHaveCount(0);

      // The rail's More tools flyout.
      await page.locator('[data-rail-tool="more-tools"]').click();
      const flyout = page.locator('[data-rail-more]');
      await expect(flyout).toBeVisible();
      expect(await expectTouchTargets(page, flyout)).toBeGreaterThanOrEqual(1);
      await page.keyboard.press('Escape');
      await expect(flyout).toHaveCount(0);

      // Help and its close button.
      await page.keyboard.press('Shift+Slash');
      await expect(tid(page, 'help-close')).toBeVisible();
      await expectTouchTargets(page, tid(page, 'help-close').locator('xpath=..'));
      await tid(page, 'help-close').click();
      await expect(tid(page, 'help-panel')).toHaveCount(0);

      // A moisture pin and its Attach photo button (pins.spec.ts).
      await page.keyboard.press('f');
      await openLeftPanel(page, tid(page, 'pin-kind-damage_moisture'));
      await tid(page, 'pin-kind-damage_moisture').click();
      const drop = await at(page, 150, 60);
      await page.mouse.click(drop.x, drop.y);
      await page.keyboard.press('Escape');
      const head = await at(page, 150, 70);
      await page.mouse.click(head.x, head.y);
      await expect(tid(page, 'pin-photo-attach')).toBeVisible();
      await expectTouchTargets(page, tid(page, 'pin-photo-attach').locator('xpath=..'));
      await page.keyboard.press('Escape');

      // The beam spacing pill and its typed box (ceiling-rcp.spec.ts).
      await seedVaultedRoom(page);
      await saved(page);
      // The rail's Ceiling tool (in the More flyout when the rail is short) switches to the ceiling rail.
      const ceiling = page.locator('[data-rail-tool="ceiling"]');
      if (!(await ceiling.isVisible())) await page.locator('[data-rail-tool="more-tools"]').click();
      await ceiling.click();
      const beamTool = page.locator('[data-rail-tool="beam"]');
      if (!(await beamTool.isVisible()))
        await page.locator('[data-rail-tool="more-tools"]').click();
      await beamTool.click();
      await expect(beamTool).toHaveAttribute('aria-pressed', 'true');
      const beam = await at(page, 72, 30);
      await page.mouse.click(beam.x, beam.y);
      await expect(tid(page, 'beam-spacing-pill')).toBeVisible();
      // The pill floats over the plan at the beam set; the plan is moved down so the set is clear of the edit bar.
      const pillTop = async () => (await tid(page, 'beam-spacing-pill').boundingBox())?.y ?? 0;
      const barBottom = await tid(page, 'edit-bar').evaluate(
        (el) => el.getBoundingClientRect().bottom,
      );
      for (const y of [60, 228]) {
        if ((await pillTop()) > barBottom + 8) break;
        await page.evaluate(
          (vy) =>
            (window as unknown as Window2).__ezdraftPlan.handle.setView({
              x: -48,
              y: vy,
              ppi: 8 / 3,
            }),
          y,
        );
      }
      await expect.poll(pillTop).toBeGreaterThan(barBottom + 8);
      await expectTouchTargets(page, tid(page, 'beam-spacing-pill').locator('xpath=..'));
      await tid(page, 'beam-spacing-pill').click();
      const box = tid(page, 'beam-spacing-input');
      await expect(box).toBeVisible();
      await expectTouchTargets(page, box.locator('xpath=..'));
    },
  );
});
