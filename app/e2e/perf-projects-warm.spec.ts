// EZD-117a B2 (vault/plans/EZD-117a.md section 4; 11 Budgets "Projects page": first cards within 1 second, so
// the bound is 1,000 ms). Untagged, so Playwright project `perf`.
// EZD-397 (AC-EZD-397-1; rule 17): moved here from app/e2e/projects.spec.ts unchanged. On the four-worker device
// run, other workers' tests share the runner's CPU, and the warm page's first card took 1033.2 ms and 1013.1 ms
// on CI with no change to the Projects page path; the `perf` project runs this alone after every device test
// (EZD-207c D-Isolate), so the time counted is the page's own. Every test makes its own company (never tenant 1).
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedGenerated } from '../test-harness/projects-fixture';

// A company with n generated projects and a member who may view projects (copy of projects.spec.ts bigCompany).
async function bigCompany(n: number) {
  const tenant = await createTenant();
  await seedGenerated(tenant, n);
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, ['view_projects'] as never);
  return m;
}

test.describe('EZD-117a Projects page', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
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
});
