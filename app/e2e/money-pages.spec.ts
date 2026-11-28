// EZD-133 W1, W2 (vault/plans/EZD-133.md section 4; AC-EZD-133-2, -4). A member without See company costs, then one
// without See sell prices, opens every page of the app (Settings sections one by one); no page, data request or
// document may carry a name from the money registry of a class the member is denied. Untagged, so desktop only.
// Paths: money/page-cases.ts (33 pages, the [section] page once per slug but company: 41 paths). 200: page code
// (notFound() only in production or signed out). Imports only the harness test.ts. Fresh tenant per member,
// removed in afterAll as in permissions.spec.ts.
// EZD-1950 (audit 2026-11-23 P2): the pages open TABS at a time, each in its own tab of the member's one signed-in
// context (the traffic capture is on the context, so it sees every tab). Each tab still waits for network idle on
// every page. The paths and the role of each test are asserted equal to the sweep before EZD-1950.
// EZD-2011 (audit 2026-11-27 row 4): the wait for a quiet network is the harness's watchRequests, with a bound per
// page and the page's name in the error. W3 shows the page shape that hung the old wait for the whole 300 s.
import {
  captureTraffic,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  deniedMoneyClasses,
  expect,
  MONEY_FIELDS,
  MONEY_PAGE_CASES,
  PAGE_QUIET_TIMEOUT_MS,
  pageViolations,
  PERMISSION_KEYS,
  setPermissions,
  test,
  watchRequests,
  type Sessions,
} from '../test-harness/e2e/test';

// EZD-1402: the /dev/field-outbox test page makes 48. EZD-914: the Supplier markup page makes 49.
// EZD-1404: the field pack page makes 50.
const EXPECTED_PATHS = 50;
const TABS = 6;

// EZD-1950: the 50 paths of the sweep before EZD-1950, in MONEY_PAGE_CASES order (page-cases.ts PAGE_FILES; the
// [section] page once, for catalog, the only Settings slug without its own page). EZD-614: catalog has its own page
// now, in the same place in the list, and [section] adds no path.
function sweptPaths(projectId: string): string[] {
  return [
    '/dev/entry/client',
    '/dev/entry/editor',
    `/dev/saves/${projectId}`,
    `/projects/${projectId}/import/00000000-0000-4000-8000-000000000000`,
    `/projects/${projectId}`,
    `/projects/${projectId}/supplier`,
    '/dev/entry/field',
    `/projects/${projectId}/field-measure`,
    `/projects/${projectId}/field`,
    '/dev/entry/office',
    '/dev/settings',
    '/settings/catalog',
    '/settings/code-edition',
    '/settings/company',
    '/settings/defaults',
    '/settings/libraries',
    '/settings/render-models',
    '/settings/sheet-presets',
    '/settings/system-status',
    '/settings/title-block',
    '/',
    '/settings',
    '/settings/users',
    '/auth/confirm',
    '/dev/benchmark-plan',
    '/dev/captcha',
    '/dev/catalog',
    '/dev/cloud-check',
    '/dev/device',
    '/dev/errors',
    `/dev/field-outbox/${projectId}`,
    '/dev/header',
    '/dev/jobs',
    '/dev/lazy',
    '/dev/messages',
    `/dev/notifications?project=${projectId}`,
    '/dev/perf-probe',
    '/dev/permissions',
    `/dev/permissions/projects/${projectId}`,
    `/dev/realtime?project=${projectId}`,
    '/dev/shell',
    '/dev/shell/rail',
    '/dev/states',
    '/dev/storage',
    '/dev/sw-offline/shell',
    '/dev/tokens',
    '/dev/typed-bar',
    '/invite/not-a-token',
    '/sign-in',
    '/terms',
  ];
}

// EZD-1950: the money class each test's member is denied, as before EZD-1950.
const DENIED: Record<'see_company_costs' | 'see_sell_prices', string[]> = {
  see_company_costs: ['company_cost'],
  see_sell_prices: ['sell_price'],
};

async function openEveryPage(sessions: Sessions, without: keyof typeof DENIED): Promise<void> {
  const tenant = await createTenant();
  const [projectId] = await createProjects(tenant, 1);
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  const granted = PERMISSION_KEYS.filter((k) => k !== without);
  await setPermissions(tenant, member.membershipId, granted);
  const [s] = await sessions.open([member.email]);
  const traffic = await captureTraffic(s.context);

  const paths = MONEY_PAGE_CASES.flatMap((c) => c.paths({ projectId }));
  expect(paths.length).toBe(EXPECTED_PATHS);
  expect(paths).toEqual(sweptPaths(projectId));
  const refused: string[] = [];
  const opened: string[] = [];
  const queue = [...paths];
  const tabs = [s.page, ...(await Promise.all(Array.from({ length: TABS - 1 }, () => s.context.newPage())))];
  await Promise.all(
    tabs.map(async (tab) => {
      for (let p = queue.shift(); p !== undefined; p = queue.shift()) {
        // EZD-2011: one page has PAGE_QUIET_TIMEOUT_MS to load and as long again to go quiet, and a page that does
        // not is named with its open requests (quiet.ts says why this is not waitForLoadState('networkidle')).
        const watch = watchRequests(tab);
        let res: Awaited<ReturnType<typeof tab.goto>>;
        try {
          res = await tab.goto(p, { timeout: PAGE_QUIET_TIMEOUT_MS });
          await watch.quiet(`money pages sweep: page ${p}`);
        } finally {
          watch.stop();
        }
        opened.push(p);
        if (res === null || res.status() !== 200) refused.push(`${p}: ${res?.status()}`);
      }
    }),
  );
  const { responses } = await traffic.settle();

  expect([...opened].sort()).toEqual([...paths].sort());

  expect(refused).toEqual([]);
  expect(
    responses.filter((r) => r.resourceType === 'document' && r.status === 200).length,
  ).toBeGreaterThanOrEqual(EXPECTED_PATHS);
  const denied = deniedMoneyClasses(new Set(granted));
  expect(denied).toEqual(DENIED[without]);
  expect(pageViolations(responses, MONEY_FIELDS, denied)).toEqual([]);
}

test.describe('EZD-133 money pages', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('W1 no page shows a company cost name to a member without See company costs @smoke', async ({
    sessions,
  }) => {
    test.setTimeout(300_000);
    await openEveryPage(sessions, 'see_company_costs');
  });

  test('W2 no page shows a sell price name to a member without See sell prices @smoke', async ({
    sessions,
  }) => {
    test.setTimeout(300_000);
    await openEveryPage(sessions, 'see_sell_prices');
  });

  // EZD-2011 (AC-EZD-2011-2): the hang of audit row 4 with a stub page. The page is quiet for more than 500 ms
  // before its load event (three scripts that each run for 400 ms; all arrive at once), then one late script starts
  // and ends before the load event, and nothing follows. Every request has ended, yet Playwright's
  // waitForLoadState('networkidle') does not return for such a page; the sweep's wait does, within its bound.
  test('W3 a page whose late request ends before the load event goes quiet within the bound', async ({ page }) => {
    const busy = 'var t = Date.now(); while (Date.now() - t < 400) {}';
    const seen: string[] = [];
    await page.route('**/ezd-2011-quiet/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname.replace('/ezd-2011-quiet', '');
      seen.push(pathname);
      const script = (body: string) => route.fulfill({ status: 200, contentType: 'text/javascript', body });
      if (pathname === '/late.js') return script('window.late = 1;');
      if (pathname === '/c.js') return script(`${busy} document.write('<script src="/ezd-2011-quiet/late.js"><\\/script>');`);
      if (pathname.endsWith('.js')) return script(busy);
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body><p>quiet</p><script src="/ezd-2011-quiet/a.js"></script><script src="/ezd-2011-quiet/b.js"></script><script src="/ezd-2011-quiet/c.js"></script></body></html>',
      });
    });
    const watch = watchRequests(page);
    const started = Date.now();
    try {
      await page.goto('/ezd-2011-quiet/page', { timeout: PAGE_QUIET_TIMEOUT_MS });
      await watch.quiet('W3 page /ezd-2011-quiet/page');
    } finally {
      watch.stop();
    }
    expect(Date.now() - started).toBeLessThan(PAGE_QUIET_TIMEOUT_MS);
    // The late script is asked for last, after the three that ran.
    expect(seen.at(-1)).toBe('/late.js');
    expect([...seen].sort()).toEqual(['/a.js', '/b.js', '/c.js', '/late.js', '/page']);
    expect(await page.evaluate(() => (window as unknown as { late?: number }).late)).toBe(1);
  });
});
