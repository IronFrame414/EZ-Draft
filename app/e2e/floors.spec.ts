// EZD-6001 B1-B7 (vault/plans/EZD-6001.md section 4; AC-EZD-6001-1 to -4; Q-0509; Q-0508; Q-0666; Q-0667; Q-0690 (a)).
// B1-B6 untagged (desktop 1600 x 1000); B7 is @ipad. Every test makes its own company (never tenant 1) with fixture S
// (P1 starts with the floor "Floor 1") and its own member. The model is read and seeded through the
// `__ezdraftEditor` hook and the canvas through `__ezdraftPlan.handle.showObject` (false when the object is not on
// the open floor). No import.meta or __dirname (lesson L-017).
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  expectTouchTargets,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

const EDITOR = ['view_projects', 'edit_model'];
const VIEWER = ['view_projects'];

type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: { handle: { showObject(id: string): boolean } };
  __ezdraftEditor?: { objects(): Obj[]; edit(changes: unknown[]): string[] };
};

async function fixtureS(permissions: string[] = EDITOR) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, permissions as never);
  return { tenant, ids, user };
}

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const trigger = (page: Page) => id(page, 'floor-switcher');
const options = (page: Page) => id(page, 'floor-option');

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor!.objects());

const showObject = (page: Page, objectId: string): Promise<boolean> =>
  page.evaluate((i) => (window as unknown as Window2).__ezdraftPlan.handle.showObject(i), objectId);

async function floorIdNamed(page: Page, name: string): Promise<string> {
  const f = (await objects(page)).find((o) => o.type === 'floor' && o.data.name === name);
  if (!f) throw new Error(`no floor ${name}`);
  return f.id;
}

// Walls (x, 0)-(x + 120, 0) on `level`, one edit; ids given or made by the browser.
async function seedWalls(page: Page, level: string, ids: string[]): Promise<void> {
  const changes = ids.map((wallId, i) => {
    const made = createWallData({
      start: { x: i * 10, y: 0 },
      end: { x: i * 10 + 120, y: 0 },
      level,
    });
    if (!made.ok) throw new Error('wall fixture');
    return {
      id: wallId,
      value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
    };
  });
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor!.edit(c), changes);
}

// The project's live (not deleted) rows of one type in the database.
async function liveRows(projectId: string, type: string): Promise<string[]> {
  const { data, error } = await adminDb()
    .from('model_object')
    .select('object_id')
    .eq('project_id', projectId)
    .eq('type', type)
    .eq('deleted', false);
  if (error) throw new Error(`model_object read failed: ${error.code}`);
  return (data as Array<{ object_id: string }>).map((r) => r.object_id);
}

const uuid = (page: Page) => page.evaluate(() => crypto.randomUUID());

async function addFloor(page: Page) {
  await trigger(page).click();
  await id(page, 'floor-add').click();
}

async function chooseFloor(page: Page, name: string) {
  await trigger(page).click();
  await options(page).filter({ hasText: name }).click();
  await expect(trigger(page)).toHaveText(name);
}

test.describe('EZD-6001 floors', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-6001 B1 the switcher shows one floor at a time', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await expect(trigger(page)).toHaveText('Floor 1');
    await addFloor(page);
    await expect(trigger(page)).toHaveText('Floor 2');
    const f1 = await floorIdNamed(page, 'Floor 1');
    const f2 = await floorIdNamed(page, 'Floor 2');
    const w1 = await uuid(page);
    const w2 = await uuid(page);
    await seedWalls(page, f1, [w1]);
    await seedWalls(page, f2, [w2]);

    await chooseFloor(page, 'Floor 1');
    expect(await showObject(page, w1)).toBe(true);
    expect(await showObject(page, w2)).toBe(false);
    await chooseFloor(page, 'Floor 2');
    expect(await showObject(page, w2)).toBe(true);
    expect(await showObject(page, w1)).toBe(false);
    await expect(trigger(page)).toHaveAttribute('data-floor-id', f2);
  });

  test('EZD-6001 B2 a renamed floor keeps its name after reload', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addFloor(page);
    await expect(trigger(page)).toHaveText('Floor 2');
    await trigger(page).click();
    await id(page, 'floor-rename').click();
    const input = id(page, 'floor-name-input');
    await expect(input).toBeFocused();
    await input.fill('Upstairs');
    await input.press('Enter');
    await expect(trigger(page)).toHaveText('Upstairs');
    await saved(page);

    await page.reload();
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await expect(trigger(page)).toHaveText('Floor 1');
    await trigger(page).click();
    await expect(options(page)).toHaveCount(2);
    await expect(options(page)).toHaveText(['Floor 1', 'Upstairs']);
    await options(page).filter({ hasText: 'Upstairs' }).click();

    // Escape during a second rename keeps the name.
    await trigger(page).click();
    await id(page, 'floor-rename').click();
    await id(page, 'floor-name-input').fill('Attic');
    await id(page, 'floor-name-input').press('Escape');
    await expect(trigger(page)).toHaveText('Upstairs');
  });

  test('EZD-6001 B3 deleting a floor with objects asks first and deletes them with it', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addFloor(page);
    const f2 = await floorIdNamed(page, 'Floor 2');
    await seedWalls(page, f2, [await uuid(page), await uuid(page)]);

    await trigger(page).click();
    await id(page, 'floor-delete').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Delete Floor 2?');
    await expect(dialog).toContainText('The 2 objects on this floor will be deleted with it.');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    expect((await objects(page)).filter((o) => o.type === 'floor')).toHaveLength(2);
    expect((await objects(page)).filter((o) => o.data.level === f2)).toHaveLength(2);

    await trigger(page).click();
    await id(page, 'floor-delete').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete floor' }).click();
    await expect(trigger(page)).toHaveText('Floor 1');
    await trigger(page).click();
    await expect(options(page)).toHaveCount(1);
    expect((await objects(page)).some((o) => o.id === f2 || o.data.level === f2)).toBe(false);
  });

  test('EZD-6001 B4 an empty floor is deleted without asking; the last floor cannot be deleted', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addFloor(page);
    await expect(trigger(page)).toHaveText('Floor 2');
    await trigger(page).click();
    await id(page, 'floor-delete').click();
    await expect(trigger(page)).toHaveText('Floor 1');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await trigger(page).click();
    await expect(options(page)).toHaveCount(1);
    await expect(id(page, 'floor-delete')).toHaveAttribute('aria-disabled', 'true');
    await expect(id(page, 'floor-delete-reason')).toHaveText('A project needs at least one floor.');
    // Playwright will not click an aria-disabled item; the click event is sent as a press would.
    await id(page, 'floor-delete').dispatchEvent('click');
    await expect(options(page)).toHaveCount(1);
    expect((await objects(page)).filter((o) => o.type === 'floor')).toHaveLength(1);
  });

  test('EZD-6001 B5 a floor with 150 walls is deleted and saved', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addFloor(page);
    const f2 = await floorIdNamed(page, 'Floor 2');
    const wallIds = Array.from(
      { length: 150 },
      (_, i) => `ffffffff-ffff-4fff-8fff-${String(i + 1).padStart(12, '0')}`,
    );
    await seedWalls(page, f2, wallIds);
    await expect.poll(() => liveRows(ids.P1, 'wall'), { timeout: 15_000 }).toHaveLength(150);
    await saved(page);

    await trigger(page).click();
    await id(page, 'floor-delete').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete floor' }).click();
    // Every save is taken: the walls and the floor are gone from the database, with no refusal.
    await expect.poll(() => liveRows(ids.P1, 'wall'), { timeout: 15_000 }).toHaveLength(0);
    await expect.poll(() => liveRows(ids.P1, 'floor'), { timeout: 15_000 }).toHaveLength(1);
    await saved(page);
    await expect(id(page, 'conflict-banner')).toHaveCount(0);

    await page.reload();
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    const after = await objects(page);
    expect(after.filter((o) => o.type === 'floor')).toHaveLength(1);
    const gone = new Set(wallIds);
    expect(after.some((o) => gone.has(o.id))).toBe(false);
  });

  test('EZD-6001 B6 a view-only user switches floors but cannot add, rename or delete', async ({
    page,
    signInAs,
  }) => {
    const { tenant, ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addFloor(page);
    const f2 = await floorIdNamed(page, 'Floor 2');
    const w2 = await uuid(page);
    await seedWalls(page, f2, [w2]);
    await saved(page);

    await setPermissions(tenant, user.membershipId, VIEWER as never);
    await page.reload();
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
    expect(await page.evaluate(() => '__ezdraftEditor' in window)).toBe(false);
    await expect(trigger(page)).toHaveText('Floor 1');
    expect(await showObject(page, w2)).toBe(false);
    await trigger(page).click();
    await expect(options(page)).toHaveCount(2);
    await expect(id(page, 'floor-add')).toHaveCount(0);
    await expect(id(page, 'floor-rename')).toHaveCount(0);
    await expect(id(page, 'floor-delete')).toHaveCount(0);
    await options(page).filter({ hasText: 'Floor 2' }).click();
    await expect(trigger(page)).toHaveText('Floor 2');
    expect(await showObject(page, w2)).toBe(true);
  });

  test('EZD-6001 B7 the floor controls are touch targets', { tag: ['@ipad'] }, async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    // The trigger with the list closed (the open list sits just above it), then the floor option and Add, Rename
    // and Delete in the open list.
    expect(await expectTouchTargets(page, id(page, 'floor-control'))).toBe(1);
    await trigger(page).click();
    await expect(id(page, 'floor-list')).toBeVisible();
    expect(await expectTouchTargets(page, id(page, 'floor-list'))).toBe(4);
  });
});
