// EZD-1902 (AC-EZD-1902-1 "@react-three/fiber is removed"; AC-EZD-1902-2 "Switching Plan, 3D and Sheets creates no
// second WebGL context (the existing __ezdraftPlan stats contexts check stays at 1)"; 11 rule 4 "a tab switch never
// creates or destroys a WebGL context"). Untagged, so desktop 1600 x 1000. The benchmark project (POST
// /api/benchmark/project, EZD-237) in its own company, opened as scene-3d.spec.ts opens it.
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

type Win = {
  __ezdraftPlan: { stats(): { contexts: number; frames: number } };
  __ezdraft3d?: { stats(): { contexts: number; frames: number } };
};

const tid = (page: Page, id: string) => page.getByTestId(id);
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true });
const contexts = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__ezdraftPlan.stats().contexts);

test.describe('EZD-1902 plain Three.js render root', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-1902-1 and -2 no React Three Fiber in the editor; Plan, 3D and Sheets share one WebGL context', async ({
    page,
    browser,
    signInAs,
  }) => {
    test.setTimeout(120_000);
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

    // AC-1: the editor route's first download holds no React Three Fiber module.
    const state = await page.context().storageState();
    const contents = await signedInJsContents(browser, state, `/projects/${projectId}`, 'editor');
    expect('error' in contents).toBe(false);
    const modules = Object.keys((contents.details as { modules?: Record<string, number> }).modules ?? {});
    expect(modules).toContain('app:editor/ProjectEditor.tsx');
    expect(modules.filter((k) => k.includes('@react-three/'))).toEqual([]);

    // AC-2: the plan is drawn into one context, and every tab switch keeps that one.
    await expect.poll(() => page.evaluate(() => (window as unknown as Win).__ezdraftPlan.stats().frames)).toBeGreaterThan(0);
    expect(await contexts(page)).toBe(1);

    await tab(page, '3D').click();
    await expect(tab(page, '3D')).toHaveAttribute('aria-current', 'page');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Win).__ezdraft3d?.stats().frames ?? 0))
      .toBeGreaterThan(0);
    expect(await contexts(page)).toBe(1);

    await tab(page, 'Sheets').click();
    await expect(tab(page, 'Sheets')).toHaveAttribute('aria-current', 'page');
    await expect(tid(page, 'sheet-preview')).toBeVisible();
    expect(await contexts(page)).toBe(1);

    await tab(page, 'Plan').click();
    await expect(tab(page, 'Plan')).toHaveAttribute('aria-current', 'page');
    await expect(tid(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
    expect(await contexts(page)).toBe(1);
    await page.goto('about:blank');
  });
});
