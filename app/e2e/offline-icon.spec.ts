// EZD-347 B1-B3 (vault/plans/EZD-347.md section 4; AC-EZD-347-1, -2). Untagged, so the desktop project.
// Box values: planner probe (plan section 2) and the path extents of svg/cloud_off.svg and svg/error.svg.
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

async function member(tenant: string, permissions: string[]) {
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return m;
}

const EDITOR = ['view_projects', 'edit_model'];

async function fixtureS(permissions: string[] = EDITOR) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  return { tenant, ids, user: await member(tenant, permissions) };
}

type Hook = {
  objects(): Array<{ id: string; type: string; data: Record<string, unknown> }>;
  edit(changes: unknown[]): string[];
};

const E = (page: Page, n: string) =>
  page.evaluate((name) => {
    const hook = (window as unknown as { __ezdraftEditor: Hook }).__ezdraftEditor;
    const floor = hook.objects().find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return hook.edit([
      { id: floor.id, value: { type: 'floor', schemaVersion: 1, data: { name, order: 1 } } },
    ]);
  }, n);

const SAVE_ROUTE = '**/api/projects/*/objects';

async function probe(page: Page, css: string): Promise<Record<string, string>> {
  return page.evaluate((style) => {
    const el = document.createElement('div');
    el.setAttribute('style', style);
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const out = {
      backgroundColor: cs.backgroundColor,
      color: cs.color,
      borderTopColor: cs.borderTopColor,
    };
    el.remove();
    return out;
  }, css);
}

// The box of the icon's <use>, polled until it has a width (the expectIconsDraw pattern).
async function useBox(loc: Locator): Promise<{ width: number; height: number }> {
  let box = { width: 0, height: 0 };
  await expect
    .poll(
      async () => {
        box = await loc.locator('svg use').evaluate((el) => {
          const b = (el as unknown as SVGGraphicsElement).getBBox();
          return { width: b.width, height: b.height };
        });
        return box.width;
      },
      { timeout: 5_000 },
    )
    .toBeGreaterThan(0);
  return box;
}

test.describe('EZD-347 offline banner icon', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-347 done when: The offline banner shows a visible cloud_off icon', async ({
    page,
    network,
  }) => {
    const spriteRequests: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/icons/sprite.svg') spriteRequests.push(r.url());
    });
    await page.goto('/dev/states');
    await page.waitForSelector('[data-testid="states-demo"][data-ready="true"]');
    await network.set(page, 'off');
    const banner = page.locator('[data-testid=offline-section] [data-state=offline]');
    await expect(banner).toBeVisible();
    await expect(banner.locator('svg use')).toHaveAttribute('href', '#ez-icon-cloud_off');
    const box = await useBox(banner);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(box.width).toBeCloseTo(18, 1);
    expect(box.height).toBeCloseTo(15.1875, 1);
    expect(spriteRequests).toEqual([]);
  });

  test("EZD-347 B2: the editor's offline banner shows its cloud_off icon", async ({
    page,
    signInAs,
    network,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await page.goto(`/projects/${ids.P1}`);
    await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await network.set(page, 'off');
    const banner = page.locator('[data-state="offline"]');
    await expect(banner).toBeVisible();
    await expect(banner.locator('svg use')).toHaveAttribute('href', '#ez-icon-cloud_off');
    const box = await useBox(banner);
    expect(box.width).toBeCloseTo(18, 1);
    expect(box.height).toBeCloseTo(15.1875, 1);
  });

  test('EZD-347 done when: the save-failed banner icon is unchanged', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(60_000);
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await page.goto(`/projects/${ids.P1}`);
    await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await page.route(SAVE_ROUTE, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
        }),
      }),
    );
    await E(page, 'Floor A');
    const banner = page.getByTestId('save-failed-banner');
    await expect(banner).toContainText('Changes not saved', { timeout: 20_000 });
    const svg = banner.locator('svg').first();
    await expect(svg).toHaveAttribute('width', '20');
    await expect(svg).toHaveAttribute('height', '20');
    await expect(banner.locator('svg use')).toHaveAttribute('href', '#ez-icon-error');
    const box = await useBox(banner);
    expect(box.width).toBeCloseTo(16, 1);
    expect(box.height).toBeCloseTo(16, 1);
    const color = await svg.evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe((await probe(page, 'color: var(--ez-red)')).color);
  });
});
