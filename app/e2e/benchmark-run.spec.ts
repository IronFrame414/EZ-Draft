// EZD-237 B1, B2 (vault/plans/EZD-237.md section 4 T25, T26; AC-EZD-237-1, -2; ticket Done when "Running it in
// the browser test writes one benchmark_run row"; S15i: the benchmark plays with its progress in the Benchmark
// card and the page stays open). Expected values: one benchmark_run row for the tenant with created_by the member,
// 180 frames per step (09m row 1; D-Script), memory a number (Chromium exposes usedJSHeapSize; Q-0664), the
// page's user agent, app_version a commit or dev-<build> (D-Version); the drag ends in cancel, so the wall's saved
// data and seq are unchanged (D-Drag); the history lists the run (newest first); the Run button is at least 44 px
// on the iPad (11 Accessibility).
import { benchmarkObjectId } from '@ezdraft/geometry/benchmark';
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  expectTouchTargets,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { appOriginHeaders } from '../test-harness/e2e/same-origin';

const WALL = benchmarkObjectId(562);
const tid = (page: Page, id: string) => page.getByTestId(id);

type LoadedObject = { id: string; data: unknown; updatedSeq: number };

async function wallOf(page: Page, projectId: string): Promise<LoadedObject> {
  const res = await page.request.get(`/api/projects/${projectId}/model`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { objects: LoadedObject[] };
  const wall = body.objects.find((o) => o.id === WALL);
  expect(wall).toBeDefined();
  return wall!;
}

test.describe('EZD-237 benchmark run', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-237 B1 Run benchmark plays in the card and writes one benchmark_run row', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(180_000);
    const tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, [
      'view_projects',
      'edit_model',
      'settings_system_status',
    ]);
    await signInAs(m.email);

    const made = await page.request.post('/api/benchmark/project', { headers: appOriginHeaders() });
    expect([200, 201]).toContain(made.status());
    const projectId = ((await made.json()) as { project: { id: string } }).project.id;
    const before = await wallOf(page, projectId);

    await page.goto('/settings/system-status');
    await expect(tid(page, 'benchmark-empty')).toHaveText('No benchmark runs yet.');
    await tid(page, 'benchmark-run').click();
    await expect(tid(page, 'benchmark-progress')).toBeVisible();
    await expect(tid(page, 'benchmark-run')).toHaveText('Running…');
    await expect(tid(page, 'benchmark-frame')).toHaveAttribute(
      'src',
      `/projects/${projectId}?benchmark=run`,
    );

    // The run ends with the history listing it; the page never leaves System status.
    await expect(tid(page, 'benchmark-row')).toHaveCount(1, { timeout: 150_000 });
    await expect(tid(page, 'benchmark-progress')).toHaveCount(0);
    await expect(tid(page, 'benchmark-error')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/settings/system-status');

    const rows = await harnessSql()<
      {
        id: string;
        created_by: string;
        app_version: string;
        device: { userAgent: string };
        results: {
          pan: { frames: number };
          zoom: { frames: number };
          drag: { frames: number };
          memory: unknown;
        };
      }[]
    >`select id, created_by, app_version, device, results from public.benchmark_run
      where tenant_id = ${tenant}::uuid`;
    expect(rows).toHaveLength(1);
    const run = rows[0]!;
    expect(run.created_by).toBe(m.appUserId);
    expect(run.results.pan.frames).toBe(180);
    expect(run.results.zoom.frames).toBe(180);
    expect(run.results.drag.frames).toBe(180);
    expect(typeof run.results.memory).toBe('number');
    expect(run.device.userAgent).toBe(await page.evaluate(() => navigator.userAgent));
    expect(run.app_version).toMatch(/^([0-9a-f]{40}|dev-[0-9]+)$/);
    await expect(tid(page, 'benchmark-row')).toHaveAttribute('data-run-id', run.id);

    const after = await wallOf(page, projectId);
    expect(after.data).toEqual(before.data);
    expect(after.updatedSeq).toBe(before.updatedSeq);
    // L-051: leave the page so none of its requests run while afterAll cleans up.
    await page.goto('about:blank');
  });

  test('EZD-237 B2 the Run button is a touch target @ipad', async ({ page, signInAs }) => {
    const tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, [
      'view_projects',
      'edit_model',
      'settings_system_status',
    ]);
    await signInAs(m.email);
    await page.goto('/settings/system-status');
    await expect(tid(page, 'benchmark-empty')).toBeVisible();
    await tid(page, 'benchmark-run').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    expect(await expectTouchTargets(page, tid(page, 'benchmark-card'))).toBe(1);
    await page.waitForLoadState('networkidle');
  });
});
