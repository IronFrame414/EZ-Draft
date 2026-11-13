// EZD-133 W1, W2 (vault/plans/EZD-133.md section 4; AC-EZD-133-2, -4). A member without See company costs, then one
// without See sell prices, opens every page of the app (Settings sections one by one); no page, data request or
// document may carry a name from the money registry of a class the member is denied. Untagged, so desktop only.
// Paths: money/page-cases.ts (33 pages, the [section] page once per slug but company: 41 paths). 200: page code
// (notFound() only in production or signed out). Imports only the harness test.ts. Fresh tenant per member,
// removed in afterAll as in permissions.spec.ts.
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
  pageViolations,
  PERMISSION_KEYS,
  setPermissions,
  test,
  type PermissionKey,
  type Sessions,
} from '../test-harness/e2e/test';

const EXPECTED_PATHS = 44;

async function openEveryPage(sessions: Sessions, without: PermissionKey): Promise<void> {
  const tenant = await createTenant();
  const [projectId] = await createProjects(tenant, 1);
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  const granted = PERMISSION_KEYS.filter((k) => k !== without);
  await setPermissions(tenant, member.membershipId, granted);
  const [s] = await sessions.open([member.email]);
  const traffic = await captureTraffic(s.context);

  const paths = MONEY_PAGE_CASES.flatMap((c) => c.paths({ projectId }));
  expect(paths.length).toBe(EXPECTED_PATHS);
  const refused: string[] = [];
  for (const p of paths) {
    const res = await s.page.goto(p);
    await s.page.waitForLoadState('networkidle');
    if (res === null || res.status() !== 200) refused.push(`${p}: ${res?.status()}`);
  }
  const { responses } = await traffic.settle();

  expect(refused).toEqual([]);
  expect(
    responses.filter((r) => r.resourceType === 'document' && r.status === 200).length,
  ).toBeGreaterThanOrEqual(EXPECTED_PATHS);
  expect(pageViolations(responses, MONEY_FIELDS, deniedMoneyClasses(new Set(granted)))).toEqual([]);
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
});
