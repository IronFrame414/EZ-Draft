// EZD-731 (AC-EZD-731-1; phase-07 EZD-731; vault/build/assumptions.md EZD-731). Local stack, real sign-in (as
// plumbing-locations.spec.ts). Expected values worked by hand: the view puts model (0, 0) at canvas (128, 384) at
// 8/3 px per inch. A 30" × 30" condenser placed at (150, 27) has its top edge on y = 42; the patch x 147.4 to 152.6,
// y 40.9 to 42.4 (canvas 521 to 535, 270 to 274) holds only that edge, clear of the 12" grid (x 144 and 156, y 36
// and 48) and of its "CU" at the centre. A 10" × 4" supply register placed at (200, 27) has its two diagonals cross at
// its centre; the patch x 199.1 to 201, y 26.6 to 28.1 (canvas 659 to 664, 310 to 314) holds only that crossing.
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

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: {
    handle: { setView(v: View): void; modelToScreen(p: Point): Point };
    stats(): { frames: number };
  };
  __ezdraftEditor: { objects(): Obj[] };
};

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const frames = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.stats().frames);

async function clickAt(page: Page, x: number, y: number) {
  const box = await canvasRegion(page).boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
    { x, y },
  );
  await page.mouse.click(box.x + s.x, box.y + s.y);
}

async function patch(page: Page, x: number, y: number, width: number, height: number) {
  const box = await canvasRegion(page).boundingBox();
  if (!box) throw new Error('canvas region has no box');
  return page.screenshot({ clip: { x: box.x + x, y: box.y + y, width, height } });
}

async function afterFrame(page: Page, before: number) {
  await expect.poll(() => frames(page), { intervals: [100], timeout: 5000 }).toBeGreaterThan(before);
}

const edge = (page: Page) => patch(page, 521, 270, 14, 4);
const cross = (page: Page) => patch(page, 659, 310, 5, 4);

test.describe('EZD-731 Mechanical layout', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-731 placed equipment and registers show on the Mechanical layer and hide when it is off', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, user.membershipId, EDITOR as never);
    await signInAs(user.email);
    await page.goto(`/projects/${ids.P1}`);
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

    await expect(id(page, 'layer-row-mechanical')).toHaveText('Mechanical');
    await expect(id(page, 'layer-eye-mechanical')).toHaveAttribute('data-on', 'true');

    const emptyEdge = await edge(page);
    const emptyCross = await cross(page);
    await page.keyboard.press('f');
    await id(page, 'mechanical-kind-condenser').click();
    await clickAt(page, 150, 27);
    await id(page, 'mechanical-kind-supply').click();
    await clickAt(page, 200, 27);
    await expect
      .poll(async () =>
        (await page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects()))
          .filter((o) => o.type === 'hvac')
          .map((o) => o.data)
          .sort((a, b) =>
            String((a.attributes as { kind: string }).kind).localeCompare(
              String((b.attributes as { kind: string }).kind),
            ),
          ),
      )
      .toMatchObject([
        { geometry: { center: { x: 150, y: 27 } }, attributes: { kind: 'condenser', width: 30, depth: 30 } },
        { geometry: { center: { x: 200, y: 27 } }, attributes: { kind: 'supply', width: 10, depth: 4 } },
      ]);
    await page.keyboard.press('Escape');
    await expect(id(page, 'fixtures-panel')).toHaveCount(0);

    // Off the canvas, so no hover highlight is drawn over them.
    let before: number;
    await id(page, 'layer-row-mechanical').hover();
    await expect.poll(async () => (await edge(page)).equals(emptyEdge)).toBe(false);
    await expect.poll(async () => (await cross(page)).equals(emptyCross)).toBe(false);
    const edgeOn = await edge(page);
    const crossOn = await cross(page);

    before = await frames(page);
    await id(page, 'layer-eye-mechanical').click();
    await expect(id(page, 'layer-eye-mechanical')).toHaveAttribute('data-on', 'false');
    await afterFrame(page, before);
    await expect.poll(async () => (await edge(page)).equals(emptyEdge)).toBe(true);
    await expect.poll(async () => (await cross(page)).equals(emptyCross)).toBe(true);

    before = await frames(page);
    await id(page, 'layer-eye-mechanical').click();
    await afterFrame(page, before);
    await expect.poll(async () => (await edge(page)).equals(edgeOn)).toBe(true);
    await expect.poll(async () => (await cross(page)).equals(crossOn)).toBe(true);
  });
});
