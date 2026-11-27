// EZD-2028 (Q-0907 "toasts and the reload notice sit above the field tab bar and clear the home bar ... on every
// screen; desktop position unchanged"; AC-EZD-2028-1, AC-EZD-2028-2): on the field pack (phone project, 390x844)
// a toast and the reload notice do not overlap the tab bar or any of its tabs; on a desktop page with no tab bar
// they stay 16 px from the bottom (Toast.module.css and DeviceNotices.module.css before this ticket). The browser
// reports no safe-area inset, so the inset term is checked in notices-bottom-css.test.ts. The page is marked
// outdated as device-storage.spec.ts AC-EZD-134-3 does: an answer carrying a newer build (on the field pack, to the
// pack's own read; on Projects, to one read the loaded page makes through its fetch). Service workers are blocked
// so the read reaches page.route.
// AC-EZD-2028-3 "New tests cover the field pack and a desktop page": the two tests below are those tests.
import type { Locator, Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFieldPack } from './fixtures/field-pack';

const BUILD_HEADER = 'x-ezdraft-app-build';
const CREW = ['view_projects', 'check_off_tasks', 'photo_notes', 'flag_conflict'];
// The desktop bottom offset that Josh keeps (Q-0907 "desktop position unchanged").
const DESKTOP_GAP = 16;

test.use({ serviceWorkers: 'block' });

// Answers the page's reads of `url` as a newer server build would.
async function answerAsNewerBuild(page: Page, url: string) {
  await page.route(`**${url}`, async (route) => {
    const response = await route.fetch();
    const build = Number(response.headers()[BUILD_HEADER]);
    expect(build).toBeGreaterThan(0);
    await route.fulfill({
      response,
      headers: { ...response.headers(), [BUILD_HEADER]: String(build + 1) },
    });
  });
}

// The page makes one same-origin read through its fetch, answered by a newer server build.
async function readFromNewerBuild(page: Page, url: string) {
  await answerAsNewerBuild(page, url);
  const status = await page.evaluate(async (u) => (await fetch(u)).status, url);
  expect(status).toBe(200);
}

// A toast-sized box in the page's own toast area, so the area's placement is measured on the real page.
async function showToastBox(page: Page): Promise<Locator> {
  await page.evaluate(() => {
    const viewport = document.querySelector('[data-toast-viewport]');
    if (!viewport) throw new Error('no toast viewport');
    const box = document.createElement('div');
    box.setAttribute('data-toast', '');
    box.setAttribute('data-testid', 'ezd-2028-toast');
    box.style.width = '240px';
    box.style.height = '48px';
    viewport.appendChild(box);
  });
  return page.getByTestId('ezd-2028-toast');
}

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error('no bounding box');
  return b;
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe('EZD-2028 toasts and the reload notice clear the bottom bar (AC-EZD-2028-3)', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'AC-EZD-2028-1 on the field pack a toast and the reload notice sit above the tab bar',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      const tenant = await createTenant();
      const [project] = (await createProjects(tenant, 1)) as [string];
      await seedFieldPack(harnessSql(), { tenantId: tenant, projectId: project, taskCount: 3 });
      const crew = await createMember({ tenantId: tenant, scope: 'listed', listed: [project] });
      await setPermissions(tenant, crew.membershipId, CREW as never);
      await signInAs(crew.email);
      // The pack's own read is answered by a newer build.
      await answerAsNewerBuild(page, `/api/projects/${project}/field-pack`);
      await page.goto(`/projects/${project}/field`);
      await expect(page.getByTestId('field-pack')).toHaveAttribute('data-state', 'ready');

      const tabBar = page.getByRole('tablist', { name: 'Field pack tabs' });
      const tabs = tabBar.getByRole('tab');
      await expect(tabs).toHaveCount(5);
      const bar = await boxOf(tabBar);
      const tabBoxes = await Promise.all((await tabs.all()).map(boxOf));

      const notice = page.getByTestId('app-reload-prompt');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(
        'EZ Draft has been updated. Reload to use the new version.',
      );
      const toast = await showToastBox(page);
      await expect(toast).toBeVisible();

      for (const el of [await boxOf(notice), await boxOf(toast)]) {
        expect(overlaps(el, bar)).toBe(false);
        for (const tab of tabBoxes) expect(overlaps(el, tab)).toBe(false);
        expect(el.y + el.height).toBeLessThanOrEqual(bar.y);
      }
    },
  );

  test(
    'AC-EZD-2028-2 on a desktop page with no tab bar they stay 16 px from the bottom',
    { tag: ['@desktop'] },
    async ({ page, signInAs }) => {
      const tenant = await createTenant();
      await createProjects(tenant, 1);
      const member = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
      await setPermissions(tenant, member.membershipId, ['view_projects'] as never);
      await signInAs(member.email);
      await page.goto('/');
      await expect(page.getByTestId('projects-header')).toBeVisible();
      await readFromNewerBuild(page, '/api/projects/counts');
      const height = page.viewportSize()!.height;

      const notice = page.getByTestId('app-reload-prompt');
      await expect(notice).toBeVisible();
      const n = await boxOf(notice);
      expect(height - (n.y + n.height)).toBeCloseTo(DESKTOP_GAP, 0);

      const t = await boxOf(await showToastBox(page));
      expect(height - (t.y + t.height)).toBeCloseTo(DESKTOP_GAP, 0);
    },
  );
});
