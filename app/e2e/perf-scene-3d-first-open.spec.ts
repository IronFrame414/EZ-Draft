// EZD-2009 (AC-EZD-2009-1, -2; flaky-test audit 2026-11-27 row 2; 11 Budgets "first open of 3D within 1 second";
// AC-EZD-1001a-3). Untagged and named perf-*, so Playwright project `perf`: it runs alone with one worker, after the
// device projects, like the other budgets. The timing was in scene-3d.spec.ts, where 4 browser workers shared the
// machine. It is taken the same way here: in the page, from the click on the 3D tab to the first frame the renderer
// draws of the 3D scene, against the same 1,000 ms.
// What the first click still paid for: the download of the lazy `scene-3d` chunk. The editor now asks for it at the
// first idle moment after the person's first input (editor/plan/scene-warmup.ts loadAfterFirstInput), so each test
// moves the pointer over the plan first, as a person does on the way to the tab. The second and third tests hold
// every file under /_next/static back by a fixed 1,500 ms: a click with no input before it pays that wait (the slow
// condition), and a click after the idle load does not.
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { appOriginHeaders } from '../test-harness/e2e/same-origin';

// 11 Budgets: first open of 3D within 1 second.
const FIRST_OPEN_BUDGET_MS = 1000;
// The fixed delay of the slow-download stub: longer than the budget, so one held file alone breaks it.
const SLOW_DOWNLOAD_MS = 1500;

type Stats = { walls: number; frames: number; contexts: number; shown: boolean };
type Win = {
  __ezdraft3d?: { stats(): Stats };
  __ezdraftEditor: { scene3dLoaded(): boolean };
};

const tid = (page: Page, id: string) => page.getByTestId(id);
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true });
const sceneLoaded = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__ezdraftEditor.scene3dLoaded());

async function openBenchmark(page: Page, signInAs: (email: string) => Promise<unknown>) {
  const tenant = await createTenant();
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model', 'settings_system_status']);
  await signInAs(m.email);
  const made = await page.request.post('/api/benchmark/project', { headers: appOriginHeaders() });
  expect([200, 201]).toContain(made.status());
  const projectId = ((await made.json()) as { project: { id: string } }).project.id;
  await page.goto(`/projects/${projectId}`);
  await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready', { timeout: 30_000 });
  await expect(tid(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready', { timeout: 30_000 });
  await expect(tab(page, '3D')).toBeVisible();
}

// A real pointer move over the middle of the plan: the person's first input in the editor.
async function movePointerOverPlan(page: Page) {
  const box = (await tid(page, 'plan-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

// Timed in the page (as scene-3d.spec.ts timed it): the click, then each animation frame until the 3D scene has
// drawn a frame. `HTMLElement.click()` sends a click and no pointer event, so it is not itself a first input.
function clickToFirstFrame(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const w = window as unknown as Win;
    const button = [...document.querySelectorAll('nav[aria-label="Views"] button')].find(
      (b) => b.textContent === '3D',
    ) as HTMLButtonElement;
    const t0 = performance.now();
    button.click();
    return new Promise<number>((resolve) => {
      const tick = () => {
        const s = w.__ezdraft3d?.stats();
        if (s !== undefined && s.shown && s.frames > 0) resolve(performance.now() - t0);
        else requestAnimationFrame(tick);
      };
      tick();
    });
  });
}

// From now on every file under /_next/static is answered SLOW_DOWNLOAD_MS late. Returns the paths held so far.
async function holdStaticFiles(page: Page): Promise<string[]> {
  const held: string[] = [];
  await page.route('**/_next/static/**', async (route) => {
    held.push(new URL(route.request().url()).pathname);
    await new Promise((r) => setTimeout(r, SLOW_DOWNLOAD_MS));
    await route.continue();
  });
  return held;
}

test.describe('EZD-2009 first open of 3D', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-1001a-3 first open of 3D on the benchmark project is within 1,000 ms', async ({ page, signInAs }) => {
    test.setTimeout(120_000);
    await openBenchmark(page, signInAs);
    // With no user action the 3D scene's chunk is not asked for (11 rule 7).
    expect(await sceneLoaded(page)).toBe(false);
    await movePointerOverPlan(page);
    // The idle load: the chunk arrives with 3D never pressed, and no scene is made.
    await expect.poll(() => sceneLoaded(page), { timeout: 15_000 }).toBe(true);
    expect(await page.evaluate(() => (window as unknown as Win).__ezdraft3d === undefined)).toBe(true);
    await expect(tab(page, 'Plan')).toHaveAttribute('aria-current', 'page');

    const elapsed = await clickToFirstFrame(page);
    console.log(`EZD-1001a first open of 3D on the benchmark project: ${Math.round(elapsed)} ms`);
    expect(elapsed).toBeLessThanOrEqual(FIRST_OPEN_BUDGET_MS);

    const first = await page.evaluate(() => (window as unknown as Win).__ezdraft3d!.stats());
    expect(first.walls).toBeGreaterThan(0);
    // 11 rule 4: drawn into the plan's one renderer.
    expect(first.contexts).toBe(1);
    await expect(tab(page, '3D')).toHaveAttribute('aria-current', 'page');
    await page.goto('about:blank');
  });

  test('AC-EZD-2009-2 the slow condition: with no input before it, the first press of 3D waits for the held download', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    await openBenchmark(page, signInAs);
    const held = await holdStaticFiles(page);
    expect(await sceneLoaded(page)).toBe(false);

    const elapsed = await clickToFirstFrame(page);
    console.log(`EZD-2009 first open of 3D, chunk not loaded and held ${SLOW_DOWNLOAD_MS} ms: ${Math.round(elapsed)} ms`);
    // The click paid for the download: the stub held at least one file, and the first frame waited for it.
    expect(held.length).toBeGreaterThan(0);
    expect(elapsed).toBeGreaterThanOrEqual(SLOW_DOWNLOAD_MS);
    await page.goto('about:blank');
  });

  test('AC-EZD-2009-1 after the idle load the first press of 3D downloads nothing: within 1,000 ms with downloads held 1,500 ms', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    await openBenchmark(page, signInAs);
    const held = await holdStaticFiles(page);
    expect(await sceneLoaded(page)).toBe(false);

    await movePointerOverPlan(page);
    await expect.poll(() => sceneLoaded(page), { timeout: 15_000 }).toBe(true);
    // The idle load is what waited for the held files.
    const idleLoad = [...held];
    expect(idleLoad.length).toBeGreaterThan(0);

    const elapsed = await clickToFirstFrame(page);
    console.log(`EZD-2009 first open of 3D, chunk loaded while idle, downloads held ${SLOW_DOWNLOAD_MS} ms: ${Math.round(elapsed)} ms`);
    // Nothing more was asked for between the click and the first frame, so the budget holds with the stub on.
    expect(held).toEqual(idleLoad);
    expect(elapsed).toBeLessThanOrEqual(FIRST_OPEN_BUDGET_MS);
    await page.goto('about:blank');
  });
});
