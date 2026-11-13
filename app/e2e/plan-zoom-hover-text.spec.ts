// EZD-207b B1-B6 (vault/plans/EZD-207b.md section 4; AC-EZD-207-2, -3, -4, -8). B1-B4 and B6 are untagged (project
// desktop, 1600 x 1000); B5 is tagged @surface. Every test makes its own company (never tenant 1) with fixture S and
// its own member. Walls and rooms are added through the `__ezdraftEditor` test hook with data from createWallData
// (lesson EZD-120d: status overwritten). Region px + the plan-input box = page px. No import.meta or __dirname
// (lesson L-017).
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
import type { Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
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

async function fixtureS(permissions: string[] = EDITOR) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return { tenant, ids, user: m };
}

type View = { x: number; y: number; ppi: number };
type Pt = { x: number; y: number };
type PlanHook = {
  handle: {
    getView(): View;
    setView(v: View): void;
    modelToScreen(p: Pt): Pt;
    getHoveredWallId(): string | null;
    getHoveredId(): string | null;
  };
  stats(): {
    frames: number;
    drawCalls: number;
    bufferUploads: number;
    glyphs: number;
    highlightUploads: number;
    contexts: number;
  };
};
type EditorHook = {
  objects(): Array<{ id: string; type: string; data: Record<string, unknown> }>;
  edit(changes: unknown[]): string[];
};
type Window2 = {
  __ezdraftPlan: PlanHook;
  __ezdraftEditor: EditorHook;
  __EZD_PERF__: { commits: number; mark(name: string): void };
};

const LOAD_ROUTE = '**/api/projects/*/model';
const editorState = (page: Page) => page.getByTestId('editor-state');
const planCanvas = (page: Page) => page.getByTestId('plan-canvas');
const planInput = (page: Page) => page.getByTestId('plan-input');
const stack = (page: Page) => page.getByTestId('zoom-stack');

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
  await expect(planCanvas(page)).toHaveAttribute('data-plan-state', 'ready');
}

const stat = (page: Page, name: 'frames' | 'bufferUploads' | 'glyphs' | 'highlightUploads') =>
  page.evaluate((n) => (window as unknown as Window2).__ezdraftPlan.stats()[n], name);
const frames = (page: Page) => stat(page, 'frames');
const commits = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__EZD_PERF__.commits);
const getView = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.handle.getView());
const toScreen = (page: Page, p: Pt) =>
  page.evaluate((q) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(q), p);
const hovered = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.handle.getHoveredId());

async function waitForFrameAbove(page: Page, before: number) {
  await expect
    .poll(() => frames(page), { intervals: [100], timeout: 5000 })
    .toBeGreaterThan(before);
}

async function setViewAndWait(page: Page, view: View) {
  const before = await frames(page);
  await page.evaluate((v) => (window as unknown as Window2).__ezdraftPlan.handle.setView(v), view);
  await waitForFrameAbove(page, before);
}

async function floorId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
}

// Adds W1 (0,0)-(120,0) and returns its id.
async function addW1(page: Page): Promise<string> {
  const level = await floorId(page);
  const made = createWallData({ start: { x: 0, y: 0 }, end: { x: 120, y: 0 }, level });
  if (!made.ok) throw new Error('wall data');
  const id = crypto.randomUUID();
  await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    [
      {
        id,
        value: {
          type: 'wall',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: { ...made.data, status: 'existing' },
        },
      },
    ],
  );
  return id;
}

async function addR1(page: Page): Promise<void> {
  const level = await floorId(page);
  await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    [
      {
        id: crypto.randomUUID(),
        value: {
          type: 'room',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: {
            geometry: {
              boundary: [
                { x: 0, y: 0 },
                { x: 141.5, y: 0 },
                { x: 141.5, y: 168 },
                { x: 0, y: 168 },
              ],
            },
            status: 'existing',
            level,
            attributes: { name: 'Kitchen', floorLevel: 0, photos: [] },
            closureOverride: null,
          },
        },
      },
    ],
  );
}

// Copy of shell-frame.spec.ts `pixel`: the colour of one pixel of a page screenshot, as #rrggbb.
async function pixel(page: Page, png: Buffer, x: number, y: number): Promise<string> {
  const b64 = png.toString('base64');
  return page.evaluate(
    async ({ b64, x, y }) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
        colorSpaceConversion: 'none',
      });
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(x, y, 1, 1).data;
      return '#' + [d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, '0')).join('');
    },
    { b64, x, y },
  );
}

// The number of pixels inside the page-px rectangle within +-16 per channel of `want` (a #rrggbb colour).
async function countNear(
  page: Page,
  png: Buffer,
  rect: { x: number; y: number; width: number; height: number },
  want: string,
): Promise<number> {
  const b64 = png.toString('base64');
  return page.evaluate(
    async ({ b64, rect, want }) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
        colorSpaceConversion: 'none',
      });
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(rect.x, rect.y, rect.width, rect.height).data;
      const w = [1, 3, 5].map((i) => parseInt(want.slice(i, i + 2), 16));
      let n = 0;
      for (let i = 0; i < d.length; i += 4)
        if (
          Math.abs(d[i] - w[0]) <= 16 &&
          Math.abs(d[i + 1] - w[1]) <= 16 &&
          Math.abs(d[i + 2] - w[2]) <= 16
        )
          n++;
      return n;
    },
    { b64, rect, want },
  );
}

const channels = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const within2 = (got: string, want: string): boolean =>
  channels(got).every((c, i) => Math.abs(c - channels(want)[i]) <= 2);

async function regionBox(page: Page) {
  const box = await planInput(page).boundingBox();
  if (!box) throw new Error('plan-input has no box');
  return box;
}
async function regionPoint(page: Page, x: number, y: number): Promise<Pt> {
  const box = await regionBox(page);
  return { x: box.x + x, y: box.y + y };
}
async function moveTo(page: Page, x: number, y: number) {
  const p = await regionPoint(page, x, y);
  await page.mouse.move(p.x, p.y);
}

// EZD-396: Fit's zoom for W1 in the measured canvas region (fitView, view.ts:78-98): margin 48 px (FIT_MARGIN_PX), W1's bounds 120 x 4.5 in.
function fitPpiW1(region: { width: number; height: number }): number {
  return Math.min((region.width - 2 * 48) / 120, (region.height - 2 * 48) / 4.5);
}

// Repo root: nearest folder upward from the working directory holding pnpm-workspace.yaml (Q-0197 (b)).
function repoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error('no pnpm-workspace.yaml above ' + process.cwd());
    dir = up;
  }
}
const hooksInit = () => ({
  path: path.join(repoRoot(), 'scripts', 'perf', 'page-hooks.browser.js'),
});

const button = (page: Page, name: string) => stack(page).getByRole('button', { name });

test.describe('EZD-207b plan canvas', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-207b B1 the zoom stack sits top right, steps about the centre, fits, and makes no React commit', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(60_000);
    await page.addInitScript(hooksInit());
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addW1(page);
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-status', 'saved', {
      timeout: 15_000,
    });

    const region = await regionBox(page);
    const box = await stack(page).boundingBox();
    if (!box) throw new Error('zoom-stack has no box');
    expect(Math.abs(box.x + box.width - (region.x + region.width - 16))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(box.y - (region.y + 16))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(box.width - 40)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(box.height - 116)).toBeLessThanOrEqual(0.5);
    const buttons = stack(page).getByRole('button');
    await expect(buttons).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const b = await buttons.nth(i).boundingBox();
      expect(Math.abs((b?.width ?? 0) - 38)).toBeLessThanOrEqual(0.5);
      expect(Math.abs((b?.height ?? 0) - 38)).toBeLessThanOrEqual(0.5);
      await expect(buttons.nth(i)).toHaveCSS('color', 'rgb(59, 66, 77)');
    }
    await expect(stack(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(stack(page)).toHaveCSS('border', '1px solid rgb(223, 226, 230)');
    await expect(stack(page)).toHaveCSS('border-radius', '10px');
    await expect(buttons.nth(0)).toHaveCSS('border-bottom', '1px solid rgb(238, 240, 243)');
    await expect(buttons.nth(1)).toHaveCSS('border-bottom', '1px solid rgb(238, 240, 243)');
    await expect(buttons.nth(2)).toHaveCSS('border-bottom', /^0px none/);

    await setViewAndWait(page, { x: 0, y: 0, ppi: 8 / 3 });
    const centre = { x: region.width / 2, y: region.height / 2 };
    const fixedModel = { x: centre.x / (8 / 3), y: -centre.y / (8 / 3) };
    const commits0 = await commits(page);
    await button(page, 'Zoom in').click();
    await expect.poll(async () => (await getView(page)).ppi).toBeCloseTo(10 / 3, 6);
    let s = await toScreen(page, fixedModel);
    expect(Math.abs(s.x - centre.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(s.y - centre.y)).toBeLessThanOrEqual(0.5);
    await button(page, 'Zoom out').click();
    await expect.poll(async () => (await getView(page)).ppi).toBeCloseTo(8 / 3, 6);
    s = await toScreen(page, fixedModel);
    expect(Math.abs(s.x - centre.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(s.y - centre.y)).toBeLessThanOrEqual(0.5);

    const from = await regionPoint(page, 600, 500);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(from.x + 200, from.y, { steps: 5 });
    await page.mouse.up({ button: 'right' });
    await button(page, 'Fit to screen').click();
    await expect.poll(async () => (await getView(page)).ppi).toBeCloseTo(fitPpiW1(region), 3);
    const fitted = await toScreen(page, { x: 60, y: -2.25 });
    expect(Math.abs(fitted.x - centre.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(fitted.y - centre.y)).toBeLessThanOrEqual(0.5);
    expect((await commits(page)) - commits0).toBe(0);
  });

  test('EZD-207b B2 the wall under the mouse turns blue with no React commit and one upload per change', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(60_000);
    await page.addInitScript(hooksInit());
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const w1 = await addW1(page);
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-status', 'saved', {
      timeout: 15_000,
    });
    await setViewAndWait(page, { x: -24, y: 24, ppi: 8 });
    const region = await regionBox(page);
    const at = (png: Buffer, x: number, y: number) => pixel(page, png, region.x + x, region.y + y);

    let before = await frames(page);
    await moveTo(page, 600, 210);
    await waitForFrameAbove(page, before);
    const shot1 = await page.screenshot();
    expect(within2(await at(shot1, 600, 210), '#627aa6')).toBe(true);
    expect(await hovered(page)).toBe(w1);

    before = await frames(page);
    await moveTo(page, 600, 300);
    await waitForFrameAbove(page, before);
    const shot2 = await page.screenshot();
    expect(within2(await at(shot2, 600, 210), '#7a828e')).toBe(true);
    expect(await hovered(page)).toBeNull();

    const commits0 = await commits(page);
    const uploads0 = await stat(page, 'bufferUploads');
    const highlights0 = await stat(page, 'highlightUploads');
    for (let i = 0; i < 10; i++) await moveTo(page, 600, i % 2 === 0 ? 210 : 300);
    await expect.poll(() => stat(page, 'highlightUploads')).toBe(highlights0 + 5);
    expect((await commits(page)) - commits0).toBe(0);
    expect(await stat(page, 'bufferUploads')).toBe(uploads0);
  });

  test('EZD-207b B3 a view-only member has the zoom stack and the hover but no editor hook', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(60_000);
    const { tenant, ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const w1 = await addW1(page);
    await expect(page.getByTestId('save-state')).toContainText('Saved just now', {
      timeout: 15_000,
    });
    await setPermissions(tenant, user.membershipId, VIEWER as never);
    await page.reload();
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
    await expect(planCanvas(page)).toHaveAttribute('data-plan-state', 'ready');
    expect(await page.evaluate(() => '__ezdraftEditor' in window)).toBe(false);
    await expect(stack(page)).toBeVisible();
    await expect(page.locator('[data-shell-region="rail"]')).toHaveCount(1);
    await expect(page.locator('[data-shell-region="rail"] [data-rail-tool]')).toHaveCount(2);
    await expect(page.locator('[data-shell-region="rail"] [data-rail-tool]').first()).toHaveAttribute(
      'data-rail-tool',
      'select',
    );

    await setViewAndWait(page, { x: -24, y: 24, ppi: 8 });
    await moveTo(page, 600, 210);
    await expect.poll(() => hovered(page)).toBe(w1);
    const region = await regionBox(page);

    await button(page, 'Fit to screen').click();
    // Same region as the editor's (Q-0630 row 9; EZD-368): the canvas region beside the inspector (EZD-396).
    await expect.poll(async () => (await getView(page)).ppi).toBeCloseTo(fitPpiW1(region), 3);
  });

  test('EZD-207b B4 a room label is drawn from the atlas in the label colour and nothing redraws while idle', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(60_000);
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    expect(await stat(page, 'glyphs')).toBe(0);
    await setViewAndWait(page, { x: 0, y: 168, ppi: 8 / 3 });
    const region = await regionBox(page);
    const rect = {
      x: Math.round(region.x + 100),
      y: Math.round(region.y + 214),
      width: 178,
      height: 20,
    };
    const emptyShot = await page.screenshot();
    expect(await countNear(page, emptyShot, rect, '#9aa3af')).toBe(0);

    const before = await frames(page);
    await addR1(page);
    await expect.poll(() => stat(page, 'glyphs')).toBe(13);
    await waitForFrameAbove(page, before);
    const shot = await page.screenshot();
    expect(await countNear(page, shot, rect, '#9aa3af')).toBeGreaterThanOrEqual(20);

    await expect
      .poll(
        async () => {
          const a = await frames(page);
          await page.waitForTimeout(500);
          return (await frames(page)) === a;
        },
        { intervals: [100], timeout: 10_000 },
      )
      .toBe(true);
    const idle = await frames(page);
    await page.waitForTimeout(1000);
    expect(await frames(page)).toBe(idle);
  });

  test(
    'EZD-207b B5 the zoom buttons are 44 px targets on Surface',
    { tag: ['@surface'] },
    async ({ page, signInAs }) => {
      const { ids, user } = await fixtureS();
      await signInAs(user.email);
      await openReady(page, ids.P1);
      expect(await expectTouchTargets(page, stack(page))).toBe(3);
      const buttons = stack(page).getByRole('button');
      await expect(buttons).toHaveCount(3);
      for (let i = 0; i < 3; i++) {
        const b = await buttons.nth(i).boundingBox();
        expect(Math.abs((b?.width ?? 0) - 44)).toBeLessThanOrEqual(0.5);
        expect(Math.abs((b?.height ?? 0) - 44)).toBeLessThanOrEqual(0.5);
      }
    },
  );

  test('EZD-207b B6 no zoom stack while loading or when the canvas failed, and Retry brings it back', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(LOAD_ROUTE, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(`/projects/${ids.P1}`);
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'loading');
    await expect(stack(page)).toHaveCount(0);
    release();
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
    await page.unroute(LOAD_ROUTE);

    const failing = await page.context().newPage();
    await failing.addInitScript(() => {
      const w = window as unknown as { __ezdFailWebGL: boolean };
      w.__ezdFailWebGL = true;
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (w.__ezdFailWebGL && /webgl/.test(type)) return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await failing.goto(`/projects/${ids.P1}`);
    await expect(editorState(failing)).toHaveAttribute('data-editor-state', 'ready');
    const alert = editorState(failing).locator('[role="alert"][data-state="error"]');
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(stack(failing)).toHaveCount(0);
    await failing.evaluate(() => {
      (window as unknown as { __ezdFailWebGL: boolean }).__ezdFailWebGL = false;
    });
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(stack(failing)).toBeVisible();
  });

  test('EZD-207b B7 the banner area keeps clear of the zoom stack, and Retry still works', async ({
    page,
    signInAs,
    network,
  }) => {
    test.setTimeout(60_000);
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    type Box = { x: number; y: number; width: number; height: number };
    const overlaps = (a: Box, b: Box) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const stackBox = async (): Promise<Box> => {
      const b = await stack(page).boundingBox();
      if (!b) throw new Error('zoom-stack has no box');
      return b;
    };

    const SAVE_ROUTE = '**/api/projects/*/objects';
    await page.route(SAVE_ROUTE, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
        }),
      }),
    );
    await addW1(page);
    const failed = page.getByTestId('save-failed-banner');
    await expect(failed).toContainText('Changes not saved', { timeout: 20_000 });
    const retry = failed.getByRole('button', { name: 'Retry' });
    const retryBox = await retry.boundingBox();
    if (!retryBox) throw new Error('Retry has no box');
    expect(overlaps(retryBox, await stackBox())).toBe(false);
    await page.unroute(SAVE_ROUTE);
    await retry.click();
    await expect(failed).toHaveCount(0);

    await network.set(page, 'off');
    const offline = page.locator('[data-state="offline"]');
    await addW1(page);
    await expect(offline).toBeVisible();
    const offlineBox = await offline.boundingBox();
    if (!offlineBox) throw new Error('offline banner has no box');
    expect(overlaps(offlineBox, await stackBox())).toBe(false);
    await network.set(page, 'on');
  });
});
