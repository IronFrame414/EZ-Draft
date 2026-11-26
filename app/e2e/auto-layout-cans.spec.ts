// EZD-509 (AC-EZD-509-2 "by count 8 returns an even grid of 8", AC-EZD-509-3 "Nothing is placed until the user
// confirms the preview."; S05 Controls "Auto-layout cans | Left panel, Lighting | ... Result shown for confirmation before
// it is committed"; vault/build/assumptions/EZD-509.md "Confirm step" and the worked example "8 cans in 20' x 16' -> 4 x 2
// at x = 2' 6", 7' 6", 12' 6", 17' 6" and y = 4' 0", 12' 0""). Desktop 1600 x 1000, untagged. Own company with fixture S
// and its own member; the room is seeded through the `__ezdraftEditor` test hook (as fixture-schedule.spec.ts). No
// import.meta or __dirname (L-017).
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
  return { ids, user };
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

// A closed 240 x 192 room (20' x 16', 320 sf, assumption EZD-509's worked example) with its four Existing walls, in
// one edit (as fixture-schedule.spec.ts).
async function seedRoom(page: Page) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const ring: Point[] = [
    { x: 0, y: 0 },
    { x: 240, y: 0 },
    { x: 240, y: 192 },
    { x: 0, y: 192 },
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
        attributes: newRoomAttributes('Family room'),
        closureOverride: null,
      },
    },
  };
  await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    [...walls, room],
  );
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
        point: (o.data.geometry as { point?: Point }).point ?? null,
      })),
  );

const rows = (page: Page) => id(page, 'fixture-schedule-row');
const lights = async (page: Page) => (await devices(page)).filter((d) => d.kind === 'recessed_light');

test.describe('EZD-509 auto-layout cans', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-509-3: the preview places nothing; Cancel drops it; Place adds the even grid of 8 as one undo step', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(['view_projects', 'edit_model']);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await seedRoom(page);
    await id(page, 'surface-ceiling').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');

    // Open auto-layout by count: the preview reads 8 cans and the model still has none.
    await expect(id(page, 'auto-layout-cans')).toContainText('Auto-layout cans');
    await id(page, 'auto-layout-cans').click();
    await expect(id(page, 'auto-layout-mode-count')).toHaveAttribute('aria-pressed', 'true');
    await id(page, 'auto-layout-count').fill('8');
    await expect(id(page, 'auto-layout-result')).toHaveText('8 cans');
    await expect(id(page, 'auto-layout-place')).toHaveText('Place 8 cans');
    expect(await lights(page)).toHaveLength(0);
    await expect(rows(page)).toHaveCount(0);

    // Cancel: the panel closes and nothing was placed.
    await id(page, 'auto-layout-cancel').click();
    await expect(id(page, 'auto-layout-panel')).toHaveCount(0);
    expect(await lights(page)).toHaveLength(0);

    // Again, and Place: 8 cans on the worked example's grid, counted in the fixture schedule.
    await id(page, 'auto-layout-cans').click();
    await id(page, 'auto-layout-count').fill('8');
    await id(page, 'auto-layout-place').click();
    await expect(id(page, 'auto-layout-panel')).toHaveCount(0);
    await expect.poll(async () => (await lights(page)).length).toBe(8);
    const at = (await lights(page)).map((d) => `${d.point!.x},${d.point!.y}`).sort();
    const want = [30, 90, 150, 210].flatMap((x) => [48, 144].map((y) => `${x},${y}`)).sort();
    expect(at).toEqual(want);
    await expect(rows(page).first()).toContainText('×8');

    // One undo step takes all 8 away.
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await lights(page)).length).toBe(0);
  });

  test('without Edit model the Auto-layout cans button is disabled', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS(['view_projects']);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await id(page, 'surface-ceiling').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');
    await expect(id(page, 'auto-layout-cans')).toBeDisabled();
  });
});
