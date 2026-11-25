// EZD-1979 (AC-EZD-1979-1, -2; audit/ui-live-2026-11-24/REPORT.md F4 and F6): on the iPad profile no editor control
// is covered by another. The edit bar sits clear of the zoom stack, the Electrical tool strip sits clear of the edit
// bar and the inspector card, and the header "Working copy · Version" switcher has a 44 px tall tap area. Both tests
// are @ipad (1180 x 820, touch). Every test makes its own company (never tenant 1) with fixture S and its own member.
// The walls are added through the `__ezdraftEditor` hook as in `edit-commands.spec.ts`. No import.meta or __dirname
// (lesson L-017).
import { CURRENT_SCHEMA_VERSION, createWallData, type Point } from '@ezdraft/geometry';
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
const TOUCH = 44;

type Window2 = {
  __ezdraftEditor: {
    objects(): Array<{ id: string; type: string; data: Record<string, unknown> }>;
    edit(changes: unknown[]): string[];
  };
};

type Box = { x: number; y: number; width: number; height: number };

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, EDITOR as never);
  return { tenant, ids, user: m };
}

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

// The four walls (0,0)->(144,0)->(144,120)->(0,120)->(0,0), a 120 sf room as on the audit's screens.
async function addWalls(page: Page) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const pt = (x: number, y: number): Point => ({ x, y });
  const pts = [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120), pt(0, 0)];
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

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (b === null) throw new Error('no box');
  return b;
}

// Two boxes overlap when they share an area (touching edges do not count).
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// The element found at the center of `locator` is the control or inside it (it is not covered there).
async function hitAtCenter(page: Page, locator: Locator): Promise<boolean> {
  const b = await box(locator);
  return locator.evaluate(
    (el, p) => {
      const found = document.elementFromPoint(p.x, p.y);
      return found !== null && el.contains(found);
    },
    { x: b.x + b.width / 2, y: b.y + b.height / 2 },
  );
}

async function seeded(page: Page, signInAs: (email: string) => Promise<unknown>) {
  const { ids, user } = await fixtureS();
  await signInAs(user.email);
  await openReady(page, ids.P1);
  await addWalls(page);
  // The edit bar loads lazily on touch screens (EZD-233).
  await expect(id(page, 'edit-undo')).toBeVisible();
}

async function expectZoomClear(page: Page) {
  const bar = await box(id(page, 'edit-bar'));
  const stack = id(page, 'zoom-stack');
  expect(overlaps(bar, await box(stack))).toBe(false);
  for (const name of ['Zoom in', 'Zoom out']) {
    const button = stack.getByRole('button', { name, exact: true });
    const b = await box(button);
    expect(b.width).toBeGreaterThanOrEqual(TOUCH);
    expect(b.height).toBeGreaterThanOrEqual(TOUCH);
    expect(await hitAtCenter(page, button)).toBe(true);
  }
}

async function expectVersionTappable(page: Page) {
  const version = id(page, 'editor-version');
  expect(await hitAtCenter(page, version)).toBe(true);
  // The tap area runs at least 44 px down through the switcher's center: every point on that line finds it.
  const b = await box(version);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const run = await version.evaluate(
    (el, p) => {
      const at = (y: number) => {
        const found = document.elementFromPoint(p.cx, y);
        return found !== null && el.contains(found);
      };
      let up = 0;
      while (up < 100 && at(p.cy - up - 1)) up++;
      let down = 0;
      while (down < 100 && at(p.cy + down + 1)) down++;
      return up + down + 1;
    },
    { cx, cy },
  );
  expect(run).toBeGreaterThanOrEqual(TOUCH);
}

test.describe('EZD-1979 iPad editor controls are not covered', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'EZD-1979 plan screen: the edit bar clears Zoom in and the version switcher is tappable',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      test.setTimeout(90_000);
      await seeded(page, signInAs);
      await expectZoomClear(page);
      await expectVersionTappable(page);
      await expectTouchTargets(page, page.locator('body'));
    },
  );

  test(
    'EZD-1979 Electrical tool: the tool strip clears the edit bar and the inspector card',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      test.setTimeout(90_000);
      await seeded(page, signInAs);
      await page.locator('[data-rail-tool="electrical"]').tap();
      await expect(page.locator('[data-rail-tool="electrical"]')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      const strip = id(page, 'device-toolbar').getByRole('toolbar');
      await expect(strip).toBeVisible();
      const stripBox = await box(strip);
      expect(overlaps(stripBox, await box(id(page, 'edit-bar')))).toBe(false);
      expect(overlaps(stripBox, await box(page.locator('[data-shell-region="inspector"]')))).toBe(
        false,
      );
      expect(overlaps(stripBox, await box(id(page, 'zoom-stack')))).toBe(false);
      await expectZoomClear(page);
      await expectVersionTappable(page);
      await expectTouchTargets(page, page.locator('body'));
    },
  );

  test(
    'EZD-1979 Electrical tool: the tool strip clears the Select more banner and its Done button',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      test.setTimeout(90_000);
      await seeded(page, signInAs);
      await page.locator('[data-rail-tool="electrical"]').tap();
      const strip = id(page, 'device-toolbar').getByRole('toolbar');
      await expect(strip).toBeVisible();
      await id(page, 'select-more').tap();
      const done = id(page, 'select-more-done');
      await expect(done).toBeVisible();
      const stripBox = await box(strip);
      expect(overlaps(stripBox, await box(id(page, 'select-more-banner')))).toBe(false);
      expect(overlaps(stripBox, await box(done))).toBe(false);
      expect(overlaps(stripBox, await box(id(page, 'edit-bar')))).toBe(false);
      expect(overlaps(stripBox, await box(page.locator('[data-shell-region="inspector"]')))).toBe(
        false,
      );
      expect(overlaps(stripBox, await box(id(page, 'zoom-stack')))).toBe(false);
      expect(await hitAtCenter(page, done)).toBe(true);
      await expectZoomClear(page);
      await expectTouchTargets(page, page.locator('body'));
      await done.tap();
      await expect(id(page, 'select-more-banner')).toHaveCount(0);
    },
  );
});
