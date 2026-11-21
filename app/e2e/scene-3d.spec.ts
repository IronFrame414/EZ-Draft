// EZD-1001a (AC-EZD-1001a-1, -2, -3; phase-10.md EZD-1001a; 11 Budgets "first open of 3D within 1 second"; 11 rules
// 4 and 7; S07 Layout footer). Untagged, so desktop 1600 x 1000. The benchmark project (POST /api/benchmark/project,
// EZD-237) in its own company, opened by a member with View projects, Edit model and System status.
// AC-3 is timed in the page: from the click on the 3D tab to the first frame the renderer draws of the 3D scene
// (`__ezdraft3d.stats().frames`), against the 1,000 ms budget.
import { benchmarkObjectId } from '@ezdraft/geometry/benchmark';
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  signedInJsContents,
  test,
} from '../test-harness/e2e/test';
import { appOriginHeaders } from '../test-harness/e2e/same-origin';

// 11 Budgets: first open of 3D within 1 second.
const FIRST_OPEN_BUDGET_MS = 1000;
// The same wall the EZD-237 benchmark run drags.
const WALL = benchmarkObjectId(562);
// The 3D scene's files: none may be in the editor route's first download (AC-EZD-1001a-2).
const SCENE_FILES = [
  'app:lazy/scene-3d/index.ts',
  'app:lazy/scene-3d/scene.ts',
  'app:lazy/scene-3d/Scene3dOverlay.tsx',
  'geometry:scene3d/wall-face.ts',
];

type Stats = {
  walls: number;
  floors: number;
  built: number;
  lastRebuilt: string[];
  frames: number;
  contexts: number;
  shown: boolean;
};
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Win = {
  __ezdraft3d?: { stats(): Stats };
  __ezdraftPlan: {
    stats(): { contexts: number; frames: number };
    handle: { getView(): { x: number; y: number; ppi: number }; setView(v: { x: number; y: number; ppi: number }): void };
  };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
};

const tid = (page: Page, id: string) => page.getByTestId(id);
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true });
const stats3d = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__ezdraft3d?.stats() ?? null);

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
  return projectId;
}

test.describe('EZD-1001a 3D scene core', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-1001a-2 the editor route holds no 3D scene code; it loads on the first press of 3D', async ({
    page,
    browser,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const projectId = await openBenchmark(page, signInAs);
    const state = await page.context().storageState();
    const contents = await signedInJsContents(browser, state, `/projects/${projectId}`, 'editor');
    expect('error' in contents).toBe(false);
    const modules = Object.keys(
      (contents.details as { modules?: Record<string, number> }).modules ?? {},
    );
    expect(modules).toContain('app:editor/ProjectEditor.tsx');
    for (const file of SCENE_FILES) expect(modules).not.toContain(file);
    // Not loaded before 3D is pressed.
    expect(await stats3d(page)).toBeNull();
    await tab(page, '3D').click();
    await expect.poll(async () => (await stats3d(page))?.frames ?? 0).toBeGreaterThan(0);
    await page.goto('about:blank');
  });

  test('AC-EZD-1001a-3 first open of 3D on the benchmark project is within 1,000 ms; AC-1 a moved wall shows at once', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    await openBenchmark(page, signInAs);
    await expect(tab(page, '3D')).toBeVisible();

    // Timed in the page: the click, then each animation frame until the 3D scene has drawn a frame.
    const elapsed = await page.evaluate(async () => {
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
    console.log(`EZD-1001a first open of 3D on the benchmark project: ${Math.round(elapsed)} ms`);
    expect(elapsed).toBeLessThanOrEqual(FIRST_OPEN_BUDGET_MS);

    const first = (await stats3d(page))!;
    expect(first.walls).toBeGreaterThan(0);
    // 11 rule 4: drawn into the plan's one renderer.
    expect(first.contexts).toBe(1);
    await expect(tab(page, '3D')).toHaveAttribute('aria-current', 'page');
    await expect(tid(page, 'scene-3d-sync')).toHaveText('Model synced with plan');
    await expect(tid(page, 'scene-3d-empty')).toHaveCount(0);

    // AC-EZD-1001a-1 in the browser: one wall moved 12" east through the editor's store is rebuilt alone and a new
    // frame is drawn, in the same task as the edit (before any save could answer).
    const after = await page.evaluate((id) => {
      const w = window as unknown as Win;
      const wall = w.__ezdraftEditor.objects().find((o) => o.id === id)!;
      const g = wall.data.geometry as { start: { x: number; y: number }; end: { x: number; y: number } };
      const before = w.__ezdraft3d!.stats();
      const { id: _drop, ...value } = wall;
      void _drop;
      w.__ezdraftEditor.edit([
        {
          id,
          value: {
            ...value,
            data: {
              ...wall.data,
              geometry: {
                start: { x: g.start.x + 12, y: g.start.y },
                end: { x: g.end.x + 12, y: g.end.y },
              },
            },
          },
        },
      ]);
      const now = w.__ezdraft3d!.stats();
      return { rebuilt: now.lastRebuilt, built: now.built - before.built, frames: before.frames };
    }, WALL);
    expect(after.rebuilt).toEqual([WALL]);
    expect(after.built).toBe(1);
    await expect.poll(async () => (await stats3d(page))!.frames).toBeGreaterThan(after.frames);

    // Plan and back: the same scene and the same one WebGL context.
    await tab(page, 'Plan').click();
    await expect(tid(page, 'scene-3d-sync')).toHaveCount(0);
    await expect.poll(async () => (await stats3d(page))!.shown).toBe(false);
    // The plan is drawn again and the 3D scene is not: a pan draws plan frames and no 3D frame.
    const mark = await page.evaluate(() => {
      const w = window as unknown as Win;
      const v = w.__ezdraftPlan.handle.getView();
      const out = { plan: w.__ezdraftPlan.stats().frames, scene: w.__ezdraft3d!.stats().frames };
      w.__ezdraftPlan.handle.setView({ ...v, x: v.x + 24 });
      return out;
    });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Win).__ezdraftPlan.stats().frames))
      .toBeGreaterThan(mark.plan);
    expect((await stats3d(page))!.frames).toBe(mark.scene);
    await tab(page, '3D').click();
    await expect.poll(async () => (await stats3d(page))!.shown).toBe(true);
    const again = (await stats3d(page))!;
    expect(again.contexts).toBe(1);
    expect(again.built).toBe(first.built + 1);
    await page.goto('about:blank');
  });
});
