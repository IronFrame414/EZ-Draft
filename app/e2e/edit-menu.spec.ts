// EZD-233 (AC-EZD-233-1 "A mirrored door swaps hand"; AC-EZD-233-2 "a saved group places again"; S03 Canvas
// interactions "Right-click / long-press: Context menu"; S03 Inspector "More"; R26 Saved section of the Fixtures
// panel). Local stack, real sign-in, fixture S, as edit-commands.spec.ts. The model is written through the editor hook
// from geometry package data. Expected values worked by hand: the saved lavatory at (60,60) and its water point at
// (60,75) centre on (60,67.5), so a copy placed anywhere keeps the point 15" above the lavatory.
import {
  CURRENT_SCHEMA_VERSION,
  createOpeningData,
  createWallData,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
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

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, EDITOR as never);
  return { ids, user };
}

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: { handle: { setView(v: View): void; modelToScreen(p: Point): Point } };
  __ezdraftSelection: { ids(): string[] };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
};

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
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

async function at(page: Page, x: number, y: number): Promise<Point> {
  const box = await page.locator('[data-shell-region="canvas"]').boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
    { x, y },
  );
  return { x: box.x + s.x, y: box.y + s.y };
}

const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const ofType = async (page: Page, type: string) =>
  (await objects(page)).filter((o) => o.type === type);
const floorOf = async (page: Page) => {
  const f = (await objects(page)).find((o) => o.type === 'floor');
  if (!f) throw new Error('no floor');
  return f.id;
};
const edit = (page: Page, changes: unknown[]) =>
  page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);

test.describe('EZD-233 context menu', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-233-1 right-click on a door, Mirror: its hand swaps and its swing stays; Undo puts it back', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);

    const level = await floorOf(page);
    const made = createWallData({ start: { x: 0, y: 0 }, end: { x: 144, y: 0 }, level });
    if (!made.ok) throw new Error('wall data');
    const wall: WallObject = { id: crypto.randomUUID(), type: 'wall', data: made.data };
    const doorId = crypto.randomUUID();
    await edit(page, [
      { id: wall.id, value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: wall.data } },
      {
        id: doorId,
        value: {
          type: 'opening',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: createOpeningData({ kind: 'door', host: wall, center: { x: 72, y: 0 } }),
        },
      },
    ]);
    const door = async () =>
      (await objects(page)).find((o) => o.id === doorId)!.data.attributes as {
        hand: string;
        swing: string;
      };
    expect(await door()).toMatchObject({ hand: 'left', swing: 'left' });

    const p = await at(page, 72, 0);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    const menu = id(page, 'context-menu');
    await expect(menu).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids()))
      .toEqual([doorId]);
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Copy',
      'Paste',
      'Duplicate',
      'Mirror',
      'Align▸',
      'Group',
      'Save as group',
      'Set status▸',
      'Delete',
    ]);
    await id(page, 'menu-mirror').click();
    await expect(menu).toHaveCount(0);
    await expect.poll(door).toMatchObject({ hand: 'right', swing: 'left' });

    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(door).toMatchObject({ hand: 'left', swing: 'left' });

    // The inspector's More has Copy, Mirror, Align, Group, Save as group and Delete.
    await id(page, 'inspector-more').click();
    await expect(id(page, 'more-menu').getByRole('menuitem')).toHaveText([
      'Copy',
      'Mirror',
      'Align▸',
      'Group',
      'Save as group',
      'Delete',
    ]);
    await id(page, 'menu-mirror').click();
    await expect.poll(door).toMatchObject({ hand: 'right', swing: 'left' });
  });

  test('AC-EZD-233-2 Save as group, then the Saved section of Fixtures places it again with new ids', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);

    const level = await floorOf(page);
    const lavId = crypto.randomUUID();
    const waterId = crypto.randomUUID();
    await edit(page, [
      {
        id: lavId,
        value: {
          type: 'fixture',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: {
            geometry: { center: { x: 60, y: 60 }, axis: { x: 1, y: 0 } },
            status: 'new',
            level,
            attributes: { kind: 'lavatory', width: 20, depth: 18 },
          },
        },
      },
      {
        id: waterId,
        value: {
          type: 'utility_point',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: {
            geometry: { point: { x: 60, y: 75 } },
            status: 'new',
            level,
            attributes: { kind: 'water', volts: null, amps: null, servesObjectId: null },
          },
        },
      },
    ]);

    // Select both, then Group: a click on either selects the pair.
    const lav = await at(page, 54, 57);
    await page.mouse.click(lav.x, lav.y);
    const water = await at(page, 60, 75);
    await page.keyboard.down('Shift');
    await page.mouse.click(water.x, water.y);
    await page.keyboard.up('Shift');
    const selected = () =>
      page.evaluate(() => [...(window as unknown as Window2).__ezdraftSelection.ids()].sort());
    await expect.poll(selected).toEqual([lavId, waterId].sort());
    await page.mouse.click(lav.x, lav.y, { button: 'right' });
    await id(page, 'menu-group').click();
    await expect.poll(async () => (await ofType(page, 'group')).length).toBe(1);
    await page.mouse.click(0, 0);
    await page.mouse.click(water.x, water.y);
    await expect.poll(selected).toEqual([lavId, waterId].sort());

    await page.mouse.click(lav.x, lav.y, { button: 'right' });
    await id(page, 'menu-save-group').click();
    const dialog = id(page, 'save-group-dialog');
    await expect(dialog).toBeVisible();
    await id(page, 'save-group-name').fill('Vanity set');
    await id(page, 'save-group-save').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Saved to Saved groups.')).toBeVisible();

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('f');
    const saved = page.getByTestId('saved-group');
    await expect(saved).toHaveText(['Vanity set']);
    await saved.click();
    await expect(saved).toHaveAttribute('aria-pressed', 'true');
    const where = await at(page, 201, 30);
    await page.mouse.click(where.x, where.y);

    await expect.poll(async () => (await ofType(page, 'fixture')).length).toBe(2);
    const lavs = await ofType(page, 'fixture');
    const points = await ofType(page, 'utility_point');
    expect(points).toHaveLength(2);
    const copy = lavs.find((o) => o.id !== lavId)!;
    const copyPoint = points.find((o) => o.id !== waterId)!;
    const c = (copy.data.geometry as { center: Point }).center;
    const q = (copyPoint.data.geometry as { point: Point }).point;
    expect(q.x - c.x).toBeCloseTo(0, 9);
    expect(q.y - c.y).toBeCloseTo(15, 9);
    expect(copy.data.attributes).toEqual({ kind: 'lavatory', width: 20, depth: 18 });

    // Placed again: a third copy.
    const again = await at(page, 201, 90);
    await page.mouse.click(again.x, again.y);
    await expect.poll(async () => (await ofType(page, 'fixture')).length).toBe(3);
  });
});
