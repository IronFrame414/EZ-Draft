// EZD-219 B1-B7 (vault/plans/EZD-219.md section 4; AC-EZD-219-1 to -5; 09m Scale, Snap and Typed zoom rows;
// Q-0664; Q-0680 (a), (b)). B1-B5 and B7 untagged (desktop 1600 x 1000); B6 is @surface. Every test makes its
// own company (never tenant 1) with fixture S and its own member, as drawing-tools.spec.ts. The canvas is read
// and driven through the `__ezdraftPlan` and `__ezdraftEditor` test hooks. No import.meta or __dirname (L-017).
import type { Point } from '@ezdraft/geometry';
import type { Locator, Page, Request } from '@playwright/test';
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
const SCALE_ROUTE = '**/plan-scale';

// Repo root: nearest folder upward from the working directory holding pnpm-workspace.yaml (drawing-tools.spec.ts).
function repoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error('no pnpm-workspace.yaml above ' + process.cwd());
    dir = up;
  }
}

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
    handle: {
      setView(v: View): void;
      getView(): View;
      modelToScreen(p: Point): Point;
    };
  };
  __ezdraftEditor: { objects(): Obj[] };
  __EZD_PERF__: { commits: number };
};

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const editorState = (page: Page) => id(page, 'editor-state');
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const statusBar = (page: Page) => page.locator('[data-shell-region="status-bar"]');
const readout = (page: Page, testId: 'status-scale' | 'status-snap') =>
  id(page, testId).locator('[data-status-value]');
const scaleRadio = (page: Page, value: string) =>
  id(page, 'status-scale-popover').locator(`[role="radio"][data-value="${value}"]`);
const incrementRadio = (page: Page, value: string) =>
  id(page, 'status-snap-popover').locator(`[role="radio"][data-value="${value}"]`);

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

async function setView(page: Page, v: View) {
  await page.evaluate(
    (next) => (window as unknown as Window2).__ezdraftPlan.handle.setView(next),
    v,
  );
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

// The screen distance of model (0,0)-(120,0) in region px.
const span = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as Window2).__ezdraftPlan.handle;
    return h.modelToScreen({ x: 120, y: 0 }).x - h.modelToScreen({ x: 0, y: 0 }).x;
  });
const ppi = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.handle.getView().ppi);
const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());

async function typeZoom(page: Page, text: string) {
  await id(page, 'status-zoom').click();
  await expect(id(page, 'status-zoom-input')).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect(id(page, 'status-zoom-input')).toHaveCount(0);
}

function scaleRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/plan-scale')) seen.push(r);
  });
  return seen;
}

async function chooseScale(page: Page, value: string) {
  await id(page, 'status-scale').click();
  await expect(id(page, 'status-scale-popover')).toBeVisible();
  await scaleRadio(page, value).click();
}

test.describe('EZD-219 status bar popovers', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-219 B1 done when: changing the snap increment changes snapping', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);

    await id(page, 'status-snap').click();
    const pop = id(page, 'status-snap-popover');
    await expect(pop).toBeVisible();
    for (const t of [
      'status-snap-endpoints',
      'status-snap-midpoints',
      'status-snap-angles',
      'status-snap-faces',
    ])
      await expect(id(page, t)).toHaveAttribute('aria-checked', 'true');
    const radios = pop.locator('[role="radio"]');
    await expect(radios).toHaveCount(7);
    await expect(incrementRadio(page, '0.5')).toHaveAttribute('aria-checked', 'true');
    await expect(pop.locator('[role="radio"][aria-checked="true"]')).toHaveCount(1);

    await incrementRadio(page, '12').click();
    await expect(readout(page, 'status-snap')).toHaveText('12"');
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
    await expect(id(page, 'status-snap')).toBeFocused();

    await setView(page, { x: -48, y: 144, ppi: 8 / 3 });
    await page.keyboard.press('w');
    await clickAt(page, 0, 0);
    await clickAt(page, 37.5, 0);
    await page.keyboard.press('Escape');
    await expect
      .poll(async () => (await objects(page)).filter((o) => o.type === 'wall').length)
      .toBe(1);
    const first = (await objects(page)).find((o) => o.type === 'wall')!;
    const g1 = first.data.geometry as { start: Point; end: Point };
    expect(g1.end.x).toBeCloseTo(36, 9);
    expect(g1.end.y).toBeCloseTo(0, 9);

    await id(page, 'status-snap').click();
    await expect(pop).toBeVisible();
    await id(page, 'status-snap-angles').click();
    await expect(id(page, 'status-snap-angles')).toHaveAttribute('aria-checked', 'false');
    await incrementRadio(page, '0.5').click();
    await expect(readout(page, 'status-snap')).toHaveText('1/2"');
    await page.keyboard.press('Escape');

    await page.keyboard.press('w');
    await clickAt(page, 0, 96);
    await clickAt(page, 37.5, 97.5);
    await page.keyboard.press('Escape');
    await expect
      .poll(async () => (await objects(page)).filter((o) => o.type === 'wall').length)
      .toBe(2);
    const second = (await objects(page)).find((o) => o.type === 'wall' && o.id !== first.id)!;
    const g2 = second.data.geometry as { start: Point; end: Point };
    expect(Math.abs(g2.end.x - 37.5)).toBeLessThanOrEqual(1 / 16);
    expect(Math.abs(g2.end.y - 97.5)).toBeLessThanOrEqual(1 / 16);
  });

  test('EZD-219 B2 an editor picks the plan scale and the project keeps it', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const requests = scaleRequests(page);
    await expect(readout(page, 'status-scale')).toHaveText(`1/2" = 1'-0"`);
    await typeZoom(page, '100');
    expect(await span(page)).toBeCloseTo(480, 6);
    const before = JSON.stringify(await objects(page));

    const answer = page.waitForResponse(
      (r) => r.url().includes('/plan-scale') && r.request().method() === 'PUT',
    );
    await chooseScale(page, '0.25');
    const res = await answer;
    expect(res.status()).toBe(200);
    expect(res.request().postData()).toBe('{"scale":0.25}');
    await expect(id(page, 'status-scale-popover')).toHaveCount(0);
    await expect(id(page, 'status-zoom')).toHaveText('100%');
    expect(await span(page)).toBeCloseTo(240, 6);
    expect(JSON.stringify(await objects(page))).toBe(before);
    expect(requests.filter((r) => r.method() === 'PUT')).toHaveLength(1);

    await page.reload();
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
    await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
    await expect(readout(page, 'status-scale')).toHaveText(`1/4" = 1'-0"`);
    await typeZoom(page, '100');
    expect(await span(page)).toBeCloseTo(240, 6);
  });

  test('EZD-219 B3 a view-only user changes the scale for the session only', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(VIEWER);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const requests = scaleRequests(page);
    await chooseScale(page, '0.25');
    await expect(readout(page, 'status-scale')).toHaveText(`1/4" = 1'-0"`);
    await typeZoom(page, '100');
    expect(await span(page)).toBeCloseTo(240, 6);
    expect(requests).toHaveLength(0);

    await page.reload();
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
    await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
    await expect(readout(page, 'status-scale')).toHaveText(`1/2" = 1'-0"`);
    expect(requests).toHaveLength(0);
  });

  test('EZD-219 B4 the live cursor readout makes no React commit', async ({ page, signInAs }) => {
    await page.addInitScript({
      path: path.join(repoRoot(), 'scripts', 'perf', 'page-hooks.browser.js'),
    });
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await setView(page, { x: -48, y: 144, ppi: 4 });
    const commits = () => page.evaluate(() => (window as unknown as Window2).__EZD_PERF__.commits);
    // Stable read: two reads in a row equal, polled every 100 ms for up to 5000 ms (drawing-tools.spec.ts B9).
    const stable = async (): Promise<number> => {
      let last = -1;
      await expect
        .poll(
          async () => {
            const now = await commits();
            const same = now === last;
            last = now;
            return same;
          },
          { intervals: [100], timeout: 5000 },
        )
        .toBe(true);
      return last;
    };

    await moveTo(page, 98, 55.5);
    await expect(id(page, 'status-cursor')).toHaveText(`8' 2" , 4' 7 1/2"`);
    const before = await stable();
    for (let i = 1; i <= 4; i++) await moveTo(page, 98 + i, 55.5);
    expect(await stable()).toBe(before);

    await page.locator('header').first().hover();
    await expect(id(page, 'status-cursor')).toHaveText('—');
  });

  test('EZD-219 B5 typed zoom and the popover keys', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const zoom = id(page, 'status-zoom');

    await typeZoom(page, '250');
    await expect(zoom).toHaveText('250%');
    expect(await ppi(page)).toBeCloseTo(10, 9);
    await typeZoom(page, '2000');
    await expect(zoom).toHaveText('1600%');
    await typeZoom(page, 'abc');
    await expect(zoom).toHaveText('1600%');
    await typeZoom(page, '33.3');
    await expect(zoom).toHaveText('33%');

    await zoom.click();
    await expect(id(page, 'status-zoom-input')).toBeFocused();
    await page.keyboard.type('70');
    await page.keyboard.press('Escape');
    await expect(id(page, 'status-zoom-input')).toHaveCount(0);
    await expect(zoom).toHaveText('33%');

    await id(page, 'status-scale').click();
    await expect(id(page, 'status-scale-popover')).toBeVisible();
    const box = await canvasRegion(page).boundingBox();
    if (!box) throw new Error('canvas region has no box');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(id(page, 'status-scale-popover')).toHaveCount(0);
    await expect(readout(page, 'status-scale')).toHaveText(`1/2" = 1'-0"`);
  });

  test('EZD-219 B7 the scale offline and after a failed save', async ({
    page,
    context,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);

    // (i) offline: shown at once, sent once back online, kept after reload.
    const requests = scaleRequests(page);
    await context.setOffline(true);
    await page.waitForFunction(() => navigator.onLine === false);
    await chooseScale(page, '0.25');
    await chooseScale(page, '0.75');
    await expect(readout(page, 'status-scale')).toHaveText(`3/4" = 1'-0"`);
    expect(requests).toHaveLength(0);
    const answer = page.waitForResponse(
      (r) => r.url().includes('/plan-scale') && r.request().method() === 'PUT',
    );
    await context.setOffline(false);
    const res = await answer;
    expect(res.status()).toBe(200);
    expect(res.request().postData()).toBe('{"scale":0.75}');
    expect(requests).toHaveLength(1);
    await page.reload();
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
    await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
    await expect(readout(page, 'status-scale')).toHaveText(`3/4" = 1'-0"`);

    // (ii) a failed save online: the banner with Retry; Retry sends the choice again.
    await page.route(SCALE_ROUTE, (route) => route.fulfill({ status: 500, body: '{}' }), {
      times: 1,
    });
    const failed = page.waitForResponse((r) => r.url().includes('/plan-scale'));
    await chooseScale(page, '0.25');
    expect((await failed).status()).toBe(500);
    const banner = id(page, 'scale-save-failed-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Changes not saved');
    await expect(readout(page, 'status-scale')).toHaveText(`1/4" = 1'-0"`);
    const retried = page.waitForResponse(
      (r) =>
        r.url().includes('/plan-scale') && r.request().method() === 'PUT' && r.status() === 200,
    );
    const puts = () => requests.filter((r) => r.method() === 'PUT').length;
    const putsBeforeRetry = puts();
    await banner.getByRole('button', { name: 'Retry' }).click();
    const ok = await retried;
    expect(ok.request().postData()).toBe('{"scale":0.25}');
    await expect(banner).toHaveCount(0);
    expect(puts()).toBe(putsBeforeRetry + 1);
  });

  test(
    'EZD-219 B6 status bar and popover controls are touch targets',
    { tag: ['@surface'] },
    async ({ page, signInAs }) => {
      const { ids, user } = await fixtureS();
      await signInAs(user.email);
      await openReady(page, ids.P1);
      expect(await expectTouchTargets(page, statusBar(page))).toBe(3);
      await id(page, 'status-snap').click();
      expect(await expectTouchTargets(page, id(page, 'status-snap-popover'))).toBe(11);
      await page.keyboard.press('Escape');
      await id(page, 'status-scale').click();
      expect(await expectTouchTargets(page, id(page, 'status-scale-popover'))).toBe(7);
    },
  );
});
