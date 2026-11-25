// EZD-507 (AC-EZD-507-1 "A light placed on the RCP is the same object id on the plan"; AC-EZD-507-2 "Each device type
// in the scope places and persists"; S05 Controls "Recessed light", "Ceiling fan", "Smoke or CO detector", "Speaker or
// low voltage", "Access panel", "Fixture type tag edit"). Desktop 1600 x 1000, untagged. Each test makes its own company
// with fixture S and its own member; the model is seeded and read through the `__ezdraftEditor` and `__ezdraftPlan`
// test hooks (as ceiling-rcp.spec.ts). No import.meta or __dirname (L-017).
import {
  CURRENT_SCHEMA_VERSION,
  createWallData,
  newRoomAttributes,
  type Point,
} from '@ezdraft/geometry';
import type { Page } from '@playwright/test';
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

type Drawn = { surface: string };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: { drawn(): Drawn; handle: { modelToScreen(p: Point): Point } };
  __ezdraftEditor: {
    objects(): Obj[];
    edit(changes: Array<{ id: string; value: unknown }>): string[];
  };
};

async function fixtureS(permissions: string[]) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, permissions as never);
  return { ids, user, tenant };
}

const id = (page: Page, testId: string) => page.getByTestId(testId);
const rail = (page: Page) => page.locator('[data-shell-region="rail"]');
const tool = (page: Page, t: string) => rail(page).locator(`[data-rail-tool="${t}"]`);
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

const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

async function clickModel(page: Page, p: Point) {
  const box = await page.locator('[data-shell-region="canvas"]').boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (q) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(q),
    p,
  );
  await page.mouse.click(box.x + s.x, box.y + s.y);
}

const devices = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as Window2).__ezdraftEditor
      .objects()
      .filter((o) => o.type === 'device' || o.type === 'access')
      .map((o) => ({
        id: o.id,
        type: o.type,
        kind: (o.data.attributes as { kind: string }).kind,
        typeTag: (o.data.attributes as { typeTag?: string }).typeTag ?? null,
      })),
  );

test.describe('EZD-507 ceiling devices', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-507-1, -2: each ceiling device places on the RCP, persists, and a light is the same object on the plan', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(['view_projects', 'edit_model']);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await seedRoom(page);
    await id(page, 'surface-ceiling').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');

    // A recessed light: a click places it and selects it; its inspector shows the fixture type.
    await tool(page, 'recessed-light').click();
    await expect(tool(page, 'recessed-light')).toHaveAttribute('aria-pressed', 'true');
    await clickModel(page, { x: 36, y: 30 });
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'device');
    await expect(id(page, 'inspector-title')).toHaveText('Recessed light');
    await id(page, 'device-typeTag').fill('A');
    await id(page, 'device-typeTag').press('Enter');
    await id(page, 'device-lumens').fill('800');
    await id(page, 'device-lumens').press('Enter');

    // A fan, then each kind of the tools with a chooser.
    await tool(page, 'ceiling-fan').click();
    await clickModel(page, { x: 72, y: 60 });
    const chosen: Array<[string, string, { x: number; y: number }]> = [
      ['detector', 'smoke_co_detector', { x: 108, y: 30 }],
      ['low-voltage', 'camera', { x: 36, y: 90 }],
      ['access-panel', 'attic_hatch', { x: 108, y: 90 }],
    ];
    for (const [t, kind, p] of chosen) {
      await tool(page, t).click();
      await id(page, `ceiling-device-${kind}`).click();
      await expect(id(page, `ceiling-device-${kind}`)).toHaveAttribute('aria-pressed', 'true');
      await clickModel(page, p);
    }
    const placed = await devices(page);
    expect(placed.map((d) => d.kind).sort()).toEqual(
      ['attic_hatch', 'camera', 'ceiling_fan', 'recessed_light', 'smoke_co_detector'].sort(),
    );
    const light = placed.find((d) => d.kind === 'recessed_light')!;
    expect(light.typeTag).toBe('A');

    // The same light on the floor plan: Floor shows it, and selecting it there selects the one id.
    await id(page, 'surface-floor').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('floor');
    await clickModel(page, { x: 36, y: 30 });
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'device');
    await expect(id(page, 'device-typeTag')).toHaveValue('A');
    expect((await devices(page)).filter((d) => d.kind === 'recessed_light')).toEqual([light]);

    // Persist: after the save, a reload brings every device back under the same ids.
    await saved(page);
    await page.reload();
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await expect.poll(async () => (await devices(page)).length).toBe(placed.length);
    const back = await devices(page);
    expect(new Set(back.map((d) => `${d.id}:${d.kind}`))).toEqual(
      new Set(placed.map((d) => `${d.id}:${d.kind}`)),
    );
  });

  // EZD-515 (AC-EZD-515-1 "A fan closer than the clearance warns"; S05 Validation "Ceiling fan blade clearance to walls
  // and beams", "Hosted ceiling item left off any ceiling surface: red flag"). The owner's Defaults clearance is set to
  // 18" as fixture input; the 52" fan placed 40" off the south wall face has its blade tip 14" off it.
  test('AC-EZD-515-1: a fan closer than the clearance warns; a detector off the ceiling is flagged', async ({
    page,
    signInAs,
  }) => {
    const { ids, user, tenant } = await fixtureS(['view_projects', 'edit_model']);
    await harnessSql()`update public.tenant
      set defaults = coalesce(defaults, '{}'::jsonb) || '{"fan_blade_clearance": 18}'::jsonb
      where id = ${tenant}::uuid`;
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await seedRoom(page);
    await id(page, 'surface-ceiling').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');

    await tool(page, 'ceiling-fan').click();
    await clickModel(page, { x: 60, y: 40 });
    await expect(id(page, 'inspector-title')).toHaveText('Ceiling fan');
    await expect(id(page, 'device-bladeSpan')).toHaveValue('4\' 4"');
    await expect(id(page, 'device-fan-clearance-wall')).toHaveText(
      'Fan blade is 1\' 2" from a wall. Clearance is 1\' 6".',
    );

    // A fan in the middle of the room is clear: 60 - 26 = 34".
    await clickModel(page, { x: 72, y: 60 });
    await expect(id(page, 'inspector-title')).toHaveText('Ceiling fan');
    await expect(id(page, 'device-fan-clearance-wall')).toHaveCount(0);

    // A detector placed outside every room reads Not on a ceiling.
    await tool(page, 'detector').click();
    await clickModel(page, { x: -40, y: 60 });
    await expect(id(page, 'inspector-not-on-ceiling')).toContainText('Not on a ceiling');
  });
});
