// EZD-117b B1-B13 (vault/plans/EZD-117b.md section 4; AC-EZD-117b-1 to -6). Untagged, so desktop 1600 x 1000.
// Every test makes its own companies (never tenant 1); fixture H and E are app/test-harness/projects-search-fixture.ts.
// Expected values: AC-1 and Q-0402 (search sends q, counts follow the search, not the tab); S01 Controls ("/" and
// Esc); Q-0401 (header parts, no EZ Binder link); `initialsFor` ("Pat Owner" gives "PO"); Q-0210 and Q-0403 (the
// gear shows when a Settings section opens); S01 States and Q-0214 (empty, no match, loading, error, no access,
// offline); Q-0414 and AC-EZD-015a-4 (offline disables New project); S01 Permissions (no create without the switch).
import type { Page } from '@playwright/test';
import {
  captureTraffic,
  cleanup,
  closeHarness,
  createTenant,
  expect,
  expectTouchTargets,
  test,
} from '../test-harness/e2e/test';
import {
  catalogMember,
  noviewMember,
  ownerMember,
  seedFixtureH,
  viewerMember,
} from '../test-harness/projects-search-fixture';

const cardNames = (page: Page) => page.getByTestId('project-card-name');
const ALL_FIVE = ['Kitchen remodel', 'Primary bath', 'Guest bath', 'Laundry', 'Hall bath'];

async function fixtureH() {
  const tenant = await createTenant();
  await seedFixtureH(tenant);
  return tenant;
}

async function fixtureE() {
  const tenant = await createTenant();
  return { owner: await ownerMember(tenant), viewer: await viewerMember(tenant) };
}

test.describe('EZD-117b Projects header, search and states', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(`EZD-117b done when: Search filters by client, address or project name, ignoring case, combines with the active status tab, and the tab counts follow the search (Q-0402). (B1)`, async ({
    page,
    context,
    signInAs,
  }) => {
    const owner = await ownerMember(await fixtureH());
    await signInAs(owner.email);
    const withQ: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.pathname.startsWith('/api/') && u.searchParams.has('q'))
        withQ.push(u.pathname + u.search);
    });
    await page.goto('/');
    await expect(page.getByTestId('project-card')).toHaveCount(5);
    const traffic = await captureTraffic(context);
    await page.getByTestId('projects-search').pressSequentially('HENDRICKS');
    await expect(page.getByTestId('project-card')).toHaveCount(2);
    await expect(cardNames(page)).toHaveText(['Kitchen remodel', 'Primary bath']);
    await expect(page.getByTestId('projects-tab-count')).toHaveText(['2', '1', '1', '0', '0', '0']);
    await page.getByTestId('projects-tab-draft').click();
    await expect(cardNames(page)).toHaveText(['Kitchen remodel']);
    await expect(page.getByTestId('projects-tab-count')).toHaveText(['2', '1', '1', '0', '0', '0']);
    await traffic.settle();
    expect([...withQ].sort()).toEqual(
      [
        '/api/projects?status=all&sort=edited&q=HENDRICKS',
        '/api/projects/counts?q=HENDRICKS',
        '/api/projects?status=draft&sort=edited&q=HENDRICKS',
      ].sort(),
    );
  });

  test(`EZD-117b done when: "/" focuses the search field unless focus is already in a text input; Esc clears the search. (B2)`, async ({
    page,
    signInAs,
  }) => {
    const owner = await ownerMember(await fixtureH());
    await signInAs(owner.email);
    await page.goto('/');
    await expect(page.getByTestId('project-card')).toHaveCount(5);
    const input = page.getByTestId('projects-search');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('');
    await page.keyboard.type('kit');
    await page.keyboard.press('/');
    await expect(input).toHaveValue('kit/');
    await page.keyboard.press('Escape');
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await expect(page.getByTestId('project-card')).toHaveCount(5);
  });

  test(`EZD-117b done when: The header shows the wordmark, Projects, search, the notifications bell, the settings gear and the avatar, and no EZ Binder link (Q-0401). (B3)`, async ({
    page,
    signInAs,
  }) => {
    const owner = await ownerMember(await fixtureH());
    await signInAs(owner.email);
    await page.goto('/');
    await expect(page.getByTestId('projects-wordmark')).toHaveText('ezdraft');
    await expect(page.getByTestId('projects-header-title')).toHaveText('Projects');
    await expect(page.getByTestId('projects-search')).toBeVisible();
    await expect(page.getByTestId('notification-bell')).toBeVisible();
    await expect(page.getByTestId('projects-settings')).toBeVisible();
    await expect(page.getByTestId('avatar-menu-trigger')).toContainText('PO');
    await expect(page.getByText('EZ Contractor Binder')).toHaveCount(0);
  });

  test(`EZD-117b done when: The settings gear shows only to a user with at least one Settings page switch and opens Settings (Q-0210, Q-0403). (B4)`, async ({
    sessions,
  }) => {
    const tenant = await fixtureH();
    const viewer = await viewerMember(tenant);
    const catalog = await catalogMember(tenant);
    const [v, c] = await sessions.open([viewer.email, catalog.email]);
    await v.page.goto('/');
    await expect(v.page.getByTestId('project-card')).toHaveCount(5);
    await expect(v.page.getByTestId('projects-settings')).toHaveCount(0);

    await c.page.goto('/');
    await expect(c.page.getByTestId('projects-settings')).toBeVisible();
    await c.page.getByTestId('projects-settings').click();
    await expect.poll(() => new URL(c.page.url()).pathname).toMatch(/^\/settings/);
  });

  test(`EZD-117b done when: No projects shows a one-line message with New project (Create projects only). (B5)`, async ({
    sessions,
  }) => {
    const { owner, viewer } = await fixtureE();
    const [o, v] = await sessions.open([owner.email, viewer.email]);
    await o.page.goto('/');
    await expect(o.page.getByTestId('projects-empty')).toContainText('No projects yet');
    await expect(o.page.getByTestId('projects-empty-new')).toBeVisible();

    await v.page.goto('/');
    await expect(v.page.getByTestId('projects-empty')).toBeVisible();
    await expect(v.page.getByTestId('projects-empty-new')).toHaveCount(0);
    await expect(v.page.getByTestId('projects-new')).toHaveCount(0);
  });

  test(`EZD-117b done when: No match shows "No projects match" with a clear-filter link. (B6)`, async ({
    page,
    signInAs,
  }) => {
    const owner = await ownerMember(await fixtureH());
    await signInAs(owner.email);
    await page.goto('/');
    await expect(page.getByTestId('project-card')).toHaveCount(5);
    await page.getByTestId('projects-tab-draft').click();
    await page.getByTestId('projects-search').fill('zzz');
    await expect(page.getByTestId('projects-no-match')).toContainText('No projects match');
    await page.getByTestId('projects-clear-filter').click();
    await expect(page.getByTestId('projects-search')).toHaveValue('');
    await expect(page.getByTestId('projects-tab-all')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('project-card')).toHaveCount(5);
  });

  test(`EZD-117b done when: Loading shows 6 card skeletons. (B7)`, async ({ page, signInAs }) => {
    const owner = await ownerMember(await fixtureH());
    await signInAs(owner.email);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) => url.pathname === '/api/projects',
      async (route) => {
        await held;
        await route.continue();
      },
    );
    await page.goto('/');
    await expect(page.getByTestId('projects-skeleton')).toHaveCount(6);
    await expect(page.getByTestId('projects-skeleton').first()).toBeVisible();
    release();
    await expect(page.getByTestId('projects-skeleton')).toHaveCount(0);
    await expect(page.getByTestId('project-card')).toHaveCount(5);
  });

  test(`EZD-117b done when: A failed load shows "Projects could not load" with Retry. (B8)`, async ({
    page,
    signInAs,
  }) => {
    const owner = await ownerMember(await fixtureH());
    await signInAs(owner.email);
    const isList = (url: URL) => url.pathname === '/api/projects';
    await page.route(isList, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
        }),
      }),
    );
    await page.goto('/');
    const banner = page.getByTestId('projects-error');
    await expect(banner).toContainText('Projects could not load');
    await expect(banner.getByRole('button', { name: 'Retry' })).toBeVisible();
    await page.unroute(isList);
    await banner.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('projects-error')).toHaveCount(0);
    await expect(page.getByTestId('project-card')).toHaveCount(5);
  });

  test(`EZD-117b done when: A user without View projects sees "You don't have access to this. Ask your supervisor." (B9)`, async ({
    page,
    context,
    signInAs,
  }) => {
    const noview = await noviewMember(await fixtureH());
    await signInAs(noview.email);
    const traffic = await captureTraffic(context);
    await page.goto('/');
    await expect(page.getByTestId('no-access')).toHaveText(
      "You don't have access to this. Ask your supervisor.",
    );
    await expect(page.getByTestId('avatar-menu-trigger')).toBeVisible();
    await expect(page.getByTestId('projects-search')).toHaveCount(0);
    await expect(page.getByTestId('notification-bell')).toHaveCount(0);
    await expect(page.getByTestId('projects-grid')).toHaveCount(0);
    await page.waitForTimeout(500);
    const result = await traffic.settle();
    expect(result.requests.filter((r) => r.path.startsWith('/api/'))).toHaveLength(0);
  });

  test(`EZD-117b done when: Offline, the Offline banner shows (AC-EZD-015a-4) and New project is disabled (S01 States; Q-0414). (B10)`, async ({
    page,
    network,
    signInAs,
  }) => {
    const owner = await ownerMember(await fixtureH());
    await signInAs(owner.email);
    await page.goto('/');
    await expect(page.getByTestId('project-card')).toHaveCount(5);
    const banner = page.locator('[role="status"][data-state="offline"]');
    await network.set(page, 'off');
    await expect(banner).toHaveText('Offline');
    await expect(page.getByTestId('projects-new')).toBeDisabled();
    await network.set(page, 'on');
    await expect(banner).toHaveCount(0);
    await expect(page.getByTestId('projects-new')).toBeEnabled();
  });

  test(`EZD-117b done when: New project is absent for a user without Create projects. (B11)`, async ({
    page,
    signInAs,
  }) => {
    const viewer = await viewerMember(await fixtureH());
    await signInAs(viewer.email);
    await page.goto('/');
    await expect(cardNames(page)).toHaveText(ALL_FIVE);
    await expect(page.getByTestId('projects-new')).toHaveCount(0);
  });

  test(`EZD-117b B12 done when: No-match touch targets are at least 44 px (11 Accessibility and input; 6 tabs + sort + Clear filter).`, async ({
    page,
    signInAs,
  }) => {
    const viewer = await viewerMember(await fixtureH());
    await signInAs(viewer.email);
    await page.goto('/');
    await expect(page.getByTestId('project-card')).toHaveCount(5);
    await page.getByTestId('projects-search').fill('zzz');
    await expect(page.getByTestId('projects-no-match')).toBeVisible();
    expect(await expectTouchTargets(page, page.locator('main'))).toBe(8);
  });

  test(
    `EZD-117b B13 done when: Header touch targets are at least 44 px on iPad (11 Accessibility and input; search, bell, gear, avatar).`,
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const owner = await ownerMember(await fixtureH());
      await signInAs(owner.email);
      await page.goto('/');
      await expect(page.getByTestId('avatar-menu-trigger')).toBeVisible();
      expect(await expectTouchTargets(page, page.getByTestId('projects-header'))).toBe(4);
    },
  );
});
