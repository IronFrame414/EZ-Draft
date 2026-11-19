// EZD-733 (AC-EZD-733-1 "Changing the start point moves the cuts on the elevation"; phase-07 EZD-733; Q-0769 no
// board; vault/build/assumptions.md EZD-733). Desktop 1600 x 1000. Each test makes its own company (never tenant 1)
// with fixture S and its own member. A 117 1/2" wall with one B15 run is seeded through the editor hook (as
// cabinet-run.spec.ts). Hand figures: the default 12" x 24" tile with a 1/8" joint, laid from the wall's left end,
// has columns every 12 1/8"; the tenth starts at 9 x 12.125 = 109.125" and is cut at 117.5". Started 6" from the
// left, the first bottom-row piece runs 0" to 5 7/8" and is cut, and no column starts at 109.125".
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
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

type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = { __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] } };

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model'] as never);
  return { ids, user };
}

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(page.getByTestId('plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

async function seedRun(page: Page) {
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
  const boxId = crypto.randomUUID();
  const v = (type: string, data: Record<string, unknown>) => ({
    type,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data,
  });
  const changes = [
    { id: wallId, value: v('wall', made.data as unknown as Record<string, unknown>) },
    {
      id: boxId,
      value: v('cabinet_box', {
        status: 'new',
        level,
        attributes: {
          code: 'B15',
          boxType: 'base',
          width: 15,
          depth: 24,
          height: 34.5,
          faceLayout: 'drawer_door_1',
          hingeSide: 'left',
          finishedEnds: 'none',
          catalogItemId: null,
          finish: null,
        },
      }),
    },
    {
      id: crypto.randomUUID(),
      value: v('cabinet_run', {
        geometry: { hostWallId: wallId, start: { x: 0, y: 0 }, axis: { x: 1, y: 0 } },
        level,
        attributes: { name: 'Back wall run', base: [boxId], upper: [] },
      }),
    },
  ];
  const done = await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    changes,
  );
  expect(done.length).toBeGreaterThan(0);
}

// The left x of each cut piece in the bottom row of the elevation tile.
const bottomCuts = (page: Page) =>
  page
    .locator('[data-testid="cabinet-tile"] polygon[data-tile-cut="true"][data-y0="0"]')
    .evaluateAll((els) =>
      [...new Set(els.map((e) => Number(e.getAttribute('data-x0'))))].sort((a, b) => a - b),
    );

test.describe('EZD-733 Tile layout', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-733-1 changing the start point moves the cuts on the elevation', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await seedRun(page);
    await expect(page.getByTestId('save-state')).toHaveText('Saved just now', { timeout: 15_000 });

    await page.keyboard.press('c');
    await expect(page.getByTestId('cabinet-run-name')).toHaveText('Back wall run');
    await page.getByTestId('cabinet-tile-add').click();
    await expect(page.getByTestId('cabinet-tile')).toBeVisible();
    await expect(page.getByTestId('cabinet-tile-start-left')).toHaveValue('0"');
    await expect.poll(() => bottomCuts(page)).toEqual([109.125]);

    const start = page.getByTestId('cabinet-tile-start-left');
    await start.fill('6');
    await start.press('Enter');
    await expect(start).toHaveValue('6"');
    await expect.poll(() => bottomCuts(page)).toEqual([0, 6 + 9 * 12.125]);
    const stored = await page.evaluate(() =>
      (window as unknown as Window2).__ezdraftEditor
        .objects()
        .filter((o) => o.type === 'tile_layout'),
    );
    expect(stored).toHaveLength(1);
    expect((stored[0]!.data.geometry as { start: unknown }).start).toEqual({ x: 6, y: 0 });
  });
});
