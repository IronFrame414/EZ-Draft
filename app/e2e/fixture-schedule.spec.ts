// EZD-508 (AC-EZD-508-1 "Counts update when lights are placed or deleted."; S05 Controls "Fixture schedule rows | Left
// panel | One row per type tag (A, F, S, T): tag, description, count. Click selects all fixtures of that type on
// canvas."; board S05Ceiling "Fixture schedule", "×8"; vault/build/assumptions.md EZD-508 untagged lights in a "—"
// row). Desktop 1600 x 1000, untagged. Own company with fixture S and its own member; the room is seeded through the
// `__ezdraftEditor` test hook and the lights placed with the Recessed light tool (as ceiling-devices.spec.ts). No
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

const rows = (page: Page) => id(page, 'fixture-schedule-row');

test.describe('EZD-508 fixture schedule', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-508-1: the schedule count goes up as lights are placed and down as one is deleted; a row press selects its lights', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(['view_projects', 'edit_model']);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await seedRoom(page);
    await id(page, 'surface-ceiling').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');
    await expect(id(page, 'fixture-schedule')).toContainText('Fixture schedule');
    await expect(rows(page)).toHaveCount(0);

    await tool(page, 'recessed-light').click();
    await clickModel(page, { x: 36, y: 30 });
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('×1');
    await clickModel(page, { x: 108, y: 30 });
    await expect(rows(page).first()).toContainText('×2');
    await clickModel(page, { x: 36, y: 90 });
    await expect(rows(page).first()).toContainText('—');
    await expect(rows(page).first()).toContainText('Recessed light');
    await expect(rows(page).first()).toContainText('×3');

    // Delete one light (a model edit through the editor's test hook, as the room is seeded); the count drops.
    const lights = (await devices(page)).filter((d) => d.kind === 'recessed_light');
    await page.evaluate(
      (gone) => (window as unknown as Window2).__ezdraftEditor.edit([{ id: gone, value: null }]),
      lights[2]!.id,
    );
    await expect(rows(page).first()).toContainText('×2');

    // Tag one light A in its inspector: rows A and "—", one light each.
    await page.keyboard.press('Escape');
    await clickModel(page, { x: 36, y: 30 });
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'device');
    await id(page, 'device-typeTag').fill('A');
    await id(page, 'device-typeTag').press('Enter');
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(0)).toContainText('A');
    await expect(rows(page).nth(0)).toContainText('×1');
    await expect(rows(page).nth(1)).toContainText('—');
    await expect(rows(page).nth(1)).toContainText('×1');

    // A row press selects the row's lights in place of the selection: "—" selects the untagged light, A the tagged.
    await rows(page).nth(1).click();
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'device');
    await expect(id(page, 'device-typeTag')).toHaveValue('');
    await rows(page).nth(0).click();
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'device');
    await expect(id(page, 'device-typeTag')).toHaveValue('A');
  });
});
