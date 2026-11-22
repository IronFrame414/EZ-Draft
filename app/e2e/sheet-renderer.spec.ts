// EZD-702b (AC-EZD-702b-1 to -3; S13 Layout "sheet preview"; 09h "Scales per viewport: 1/4\" = 1'-0\" plans"; 11 rule
// 2, rule 3, rule 7). Desktop 1600 x 1000, untagged. Fixture S (P1 starts with "Floor 1") in its own company with a
// member who may edit the model; the fixture room's four walls (144 x 120 in, EZD-238's fixture room) are added
// through the editor test hook, as editor-drawing-lazy.spec.ts does. At 1/4" = 1'-0" a 120 in wall face is 2.5 paper
// inches long on the sheet.
import { CURRENT_SCHEMA_VERSION, createWallData, type Point } from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  signedInJsContents,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = { __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] } };

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true });
const P = (x: number, y: number): Point => ({ x, y });

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

// Adds a wall from each point to the next on the first floor; returns the new ids in order.
async function addWalls(page: Page, pts: Point[]): Promise<string[]> {
  const objects = await page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
  const level = objects.find((o) => o.type === 'floor')!.id;
  const changes = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const made = createWallData({ start: pts[i]!, end: pts[i + 1]!, level, thicknessSide: 'right' });
    if (!made.ok) throw new Error('wall data');
    changes.push({
      id: crypto.randomUUID(),
      value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
    });
  }
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);
  return changes.map((c) => c.id);
}

test.describe('EZD-702b Sheet renderer', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-702b AC-1 AC-2 the fixture room sheet holds its walls at 1/4" scale; a Plan edit draws no sheet', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const walls = await addWalls(page, [P(0, 0), P(144, 0), P(144, 120), P(0, 120), P(0, 0)]);

    await tab(page, 'Sheets').click();
    await id(page, 'sheet-row-A1.0').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'A1.0');
    const drawing = id(page, 'sheet-drawing');
    for (const w of walls) await expect(drawing.locator(`line[data-object-id="${w}"]`).first()).toBeAttached();
    // W2 (144,0) to (144,120): its faces are 120/48 = 2.5 paper inches long.
    const faces = await drawing.locator(`line[data-object-id="${walls[1]}"]`).evaluateAll((els) =>
      els.map((e) => {
        const n = (a: string) => Number(e.getAttribute(a));
        return Math.hypot(n('x2') - n('x1'), n('y2') - n('y1'));
      }),
    );
    expect(faces.length).toBeGreaterThanOrEqual(2);
    for (const f of faces) expect(f).toBeCloseTo(2.5, 4);
    await expect(id(page, 'sheets-canvas')).toHaveAttribute('data-sheet-renders', '1');

    // Back on Plan, three edits; Sheets again draws the open sheet once, with the new walls.
    await tab(page, 'Plan').click();
    await expect(id(page, 'sheets-canvas')).toHaveCount(0);
    const more = [
      ...(await addWalls(page, [P(200, 0), P(300, 0)])),
      ...(await addWalls(page, [P(200, 50), P(300, 50)])),
      ...(await addWalls(page, [P(200, 100), P(300, 100)])),
    ];
    await tab(page, 'Sheets').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'A1.0');
    for (const w of more) await expect(drawing.locator(`line[data-object-id="${w}"]`).first()).toBeAttached();
    await expect(id(page, 'sheets-canvas')).toHaveAttribute('data-sheet-renders', '2');
  });

  test('EZD-702b AC-3 the sheet renderer chunk is absent from the Plan bundle', async ({ page, browser, signInAs }) => {
    test.setTimeout(120_000);
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const state = await page.context().storageState();
    const contents = await signedInJsContents(browser, state, `/projects/${ids.P1}`, 'editor');
    expect('error' in contents).toBe(false);
    expect('value' in contents ? contents.value : -1).toBe(0);
    const modules = Object.keys((contents.details as { modules?: Record<string, number> }).modules ?? {});
    // The measure saw the editor's own code, so an absence below is not an empty list.
    expect(modules).toContain('app:editor/ProjectEditor.tsx');
    const sheets = modules.filter(
      (m) =>
        m.startsWith('app:lazy/sheets/') ||
        m.startsWith('app:lazy/sheets-screen/') ||
        m.startsWith('app:workers/sheet') ||
        m.includes('drawing/sheet-svg'),
    );
    expect(sheets).toEqual([]);
  });
});
