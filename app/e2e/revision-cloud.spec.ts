// EZD-232 (AC-EZD-232-1 "A drawn cloud persists after reload"; S03 rail "Revision cloud | Draw a cloud and delta tag
// manually"; 04 Tool rail "Revision cloud | Q"; gesture: vault/build/assumptions/EZD-232.md). Desktop 1600 x 1000. The
// test makes its own company (never tenant 1) with fixture S and its own member. The canvas is driven through the
// `__ezdraftPlan`, `__ezdraftEditor` and `__ezdraftSelection` hooks. Helpers are copies of dimensions-text.spec.ts.
// No import.meta or __dirname (L-017).
import type { Point } from '@ezdraft/geometry';
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
    drawn(): { batches: Array<{ key: string }> };
  };
  __ezdraftEditor: { objects(): Obj[] };
  __ezdraftSelection: { ids(): string[] };
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

const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const clouds = async (page: Page) =>
  (await objects(page)).filter((o) => o.type === 'revision_cloud');
// The cloud's scallops and delta are drawn on the dimensions layer, in the dimension line weight.
const cloudDrawn = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as Window2).__ezdraftPlan
      .drawn()
      .batches.some((b) => b.key === 'dimensions:segments:dimension'),
  );
const selected = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids());
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

test.describe('EZD-232 Manual revision cloud', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-1: a cloud drawn with Q persists after reload', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await view(page);
    expect(await clouds(page)).toHaveLength(0);

    // Q, then a press at (12, 24), a drag and the lift at (108, 96).
    await page.keyboard.press('q');
    await expect(tool(page, 'revision-cloud')).toHaveAttribute('aria-pressed', 'true');
    const a = await at(page, 12, 24);
    const b = await at(page, 108, 96);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2);
    await page.mouse.move(b.x, b.y);
    await page.mouse.up();

    await expect.poll(async () => (await clouds(page)).length).toBe(1);
    const [cloud] = await clouds(page);
    expect(cloud!.data).toMatchObject({ attributes: { source: 'manual', rev: null } });
    const g = cloud!.data.geometry as { boundary: Point[]; tag: Point };
    // The press and lift land on screen pixels: each corner within a pixel (3/8" at 8/3 px/in).
    expect(g.boundary).toHaveLength(4);
    const xs = g.boundary.map((p) => p.x);
    const ys = g.boundary.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(12, 0);
    expect(Math.max(...xs)).toBeCloseTo(108, 0);
    expect(Math.min(...ys)).toBeCloseTo(24, 0);
    expect(Math.max(...ys)).toBeCloseTo(96, 0);
    expect(g.tag).toEqual({ x: Math.max(...xs), y: Math.max(...ys) });
    await expect.poll(() => cloudDrawn(page)).toBe(true);
    await expect.poll(() => selected(page)).toEqual([cloud!.id]);
    await saved(page);

    // AC-1: after a reload the same cloud is back, drawn, and a click inside it selects it.
    await page.reload();
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
    await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
    const after = await clouds(page);
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(cloud!.id);
    expect(after[0]!.data).toEqual(cloud!.data);
    await expect.poll(() => cloudDrawn(page)).toBe(true);
    await view(page);
    const inside = await at(page, 60, 60);
    await page.mouse.click(inside.x, inside.y);
    await expect.poll(() => selected(page)).toEqual([cloud!.id]);
  });
});
