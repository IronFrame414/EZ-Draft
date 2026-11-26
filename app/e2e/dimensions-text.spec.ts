// EZD-216 (AC-EZD-216-1, -3, -5, -6, -8; S03 rail "Dimension (L)", "Text (T)"; Q-0683 (a) a click opens the box in
// place, Enter commits; S03 canvas "Double-click | Edits the object in place"; Q-0674 (b) the Dimensions overlay
// row). Desktop 1600 x 1000. Each test makes its own company (never tenant 1) with fixture S and its own member. One
// 12' 6" wall (150", 09m row 1) is seeded through the editor hook; the canvas is driven through the `__ezdraftPlan`
// and `__ezdraftEditor` hooks. Helpers are copies of measure.spec.ts. No import.meta or __dirname (L-017).
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

const EDITOR = ['view_projects', 'edit_model'];

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, EDITOR as never);
  return { tenant, ids, user };
}

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: {
    handle: { setView(v: View): void; modelToScreen(p: Point): Point };
    drawnTexts(): Array<{ objectId: string; text: string }>;
  };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
};

const editorState = (page: Page) => page.getByTestId('editor-state');
const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const tool = (page: Page, which: string) => page.locator(`[data-rail-tool="${which}"]`);

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

// view: model (0,0) at region px (128, 384); 8/3 px per inch.
async function view(page: Page) {
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
  const box = await canvasRegion(page).boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
    { x, y },
  );
  return { x: box.x + s.x, y: box.y + s.y };
}
const clickAt = async (page: Page, x: number, y: number) => {
  const p = await at(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
};

const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const drawn = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.drawnTexts());
const drawnFor = async (page: Page, objectId: string) =>
  (await drawn(page)).filter((t) => t.objectId === objectId).map((t) => t.text);
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

// One 150" wall from (0,0) to (150,0) on the open floor.
async function seedWall(page: Page) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((x) => x.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const made = createWallData({
    start: { x: 0, y: 0 },
    end: { x: 150, y: 0 },
    level,
    thicknessSide: 'right',
  });
  if (!made.ok) throw new Error('wall data');
  const change = {
    id: crypto.randomUUID(),
    value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
  };
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), [change]);
}

const placed = async (page: Page, type: string) =>
  (await objects(page)).filter(
    (o) => o.type === type && (o.data.attributes as { auto?: unknown }).auto == null,
  );

test.describe('EZD-216 Dimensions and text', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-1, -3, -5, -6: a 12\' 6" dimension, its eye, a note, and a double-click override', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await view(page);
    await seedWall(page);

    // AC-1: L, two points 150" apart above the wall, then the line 24" above them.
    await page.keyboard.press('l');
    await expect(tool(page, 'dimension')).toHaveAttribute('aria-pressed', 'true');
    await expect(id(page, 'dimension-mode').locator('[data-mode="linear"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await clickAt(page, 0, 60);
    await clickAt(page, 150, 60);
    await clickAt(page, 75, 84);
    await expect.poll(async () => (await placed(page, 'dimension')).length).toBe(1);
    const [dim] = await placed(page, 'dimension');
    expect(dim!.data).toMatchObject({
      geometry: { kind: 'points', from: { x: 0, y: 60 }, to: { x: 150, y: 60 } },
      status: 'existing',
      attributes: { kind: 'linear', offset: 24, override: null },
    });
    await expect.poll(() => drawnFor(page, dim!.id)).toEqual([`12' 6"`]);

    // AC-6: the Dimensions eye hides and shows every dimension (the auto overall pair too).
    await expect(id(page, 'layer-row-dimensions')).toContainText('Dimensions');
    const dimIds = async () =>
      new Set((await objects(page)).filter((o) => o.type === 'dimension').map((o) => o.id));
    const dimTexts = async () => {
      const all = await dimIds();
      return (await drawn(page)).filter((t) => all.has(t.objectId)).length;
    };
    expect(await dimTexts()).toBeGreaterThan(1);
    await id(page, 'layer-eye-dimensions').click();
    await expect(id(page, 'layer-eye-dimensions')).toHaveAttribute('data-on', 'false');
    await expect.poll(dimTexts).toBe(0);
    await id(page, 'layer-eye-dimensions').click();
    await expect.poll(async () => (await drawnFor(page, dim!.id)).length).toBe(1);

    // AC-5 / Q-0683 (a): T, a click opens the box in place; Enter commits the note.
    await page.keyboard.press('Escape');
    await page.keyboard.press('t');
    await expect(tool(page, 'text')).toHaveAttribute('aria-pressed', 'true');
    await clickAt(page, 40, -60);
    await expect(id(page, 'canvas-text-box')).toBeFocused();
    await page.keyboard.type('VERIFY IN FIELD');
    await page.keyboard.press('Enter');
    await expect(id(page, 'canvas-text-box')).toHaveCount(0);
    await expect.poll(async () => (await placed(page, 'text')).length).toBe(1);
    const [note] = await placed(page, 'text');
    // The click lands on a screen pixel: the note is where the pointer was, within a pixel (3/8" at 8/3 px/in).
    expect(note!.data).toMatchObject({
      geometry: { leader: null },
      attributes: { text: 'VERIFY IN FIELD', paperSize: '3/32' },
    });
    const pos = (note!.data.geometry as { position: { x: number; y: number } }).position;
    expect(pos.x).toBeCloseTo(40, 2);
    expect(pos.y).toBeCloseTo(-60, 2);
    await expect.poll(() => drawnFor(page, note!.id)).toEqual(['VERIFY IN FIELD']);

    // AC-3: a double-click on the dimension opens its box; the typed text overrides the measured value.
    await page.keyboard.press('Escape');
    await expect(tool(page, 'text')).toHaveAttribute('aria-pressed', 'false');
    const p = await at(page, 40, 84);
    await page.mouse.dblclick(p.x, p.y);
    await expect(id(page, 'canvas-text-box')).toBeFocused();
    await page.keyboard.type('EQ');
    await page.keyboard.press('Enter');
    await expect.poll(() => drawnFor(page, dim!.id)).toEqual(['EQ']);
    await saved(page);
  });
});
