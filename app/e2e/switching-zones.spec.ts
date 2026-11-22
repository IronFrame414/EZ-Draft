// EZD-510 (AC-EZD-510-1 "Zones draw and save with the room"; AC-EZD-510-2 "A dimmer zone draws with its dimmer mark";
// S05 Controls "Switching zones | Left panel, Lighting | Draws switching zones and dimmers on the RCP (dashed accent
// lines). | Edit model."; board S05Ceiling left panel "Lighting", "Switching zones"; legend "Switch zone" in
// --ez-cobalt). Desktop 1600 x 1000, untagged. The test makes its own company with fixture S and its own member; the
// room is seeded and the model and the drawn batches read through the `__ezdraftEditor` and `__ezdraftPlan` test
// hooks. The dimmer mark's letters are text (not in the drawn batches); its items are proved in
// src/editor/tools/switch-zone.test.tsx. No import.meta or __dirname (L-017).
import {
  CURRENT_SCHEMA_VERSION,
  createWallData,
  newRoomAttributes,
  type Point,
} from '@ezdraft/geometry';
import type { Page } from '@playwright/test';
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
type Zone = { geometry: { roomId: string; boundary: Point[] }; attributes: { dimmer: boolean } };

async function fixtureS(permissions: string[]) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, permissions as never);
  return { ids, user };
}

const id = (page: Page, testId: string) => page.getByTestId(testId);
const drawn = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.drawn());
const objects = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });
// The zone outline: the accent (`new`) layer's dashed (`hidden`) lines; the seeded room and walls are Existing.
const ZONE_BATCH = 'new:segments:hidden';
const zoneBatch = async (page: Page) =>
  (await drawn(page)).batches.find((b) => b.key === ZONE_BATCH) ?? null;

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

async function clickModel(page: Page, p: Point) {
  const box = await page.locator('[data-shell-region="canvas"]').boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (q) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(q),
    p,
  );
  await page.mouse.click(box.x + s.x, box.y + s.y);
}

// A closed 144 x 120 room with its four Existing walls, in one edit (as ceiling-rcp.spec.ts). Returns the room id.
async function seedRoom(page: Page): Promise<string> {
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
  const roomId = crypto.randomUUID();
  const room = {
    id: roomId,
    value: {
      type: 'room',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: {
        geometry: { boundary: ring },
        status: 'existing',
        level,
        attributes: newRoomAttributes('Family room'),
        closureOverride: null,
      },
    },
  };
  await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    [...walls, room],
  );
  return roomId;
}

const zones = async (page: Page) =>
  (await objects(page))
    .filter((o) => o.type === 'switch_zone')
    .map((o) => ({ id: o.id, data: o.data as unknown as Zone }));

test.describe('EZD-510 Switching zones', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-510-1, -2: a dimmer zone draws in the accent and saves with its room', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(['view_projects', 'edit_model']);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const roomId = await seedRoom(page);
    await id(page, 'surface-ceiling').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');
    expect(await zoneBatch(page)).toBeNull();

    // Lighting › Switching zones turns the tool on; Dimmer goes on the next zone.
    await expect(id(page, 'ceiling-lighting')).toContainText('Lighting');
    await id(page, 'switching-zones').click();
    await expect(id(page, 'switching-zones')).toHaveAttribute('aria-pressed', 'true');
    await expect(id(page, 'switching-zones-hint')).toHaveText(
      'Click to draw a zone. Click the first point to close.',
    );
    await id(page, 'switching-zones-dimmer').check();

    const corners: Point[] = [
      { x: 24, y: 24 },
      { x: 96, y: 24 },
      { x: 96, y: 72 },
      { x: 24, y: 72 },
    ];
    for (const p of corners) await clickModel(page, p);
    await clickModel(page, corners[0]!);

    // Saved on the room, selected, with its Dimmer box on; drawn dashed in the legend's accent.
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'switch_zone');
    await expect(id(page, 'inspector-title')).toHaveText('Switching zone');
    await expect(id(page, 'switch-zone-dimmer')).toBeChecked();
    const made = await zones(page);
    expect(made).toHaveLength(1);
    const zone = made[0]!;
    expect(zone.data.geometry.roomId.toLowerCase()).toBe(roomId.toLowerCase());
    expect(zone.data.geometry.boundary).toHaveLength(4);
    expect(zone.data.attributes.dimmer).toBe(true);
    // The page works the token out on its own; compare to six places.
    const accent = tokenRgb('--ez-cobalt');
    await expect
      .poll(async () => (await zoneBatch(page))?.color ?? null)
      .toEqual({
        r: expect.closeTo(accent.r, 6),
        g: expect.closeTo(accent.g, 6),
        b: expect.closeTo(accent.b, 6),
      });

    // The inspector turns the dimmer off and on, one edit each.
    await id(page, 'switch-zone-dimmer').uncheck();
    await expect.poll(async () => (await zones(page))[0]!.data.attributes.dimmer).toBe(false);
    await id(page, 'switch-zone-dimmer').check();
    await expect.poll(async () => (await zones(page))[0]!.data.attributes.dimmer).toBe(true);

    // Persist: after the save, a reload brings the zone back on its room and draws it again.
    await saved(page);
    await page.reload();
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await expect.poll(async () => (await zones(page)).length).toBe(1);
    const back = (await zones(page))[0]!;
    expect(back.id).toBe(zone.id);
    expect(back.data.geometry.roomId.toLowerCase()).toBe(roomId.toLowerCase());
    expect(back.data.attributes.dimmer).toBe(true);
    await id(page, 'surface-ceiling').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');
    await expect.poll(async () => (await zoneBatch(page)) !== null).toBe(true);
    // A click inside the zone selects it again.
    await clickModel(page, { x: 60, y: 48 });
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'switch_zone');
  });

  test('S05 view only: without Edit model the Switching zones button is disabled', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(['view_projects']);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await id(page, 'surface-ceiling').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');
    await expect(id(page, 'switching-zones')).toBeDisabled();
  });
});
