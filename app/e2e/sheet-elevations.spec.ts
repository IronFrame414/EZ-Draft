// EZD-707 (AC-EZD-707-1 "A4.0 shows each run's elevation"; AC-EZD-707-3 "Add elevation adds a wall that has no
// cabinets"; R24; 09h "1/2\" = 1'-0\" elevations"). Desktop 1600 x 1000, untagged. Fixture S (P1 starts with "Floor
// 1") in its own company with a member who may edit the model. A 144 x 120 in room of four walls is added through the
// editor test hook, with a cabinet run of one B24 on the first wall. At 1/2" = 1'-0" one model inch is 1/24 paper
// inch, so the B24 prints 1" wide.
import { CURRENT_SCHEMA_VERSION, createWallData, type Point } from '@ezdraft/geometry';
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

type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = { __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] } };

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true });
const P = (x: number, y: number): Point => ({ x, y });
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model'] as never);
  return { ids, user };
}

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

// The room's four walls and a run of one B24 on the first; returns the wall ids and the box id.
async function addKitchen(page: Page): Promise<{ walls: string[]; box: string }> {
  const objects = await page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
  const level = objects.find((o) => o.type === 'floor')!.id;
  const pts = [P(0, 0), P(144, 0), P(144, 120), P(0, 120), P(0, 0)];
  const changes: { id: string; value: unknown }[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const made = createWallData({ start: pts[i]!, end: pts[i + 1]!, level, thicknessSide: 'right' });
    if (!made.ok) throw new Error('wall data');
    changes.push({ id: crypto.randomUUID(), value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data } });
  }
  const box = crypto.randomUUID();
  changes.push({
    id: box,
    value: {
      type: 'cabinet_box',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: {
        status: 'new',
        level,
        attributes: {
          code: 'B24',
          boxType: 'base',
          width: 24,
          depth: 24,
          height: 34.5,
          faceLayout: 'door_1',
          hingeSide: 'left',
          finishedEnds: 'none',
          catalogItemId: null,
          finish: null,
        },
      },
    },
  });
  changes.push({
    id: crypto.randomUUID(),
    value: {
      type: 'cabinet_run',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: {
        geometry: { hostWallId: changes[0]!.id, start: P(0, 0), axis: P(1, 0) },
        level,
        attributes: { name: 'Back wall run', base: [box], upper: [] },
      },
    },
  });
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);
  return { walls: changes.slice(0, 4).map((c) => c.id), box };
}

test.describe('EZD-707 Elevations sheet', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-707 AC-1 AC-3 A4.0 shows the run elevation; Add elevation adds a wall with no cabinets, kept on reload', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const { walls, box } = await addKitchen(page);
    await saved(page);

    await tab(page, 'Sheets').click();
    await id(page, 'sheet-row-A4.0').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'A4.0');
    const drawing = id(page, 'sheet-drawing');
    await expect(drawing.locator(`line[data-object-id="${walls[0]}"]`).first()).toBeAttached();
    // The B24's bottom edge is 24/24 = 1 paper inch long.
    const widths = await drawing.locator(`line[data-object-id="${box}"]`).evaluateAll((els) =>
      els.map((e) => Math.abs(Number(e.getAttribute('x2')) - Number(e.getAttribute('x1')))),
    );
    expect(widths.map((w) => Math.round(w * 1000) / 1000)).toContain(1);
    await expect(drawing.getByText('ELEVATION A')).toBeAttached();
    // The cabinet schedule prints under the elevations: one row for the B24.
    await expect(drawing.getByText('CABINET SCHEDULE', { exact: true })).toBeAttached();
    await expect(drawing.getByText('B24', { exact: true })).toBeAttached();
    await expect(drawing.locator(`[data-object-id="${walls[1]}"]`)).toHaveCount(0);
    await expect(id(page, 'status-sheet-scale')).toHaveText(`1/2" = 1'-0"`);

    await id(page, 'sheet-elevation-add').selectOption(walls[1]!);
    await expect(drawing.locator(`line[data-object-id="${walls[1]}"]`).first()).toBeAttached();
    await expect(drawing.getByText('ELEVATION B')).toBeAttached();
    await saved(page);

    await page.reload();
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await tab(page, 'Sheets').click();
    await id(page, 'sheet-row-A4.0').click();
    await expect(drawing.locator(`line[data-object-id="${walls[1]}"]`).first()).toBeAttached();
    await expect(drawing.locator(`line[data-object-id="${box}"]`).first()).toBeAttached();
  });
});
