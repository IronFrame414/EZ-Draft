// EZD-208b B1-B13 (vault/plans/EZD-208b.md section 4; AC-EZD-208-1, -2, -3, -5, -6, -7, -8, -9, -13, -14, -15,
// -16, -17): selection on the plan, the rail and the tablet bar. B1-B10 untagged (desktop 1600 x 1000); B11-B13 are
// @ipad (ipad-landscape, WebKit). Every test makes its own company (never tenant 1) with fixture S (P1 "bravo"
// starts with the floor "Floor 1") and its own member. The canvas is read and driven through the `__ezdraftPlan`,
// `__ezdraftEditor` and `__ezdraftSelection` test hooks. No import.meta or __dirname (lesson L-017).
import {
  CURRENT_SCHEMA_VERSION,
  createOpeningData,
  createWallData,
  type Point,
} from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
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
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: {
    handle: { setView(v: View): void; modelToScreen(p: Point): Point };
    stats(): { frames: number; selectionUploads: number };
  };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
  __ezdraftSelection: { ids(): string[]; hoveredId(): string | null };
  __EZD_PERF__: { commits: number };
};

const editorState = (page: Page) => page.getByTestId('editor-state');
const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const railTools = (page: Page) => page.locator('[data-shell-region="rail"] [data-rail-tool]');
const tool = (page: Page, which: 'select' | 'wall' | 'room-rect') =>
  page.locator(`[data-rail-tool="${which}"]`);

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

// at(x, y): the page point of a model point (canvas region box + the handle's modelToScreen).
async function at(page: Page, x: number, y: number): Promise<Point> {
  const box = await canvasRegion(page).boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
    { x, y },
  );
  return { x: box.x + s.x, y: box.y + s.y };
}

const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

// Repo root: nearest folder upward from the working directory holding pnpm-workspace.yaml.
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
  channels(got).every((c, i) => Math.abs(c - channels(want)[i]!) <= 2);

// addSel: fixture SEL. W1 (0,0)->(144,0), W2 (0,96)->(96,96), D1 a door centred (72,0) on W1.
async function addSel(page: Page): Promise<{ w1: string; w2: string; d1: string }> {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const m1 = createWallData({
    start: { x: 0, y: 0 },
    end: { x: 144, y: 0 },
    level,
    thicknessSide: 'right',
  });
  const m2 = createWallData({
    start: { x: 0, y: 96 },
    end: { x: 96, y: 96 },
    level,
    thicknessSide: 'right',
  });
  if (!m1.ok || !m2.ok) throw new Error('wall data');
  const w1 = crypto.randomUUID();
  const w2 = crypto.randomUUID();
  const d1 = crypto.randomUUID();
  const door = createOpeningData({
    kind: 'door',
    host: { id: w1, type: 'wall', data: m1.data },
    center: { x: 72, y: 0 },
  });
  const make = (i: string, type: string, data: unknown) => ({
    id: i,
    value: { type, schemaVersion: CURRENT_SCHEMA_VERSION, data },
  });
  await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    [make(w1, 'wall', m1.data), make(w2, 'wall', m2.data), make(d1, 'opening', door)],
  );
  return { w1, w2, d1 };
}

const ids = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids());
const hovered = (page: Page): Promise<string | null> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.hoveredId());
const expectIds = (page: Page, want: string[]) =>
  expect.poll(() => ids(page), { timeout: 5000 }).toEqual(want);
const commits = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__EZD_PERF__.commits);
const stat = (page: Page, name: 'frames' | 'selectionUploads') =>
  page.evaluate((n) => (window as unknown as Window2).__ezdraftPlan.stats()[n], name);

// Stable read of the React commit count: two reads in a row equal, every 100 ms for up to 5000 ms.
async function stableCommits(page: Page): Promise<number> {
  let last = -1;
  await expect
    .poll(
      async () => {
        const now = await commits(page);
        const same = now === last;
        last = now;
        return same;
      },
      { intervals: [100], timeout: 5000 },
    )
    .toBe(true);
  return last;
}

async function waitForFrameAbove(page: Page, before: number) {
  await expect
    .poll(() => stat(page, 'frames'), { intervals: [100], timeout: 5000 })
    .toBeGreaterThan(before);
}

// Model points of fixture SEL (section 4).
const DOOR = { x: 72, y: -2.25 };
const WALL1 = { x: 20, y: -2.25 };
const EMPTY = { x: 72, y: 48 };
const IN: [Point, Point] = [
  { x: -12, y: 108 },
  { x: 108, y: 84 },
];
const TOUCH: [Point, Point] = [
  { x: 108, y: 100 },
  { x: 84, y: -12 },
];
const IN_SAME: [Point, Point] = [
  { x: 84, y: -12 },
  { x: 108, y: 100 },
];

const clickModel = async (page: Page, p: Point) => {
  const s = await at(page, p.x, p.y);
  await page.mouse.click(s.x, s.y);
};
const moveModel = async (page: Page, p: Point) => {
  const s = await at(page, p.x, p.y);
  await page.mouse.move(s.x, s.y);
};
async function dragBox(page: Page, [a, b]: [Point, Point], release = true) {
  const from = await at(page, a.x, a.y);
  const to = await at(page, b.x, b.y);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  if (release) await page.mouse.up();
}

type TouchType = 'pointerdown' | 'pointermove' | 'pointerup';
async function touch(page: Page, type: TouchType, pointerId: number, x: number, y: number) {
  await page.evaluate(
    ({ type, pointerId, x, y }) => {
      const el = document.querySelector('[data-testid="plan-input"]');
      if (!el) throw new Error('no plan-input');
      el.dispatchEvent(
        new PointerEvent(type, {
          pointerId,
          pointerType: 'touch',
          isPrimary: pointerId === 1,
          clientX: x,
          clientY: y,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { type, pointerId, x, y },
  );
}
async function tapAt(page: Page, p: Point) {
  const s = await at(page, p.x, p.y);
  await touch(page, 'pointerdown', 1, s.x, s.y);
  await touch(page, 'pointerup', 1, s.x, s.y);
}
async function touchDrag(page: Page, [a, b]: [Point, Point], release: boolean) {
  const from = await at(page, a.x, a.y);
  const to = await at(page, b.x, b.y);
  await touch(page, 'pointerdown', 1, from.x, from.y);
  for (let i = 1; i <= 10; i++)
    await touch(
      page,
      'pointermove',
      1,
      from.x + ((to.x - from.x) * i) / 10,
      from.y + ((to.y - from.y) * i) / 10,
    );
  if (release) await touch(page, 'pointerup', 1, to.x, to.y);
}

const boxEl = (page: Page) => id(page, 'selection-box');

test.describe('EZD-208b selection', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-208b B1 done when: clicks at one spot on a door in a wall select the door, then the wall, then the door', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(60_000);
    const { ids: pids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, pids.P1);
    const { w1, d1 } = await addSel(page);
    await view(page);
    const region = await canvasRegion(page).boundingBox();
    if (!region) throw new Error('no region');
    const wallPixel = async () => {
      const png = await page.screenshot();
      return pixel(page, png, Math.round(region.x + 181.33), Math.round(region.y + 390));
    };
    await expect.poll(async () => within2(await wallPixel(), '#7a828e')).toBe(true);

    let uploads = await stat(page, 'selectionUploads');
    await clickModel(page, DOOR);
    await expectIds(page, [d1]);
    await expect.poll(() => stat(page, 'selectionUploads')).toBeGreaterThan(uploads);
    uploads = await stat(page, 'selectionUploads');

    await clickModel(page, DOOR);
    await expectIds(page, [w1]);
    await expect.poll(() => stat(page, 'selectionUploads')).toBeGreaterThan(uploads);
    await expect.poll(async () => within2(await wallPixel(), '#366bd3')).toBe(true);
    uploads = await stat(page, 'selectionUploads');

    await clickModel(page, DOOR);
    await expectIds(page, [d1]);
    await expect.poll(() => stat(page, 'selectionUploads')).toBeGreaterThan(uploads);
  });

  test('EZD-208b B2 Select is the first rail tool and on at open; V, W, Esc and the Select button', async ({
    page,
    signInAs,
  }) => {
    const { ids: pids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, pids.P1);
    await expect(railTools(page)).toHaveCount(6);
    await expect(railTools(page).nth(0)).toHaveAttribute('data-rail-tool', 'select');
    await expect(railTools(page).nth(1)).toHaveAttribute('data-rail-tool', 'move');
    await expect(railTools(page).nth(2)).toHaveAttribute('data-rail-tool', 'wall');
    await expect(railTools(page).nth(3)).toHaveAttribute('data-rail-tool', 'room-rect');
    await expect(railTools(page).nth(4)).toHaveAttribute('data-rail-tool', 'door');
    await expect(railTools(page).nth(5)).toHaveAttribute('data-rail-tool', 'window');
    await expect(tool(page, 'select')).toHaveAttribute('aria-label', 'Select');
    await expect(tool(page, 'select')).toHaveAttribute('aria-keyshortcuts', 'V');
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(page, 'select')).toBeEnabled();
    await expect(id(page, 'edit-bar')).toHaveCount(0);

    await page.keyboard.press('w');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('v');
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('r');
    await expect(tool(page, 'room-rect')).toHaveAttribute('aria-pressed', 'true');
    await tool(page, 'select').click();
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(page, 'room-rect')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('w');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'false');
  });

  test('EZD-208b B3 Shift-click adds and removes; Shift on empty keeps; a plain click on empty clears', async ({
    page,
    signInAs,
  }) => {
    const { ids: pids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, pids.P1);
    const { w1, d1 } = await addSel(page);
    await view(page);
    await clickModel(page, DOOR);
    await expectIds(page, [d1]);
    await page.keyboard.down('Shift');
    await clickModel(page, WALL1);
    await expectIds(page, [d1, w1]);
    await clickModel(page, DOOR);
    await expectIds(page, [w1]);
    await clickModel(page, EMPTY);
    await page.keyboard.up('Shift');
    await expectIds(page, [w1]);
    await clickModel(page, EMPTY);
    await expectIds(page, []);
  });

  test('EZD-208b B4 a box left to right takes what is inside; right to left takes what it touches', async ({
    page,
    signInAs,
  }) => {
    const { ids: pids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, pids.P1);
    const { w1, w2, d1 } = await addSel(page);
    await view(page);
    await dragBox(page, IN);
    await expectIds(page, [w2]);
    await dragBox(page, TOUCH);
    await expectIds(page, [d1, w2, w1]);
    await dragBox(page, IN_SAME);
    await expectIds(page, []);
  });

  test('EZD-208b B5 the box is solid cobalt left to right and dashed green right to left, with no React commit', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(60_000);
    await page.addInitScript(hooksInit());
    const { ids: pids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, pids.P1);
    await addSel(page);
    await saved(page);
    await view(page);
    const attr = async (name: string) => Number(await boxEl(page).getAttribute(name));
    const css = (prop: string) =>
      boxEl(page).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
    // Token colours go through a probe with the same var(--ez-*) declaration (as shell-header.spec.ts), so the
    // check does not depend on how the production build serializes oklch(): --ez-cobalt is oklch(0.55 0.17 262),
    // --ez-box-touch-stroke oklch(0.5 0.12 160), --ez-box-touch-fill oklch(0.72 0.12 160) (DB5, DB13).
    const probe = (prop: string, token: string) =>
      page.evaluate(
        ([p, t]) => {
          if (!getComputedStyle(document.documentElement).getPropertyValue(t).trim()) return `undefined ${t}`;
          const el = document.createElement('div');
          el.style.setProperty(p, `var(${t})`);
          document.body.appendChild(el);
          const v = getComputedStyle(el).getPropertyValue(p);
          el.remove();
          return v;
        },
        [prop, token] as const,
      );

    // Colours compare as pixels: the build may serve a token as lab() while a literal keeps its oklch text.
    const pixel = (value: string) =>
      page.evaluate((v) => {
        const c = document.createElement('canvas');
        c.width = 1;
        c.height = 1;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#010203';
        ctx.fillStyle = v;
        if (ctx.fillStyle === '#010203') throw new Error(`canvas rejected colour ${v}`);
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data);
      }, value);
    const expectSamePixels = async (tokenValue: string, literalValue: string) => {
      const t = await pixel(tokenValue);
      const l = await pixel(literalValue);
      for (let i = 0; i < 4; i++) expect(Math.abs(t[i] - l[i])).toBeLessThanOrEqual(1);
    };

    const before = await stableCommits(page);
    await dragBox(page, IN, false);
    await expect(boxEl(page)).toHaveAttribute('data-box-mode', 'inside');
    expect(await attr('x')).toBeCloseTo(96, 1);
    expect(await attr('y')).toBeCloseTo(96, 1);
    expect(await attr('width')).toBeCloseTo(320, 1);
    expect(await attr('height')).toBeCloseTo(64, 1);
    expect(await css('stroke')).toBe(await probe('stroke', '--ez-cobalt'));
    expect(await css('stroke-dasharray')).toBe('none');
    expect(await css('stroke-width')).toBe('1.5px');
    expect(await css('fill-opacity')).toBe('0.08');
    expect(await commits(page)).toBe(before);
    await page.mouse.up();
    await expect(boxEl(page)).toHaveAttribute('display', 'none');
    await expect(boxEl(page)).not.toHaveAttribute('data-box-mode');

    const before2 = await stableCommits(page);
    await dragBox(page, TOUCH, false);
    await expect(boxEl(page)).toHaveAttribute('data-box-mode', 'touch');
    expect(await attr('x')).toBeCloseTo(352, 1);
    expect(await attr('y')).toBeCloseTo(117.33, 1);
    expect(await attr('width')).toBeCloseTo(64, 1);
    expect(await attr('height')).toBeCloseTo(298.67, 1);
    expect(await css('stroke')).toBe(await probe('stroke', '--ez-box-touch-stroke'));
    await expectSamePixels(await probe('stroke', '--ez-box-touch-stroke'), 'oklch(0.5 0.12 160)');
    expect(await css('stroke-dasharray')).toBe('6px, 4px');
    expect(await css('fill')).toBe(await probe('fill', '--ez-box-touch-fill'));
    await expectSamePixels(await probe('fill', '--ez-box-touch-fill'), 'oklch(0.72 0.12 160)');
    expect(await css('fill-opacity')).toBe('0.12');
    expect(await commits(page)).toBe(before2);
    await page.mouse.up();
    await expect(boxEl(page)).toHaveAttribute('display', 'none');
  });

  test('EZD-208b B6 Ctrl+A and Cmd+A select every wall and opening and keep the tool', async ({
    page,
    signInAs,
  }) => {
    const { ids: pids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, pids.P1);
    const { w1, w2, d1 } = await addSel(page);
    await view(page);
    await page.keyboard.press('Control+a');
    await expectIds(page, [d1, w2, w1]);
    await page.keyboard.press('Escape');
    await expectIds(page, []);
    await page.keyboard.press('Meta+a');
    await expectIds(page, [d1, w2, w1]);
    await page.keyboard.press('Escape');
    await expectIds(page, []);
    await page.keyboard.press('w');
    await page.keyboard.press('Control+a');
    await expectIds(page, [d1, w2, w1]);
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'true');
  });

  test('EZD-208b B7 Esc cancels the chain, then clears the selection and returns to Select', async ({
    page,
    signInAs,
  }) => {
    const { ids: pids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, pids.P1);
    const { w1 } = await addSel(page);
    await view(page);
    await clickModel(page, WALL1);
    await expectIds(page, [w1]);
    await page.keyboard.press('w');
    await clickModel(page, EMPTY);
    await page.keyboard.press('Escape');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'true');
    await expectIds(page, [w1]);
    const walls = await page.evaluate(
      () =>
        (window as unknown as Window2).__ezdraftEditor.objects().filter((o) => o.type === 'wall')
          .length,
    );
    expect(walls).toBe(2);
    await page.keyboard.press('Escape');
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    await expectIds(page, []);
  });

  test('EZD-208b B8 Esc with nothing to cancel clears at once; keys in a field go to the field', async ({
    page,
    signInAs,
  }) => {
    const { ids: pids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, pids.P1);
    const { w1 } = await addSel(page);
    await view(page);
    await clickModel(page, WALL1);
    await expectIds(page, [w1]);
    await page.keyboard.press('Escape');
    await expectIds(page, []);
    await clickModel(page, WALL1);
    await expectIds(page, [w1]);
    await page.evaluate(() => {
      const probe = document.createElement('input');
      probe.setAttribute('data-testid', 'probe');
      document.body.appendChild(probe);
      probe.focus();
    });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+a');
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    await expectIds(page, [w1]);
    await expect(id(page, 'probe')).toBeFocused();
    await page.evaluate(() => document.querySelector('[data-testid="probe"]')?.remove());
    await page.keyboard.press('Escape');
    await expectIds(page, []);
  });

  test('EZD-208b B9 hover shows what a click would select, with no React commit', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(60_000);
    await page.addInitScript(hooksInit());
    const { ids: pids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, pids.P1);
    const { w1, d1 } = await addSel(page);
    await saved(page);
    await view(page);
    const region = await canvasRegion(page).boundingBox();
    if (!region) throw new Error('no region');
    const wallPixel = async () => {
      const png = await page.screenshot();
      return pixel(page, png, Math.round(region.x + 181.33), Math.round(region.y + 390));
    };

    await moveModel(page, WALL1);
    await expect.poll(() => hovered(page)).toBe(w1);
    await expect.poll(async () => within2(await wallPixel(), '#627aa6')).toBe(true);
    await moveModel(page, DOOR);
    await expect.poll(() => hovered(page)).toBe(d1);
    await clickModel(page, DOOR);
    await expectIds(page, [d1]);
    await expect.poll(() => hovered(page)).toBe(w1);
    await moveModel(page, EMPTY);
    await expect.poll(() => hovered(page)).toBeNull();

    const before = await stableCommits(page);
    for (let i = 0; i < 10; i++) await moveModel(page, i % 2 === 0 ? WALL1 : EMPTY);
    expect(await stableCommits(page)).toBe(before);
  });

  test('EZD-208b B10 a view-only member has Select on the rail and can select and box select', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(60_000);
    const { tenant, ids: pids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, pids.P1);
    const { w2, d1 } = await addSel(page);
    await saved(page);
    await setPermissions(tenant, user.membershipId, VIEWER as never);
    await page.reload();
    await openReady(page, pids.P1);
    await view(page);
    await expect(railTools(page)).toHaveCount(1);
    await expect(railTools(page).first()).toHaveAttribute('data-rail-tool', 'select');
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(page, 'select')).toBeEnabled();
    await page.keyboard.press('w');
    await expect(railTools(page)).toHaveCount(1);
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    await clickModel(page, DOOR);
    await expectIds(page, [d1]);
    await dragBox(page, IN);
    await expectIds(page, [w2]);
    expect(await page.evaluate(() => '__ezdraftEditor' in window)).toBe(false);
    expect(await page.evaluate(() => '__ezdraftSelection' in window)).toBe(true);
  });

  test(
    'EZD-208b B11 Select more on a tablet: taps add and remove, empty keeps, Done turns it off',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      test.setTimeout(60_000);
      const { ids: pids, user } = await fixtureS();
      await signInAs(user.email);
      await openReady(page, pids.P1);
      const { w1, w2, d1 } = await addSel(page);
      await view(page);
      await expect(page.getByRole('toolbar', { name: 'Edit' })).toBeVisible();
      await expect(id(page, 'select-more')).toHaveText('Select more');
      await expect(id(page, 'select-all')).toHaveText('Select all');
      await expect(id(page, 'select-more')).toHaveAttribute('aria-pressed', 'false');
      await expect(id(page, 'select-more-banner')).toHaveCount(0);

      await id(page, 'select-more').tap();
      await expect(id(page, 'select-more')).toHaveAttribute('aria-pressed', 'true');
      await expect(id(page, 'select-more-banner')).toContainText(
        'Tap objects to add or remove them.',
      );
      await expect(id(page, 'select-more-done')).toHaveText('Done');
      await tapAt(page, DOOR);
      await expectIds(page, [d1]);
      await tapAt(page, WALL1);
      await expectIds(page, [d1, w1]);
      await tapAt(page, EMPTY);
      await expectIds(page, [d1, w1]);
      await tapAt(page, DOOR);
      await expectIds(page, [w1]);

      await id(page, 'select-more-done').tap();
      await expect(id(page, 'select-more')).toHaveAttribute('aria-pressed', 'false');
      await expect(id(page, 'select-more-banner')).toHaveCount(0);
      await tapAt(page, DOOR);
      await expectIds(page, [d1]);
      await id(page, 'select-all').tap();
      await expectIds(page, [d1, w2, w1]);
    },
  );

  test(
    'EZD-208b B12 one finger from empty draws a box; a second finger never does',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      test.setTimeout(60_000);
      const { ids: pids, user } = await fixtureS();
      await signInAs(user.email);
      await openReady(page, pids.P1);
      const { w1, w2, d1 } = await addSel(page);
      await view(page);

      await touchDrag(page, IN, false);
      await expect(boxEl(page)).toHaveAttribute('data-box-mode', 'inside');
      const inEnd = await at(page, IN[1].x, IN[1].y);
      await touch(page, 'pointerup', 1, inEnd.x, inEnd.y);
      await expectIds(page, [w2]);

      await touchDrag(page, TOUCH, true);
      await expectIds(page, [d1, w2, w1]);

      const region = await canvasRegion(page).boundingBox();
      if (!region) throw new Error('no region');
      const start = await at(page, IN[0].x, IN[0].y);
      const end = await at(page, IN[1].x, IN[1].y);
      await touch(page, 'pointerdown', 1, start.x, start.y);
      await touch(page, 'pointerdown', 2, region.x + 200, region.y + 300);
      await expect(boxEl(page)).toHaveAttribute('display', 'none');
      for (let i = 1; i <= 10; i++) {
        await touch(
          page,
          'pointermove',
          1,
          start.x + ((end.x - start.x) * i) / 10,
          start.y + ((end.y - start.y) * i) / 10,
        );
        await expect(boxEl(page)).toHaveAttribute('display', 'none');
      }
      await touch(page, 'pointerup', 2, region.x + 200, region.y + 300);
      await touch(page, 'pointerup', 1, end.x, end.y);
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      );
      await expect(boxEl(page)).toHaveAttribute('display', 'none');
      await expectIds(page, [d1, w2, w1]);
    },
  );

  test(
    'EZD-208b B13 bar, banner and Done are touch targets where the board puts them, with banners below',
    { tag: ['@ipad'] },
    async ({ page, signInAs, network }) => {
      test.setTimeout(60_000);
      const { ids: pids, user } = await fixtureS();
      await signInAs(user.email);
      await openReady(page, pids.P1);
      const region = await canvasRegion(page).boundingBox();
      if (!region) throw new Error('no region');
      const bar = await id(page, 'edit-bar').boundingBox();
      if (!bar) throw new Error('no edit-bar box');
      expect(Math.abs(bar.x - region.x - 16)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(bar.y - region.y - 14)).toBeLessThanOrEqual(0.5);
      // Editor bar (EZD-217 plan B4): 8 buttons x 62 + 10 gaps x 2 + 3 separators x (1 + 8 margin) + 12 padding + 2 border = 557.
      expect(Math.abs(bar.width - 557)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(bar.height - 66)).toBeLessThanOrEqual(0.5);
      expect(await expectTouchTargets(page, id(page, 'edit-bar'))).toBe(8);

      await id(page, 'select-more').tap();
      const banner = await id(page, 'select-more-banner').boundingBox();
      if (!banner) throw new Error('no banner box');
      expect(Math.abs(banner.y - region.y - 90)).toBeLessThanOrEqual(0.5);
      expect(await expectTouchTargets(page, id(page, 'select-more-banner'))).toBe(1);
      const done = await id(page, 'select-more-done').boundingBox();
      if (!done) throw new Error('no done box');
      expect(done.height).toBeGreaterThanOrEqual(44);

      await network.set(page, 'off');
      const offline = page.locator('[data-state="offline"]');
      await expect(offline).toBeVisible();
      const off = await offline.boundingBox();
      if (!off) throw new Error('no offline box');
      const nowBanner = await id(page, 'select-more-banner').boundingBox();
      if (!nowBanner) throw new Error('no banner box');
      expect(Math.abs(off.y - (nowBanner.y + nowBanner.height + 8))).toBeLessThanOrEqual(0.5);
    },
  );
});
