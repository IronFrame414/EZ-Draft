// EZD-502 (AC-EZD-502-1 "Both shows the RCP over a greyed floor plan with the ceiling rail"; S05 Entry points "the
// Ceiling tool (roofing icon) in the standard tool rail", "left panel segment Ceiling or Both"; S05 Layout ceiling rail
// list, "legend chip bottom left", "Status bar adds View, Scale and Joists status", Existing/Proposed toggle kept;
// S05 States "Locked / view-only: Rail tools other than Select disabled"; board S05Ceiling). Desktop 1600 x 1000,
// untagged. Each test makes its own company with fixture S and its own member; the model is seeded and the drawn
// batches read through the `__ezdraftEditor` and `__ezdraftPlan` test hooks. No import.meta or __dirname (L-017).
// EZD-505 (AC-EZD-505-1 "A level beam above the ridge shows a warning"; S05 Controls "Beam", inspector beams, spacing
// pill; S05 Validation): the Beam tool places a set in a vaulted room (ridge 13' 0", walls 8' 0"); typing a Height
// AFF above the ridge shows the warning in the inspector.
// EZD-506 (AC-EZD-506-1 "The preview updates when Height AFF changes"; S05 Controls "Section A-A preview"; board
// S05Ceiling "beams 9' 0"", "ridge 13' 0""): the section under the beam fields re-draws when Height AFF is typed.
// EZD-503 (S05 Controls "Room ceiling summary", "Change ceiling ... Heights accept typed formats", "Read heights from
// scan ... Only when a GLB mesh exists for the project"; S05 Validation "Typed heights: invalid format shows inline
// error, value not applied"): the left panel's summary follows a Change ceiling save. AC-EZD-503-1 (the scan fill)
// is proved on the fixture GLB in src/editor/ceiling/room-ceiling.test.ts.
import {
  CURRENT_SCHEMA_VERSION,
  createWallData,
  newRoomAttributes,
  type Point,
} from '@ezdraft/geometry';
import type { Page } from '@playwright/test';
import { GREYED_FLOOR_TOKEN } from '../src/editor/ceiling/rcp';
import { tokenRgb } from '../src/editor/plan/color';
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

type Rgb = { r: number; g: number; b: number };
type Drawn = { surface: string; batches: Array<{ key: string; color: Rgb; order: number }> };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: { drawn(): Drawn; handle: { modelToScreen(p: Point): Point } };
  __ezdraftEditor: {
    objects(): Obj[];
    edit(changes: Array<{ id: string; value: unknown }>): string[];
  };
};

const CEILING_RAIL = [
  'select',
  'ceiling-type',
  'beam',
  'recessed-light',
  'ceiling-fan',
  'act-grid',
  'hvac',
  'detector',
  'low-voltage',
  'access-panel',
  'soffit',
  'tag',
];

async function fixtureS(permissions: string[]) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, permissions as never);
  return { ids, user };
}

const id = (page: Page, testId: string) => page.getByTestId(testId);
const rail = (page: Page) => page.locator('[data-shell-region="rail"]');
const tool = (page: Page, t: string) => rail(page).locator(`[data-rail-tool="${t}"]`);
const topIds = (page: Page) =>
  rail(page)
    .locator('[data-rail="top"] [data-rail-tool]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-rail-tool')));
const drawn = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.drawn());

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

// A closed 144 x 120 room with its four Existing walls, in one edit (as left-panel.spec.ts). EZD-505: `vaulted` gives
// it a ridge east-west at 13' 0".
async function seedRoom(page: Page, vaulted = false) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
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
      value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
    };
  });
  const room = {
    id: crypto.randomUUID(),
    value: {
      type: 'room',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: {
        geometry: { boundary: ring },
        status: 'existing',
        level,
        attributes: vaulted
          ? {
              ...newRoomAttributes('Family room'),
              ceilingType: 'vaulted',
              ceiling: {
                heightsBy: 'pitch',
                wallHeights: [],
                pointHeights: [],
                pitch: 9.4,
                ridge: { start: { x: 0, y: 60 }, end: { x: 144, y: 60 }, height: 156 },
              },
            }
          : newRoomAttributes('Family room'),
        closureOverride: null,
      },
    },
  };
  await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    [...walls, room],
  );
}

const floorBatches = (d: Drawn) => d.batches.filter((b) => b.key.startsWith('floor:'));
const rcpBatches = (d: Drawn) => d.batches.filter((b) => !b.key.startsWith('floor:'));

test.describe('EZD-502 RCP view and ceiling rail', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-502-1: Both shows the RCP over a greyed floor plan with the ceiling rail', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(['view_projects', 'edit_model']);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await seedRoom(page);

    await expect(id(page, 'surface-floor')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => floorBatches(await drawn(page)).length).toBe(0);
    await id(page, 'surface-both').click();
    await expect(id(page, 'surface-both')).toHaveAttribute('aria-pressed', 'true');
    await expect(id(page, 'left-panel')).toHaveAttribute('data-surface', 'both');

    // The ceiling rail, in the S05 order, Select on.
    await expect.poll(() => topIds(page)).toEqual(CEILING_RAIL);
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    for (const t of CEILING_RAIL) await expect(tool(page, t)).toBeEnabled();

    // The RCP over the floor plan drawn in one grey, under it.
    await expect.poll(async () => (await drawn(page)).surface).toBe('both');
    const d = await drawn(page);
    const grey = tokenRgb(GREYED_FLOOR_TOKEN);
    expect(floorBatches(d).length).toBeGreaterThan(0);
    expect(rcpBatches(d).length).toBeGreaterThan(0);
    for (const b of floorBatches(d)) expect(b.color).toEqual(grey);
    expect(Math.max(...floorBatches(d).map((b) => b.order))).toBeLessThan(
      Math.min(...rcpBatches(d).map((b) => b.order)),
    );

    // Legend chip; status bar View and Joists, with the Existing/Proposed toggle and Scale kept.
    await expect(id(page, 'ceiling-legend')).toContainText('Switch zone');
    await expect(id(page, 'status-ceiling-view')).toHaveText('Reflected ceiling plan');
    await expect(id(page, 'status-joists')).toHaveText('unknown · beam clash checks off');
    await expect(id(page, 'status-phase')).toBeVisible();
    await expect(id(page, 'status-scale')).toBeVisible();

    // A ceiling tool turns on; Esc goes back to Select; W does not turn on a floor tool.
    await tool(page, 'beam').click();
    await expect(tool(page, 'beam')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('w');
    await expect(id(page, 'typed-bar')).toHaveCount(0);
    expect(await topIds(page)).toEqual(CEILING_RAIL);

    // Floor: the standard rail with the Ceiling tool; no grey, no legend.
    await id(page, 'surface-floor').click();
    await expect(tool(page, 'ceiling')).toBeVisible();
    await expect(tool(page, 'wall')).toBeVisible();
    await expect.poll(async () => (await drawn(page)).surface).toBe('floor');
    expect(floorBatches(await drawn(page))).toHaveLength(0);
    await expect(id(page, 'ceiling-legend')).toHaveCount(0);
    await expect(id(page, 'status-joists')).toHaveCount(0);

    // The Ceiling tool on the standard rail switches to Ceiling: the RCP alone, the ceiling rail.
    await tool(page, 'ceiling').click();
    await expect(id(page, 'surface-ceiling')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => topIds(page)).toEqual(CEILING_RAIL);
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');
    const c = await drawn(page);
    expect(floorBatches(c)).toHaveLength(0);
    expect(rcpBatches(c).length).toBeGreaterThan(0);
  });

  test('S05 view only: the segment works without Edit model; on the ceiling rail only Select is on', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(['view_projects']);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await expect(tool(page, 'ceiling')).toBeEnabled();
    await id(page, 'surface-both').click();
    await expect.poll(() => topIds(page)).toEqual(CEILING_RAIL);
    await expect(tool(page, 'select')).toBeEnabled();
    for (const t of CEILING_RAIL.slice(1)) await expect(tool(page, t)).toBeDisabled();
    await expect.poll(async () => (await drawn(page)).surface).toBe('both');
  });

  test('AC-EZD-505-1: a level beam above the ridge shows a warning', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS(['view_projects', 'edit_model']);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await seedRoom(page, true);
    await id(page, 'surface-ceiling').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');

    // The Beam tool: a click in the room places a set there and selects it.
    await tool(page, 'beam').click();
    await expect(tool(page, 'beam')).toHaveAttribute('aria-pressed', 'true');
    const box = await page.locator('[data-shell-region="canvas"]').boundingBox();
    if (!box) throw new Error('canvas region has no box');
    const s = await page.evaluate(
      (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
      { x: 72, y: 30 },
    );
    await page.mouse.click(box.x + s.x, box.y + s.y);
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'beam');
    await expect(id(page, 'inspector-title')).toHaveText('Faux beams');
    // 144" across the ridge at 4' 0" o.c.: 3 beams; Height AFF at the 8' 0" plate, no warning.
    await expect(id(page, 'inspector-subtitle')).toHaveText('3 beams · Family room');
    await expect(id(page, 'beam-heightAff')).toHaveValue('8\' 0"');
    await expect(id(page, 'beam-spacing-pill')).toHaveText('4\' 0" o.c.');
    await expect(page.locator('[data-testid^="beam-warning-"]')).toHaveCount(0);
    const beams = await page.evaluate(() =>
      (window as unknown as Window2).__ezdraftEditor.objects().filter((o) => o.type === 'beam'),
    );
    expect(beams).toHaveLength(1);

    // Height AFF 13' 6" is above the 13' 0" ridge: the warning shows.
    await id(page, 'beam-heightAff').fill('13\' 6"');
    await id(page, 'beam-heightAff').press('Enter');
    await expect(id(page, 'beam-warning-above_ridge')).toContainText('Beams above the ridge');
    // Back to 9' 0": the warning goes.
    await id(page, 'beam-heightAff').fill("9'");
    await id(page, 'beam-heightAff').press('Enter');
    await expect(id(page, 'beam-warning-above_ridge')).toHaveCount(0);
  });

  test('AC-EZD-506-1: the Section A-A preview updates when Height AFF changes', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(['view_projects', 'edit_model']);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await seedRoom(page, true);
    await id(page, 'surface-ceiling').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');
    await tool(page, 'beam').click();
    const box = await page.locator('[data-shell-region="canvas"]').boundingBox();
    if (!box) throw new Error('canvas region has no box');
    const s = await page.evaluate(
      (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
      { x: 72, y: 30 },
    );
    await page.mouse.click(box.x + s.x, box.y + s.y);
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'beam');

    // Placed at the 8' 0" plate under the 13' 0" ridge.
    await expect(id(page, 'beam-section')).toContainText('Section A-A');
    await expect(id(page, 'beam-section-beams-label')).toHaveText('beams 8\' 0"');
    await expect(id(page, 'beam-section-ridge-label')).toHaveText('ridge 13\' 0"');
    const before = await id(page, 'beam-section-beam').getAttribute('points');

    await id(page, 'beam-heightAff').fill("9'");
    await id(page, 'beam-heightAff').press('Enter');
    await expect(id(page, 'beam-section-beams-label')).toHaveText('beams 9\' 0"');
    await expect(id(page, 'beam-section-beam')).not.toHaveAttribute('points', before ?? '');
    await expect(id(page, 'beam-section-ridge-label')).toHaveText('ridge 13\' 0"');
  });

  test('EZD-503: Change ceiling saves a vaulted ceiling and the summary follows', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(['view_projects', 'edit_model']);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await seedRoom(page);
    await id(page, 'surface-ceiling').click();

    // S05 Empty: no ceiling set reads flat at the 8' 0" walls. No GLB, so no Read heights from scan.
    await expect(id(page, 'room-ceiling-heading')).toHaveText('Family room ceiling');
    await expect(id(page, 'room-ceiling-type')).toHaveText('Flat');
    await expect(id(page, 'room-ceiling-heights')).toHaveText('walls 8\' 0"');
    await id(page, 'room-ceiling-change').click();
    await expect(id(page, 'ceiling-editor')).toBeVisible();
    await expect(id(page, 'ceiling-editor-read-scan')).toHaveCount(0);

    await id(page, 'ceiling-editor-type').selectOption('vaulted');
    await id(page, 'ceiling-editor-ridge-direction').selectOption('east_west');
    await expect(id(page, 'ceiling-editor-wall-0')).toHaveValue('8\' 0"');
    // An invalid height shows its error and nothing is saved.
    await id(page, 'ceiling-editor-ridge').fill('tall');
    await id(page, 'ceiling-editor-save').click();
    await expect(id(page, 'ceiling-editor-ridge-error')).toBeVisible();
    await expect(id(page, 'room-ceiling-type')).toHaveText('Flat');

    // 12' 0" over 8' 0" walls with the ridge across the middle of 120": 12 x 48 / 60 = 9.6/12.
    await id(page, 'ceiling-editor-ridge').fill('144"');
    await id(page, 'ceiling-editor-save').click();
    await expect(id(page, 'ceiling-editor')).toHaveCount(0);
    await expect(id(page, 'room-ceiling-type')).toHaveText('Vaulted, ridge east-west');
    await expect(id(page, 'room-ceiling-heights')).toHaveText(
      'walls 8\' 0" · ridge 12\' 0" · 9.6/12',
    );
    const room = await page.evaluate(() =>
      (window as unknown as Window2).__ezdraftEditor.objects().find((o) => o.type === 'room'),
    );
    const attrs = (
      room!.data as { attributes: { ceilingType: string; ceiling: { ridge: unknown } } }
    ).attributes;
    expect(attrs.ceilingType).toBe('vaulted');
    expect(attrs.ceiling.ridge).toEqual({
      start: { x: 0, y: 60 },
      end: { x: 144, y: 60 },
      height: 144,
    });
  });
});
