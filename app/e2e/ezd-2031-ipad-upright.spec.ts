// EZD-2031 (Q-0908, which changes Q-0054 (a); AC-EZD-2031-1, AC-EZD-2031-2, AC-EZD-2031-3, AC-EZD-2031-4; accessibility and iPad audit 2026-11-27 A17): the
// editor runs on an iPad held upright. A screen 744 to 1023 px wide and at least 744 px tall gets the editor shell; a
// phone, also held sideways, and anything under 744 px wide keep the phone layout; from 1024 px nothing changes. At
// 768x1024 and 834x1194 on a touch screen the rail, canvas and inspector are on screen with no sideways page scroll,
// the left panel is folded (Q-0909, EZD-2029), the edit bar with a wall selected covers neither the inspector nor Zoom
// in, the header and status bar stay on one line, and every control passes the 44 px check.
// Expected boxes come from the frame tokens (styles/tokens.css): header margin 16 + height 60, body padding 16, gap
// 16, rail 56, inspector 336 (below the canvas when upright, as tall as the inspector is wide), status bar 30 with a
// 16 px margin. Every test makes its own company (never tenant 1) with fixture S and its own member; walls go in
// through the `__ezdraftEditor` hook as in ezd-2029-touch-left-panel-fold.spec.ts. No import.meta or __dirname (L-017).
import { CURRENT_SCHEMA_VERSION, createWallData, type Point } from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
import {
  PERMISSION_KEYS,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  expectTouchTargets,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { TOUCH_TARGET_SELECTOR } from '../test-harness/touch-targets';
import { seedFixtureS } from '../test-harness/projects-fixture';
import { en } from '../src/server/messages/catalogs/en';

const EDITOR = ['view_projects', 'edit_model'];
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
type Size = { width: number; height: number };

const UPRIGHT: Size[] = [
  { width: 768, height: 1024 },
  { width: 834, height: 1194 },
];

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const region = (page: Page, name: string): Locator => page.locator(`[data-shell-region="${name}"]`);
const frame = (page: Page): Locator => region(page, 'frame');
const phoneFrame = (page: Page): Locator => page.locator('[data-phone-region="frame"]');
const header = (page: Page): Locator => page.locator('[data-shell-region="frame"] > header');
const toggle = (page: Page): Locator =>
  page.getByRole('button', { name: TOGGLE_NAME, exact: true });

// EZD-324: WebKit reports a media-query change in its next rendering update; wait for it.
const nextFrame = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (b === null) throw new Error('no box');
  return b;
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function hitAtCenter(locator: Locator): Promise<boolean> {
  const b = await box(locator);
  return locator.evaluate(
    (el, p) => {
      const found = document.elementFromPoint(p.x, p.y);
      return found !== null && el.contains(found);
    },
    { x: b.x + b.width / 2, y: b.y + b.height / 2 },
  );
}

// The upright frame boxes at W x H, from the tokens: the body content runs from y 92 (16 + 60 + 16) to H - 62 (status
// bar 30 + its margin 16 + body padding 16); the rail column is 56 wide at x 16 and the rail stops 16 + 56 above its
// bottom for the fold control; the canvas starts at x 88 and runs to W - 16; the inspector, 336 tall, sits 16 below it.
function upright({ width: W, height: H }: Size): Record<string, Box> {
  const bottom = H - 62;
  const canvasH = bottom - 92 - 16 - 336;
  return {
    rail: { x: 16, y: 92, width: 56, height: bottom - 92 - 16 - 56 },
    canvas: { x: 88, y: 92, width: W - 16 - 88, height: canvasH },
    inspector: { x: 88, y: 92 + canvasH + 16, width: W - 16 - 88, height: 336 },
    'status-bar': { x: 16, y: H - 46, width: W - 32, height: 30 },
  };
}

const REGION_ATTR = 'data-ezd2031-region';
// A region is at most this tall, so it fits the upright inspector (336 px) when scrolled into view.
const REGION_MAX = 300;

// Checks every visible control under `root` with expectTouchTargets, region by region (as
// ezd-1980-ipad-touch-targets.spec.ts): each control's largest enclosing box that fits REGION_MAX and does not scroll is
// scrolled to the middle and checked while in view; the regions together must hold every visible control.
async function expectAllTouchTargets(page: Page, root: Locator): Promise<number> {
  const { total, regions } = await root.evaluate(
    (rootEl, { selector, attr, max }) => {
      const visible = (el: Element) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return !(
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          r.width <= 0 ||
          r.height <= 0
        );
      };
      const targets = Array.from(rootEl.querySelectorAll(selector)).filter(visible);
      const chosen = new Set<Element>();
      const scrolls = (el: Element) => el.scrollHeight > el.clientHeight + 1;
      for (const t of targets) {
        let region: Element = t.parentElement ?? rootEl;
        let up = region.parentElement;
        while (
          up &&
          rootEl.contains(up) &&
          up.getBoundingClientRect().height <= max &&
          !scrolls(up)
        ) {
          region = up;
          up = up.parentElement;
        }
        chosen.add(region);
      }
      const outer = [...chosen].filter((r) => ![...chosen].some((o) => o !== r && o.contains(r)));
      document.querySelectorAll(`[${attr}]`).forEach((e) => e.removeAttribute(attr));
      outer.forEach((r, i) => r.setAttribute(attr, String(i)));
      return { total: targets.length, regions: outer.length };
    },
    { selector: TOUCH_TARGET_SELECTOR, attr: REGION_ATTR, max: REGION_MAX },
  );
  expect(total, 'controls on the screen').toBeGreaterThan(0);
  let checked = 0;
  for (let i = 0; i < regions; i++) {
    const region = page.locator(`[${REGION_ATTR}="${i}"]`);
    await region.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    checked += await expectTouchTargets(page, region);
  }
  expect(checked, 'every control was checked').toBe(total);
  return checked;
}

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, EDITOR as never);
  return { ids, user: m };
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

// Taps the top wall's middle, (72, 0), and waits for it to be the one selected object. Model (0,0) is at canvas point
// (128, 384): below the edit bar row and inside the upright canvas (664 x 518 at 768x1024).
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

// The header and the status bar are each one line: the header keeps its 60 px card and every control in it lies
// inside it; the status bar keeps its 30 px and no cell is taller than one line or spills out of the bar.
async function expectOneLine(page: Page, W: number) {
  const hb = await box(header(page));
  expect(hb).toEqual({ x: 16, y: 16, width: W - 32, height: 60 });
  const controls = header(page).locator('a[href], button');
  for (const c of await controls.all()) {
    if (!(await c.isVisible())) continue;
    const b = await box(c);
    const name = (await c.getAttribute('aria-label')) ?? (await c.innerText());
    expect(b.y, name).toBeGreaterThanOrEqual(hb.y);
    expect(b.y + b.height, name).toBeLessThanOrEqual(hb.y + hb.height);
    expect(b.x + b.width, name).toBeLessThanOrEqual(W - 16);
  }
  const bar = region(page, 'status-bar');
  const sb = await box(bar);
  expect(sb.height).toBe(30);
  const spill = await bar.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const out: string[] = [];
    for (const c of Array.from(
      el.querySelectorAll('[data-status-item], [data-status-label], [data-status-value]'),
    )) {
      const b = c.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.left < r.left - 0.5 || b.right > r.right + 0.5 || b.bottom > r.bottom + 0.5) {
        out.push(
          `${(c.textContent ?? '').trim().slice(0, 30)} ${Math.round(b.left)}-${Math.round(b.right)}`,
        );
      }
    }
    return out;
  });
  expect(spill).toEqual([]);
  // No two cells overlap (a cell that runs out of room is cut, Q-0807; it never runs under its neighbour).
  const cells = await bar.evaluate((el) =>
    Array.from(el.querySelectorAll('[data-status-item]'))
      .map((c) => {
        const b = c.getBoundingClientRect();
        return {
          text: (c.textContent ?? '').trim().slice(0, 30),
          left: b.left,
          right: b.right,
          w: b.width,
        };
      })
      .filter((c) => c.w > 0)
      .sort((a, b) => a.left - b.left),
  );
  // (The dev shell's bar holds only the disclaimer.)
  for (let i = 1; i < cells.length; i++) {
    expect(cells[i]!.left, `${cells[i - 1]!.text} / ${cells[i]!.text}`).toBeGreaterThanOrEqual(
      cells[i - 1]!.right,
    );
  }
}

test.describe('EZD-2031 the editor runs on an iPad held upright', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'AC-EZD-2031-1, AC-EZD-2031-4: from 1024 px wide nothing changes; 744 to 1023 px wide and at least 744 px tall gets the editor shell; phones keep the phone layout',
    { tag: ['@ipad'] },
    async ({ page }) => {
      for (const path of ['/dev/device', '/dev/shell']) {
        await page.goto(path);
        const steps: Array<[number, number, 'full' | 'phone']> = [
          [768, 1024, 'full'],
          [834, 1194, 'full'],
          [744, 744, 'full'],
          [1023, 744, 'full'],
          [743, 1024, 'phone'],
          [1023, 743, 'phone'],
          [932, 430, 'phone'],
          [390, 844, 'phone'],
          [1024, 600, 'full'],
          [1180, 820, 'full'],
        ];
        for (const [width, height, want] of steps) {
          await page.setViewportSize({ width, height });
          await nextFrame(page);
          const at = `${path} ${width}x${height}`;
          if (want === 'full') {
            await expect(frame(page), at).toBeVisible();
            await expect(phoneFrame(page), at).toHaveCount(0);
          } else {
            await expect(phoneFrame(page), at).toBeVisible();
            await expect(frame(page), at).toHaveCount(0);
          }
        }
      }
    },
  );

  test(
    'AC-EZD-2031-1, AC-EZD-2031-2, AC-EZD-2031-3: the plan editor at 768x1024 and 834x1194 with a wall selected',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      test.setTimeout(150_000);
      const { ids, user } = await fixtureS();
      await signInAs(user.email);
      await page.setViewportSize(UPRIGHT[0]!);
      await openReady(page, ids.P1);
      await expect(phoneFrame(page)).toHaveCount(0);
      await addWalls(page);
      // The edit bar loads lazily on touch screens (EZD-233).
      await expect(id(page, 'edit-undo')).toBeVisible();

      for (const at of UPRIGHT) {
        await page.setViewportSize(at);
        await nextFrame(page);
        await expect(frame(page)).toBeVisible();
        await expect(page.locator('[data-phone-region]')).toHaveCount(0);
        const want = upright(at);
        for (const [name, b] of Object.entries(want)) {
          await expect.poll(() => box(region(page, name)), `${at.width} ${name}`).toEqual(b);
        }
        const scroll = await page.evaluate(() => ({
          w: document.documentElement.scrollWidth,
          h: document.documentElement.scrollHeight,
        }));
        expect(scroll).toEqual({ w: at.width, h: at.height });

        // The left panel is folded (Q-0909); its control sits 16 px below the rail.
        await expect(region(page, 'left-panel')).toBeHidden();
        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
        const rail = want.rail!;
        expect(await box(toggle(page))).toEqual({
          x: 16,
          y: rail.y + rail.height + 16,
          width: 56,
          height: 56,
        });

        // A long cursor reading: a tap on empty canvas at model (-283 1/2", -183 1/2"), far from the walls.
        await page.evaluate(() =>
          (window as unknown as Window2).__ezdraftPlan.handle.setView({
            x: -396,
            y: -71,
            ppi: 8 / 3,
          }),
        );
        const cv = await box(region(page, 'canvas'));
        await page.touchscreen.tap(cv.x + 300, cv.y + 300);
        await expect(id(page, 'status-cursor')).toContainText("-23'");
        await expect(id(page, 'status-cursor')).toContainText("-15'");
        // Q-0807: the reading, cut with an ellipsis when it runs out of room, has its full text as the tooltip.
        const reading = await id(page, 'status-cursor').evaluate((el) => el.textContent ?? '');
        expect(reading).toMatch(/^-23' .+ , -15' /);
        await expect(id(page, 'status-cursor')).toHaveAttribute('title', reading);
        await expectOneLine(page, at.width);
        // Every plan cell stays: Floor, View, Scale, Snap, Cursor and Zoom.
        expect(
          await region(page, 'status-bar').locator('[data-status-item]').count(),
        ).toBeGreaterThanOrEqual(6);

        // AC-EZD-2031-3: on the plan, with nothing selected (the edit bar is shown on a touch screen), every control in the
        // frame passes the 44 px check, region by region as EZD-1980 does.
        await expect
          .poll(() =>
            page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids().length),
          )
          .toBe(0);
        expect(await expectAllTouchTargets(page, frame(page))).toBeGreaterThan(0);

        await selectWall(page);
        await expect(id(page, 'edit-delete')).toBeEnabled();
        const bar = await box(id(page, 'edit-bar'));
        expect(overlaps(bar, await box(region(page, 'inspector'))), 'bar / inspector').toBe(false);
        const zoomIn = id(page, 'zoom-stack').getByRole('button', { name: 'Zoom in', exact: true });
        expect(overlaps(bar, await box(zoomIn)), 'bar / Zoom in').toBe(false);
        expect(await hitAtCenter(zoomIn)).toBe(true);
        for (const name of ['undo', 'redo', 'delete', 'duplicate', 'copy', 'paste']) {
          expect(await hitAtCenter(id(page, `edit-${name}`)), name).toBe(true);
        }
        // The bar lies inside the canvas.
        const canvas = await box(region(page, 'canvas'));
        expect(bar.x + bar.width).toBeLessThanOrEqual(canvas.x + canvas.width);

        // With the wall selected the edit bar's controls pass the 44 px check too.
        expect(await expectTouchTargets(page, id(page, 'edit-bar'))).toBe(8);

        // Open, the left panel covers neither the inspector nor the edit bar's buttons it does not lie over.
        await toggle(page).tap();
        const panel = region(page, 'left-panel');
        await expect(panel).toBeVisible();
        expect(
          overlaps(await box(panel), await box(region(page, 'inspector'))),
          'panel / inspector',
        ).toBe(false);
        await toggle(page).tap();
        await expect(panel).toBeHidden();
        // Clear the selection for the next size: a tap on empty canvas, right of the walls, below the zoom stack.
        const c = await box(region(page, 'canvas'));
        await page.touchscreen.tap(c.x + c.width - 40, c.y + c.height - 40);
      }
    },
  );
  test(
    'AC-EZD-2031-2: with every permission the header and status bar stay on one line at 768x1024 and 834x1194',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      test.setTimeout(120_000);
      const tenant = await createTenant();
      const ids = await seedFixtureS(tenant);
      const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
      await setPermissions(tenant, m.membershipId, PERMISSION_KEYS as never);
      await signInAs(m.email);
      await page.setViewportSize(UPRIGHT[0]!);
      await openReady(page, ids.P1);
      for (const at of UPRIGHT) {
        await page.setViewportSize(at);
        await nextFrame(page);
        await expect(frame(page)).toBeVisible();
        await expectOneLine(page, at.width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(at.width);
      }
      // The dev shell has the full header too (tabs, Share, Export, Issue set).
      await page.goto('/dev/device');
      for (const at of UPRIGHT) {
        await page.setViewportSize(at);
        await nextFrame(page);
        await expectOneLine(page, at.width);
      }
    },
  );

  test(
    'AC-EZD-2031-1: 3D and Sheets, which have no inspector, give the canvas the full height upright',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      test.setTimeout(90_000);
      const { ids, user } = await fixtureS();
      await signInAs(user.email);
      const at = UPRIGHT[0]!;
      await page.setViewportSize(at);
      await openReady(page, ids.P1);
      const views = page.getByRole('navigation', { name: 'Views' });
      // Sheets: the rail column holds only the fold control; the canvas runs from y 92 to H - 62.
      await views.getByRole('button', { name: 'Sheets', exact: true }).tap();
      await expect(region(page, 'inspector')).toHaveCount(0);
      await expect
        .poll(() => box(region(page, 'canvas')))
        .toEqual({ x: 88, y: 92, width: at.width - 16 - 88, height: at.height - 62 - 92 });
      // Open, the left panel runs to the canvas bottom (there is no inspector to keep clear of).
      await toggle(page).tap();
      await expect(region(page, 'left-panel')).toBeVisible();
      const p = await box(region(page, 'left-panel'));
      expect(p.y + p.height).toBe(at.height - 62);
      await toggle(page).tap();
      // 3D: no rail and no left panel; the canvas takes the whole body.
      await views.getByRole('button', { name: '3D', exact: true }).tap();
      await expect(region(page, 'inspector')).toHaveCount(0);
      await expect
        .poll(() => box(region(page, 'canvas')))
        .toEqual({ x: 16, y: 92, width: at.width - 32, height: at.height - 62 - 92 });
    },
  );
});
