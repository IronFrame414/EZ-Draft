// EZD-234 B1-B2 (AC-EZD-234-1, -2, -5; S03 Fixtures, Validation; S03:146; Q-0704 05-screens; 09q Utilities to move
// row 1). Local stack, real sign-in (as move.spec.ts). Expected values worked by hand: a 30" × 26" range at (150, 15)
// facing down covers x 135 to 165, y 2 to 28; its electric point at (144, 3) and gas point at (156, 3) are inside it;
// moved 24" east it covers x 159 to 189, so they are 15" (1' 3") and 3" from it. Points are on 3" multiples, which land
// on whole pixels at 8/3 px per inch, and right of the panel.
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
const VIEWER = ['view_projects'];

async function fixtureS(permissions: string[]) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, permissions as never);
  return { ids, user };
}

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: { handle: { setView(v: View): void; modelToScreen(p: Point): Point } };
  __ezdraftEditor: { objects(): Obj[] };
};

const editorState = (page: Page) => page.getByTestId('editor-state');
const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');

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
const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const ofType = async (page: Page, type: string) =>
  (await objects(page)).filter((o) => o.type === type);

test.describe('EZD-234 Fixtures tool', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-234 B1 F opens the panel; a range and two linked points place; moving the range lists both', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(EDITOR);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await view(page);

    await page.keyboard.press('f');
    await expect(page.locator('[data-rail-tool="fixtures"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const panel = id(page, 'fixtures-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button')).toHaveCount(20); // EZD-227: plus Grab-bar blocking. EZD-226: plus Tile shower
    await expect(panel).not.toContainText(/saved/i);

    await panel.getByRole('button', { name: 'Range' }).click();
    await clickAt(page, 150, 15);
    await expect.poll(async () => (await ofType(page, 'fixture')).length).toBe(1);
    const [range] = await ofType(page, 'fixture');
    expect(range.data).toMatchObject({
      geometry: { center: { x: 150, y: 15 }, axis: { x: 1, y: 0 } },
      attributes: { kind: 'range', width: 30, depth: 26 },
    });

    await panel.getByRole('button', { name: 'Electric' }).click();
    await id(page, 'utility-volts').selectOption('240');
    await id(page, 'utility-amps').fill('50');
    await clickAt(page, 144, 3);
    await panel.getByRole('button', { name: 'Gas' }).click();
    await clickAt(page, 156, 3);
    await expect.poll(async () => (await ofType(page, 'utility_point')).length).toBe(2);
    for (const p of await ofType(page, 'utility_point'))
      expect((p.data.attributes as { servesObjectId: string }).servesObjectId).toBe(range.id);

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await clickAt(page, 162, 21);
    await page.keyboard.press('m');
    await clickAt(page, 162, 21);
    await moveTo(page, 210, 21);
    await page.keyboard.type('24"');
    await page.keyboard.press('Enter');

    await expect
      .poll(
        async () =>
          ((await ofType(page, 'fixture'))[0].data.geometry as { center: Point }).center.x,
      )
      .toBe(174);
    const list = id(page, 'utilities-to-move');
    await expect(list).toBeVisible();
    await expect(list.getByTestId('utility-to-move')).toHaveText([
      'Electric: 1\' 3" from the new position',
      'Gas: 3" from the new position',
    ]);
    await list.getByRole('button', { name: 'Close' }).click();
    await expect(list).toHaveCount(0);
  });

  test('EZD-234 B2 without Edit model there is no Fixtures tool and F opens nothing', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(VIEWER);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await expect(page.locator('[data-rail-tool="fixtures"]')).toHaveCount(0);
    await page.keyboard.press('f');
    await expect(id(page, 'fixtures-panel')).toHaveCount(0);
  });
});
