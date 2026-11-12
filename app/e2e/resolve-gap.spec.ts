// EZD-213c R1-R3 (vault/plans/EZD-213c.md section 4; AC-EZD-213-11, -15; Q-0630 rows 9, 24, 28; Q-0633 G9). R1 and R2
// are untagged (desktop 1600 x 1000); R3 is @surface. Every test makes its own company (never tenant 1) with fixture S
// and its own member. The canvas is driven through the `__ezdraftPlan` and `__ezdraftEditor` test hooks and the
// selection is read from `__ezdraftSelection.ids()`. Helpers are copied from drawing-tools.spec.ts. No import.meta or
// __dirname (lesson L-017).
import {
  CURRENT_SCHEMA_VERSION,
  createWallData,
  type Point,
} from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
import {
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
const SIZE = '1/2" gap';
const HINT_DESKTOP = 'Click a wall of this room, or press Esc to go back';
const HINT_TOUCH = 'Tap a wall of this room, or tap Select to go back';

async function member(tenant: string, permissions: string[]) {
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return m;
}

async function fixtureS(permissions: string[] = EDITOR) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  return { tenant, ids, user: await member(tenant, permissions) };
}

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: {
    handle: { setView(v: View): void; modelToScreen(p: Point): Point };
    stats(): { glyphs: number };
  };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
  __ezdraftSelection: { ids(): string[] };
  __EZD_PERF__: { commits: number };
};

const editorState = (page: Page) => page.getByTestId('editor-state');
const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const inspector = (page: Page) => page.locator('[data-shell-region="inspector"]');

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
const moveTo = async (page: Page, x: number, y: number) => {
  const p = await at(page, x, y);
  await page.mouse.move(p.x, p.y);
};
const clickAt = async (page: Page, x: number, y: number) => {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
};

const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const wallsIn = (list: Obj[]) => list.filter((o) => o.type === 'wall');
const selected = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids());

// The wall whose start is within 0.01 of (x, y): LAST is (0, 120), FIRST is (0, 0).
async function wallStartingAt(page: Page, x: number, y: number): Promise<Obj> {
  const found = wallsIn(await objects(page)).find((w) => {
    const s = (w.data.geometry as { start: Point }).start;
    return Math.abs(s.x - x) < 0.01 && Math.abs(s.y - y) < 0.01;
  });
  if (!found) throw new Error(`no wall starts at (${x}, ${y})`);
  return found;
}

const pt = (x: number, y: number): Point => ({ x, y });

// addGap: the GAP walls (0,0)->(144,0)->(144,120)->(0,120)->(0,0.5) through the editor hook (09j Closure row 2).
async function addGap(page: Page) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const pts = [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120), pt(0, 0.5)];
  const changes = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const made = createWallData({
      start: pts[i]!,
      end: pts[i + 1]!,
      level,
      thicknessSide: 'right',
    });
    if (!made.ok) throw new Error('wall data');
    changes.push({
      id: crypto.randomUUID(),
      value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
    });
  }
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);
}

const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

// The typed chain of drawing-tools.spec.ts B5 and B7 up to the fourth wall's length.
async function typedChainStart(page: Page) {
  await page.keyboard.press('w');
  await clickAt(page, 0, 0);
  await moveTo(page, 60, 0);
  await page.keyboard.type("12'");
  await page.keyboard.press('Enter');
  await moveTo(page, 144, 50);
  await page.keyboard.type("10'");
  await page.keyboard.press('Tab');
  await page.keyboard.type('90');
  await page.keyboard.press('Enter');
  await moveTo(page, 94, 120);
  await page.keyboard.type("12'");
  await page.keyboard.press('Tab');
  await page.keyboard.type('90');
  await page.keyboard.press('Enter');
  await moveTo(page, 0, 70);
}

test.describe('EZD-213c resolve the gap in the inspector', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-213c R1 finish a chain with a 1/2 inch gap, the section shows in the inspector; marker and any chain wall show it; Esc returns from pick', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(90_000);
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await view(page);
    await typedChainStart(page);
    await page.keyboard.type('9\' 11 1/2"');
    await page.keyboard.press('Tab');
    await page.keyboard.type('90');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    await expect.poll(async () => wallsIn(await objects(page)).length).toBe(4);
    const LAST = await wallStartingAt(page, 0, 120);
    const FIRST = await wallStartingAt(page, 0, 0);
    const sectionShown = async () => {
      await expect(inspector(page).getByTestId('inspector-gap')).toHaveCount(1);
      await expect(inspector(page).getByTestId('gap-size')).toHaveText(SIZE);
      await expect(inspector(page).getByTestId('gap-title')).toHaveText('Resolve the gap');
      await expect(inspector(page).getByTestId('gap-pick')).toHaveText(
        'Pick the wall that absorbs it',
      );
      await expect(inspector(page).getByTestId('gap-keep')).toHaveText(
        'Keep the room out of square',
      );
    };

    await expect.poll(() => selected(page)).toEqual([LAST.id]);
    await sectionShown();
    await expect(id(page, 'gap-box')).toHaveCount(1);
    await expect(id(page, 'gap-box').getByRole('button')).toHaveCount(1);
    await expect(id(page, 'gap-box').getByTestId('gap-pick')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect.poll(() => selected(page)).toEqual([]);
    await expect(id(page, 'inspector-gap')).toHaveCount(0);
    await expect(id(page, 'gap-box')).toHaveCount(1);

    await id(page, 'gap-pill').click();
    await expect.poll(() => selected(page)).toEqual([LAST.id]);
    await sectionShown();

    await clickAt(page, 72, 0);
    await expect.poll(() => selected(page)).toEqual([FIRST.id]);
    await sectionShown();

    await id(page, 'gap-pick').click();
    await expect(id(page, 'gap-hint')).toHaveText(HINT_DESKTOP);
    await expect(id(page, 'gap-pick')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(id(page, 'gap-pick')).toHaveCount(1);
    await expect(id(page, 'gap-hint')).toHaveCount(0);
    await expect.poll(() => selected(page)).toEqual([FIRST.id]);
  });

  test('EZD-213c R2 a view-only member clicks the marker and sees the size with no buttons', async ({
    page,
    signInAs,
  }) => {
    const { tenant, ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addGap(page);
    await saved(page);
    const LAST = await wallStartingAt(page, 0, 120);
    await setPermissions(tenant, user.membershipId, VIEWER as never);
    await page.reload();
    await openReady(page, ids.P1);
    await view(page);
    await expect(id(page, 'gap-box').getByRole('button')).toHaveCount(1);
    await id(page, 'gap-pill').click();
    await expect.poll(() => selected(page)).toEqual([LAST.id]);
    await expect(id(page, 'inspector-gap')).toBeVisible();
    await expect(id(page, 'gap-size')).toHaveText(SIZE);
    await expect(id(page, 'inspector-gap').getByRole('button')).toHaveCount(0);
    await expect(id(page, 'gap-title')).toHaveCount(0);
  });

  test(
    'EZD-213c R3 tablet: 44 px targets, tap hint, tap Select returns',
    { tag: ['@surface'] },
    async ({ page, signInAs }) => {
      const { ids, user } = await fixtureS();
      await signInAs(user.email);
      await openReady(page, ids.P1);
      await addGap(page);
      await view(page);
      expect(await expectTouchTargets(page, id(page, 'gap-box'))).toBe(1);
      await id(page, 'gap-pill').click();
      expect(await expectTouchTargets(page, id(page, 'inspector-gap'))).toBe(2);
      await id(page, 'gap-pick').click();
      await expect(id(page, 'gap-hint')).toHaveText(HINT_TOUCH);
      await page.locator('[data-rail-tool="select"]').click();
      await expect(id(page, 'gap-pick')).toHaveCount(1);
    },
  );
});
