// EZD-117a B1-B8 (vault/plans/EZD-117a.md section 4; AC-EZD-117a-1 to -7). Untagged, so desktop 1600 x 1000. Every
// test makes its own company (never tenant 1) and members; fixture S is app/test-harness/projects-fixture.ts.
// Expected values: ticket row Done when (200 projects: two data requests, first cards within budget, no editor
// code); Q-0450 (a) (exact match on every /api/ request); 11 Budgets "Projects page" (first cards 1000 ms) and
// `download.projects-settings` (300,000 bytes; Q-0586, Josh 2026-11-05); ENTRY_RULES.office; S01 Controls; Q-0394 (a card is not a link);
// Q-0202; S01 Permissions; Decided "CSS" (token pairs from the mockup `renderVals`, tokens.css).
// B3 budget 300,000: Q-0586 (Josh 2026-11-05).
// B1 source (EZD-117b E4): AC-EZD-117a-2; EZD-117a ticket row; EZD-110 D16; Q-0450 (a).
import type { Locator, Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  signedInJsContents,
  signedInJsSize,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS, seedGenerated, type FixtureKey } from '../test-harness/projects-fixture';

async function member(
  tenant: string,
  permissions: string[],
  scope: 'all' | 'listed' = 'all',
  listed: string[] = [],
) {
  const m = await createMember({ tenantId: tenant, scope, listed });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return m;
}

// A company with n generated projects and a member who may view projects (B1-B4).
async function bigCompany(n: number) {
  const tenant = await createTenant();
  await seedGenerated(tenant, n);
  return member(tenant, ['view_projects']);
}

async function fixtureS(permissions: string[] = ['view_projects']) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  return { tenant, ids, owner: await member(tenant, permissions) };
}

const cardNames = (page: Page) => page.getByTestId('project-card-name');
const cardOf = (page: Page, id: string) =>
  page.locator(`[data-testid="project-card"][data-project-id="${id}"]`);
const apiRequests = (page: Page): string[] => {
  const urls: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) urls.push(r.url());
  });
  return urls;
};
// Landing settle (EZD-117b E11): count finished GET /api/notifications; the mount fetch and the first-join resync make 2.
function countNotificationGets(page: Page): () => number {
  let count = 0;
  page.on('requestfinished', (req) => {
    if (req.method() === 'GET' && new URL(req.url()).pathname === '/api/notifications') count++;
  });
  return () => count;
}

// The computed background and text colors of an element, and of a probe div styled with the token pair.
async function colorsOf(el: Locator) {
  return el.evaluate((e) => {
    const s = getComputedStyle(e);
    return { background: s.backgroundColor, color: s.color };
  });
}
async function probe(page: Page, background: string | null, color: string) {
  return page.evaluate(
    ([bg, fg]) => {
      const d = document.createElement('div');
      if (bg !== null) d.style.backgroundColor = `var(${bg})`;
      d.style.color = `var(${fg})`;
      document.body.appendChild(d);
      const s = getComputedStyle(d);
      const out = { background: s.backgroundColor, color: s.color };
      d.remove();
      return out;
    },
    [background, color] as const,
  );
}

test.describe('EZD-117a Projects page', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  // EZD-117b plan section 4 E4 (Q-0450 (a)): recorded with apiRequests (page.on('request')); EZD-353 T1 (traffic.spec.ts)
  // proves captureTraffic counts the same requests. Source: AC-EZD-117a-2; EZD-117a ticket row; EZD-110b D16 (two
  // notification GETs when the user channel subscribes); hub.ts header (token on first connect only); Q-0450 (a).
  test("EZD-117a B1 two data requests: 200 projects load 48 cards from /api/projects and /api/projects/counts, plus the bell's mount requests (/api/notifications twice, /api/realtime/token once), and nothing else", async ({
    page,
    signInAs,
  }) => {
    const m = await bigCompany(200);
    const landing = countNotificationGets(page);
    await signInAs(m.email);
    await expect.poll(landing).toBe(2);
    const urls = apiRequests(page);
    await page.goto('/');
    await expect(page.getByTestId('project-card')).toHaveCount(48);
    await expect
      .poll(() => urls.filter((u) => new URL(u).pathname === '/api/notifications').length)
      .toBe(2);
    expect(urls.map((u) => new URL(u).pathname).sort()).toEqual([
      '/api/notifications',
      '/api/notifications',
      '/api/projects',
      '/api/projects/counts',
      '/api/realtime/token',
    ]);
    await expect(page.getByTestId('projects-more')).toHaveCount(1);
  });

  test('EZD-117a B2 the first cards show within 1,000 ms on a warm page', async ({
    page,
    signInAs,
  }) => {
    const m = await bigCompany(200);
    await signInAs(m.email);
    await page.goto('/');
    await expect(page.getByTestId('project-card').first()).toBeVisible();
    await page.addInitScript(() => {
      const w = window as unknown as { __firstCardMs?: number };
      const mo = new MutationObserver(() => {
        if (
          document.querySelector('[data-testid="project-card"]') &&
          w.__firstCardMs === undefined
        ) {
          w.__firstCardMs = performance.now();
          mo.disconnect();
        }
      });
      mo.observe(document, { childList: true, subtree: true });
    });
    await page.goto('/');
    await expect(page.getByTestId('project-card').first()).toBeVisible();
    const ms = await page.evaluate(
      () => (window as unknown as { __firstCardMs?: number }).__firstCardMs,
    );
    expect(ms).toBeDefined();
    expect(ms as number).toBeLessThan(1000);
  });

  test('EZD-117a B3 the page loads no editor code and stays within 300,000 compressed bytes', async ({
    page,
    browser,
    signInAs,
  }) => {
    test.setTimeout(120000);
    const m = await bigCompany(200);
    await signInAs(m.email);
    await page.goto('/');
    await expect(page.getByTestId('project-card').first()).toBeVisible();
    const state = await page.context().storageState();
    const contents = await signedInJsContents(browser, state, '/');
    expect('error' in contents).toBe(false);
    expect('value' in contents ? contents.value : -1).toBe(0);
    const size = await signedInJsSize(browser, state, '/');
    expect('error' in size).toBe(false);
    expect('value' in size ? size.value : Infinity).toBeLessThanOrEqual(300000);
  });

  // EZD-117b plan section 4 E10: recorded with apiRequests, as B1. Source: EZD-117a B4 (6); EZD-110b D16; hub.ts header.
  test("EZD-117a B4 scrolling loads one page per step until all 200 cards show, with no other request than the bell's mount requests", async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120000);
    const m = await bigCompany(200);
    const landing = countNotificationGets(page);
    await signInAs(m.email);
    await expect.poll(landing).toBe(2);
    const urls = apiRequests(page);
    await page.goto('/');
    const cards = page.getByTestId('project-card');
    const more = page.getByTestId('projects-more');
    await expect(cards).toHaveCount(48);
    await expect
      .poll(() => urls.filter((u) => new URL(u).pathname === '/api/notifications').length)
      .toBe(2);
    for (const n of [96, 144, 192]) {
      await more.scrollIntoViewIfNeeded();
      await expect(cards).toHaveCount(n);
      await expect(more).toHaveAttribute('data-more-state', 'idle');
    }
    await more.scrollIntoViewIfNeeded();
    await expect(cards).toHaveCount(200);
    await expect(more).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    const paths = urls.map((u) => new URL(u).pathname);
    expect(paths.filter((p) => p === '/api/projects')).toHaveLength(5);
    expect(paths.filter((p) => p === '/api/projects/counts')).toHaveLength(1);
    expect(urls.filter((u) => new URL(u).searchParams.has('after'))).toHaveLength(4);
    expect(paths.filter((p) => p === '/api/notifications')).toHaveLength(2);
    expect(paths.filter((p) => p === '/api/realtime/token')).toHaveLength(1);
    expect(urls).toHaveLength(9);
  });

  test('EZD-117a B5 tabs, counts, sort and card content on fixture S', async ({
    page,
    signInAs,
  }) => {
    const { owner, ids } = await fixtureS();
    await signInAs(owner.email);
    await page.goto('/');
    await expect(page.getByTestId('projects-tab-count')).toHaveText(['6', '2', '1', '1', '1', '1']);
    await expect(cardNames(page)).toHaveText([
      'Delta',
      'bravo',
      'Alpha',
      'charlie',
      'echo',
      'foxtrot',
    ]);

    await page.getByTestId('projects-tab-draft').click();
    await expect(cardNames(page)).toHaveText(['Alpha', 'charlie']);
    await expect(page.getByTestId('projects-tab-count')).toHaveText(['6', '2', '1', '1', '1', '1']);
    await page.getByTestId('projects-tab-all').click();
    await expect(cardNames(page)).toHaveCount(6);

    await page.getByTestId('projects-sort').click();
    await expect(page.getByTestId('projects-sort-menu')).toBeVisible();
    await page.getByTestId('projects-sort-name').click();
    await expect(page.getByTestId('projects-sort')).toHaveText('Name');
    await expect(cardNames(page)).toHaveText([
      'Alpha',
      'bravo',
      'charlie',
      'Delta',
      'echo',
      'foxtrot',
    ]);

    const p3 = cardOf(page, ids.P3);
    await expect(p3.getByTestId('project-card-name')).toHaveText('charlie');
    await expect(p3.getByTestId('project-card-status')).toHaveText('Draft');
    await expect(p3.getByTestId('project-card-place')).toHaveText('acme · 3 Sort St');
    await expect(p3.getByTestId('project-card-version')).toHaveText('Working copy');
    await expect(p3.getByTestId('project-card-open')).toHaveText('5 to review');

    // Pill colors: the mockup `renderVals` pairs as the Decided "CSS" tokens.
    const pairs: [FixtureKey, string, string][] = [
      ['P2', '--ez-hover', '--ez-slate-500'],
      ['P5', '--ez-cobalt-tint', '--ez-cobalt-text'],
      ['P6', '--ez-amber-tint', '--ez-amber-text'],
      ['P1', '--ez-green-tint', '--ez-green'],
      ['P4', '--ez-ink', '--ez-surface'],
    ];
    for (const [key, bg, fg] of pairs) {
      const pill = cardOf(page, ids[key]).getByTestId('project-card-status');
      expect(await colorsOf(pill)).toEqual(await probe(page, bg, fg));
    }
    const open3 = (await colorsOf(p3.getByTestId('project-card-open'))).color;
    expect(open3).toBe((await probe(page, null, '--ez-amber-text')).color);
    const open1 = (await colorsOf(cardOf(page, ids.P1).getByTestId('project-card-open'))).color;
    expect(open1).toBe((await probe(page, null, '--ez-slate-300')).color);
  });

  test('EZD-117a B6 a card is a link to the editor (EZD-120c E2): href /projects/<id>, no role or tabindex', async ({
    page,
    signInAs,
  }) => {
    const { owner, ids } = await fixtureS();
    // EZD-334: the landing settle (EZD-117b E11): the bell's mount GET and first-join resync, after sign-in and again after
    // the page load, finish before the card is used.
    const landing = countNotificationGets(page);
    await signInAs(owner.email);
    await expect.poll(landing).toBe(2);
    await page.goto('/');
    await expect(page.getByTestId('project-card')).toHaveCount(6);
    await expect.poll(landing).toBe(4);
    const card = cardOf(page, ids.P1);
    expect(await card.getAttribute('href')).toBe(`/projects/${ids.P1}`);
    for (const name of ['role', 'tabindex']) expect(await card.getAttribute(name)).toBeNull();
    await card.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/projects/${ids.P1}`);
  });

  test('EZD-117a B7 a member limited to listed projects sees only those', async ({
    page,
    signInAs,
  }) => {
    const { tenant, ids } = await fixtureS();
    const listed = await member(tenant, ['view_projects'], 'listed', [ids.P3, ids.P4]);
    await signInAs(listed.email);
    await page.goto('/');
    await expect(cardNames(page)).toHaveText(['Delta', 'charlie']);
    await expect(page.getByTestId('projects-tab-count')).toHaveText(['2', '1', '0', '0', '0', '1']);
  });

  test('EZD-117a B8 a member without View projects sees the no-access line, the avatar menu, and no data request', async ({
    page,
    signInAs,
  }) => {
    const { owner } = await fixtureS([]);
    await signInAs(owner.email);
    const urls = apiRequests(page);
    await page.goto('/');
    await expect(page.getByTestId('no-access')).toBeVisible();
    await expect(page.getByTestId('avatar-menu-trigger')).toBeVisible();
    await expect(page.getByTestId('projects-settings')).toHaveCount(0);
    await expect(page.getByTestId('projects-grid')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(urls).toHaveLength(0);
  });
});
