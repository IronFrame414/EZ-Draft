// EZD-2029 (Q-0909; AC-EZD-2029-1..4; accessibility and iPad audit 2026-11-27 A18): on a touch screen the editor
// left panel starts folded and the canvas takes its width; one control below the rail opens it and folds it again
// (or Esc), on the plan and on Sheets. With a wall selected, at 1180x820 and 1024x1366, the edit bar covers neither the
// inspector, the left panel nor Zoom in, folded or open. With a mouse the panel stays open and there is no control.
// Every test makes its own company (never tenant 1) with fixture S and its own member; walls go in through the
// `__ezdraftEditor` hook as in edit-commands.spec.ts. No import.meta or __dirname (lesson L-017).
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
import { en } from '../src/server/messages/catalogs/en';

const EDITOR = ['view_projects', 'edit_model'];
const TOUCH = 44;
const TOGGLE_NAME = en['common.shell.left_panel_toggle'];

type Window2 = {
  __ezdraftEditor: {
    objects(): Array<{ id: string; type: string; data: Record<string, unknown> }>;
    edit(changes: unknown[]): string[];
  };
  __ezdraftPlan: {
    handle: {
      setView(v: { x: number; y: number; ppi: number }): void;
      modelToScreen(p: Point): Point;
    };
  };
  __ezdraftSelection: { ids(): string[] };
};

type Box = { x: number; y: number; width: number; height: number };

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const region = (page: Page, name: string): Locator =>
  page.locator(`[data-shell-region="${name}"]`);
const toggle = (page: Page): Locator => page.getByRole('button', { name: TOGGLE_NAME, exact: true });

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

// The four walls (0,0)->(144,0)->(144,120)->(0,120)->(0,0).
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

// Taps the top wall's middle, (72, 0), and waits for it to be the one selected object. The view puts model (0,0)
// at canvas-region point (128, 384), clear of the edit bar row and the open panel.
async function selectWall(page: Page) {
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
  const canvas = await box(region(page, 'canvas'));
  const s = await page.evaluate(() =>
    (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen({ x: 72, y: 0 }),
  );
  await page.touchscreen.tap(canvas.x + s.x, canvas.y + s.y);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids().length))
    .toBe(1);
}

async function seeded(page: Page, signInAs: (email: string) => Promise<unknown>) {
  const { ids, user } = await fixtureS();
  await signInAs(user.email);
  await openReady(page, ids.P1);
  await addWalls(page);
  // The edit bar loads lazily on touch screens (EZD-233).
  await expect(id(page, 'edit-undo')).toBeVisible();
  return ids;
}

// AC-EZD-2029-2: the edit bar covers none of the inspector, the left panel (when shown), Zoom in, or the control.
async function expectBarClear(page: Page) {
  const bar = await box(id(page, 'edit-bar'));
  expect(overlaps(bar, await box(region(page, 'inspector'))), 'bar / inspector').toBe(false);
  const panel = region(page, 'left-panel');
  if (await panel.isVisible()) {
    expect(overlaps(bar, await box(panel)), 'bar / left panel').toBe(false);
  }
  const zoomIn = id(page, 'zoom-stack').getByRole('button', { name: 'Zoom in', exact: true });
  expect(overlaps(bar, await box(zoomIn)), 'bar / Zoom in').toBe(false);
  expect(await hitAtCenter(page, zoomIn)).toBe(true);
  expect(overlaps(bar, await box(toggle(page))), 'bar / control').toBe(false);
  // The bar's buttons are all where a finger can reach them.
  for (const name of ['undo', 'delete', 'duplicate']) {
    expect(await hitAtCenter(page, id(page, `edit-${name}`)), name).toBe(true);
  }
}

async function expectFolded(page: Page) {
  await expect(region(page, 'left-panel')).toBeHidden();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  // The canvas takes the panel's width: it starts 16 px after the rail column.
  const rail = await box(region(page, 'rail'));
  expect((await box(region(page, 'canvas'))).x).toBe(rail.x + rail.width + 16);
}

async function expectOpen(page: Page) {
  const panel = region(page, 'left-panel');
  await expect(panel).toBeVisible();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  const p = await box(panel);
  expect(p.width).toBe(248);
  expect(overlaps(p, await box(region(page, 'inspector'))), 'panel / inspector').toBe(false);
  expect(await hitAtCenter(page, toggle(page))).toBe(true);
}

async function sizes(page: Page, at: { width: number; height: number }) {
  await page.setViewportSize(at);
  await expect(region(page, 'frame')).toBeVisible();
  await expect(id(page, 'edit-bar')).toBeVisible();
}

test.describe('EZD-2029 touch screens: the left panel folds away', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'EZD-2029 AC-1, AC-2, AC-4: plan with a wall selected at 1180x820 and 1024x1366, folded and open',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      test.setTimeout(120_000);
      await seeded(page, signInAs);
      await expectFolded(page);
      await selectWall(page);
      await expect(id(page, 'edit-delete')).toBeEnabled();

      for (const at of [
        { width: 1180, height: 820 },
        { width: 1024, height: 1366 },
      ]) {
        await sizes(page, at);
        await expectFolded(page);
        await expectBarClear(page);
        const t = await box(toggle(page));
        expect(t.width).toBeGreaterThanOrEqual(TOUCH);
        expect(t.height).toBeGreaterThanOrEqual(TOUCH);

        await toggle(page).tap();
        await expectOpen(page);
        await expectBarClear(page);
        // The wall stays selected while the panel opens.
        expect(
          await page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids().length),
        ).toBe(1);
        // Open, the control stays 44 px and nothing covers it.
        const t2 = await box(toggle(page));
        expect(t2.width).toBeGreaterThanOrEqual(TOUCH);
        expect(t2.height).toBeGreaterThanOrEqual(TOUCH);
        expect(await hitAtCenter(page, toggle(page))).toBe(true);

        // The same control folds it again.
        await toggle(page).tap();
        await expectFolded(page);
        await expectBarClear(page);
        // AC-4: the rail's column (the rail and the control below it) passes the 44 px check; the folded panel in
        // it is skipped as not shown.
        expect(await expectTouchTargets(page, toggle(page).locator('..'))).toBeGreaterThan(1);
      }
    },
  );

  test(
    'EZD-2029 AC-1: Esc folds the open panel from the control or from inside the panel',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      test.setTimeout(90_000);
      await seeded(page, signInAs);
      await selectWall(page);

      await toggle(page).tap();
      await expectOpen(page);
      await toggle(page).focus();
      await page.keyboard.press('Escape');
      await expectFolded(page);
      // Esc folded the panel only: the wall is still selected.
      expect(
        await page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids().length),
      ).toBe(1);

      await toggle(page).tap();
      await expectOpen(page);
      await region(page, 'left-panel').getByRole('button').first().focus();
      await page.keyboard.press('Escape');
      await expectFolded(page);
      await expect(toggle(page)).toBeFocused();
    },
  );

  test(
    'EZD-2029 AC-1: Sheets has the same fold and control',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      test.setTimeout(90_000);
      await seeded(page, signInAs);
      await page
        .getByRole('navigation', { name: 'Views' })
        .getByRole('button', { name: 'Sheets', exact: true })
        .tap();
      await expect(toggle(page)).toBeVisible();
      await expect(region(page, 'left-panel')).toBeHidden();
      await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
      await toggle(page).tap();
      await expect(region(page, 'left-panel')).toBeVisible();
      await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
      await toggle(page).tap();
      await expect(region(page, 'left-panel')).toBeHidden();
    },
  );

  test(
    'EZD-2029 AC-3: with a mouse the left panel stays open and there is no fold control',
    { tag: ['@desktop'] },
    async ({ page, signInAs }) => {
      test.setTimeout(90_000);
      const { ids, user } = await fixtureS();
      await signInAs(user.email);
      await openReady(page, ids.P1);
      await expect(region(page, 'left-panel')).toBeVisible();
      expect(await box(region(page, 'left-panel'))).toMatchObject({ x: 88, y: 92, width: 248 });
      await expect(toggle(page)).toHaveCount(0);
      await expect(id(page, 'left-panel-toggle')).toBeHidden();
    },
  );
});
