// EZD-226 (AC-EZD-226-1, -3; S03 Fixtures; Q-0704; vault/build/assumptions.md EZD-226). Local stack, real sign-in (as
// fixtures-tool.spec.ts). Expected values worked by hand: the 60" x 36" shower placed at (150, 18) facing down covers
// x 120 to 180, y 0 to 36, so its footprint is (120,0), (180,0), (180,36), (120,36); its linear drain runs the whole
// back wall (side 2, offset 0, length 60) and its one 12" x 24" niche is on side 2. After save and reload it reads
// back the same; moved 24" east it covers x 144 to 204 with the same attributes. Points are on 3" multiples.
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

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: { handle: { setView(v: View): void; modelToScreen(p: Point): Point } };
  __ezdraftEditor: { objects(): Obj[] };
};

const editorState = (page: Page) => page.getByTestId('editor-state');
const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

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
  await page.mouse.click(p.x, p.y);
};
const moveTo = async (page: Page, x: number, y: number) => {
  const p = await at(page, x, y);
  await page.mouse.move(p.x, p.y);
};
const showers = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects())).filter(
    (o) => o.type === 'tile_shower',
  );

const p = (x: number, y: number) => ({ x, y });
const ATTRIBUTES = {
  curb: { height: 4, width: 4 },
  niches: [{ width: 12, height: 24, bottomHeight: 48, side: 2 }],
  bench: null,
  glass: [],
  panSlope: 0.25,
  drain: { type: 'linear', side: 2, offset: 0, length: 60 },
};

test.describe('EZD-226 Custom tile shower', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-226 B1 the 5x8 bath shower places, survives save and reload, and moves as one', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model'] as never);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await view(page);

    await page.keyboard.press('f');
    const panel = id(page, 'fixtures-panel');
    await panel.getByRole('button', { name: 'Tile shower' }).click();
    await expect(id(page, 'tile-shower-fields')).toBeVisible();
    await id(page, 'shower-curb-height').fill('4"');
    await id(page, 'shower-niches').selectOption('1');
    await id(page, 'shower-drain').selectOption('linear');
    await clickAt(page, 150, 18);
    await expect.poll(async () => (await showers(page)).length).toBe(1);
    await saved(page);

    await page.reload();
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
    await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
    const [shower] = await showers(page);
    expect(shower.data).toMatchObject({
      geometry: { footprint: [p(120, 0), p(180, 0), p(180, 36), p(120, 36)] },
      attributes: ATTRIBUTES,
    });

    await view(page);
    await clickAt(page, 162, 21);
    await page.keyboard.press('m');
    await clickAt(page, 162, 21);
    await moveTo(page, 210, 21);
    await page.keyboard.type('24"');
    await page.keyboard.press('Enter');
    await expect
      .poll(
        async () => ((await showers(page))[0].data.geometry as { footprint: Point[] }).footprint,
      )
      .toEqual([p(144, 0), p(204, 0), p(204, 36), p(144, 36)]);
    expect((await showers(page))[0].data.attributes).toEqual(ATTRIBUTES);
    await saved(page);
  });
});
