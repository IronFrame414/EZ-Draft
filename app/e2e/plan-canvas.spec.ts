// EZD-207a B1-B8 (vault/plans/EZD-207a.md section 4; AC-EZD-207-1, -4, -6, -7, -8, -9). Untagged, so desktop
// 1600 x 1000. Every test makes its own company (never tenant 1) with fixture S (app/test-harness/projects-fixture.ts;
// P1 "bravo" starts with the floor "Floor 1") and its own members and context. Walls are added through the
// `__ezdraftEditor` test hook with data from createWallData (lesson EZD-120d: status overwritten). The canvas is read
// through `__ezdraftPlan` (C9). Region px + the canvas region's bounding box = page px. No import.meta or
// __dirname (lesson L-017).
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
  setPermissions,
  signedInJsContents,
  signedInJsSize,
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
  };
  stats(): { frames: number; drawCalls: number; bufferUploads: number; contexts: number };
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
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const frame = (page: Page) => page.locator('[data-shell-region="frame"]');

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
  await expect(planCanvas(page)).toHaveAttribute('data-plan-state', 'ready');
}

const frames = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.stats().frames);
const stat = (page: Page, name: 'bufferUploads' | 'contexts') =>
  page.evaluate((n) => (window as unknown as Window2).__ezdraftPlan.stats()[n], name);
const getView = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.handle.getView());
const toScreen = (page: Page, p: Pt) =>
  page.evaluate((q) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(q), p);

// "Wait for a frame": frames above the value read just before the change.
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

type WallSpec = { start: Pt; end: Pt; status: 'existing' | 'new' | 'demo' };

async function wallChanges(page: Page, specs: WallSpec[]) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  return specs.map((s) => {
    const made = createWallData({ start: s.start, end: s.end, level });
    if (!made.ok) throw new Error('wall data');
    return {
      id: crypto.randomUUID(),
      value: {
        type: 'wall',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: { ...made.data, status: s.status },
      },
    };
  });
}

async function addWalls(page: Page, specs: WallSpec[]) {
  const changes = await wallChanges(page, specs);
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);
}

// Adds the walls and sets the view in one synchronous step, then waits for a frame above the value read before.
async function addWallsAndView(page: Page, specs: WallSpec[], view: View) {
  const changes = await wallChanges(page, specs);
  const before = await page.evaluate(
    ({ c, v }) => {
      const w = window as unknown as Window2;
      const f = w.__ezdraftPlan.stats().frames;
      w.__ezdraftEditor.edit(c);
      w.__ezdraftPlan.handle.setView(v);
      return f;
    },
    { c: changes, v: view },
  );
  await waitForFrameAbove(page, before);
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

const channels = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const within2 = (got: string, want: string): boolean =>
  channels(got).every((c, i) => Math.abs(c - channels(want)[i]) <= 2);

// A region-px point as a page-px point.
async function regionPoint(page: Page, x: number, y: number): Promise<Pt> {
  const box = await canvasRegion(page).boundingBox();
  if (!box) throw new Error('canvas region has no box');
  return { x: box.x + x, y: box.y + y };
}

async function rightDrag(page: Page, from: Pt, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 5 });
  await page.mouse.up({ button: 'right' });
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

test.describe('EZD-207a plan canvas', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-207a B1 the grid is drawn by the canvas and walls show in their status colours', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await setViewAndWait(page, { x: 0, y: 0, ppi: 8 / 3 });
    const box = await canvasRegion(page).boundingBox();
    if (!box) throw new Error('canvas region has no box');
    const at = (png: Buffer, x: number, y: number) => pixel(page, png, box.x + x, box.y + y);

    const shot1 = await page.screenshot();
    expect(await at(shot1, 32, 16)).toBe('#e6e9ed');
    expect(await at(shot1, 16, 32)).toBe('#e6e9ed');
    expect(await at(shot1, 48, 16)).toBe('#f6f7f9');
    expect(await frame(page).evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');

    await addWallsAndView(
      page,
      [
        { start: { x: 0, y: 0 }, end: { x: 120, y: 0 }, status: 'existing' },
        { start: { x: 0, y: -24 }, end: { x: 120, y: -24 }, status: 'new' },
        { start: { x: 0, y: -48 }, end: { x: 120, y: -48 }, status: 'demo' },
      ],
      { x: -24, y: 24, ppi: 8 },
    );
    const shot2 = await page.screenshot();
    expect(within2(await at(shot2, 600, 210), '#7a828e')).toBe(true);
    expect(within2(await at(shot2, 600, 402), '#366bd3')).toBe(true);
    expect(within2(await at(shot2, 600, 594), '#da4339')).toBe(true);
  });

  test('EZD-207a B2 the wheel zooms toward the cursor and right-drag and Space-drag pan', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await setViewAndWait(page, { x: 0, y: 0, ppi: 8 / 3 });

    const cursor = await regionPoint(page, 400, 300);
    await page.mouse.move(cursor.x, cursor.y);
    await page.mouse.wheel(0, -100);
    await expect.poll(async () => (await getView(page)).ppi).toBeGreaterThan((8 / 3) * 1.1);
    const zoomed = await getView(page);
    expect(zoomed.ppi / (8 / 3)).toBeCloseTo(Math.exp(0.2), 3);
    const under = await toScreen(page, { x: 150, y: -112.5 });
    expect(Math.abs(under.x - 400)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(under.y - 300)).toBeLessThanOrEqual(0.5);

    const beforeRight = await getView(page);
    await rightDrag(page, cursor, 100, 50);
    await expect.poll(async () => (await getView(page)).x).not.toBe(beforeRight.x);
    const afterRight = await getView(page);
    expect(afterRight.x - beforeRight.x).toBeCloseTo(-100 / beforeRight.ppi, 3);
    expect(afterRight.y - beforeRight.y).toBeCloseTo(50 / beforeRight.ppi, 3);

    await page.mouse.move(cursor.x, cursor.y);
    await page.keyboard.down('Space');
    await page.mouse.down();
    await page.mouse.move(cursor.x + 100, cursor.y + 50, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await expect.poll(async () => (await getView(page)).x).not.toBe(afterRight.x);
    const afterSpace = await getView(page);
    expect(afterSpace.x - afterRight.x).toBeCloseTo(-100 / afterRight.ppi, 3);
    expect(afterSpace.y - afterRight.y).toBeCloseTo(50 / afterRight.ppi, 3);
  });

  test('EZD-207a B3 nothing is drawn while idle and a pan or zoom makes no React commit and no buffer upload', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(60_000);
    await page.addInitScript({
      path: path.join(repoRoot(), 'scripts', 'perf', 'page-hooks.browser.js'),
    });
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addWalls(page, [{ start: { x: 0, y: 0 }, end: { x: 120, y: 0 }, status: 'existing' }]);
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-status', 'saved', {
      timeout: 15_000,
    });

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

    const uploads = await stat(page, 'bufferUploads');
    const commits = await page.evaluate(() => (window as unknown as Window2).__EZD_PERF__.commits);
    await page.evaluate(() => (window as unknown as Window2).__EZD_PERF__.mark('pan-start'));
    const from = await regionPoint(page, 600, 400);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(from.x + 200, from.y + 100, { steps: 20 });
    await page.mouse.up({ button: 'right' });
    await page.mouse.wheel(0, -100);
    await page.evaluate(() => (window as unknown as Window2).__EZD_PERF__.mark('pan-end'));

    await expect.poll(() => frames(page)).toBeGreaterThan(idle);
    expect(
      (await page.evaluate(() => (window as unknown as Window2).__EZD_PERF__.commits)) - commits,
    ).toBe(0);
    expect(await stat(page, 'bufferUploads')).toBe(uploads);
    expect(await stat(page, 'contexts')).toBe(1);
    expect(await page.locator('canvas').count()).toBe(1);
  });

  test('EZD-207a B4 a view-only member gets the canvas, pan and zoom, and no editor hook', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(VIEWER);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await expect(page.locator('[data-shell-region="rail"]')).toHaveCount(1);
    await expect(page.locator('[data-shell-region="rail"] [data-rail-tool]')).toHaveCount(1);
    await expect(page.locator('[data-shell-region="rail"] [data-rail-tool]')).toHaveAttribute(
      'data-rail-tool',
      'select',
    );
    expect(await page.evaluate(() => '__ezdraftEditor' in window)).toBe(false);

    const start = await getView(page);
    const from = await regionPoint(page, 600, 400);
    await rightDrag(page, from, 100, 50);
    await expect.poll(async () => (await getView(page)).x).not.toBe(start.x);

    const panned = await getView(page);
    await page.mouse.move(from.x, from.y);
    await page.mouse.wheel(0, -100);
    await expect.poll(async () => (await getView(page)).ppi).not.toBe(panned.ppi);
  });

  test('EZD-207a B5 while the model loads there is the skeleton, the disabled rail and no canvas or surface', async ({
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
    await expect(editorState(page).locator('[data-skeleton]').first()).toBeVisible();
    await expect(page.getByTestId('plan-canvas')).toHaveCount(0);
    await expect(page.getByTestId('plan-input')).toHaveCount(0);
    await expect(page.locator('[data-shell-region="rail"]')).toHaveCount(1);
    const tools = page.locator('[data-shell-region="rail"] [data-rail-tool]');
    await expect(tools).toHaveCount(5);
    await expect(tools.first()).toBeDisabled();
    await expect(tools.last()).toBeDisabled();
    release();
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
  });

  test("EZD-207a B6 a canvas that cannot start shows Couldn't show the plan with Retry, and Retry brings the plan back", async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await page.addInitScript(() => {
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
    await page.goto(`/projects/${ids.P1}`);
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
    const alert = editorState(page).locator('[role="alert"][data-state="error"]');
    await expect(alert).toContainText("Couldn't show the plan.");
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(planCanvas(page)).toHaveCount(0);
    expect(await frame(page).evaluate((el) => getComputedStyle(el).backgroundSize)).toBe(
      '32px 32px, 32px 32px',
    );

    await page.evaluate(() => {
      (window as unknown as { __ezdFailWebGL: boolean }).__ezdFailWebGL = false;
    });
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(planCanvas(page)).toHaveAttribute('data-plan-state', 'ready');
  });

  test('EZD-207a B7 the editor header has only the Plan tab and the frame has no panels, only the disclaimer', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const tabs = page.locator('header nav button');
    await expect(tabs).toHaveCount(1);
    await expect(tabs).toHaveText('Plan');
    await expect(tabs).toHaveAttribute('aria-current', 'page');
    for (const region of ['left-panel', 'inspector'])
      await expect(page.locator(`[data-shell-region="${region}"]`)).toHaveCount(0);
    await expect(page.locator('[data-shell-region="rail"]')).toHaveCount(1);
    await expect(page.locator('[data-shell-region="rail"] [data-rail-tool]')).toHaveCount(5);
    await expect(page.locator('[data-status-item]')).toHaveCount(4);
    await expect(page.getByTestId('disclaimer')).toBeVisible();
  });

  test('EZD-207a B8 the editor route loads no code past the editor entry rules and stays within 500,000 compressed bytes', async ({
    page,
    browser,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const state = await page.context().storageState();
    const url = `/projects/${ids.P1}`;
    const contents = await signedInJsContents(browser, state, url, 'editor');
    expect('error' in contents).toBe(false);
    expect('value' in contents ? contents.value : -1).toBe(0);
    const size = await signedInJsSize(browser, state, url);
    expect('error' in size).toBe(false);
    expect('value' in size ? size.value : Infinity).toBeLessThanOrEqual(500_000);
  });
});
