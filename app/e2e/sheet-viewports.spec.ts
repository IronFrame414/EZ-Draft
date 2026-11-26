// EZD-703 (AC-EZD-703-1 "A1.0 shows existing only and A2.0 shows demo"; S13 Rail: Viewport "set scale per viewport";
// 09h "Scales per viewport: 1/4\" = 1'-0\" plans"; 03b rule 3). Desktop 1600 x 1000, untagged. Fixture S (P1 starts
// with "Floor 1") in its own company with a member who may edit the model. Three 120 in walls are added through the
// editor test hook, one Existing, one Demo and one New. At 1/4" = 1'-0" a 120 in wall face is 2.5 paper inches long, at
// 1/2" = 1'-0" it is 5.
import { CURRENT_SCHEMA_VERSION, createWallData, type ObjectStatus, type Point } from '@ezdraft/geometry';
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

// One 120 in wall of each status on the first floor, side by side; ids in the order given.
async function addWalls(page: Page, statuses: ObjectStatus[]): Promise<string[]> {
  const objects = await page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
  const level = objects.find((o) => o.type === 'floor')!.id;
  const changes = statuses.map((status, i) => {
    const made = createWallData({ start: P(i * 60, 0), end: P(i * 60, 120), level, thicknessSide: 'right', status });
    if (!made.ok) throw new Error('wall data');
    return { id: crypto.randomUUID(), value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data } };
  });
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);
  return changes.map((c) => c.id);
}

async function faceLengths(drawing: Locator, wall: string): Promise<number[]> {
  return drawing.locator(`line[data-object-id="${wall}"]`).evaluateAll((els) =>
    els.map((e) => {
      const n = (a: string) => Number(e.getAttribute(a));
      return Math.hypot(n('x2') - n('x1'), n('y2') - n('y1'));
    }),
  );
}

test.describe('EZD-703 Viewports and scales', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-703 AC-1 A1.0 shows existing only and A2.0 shows demo; a viewport scale is kept', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const [existing, demo, built] = await addWalls(page, ['existing', 'demo', 'new']);
    await saved(page);

    await tab(page, 'Sheets').click();
    const drawing = id(page, 'sheet-drawing');
    const has = (w: string) => drawing.locator(`[data-object-id="${w}"]`);

    await id(page, 'sheet-row-A1.0').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'A1.0');
    await expect(has(existing!).first()).toBeAttached();
    // 09m row 4: the wall to be removed stands today, so A1.0 draws it as existing (no demo layer, no dashes).
    await expect(has(demo!).first()).toBeAttached();
    await expect(drawing.locator(`[data-object-id="${demo}"][data-layer="demo"]`)).toHaveCount(0);
    await expect(drawing.locator(`line[data-object-id="${demo}"][stroke-dasharray]`)).toHaveCount(0);
    await expect(has(built!)).toHaveCount(0);
    await expect(id(page, 'status-sheet-scale')).toHaveText(`1/4" = 1'-0"`);

    await id(page, 'sheet-row-A2.0').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'A2.0');
    await expect(drawing.locator(`line[data-object-id="${demo}"][data-layer="demo"][stroke-dasharray]`).first()).toBeAttached();
    await expect(has(existing!).first()).toBeAttached();
    await expect(has(built!)).toHaveCount(0);

    await id(page, 'sheet-row-A3.0').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'A3.0');
    await expect(has(built!).first()).toBeAttached();
    await expect(has(demo!)).toHaveCount(0);

    // A1.0 at 1/2" = 1'-0": the existing wall's 120 in faces are 5 paper inches long.
    await id(page, 'sheet-row-A1.0').click();
    await id(page, 'sheet-viewport-0-scale').selectOption('1/2');
    await expect(id(page, 'status-sheet-scale')).toHaveText(`1/2" = 1'-0"`);
    await expect.poll(async () => (await faceLengths(drawing, existing!)).map((f) => Math.round(f * 1000) / 1000)).toContain(5);
    await saved(page);

    // The scale is stored with the model: after a reload A1.0 is still drawn at 1/2".
    await page.reload();
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await tab(page, 'Sheets').click();
    await id(page, 'sheet-row-A1.0').click();
    await expect(id(page, 'status-sheet-scale')).toHaveText(`1/2" = 1'-0"`);
    await expect(id(page, 'sheet-viewport-0-scale')).toHaveValue('1/2');
    await expect.poll(async () => (await faceLengths(drawing, existing!)).map((f) => Math.round(f * 1000) / 1000)).toContain(5);
  });
  // EZD-705 AC-EZD-705-1 (S13 Validation "Every sheet gets a scale bar and a printed check dimension"; settled
  // vault/build/assumptions/EZD-705.md: a check dimension labeled 4'-0", 1" on paper at 1/4" = 1'-0", 2" at 1/2").
  test('EZD-705 AC-1 the check dimension on the sheet measures its label x the viewport scale', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addWalls(page, ['existing']);
    await saved(page);

    await tab(page, 'Sheets').click();
    const drawing = id(page, 'sheet-drawing');
    await id(page, 'sheet-row-A1.0').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'A1.0');
    const check = drawing.locator('line[data-print-mark="check-dimension"]');
    const label = drawing.locator('text[data-print-mark="check-dimension-label"]');
    const drawn = () =>
      check.evaluate((e) => {
        const n = (a: string) => Number(e.getAttribute(a));
        return Math.round(Math.hypot(n('x2') - n('x1'), n('y2') - n('y1')) * 1000) / 1000;
      });
    const labelInches = async () => {
      const m = /^(\d+)'-(\d+)"$/.exec((await label.textContent()) ?? '');
      return m === null ? NaN : Number(m[1]) * 12 + Number(m[2]);
    };
    await expect(check).toHaveCount(1);
    await expect(label).toHaveText(`4'-0"`);
    await expect(drawing.locator('rect[data-print-mark="scale-bar"]').first()).toBeAttached();
    expect(await drawn()).toBeCloseTo(((await labelInches()) * 0.25) / 12, 3);
    expect(await drawn()).toBeCloseTo(1, 3);

    await id(page, 'sheet-viewport-0-scale').selectOption('1/2');
    await expect(id(page, 'status-sheet-scale')).toHaveText(`1/2" = 1'-0"`);
    await expect.poll(drawn).toBeCloseTo(2, 3);
    expect(await drawn()).toBeCloseTo(((await labelInches()) * 0.5) / 12, 3);
  });
});
