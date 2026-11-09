// EZD-363 B1-B2 (vault/plans/EZD-363.md section 4; AC-EZD-363-1). The disabled Wall tool shows the same look
// with a mouse (hovered or not) and on touch while the model loads. Every test makes its own company (never
// tenant 1) with fixture S and its own member. The load is held with a route, as in drawing-tools.spec.ts B2.
import type { Locator, Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

const EDITOR = ['view_projects', 'edit_model'];
const LOAD_ROUTE = '**/api/projects/*/model';

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

const editorState = (page: Page) => page.getByTestId('editor-state');
const wall = (page: Page) => page.locator('[data-rail-tool="wall"]');

const coarse = (page: Page): Promise<boolean> =>
  page.evaluate(() => window.matchMedia('(any-pointer: coarse)').matches);
const hoverCapable = (page: Page): Promise<boolean> =>
  page.evaluate(() => window.matchMedia('(hover: hover)').matches);

// The disabled look: background transparent (rgba(0, 0, 0, 0)), --ez-slate-300 #9aa3af (rgb(154, 163, 175),
// tokens.css line 10), cursor default (ToolRail.module.css).
async function expectDisabledLook(locator: Locator) {
  await expect(locator).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(locator).toHaveCSS('color', 'rgb(154, 163, 175)');
  await expect(locator).toHaveCSS('cursor', 'default');
}

// The pointer goes to the centre of the Wall button (page.mouse.move, not locator.hover()).
async function pointAtWall(page: Page) {
  const box = await wall(page).boundingBox();
  if (!box) throw new Error('the Wall tool has no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

// Holds the model load until the returned release() is called.
async function holdLoad(page: Page, projectId: string): Promise<() => void> {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(LOAD_ROUTE, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(`/projects/${projectId}`);
  return () => release();
}

test.describe('EZD-363 disabled tool look', () => {
  // After sign-in the page is controlled by sw.js (EZD-013). On WebKit a service-worker-controlled page's
  // model request is not routed by page.route, so the held load never held (measured on ipad-landscape:
  // controller "controlled", route hits 0). Blocking the service worker keeps the request on the page's route.
  test.use({ serviceWorkers: 'block' });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'EZD-363 B1 a disabled tool looks the same hovered and not hovered with a mouse',
    { tag: ['@desktop'] },
    async ({ page, signInAs }) => {
      const { ids, user } = await fixtureS();
      await signInAs(user.email);
      const release = await holdLoad(page, ids.P1);
      await expect(editorState(page)).toHaveAttribute('data-editor-state', 'loading');
      await expect(wall(page)).toBeDisabled();
      expect(await hoverCapable(page)).toBe(true);
      await expectDisabledLook(wall(page));
      await pointAtWall(page);
      await expectDisabledLook(wall(page));
      release();
      await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
      await expect(wall(page)).toHaveAttribute('aria-pressed', 'false');
      await page.mouse.move(0, 0);
      await pointAtWall(page);
      // Hover is live on this project once the tool is enabled (--ez-hover, tokens.css line 13).
      await expect(wall(page)).toHaveCSS('background-color', 'rgb(242, 244, 247)');
    },
  );

  test(
    'EZD-363 B2 a disabled tool looks the same on touch',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { ids, user } = await fixtureS();
      await signInAs(user.email);
      const release = await holdLoad(page, ids.P1);
      await expect(editorState(page)).toHaveAttribute('data-editor-state', 'loading');
      await expect(wall(page)).toBeDisabled();
      expect(await coarse(page)).toBe(true);
      await expectDisabledLook(wall(page));
      await pointAtWall(page);
      await expectDisabledLook(wall(page));
      release();
      await expect(editorState(page)).not.toHaveAttribute('data-editor-state', 'loading');
    },
  );
});
