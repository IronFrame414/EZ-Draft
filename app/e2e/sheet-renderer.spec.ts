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

  // EZD-1975 (AC-EZD-1975-1, AC-EZD-1975-2): the failure on the slower CI machine, made on purpose. The saves of the
  // Plan edits are held until Sheets is shown again and has drawn, so their answers (which put the server's wall
  // numbers in the open model) land after the return; the CPU is slowed 4 times. The sheet is still drawn once.
  test('EZD-1975 AC-1 AC-2 saves that answer after the return to Sheets do not draw the sheet again (CPU slowed 4x)', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(180_000);
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    let gate: Promise<void> = Promise.resolve();
    let release = () => {};
    const hold = () => {
      gate = new Promise<void>((r) => (release = r));
    };
    await page.route('**/api/projects/*/objects', async (route) => {
      await gate;
      await route.continue();
    });
    await openReady(page, ids.P1);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const slow = { timeout: 30_000 };
    // The walls whose saved number has reached the open model.
    const numbered = (wallIds: string[]) =>
      page.evaluate(
        (w) =>
          (window as unknown as Window2).__ezdraftEditor
            .objects()
            .filter((o) => w.includes(o.id))
            .filter((o) => typeof (o.data.attributes as { number?: unknown } | undefined)?.number === 'number').length,
        wallIds,
      );
    // Two frames, so a draw started by the last model update has reached the page.
    const settle = () =>
      page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const canvas = id(page, 'sheets-canvas');
    const drawing = id(page, 'sheet-drawing');

    hold();
    const walls = await addWalls(page, [P(0, 0), P(144, 0), P(144, 120), P(0, 120), P(0, 0)]);
    await tab(page, 'Sheets').click();
    await id(page, 'sheet-row-A1.0').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'A1.0', slow);
    for (const w of walls) await expect(drawing.locator(`line[data-object-id="${w}"]`).first()).toBeAttached(slow);
    await expect(canvas).toHaveAttribute('data-sheet-renders', '1', slow);
    // The first save answers while the sheet is shown: its numbers draw nothing.
    expect(await numbered(walls)).toBe(0);
    release();
    await expect.poll(() => numbered(walls), slow).toBe(4);
    await settle();
    await expect(canvas).toHaveAttribute('data-sheet-renders', '1');

    // Back on Plan, three edits whose saves are held; Sheets again draws the open sheet once.
    await tab(page, 'Plan').click();
    await expect(canvas).toHaveCount(0);
    hold();
    const more = [
      ...(await addWalls(page, [P(200, 0), P(300, 0)])),
      ...(await addWalls(page, [P(200, 50), P(300, 50)])),
      ...(await addWalls(page, [P(200, 100), P(300, 100)])),
    ];
    await tab(page, 'Sheets').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'A1.0', slow);
    for (const w of more) await expect(drawing.locator(`line[data-object-id="${w}"]`).first()).toBeAttached(slow);
    await expect(canvas).toHaveAttribute('data-sheet-renders', '2', slow);
    // The held saves answer now, after the return.
    expect(await numbered(more)).toBe(0);
    release();
    await expect.poll(() => numbered(more), slow).toBe(3);
    await settle();
    await expect(canvas).toHaveAttribute('data-sheet-renders', '2');
    for (const w of more) await expect(drawing.locator(`line[data-object-id="${w}"]`).first()).toBeAttached();
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
