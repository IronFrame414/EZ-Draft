// EZD-729 B1 (AC-EZD-729-1; S03 "Layers tab sections: Phase, Overlays, Rooms"; vault/build/assumptions.md EZD-729).
// Local stack, real sign-in (as fixtures-tool.spec.ts). Expected values worked by hand: the view puts model (0, 0) at
// canvas (128, 384) at 8/3 px per inch. A 33" × 22" sink placed at (150, 27) facing down has its back edge on y = 38,
// so its drain diamond reaches up to (150, 41); the patch x 147.5 to 152.5, y 38.5 to 40.5 (canvas 521 to 535,
// 276 to 281) holds only that diamond's lines, clear of the outline and the 12" grid. The patch x 148 to 152,
// y 15 to 17 (canvas 523 to 533, 339 to 344) holds only the sink's front edge (y 16).
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

test.describe('EZD-729 Plumbing locations', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-729 B1 a placed sink draws its supply and drain locations; the Plumbing eye hides them', async ({
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

    await expect(id(page, 'layer-row-plumbing')).toHaveText('Plumbing');
    await expect(id(page, 'layer-eye-plumbing')).toHaveAttribute('data-on', 'true');

    const emptyDrain = await patch(page, 521, 276, 14, 5);
    await page.keyboard.press('f');
    await id(page, 'fixtures-panel').getByRole('button', { name: 'Sink' }).click();
    await clickAt(page, 150, 27);
    await expect
      .poll(async () =>
        (await page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects()))
          .filter((o) => o.type === 'fixture')
          .map((o) => o.data),
      )
      .toMatchObject([
        { geometry: { center: { x: 150, y: 27 } }, attributes: { kind: 'sink', width: 33, depth: 22 } },
      ]);
    await page.keyboard.press('Escape');
    await expect(id(page, 'fixtures-panel')).toHaveCount(0);

    // Off the canvas, so no hover highlight is drawn over the sink.
    let before: number;
    await id(page, 'layer-row-plumbing').hover();
    await expect.poll(async () => (await patch(page, 521, 276, 14, 5)).equals(emptyDrain)).toBe(false);
    const drainOn = await patch(page, 521, 276, 14, 5);
    const frontOn = await patch(page, 523, 339, 10, 5);

    before = await frames(page);
    await id(page, 'layer-eye-plumbing').click();
    await expect(id(page, 'layer-eye-plumbing')).toHaveAttribute('data-on', 'false');
    await afterFrame(page, before);
    await expect.poll(async () => (await patch(page, 521, 276, 14, 5)).equals(emptyDrain)).toBe(true);
    expect((await patch(page, 523, 339, 10, 5)).equals(frontOn)).toBe(true);

    before = await frames(page);
    await id(page, 'layer-eye-plumbing').click();
    await afterFrame(page, before);
    await expect.poll(async () => (await patch(page, 521, 276, 14, 5)).equals(drainOn)).toBe(true);
  });
});
