// EZD-1903 (AC-EZD-1903-3; editor plan 2026-11-23 section 3.2, L2): the geometry schemas are on zod/mini, so the
// editor route's first download holds none of zod's to-json-schema code (its "draft-2020-12" target name) and none of
// classic zod (its ZodRealError class name), and it stays within the 500,000-byte limit (11 Budgets; EZD-120c B11).
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  signedInJsSize,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

type SizeDetails = { files: { url: string }[] };

test.describe('EZD-1903 editor route on zod/mini', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-1903 Z1 the editor route loads no zod JSON-schema code and no classic zod', async ({
    page,
    browser,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model'] as never);
    await signInAs(user.email);
    await page.goto(`/projects/${ids.P1}`);
    await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');

    const state = await page.context().storageState();
    const size = await signedInJsSize(browser, state, `/projects/${ids.P1}`);
    expect('error' in size).toBe(false);
    expect('value' in size ? size.value : Infinity).toBeLessThanOrEqual(500_000);
    const files = ((size as { details?: SizeDetails }).details?.files ?? []).map((f) => f.url);
    expect(files.length).toBeGreaterThan(0);
    for (const url of files) {
      const body = await (await page.request.get(url)).text();
      expect(body.includes('draft-2020-12'), url).toBe(false);
      expect(body.includes('ZodRealError'), url).toBe(false);
    }
  });
});
