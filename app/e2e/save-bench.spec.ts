// EZD-120d B6, B7 (vault/plans/EZD-120d.md sections 4 and 6; AC-EZD-120d-4). Untagged, so desktop. A fresh company
// with fixture S (each project starts with the floor "Floor 1") and an editor; the page is /dev/saves/<id>.
// Expected values: plan section 4 (rows 5, objects 11 = floor + 10 walls, checkpoints 0; after Retry rows 1).
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

async function setup() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model']);
  return { ids, user };
}

test.describe('EZD-120d save test page', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-120d B6 50 edits write 5 rows and make no checkpoint', async ({ page, signInAs }) => {
    test.setTimeout(90_000);
    const { ids, user } = await setup();
    await signInAs(user.email);
    await page.goto(`/dev/saves/${ids.P1}`);
    const result = page.getByTestId('bench-result');
    await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await page.getByTestId('bench-fifty').click();
    await expect(result).toHaveAttribute('data-phase', 'done', { timeout: 60_000 });
    await expect(result).toHaveAttribute('data-rows', '5');
    await expect(result).toHaveAttribute('data-objects', '11');
    await expect(result).toHaveAttribute('data-checkpoints', '0');
  });

  test('EZD-120d B7 Fail next save shows the banner and fails, and Retry saves one row', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const { ids, user } = await setup();
    await signInAs(user.email);
    await page.clock.install();
    await page.goto(`/dev/saves/${ids.P1}`);
    const result = page.getByTestId('bench-result');
    await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await page.getByTestId('bench-fifty').click();
    await page.clock.runFor(5_000);
    await expect(result).toHaveAttribute('data-phase', 'done', { timeout: 60_000 });

    await page.getByTestId('bench-fail').click();
    await page.clock.runFor(20_000);
    const banner = page.getByTestId('save-failed-banner');
    await expect(banner).toBeVisible();
    await expect(result).toHaveAttribute('data-phase', 'failed');
    await expect(result).toHaveAttribute('data-rows', '0');

    await banner.getByRole('button', { name: 'Retry' }).click();
    await page.clock.runFor(5_000);
    await expect(result).toHaveAttribute('data-phase', 'done');
    await expect(result).toHaveAttribute('data-rows', '1');
    await expect(result).toHaveAttribute('data-checkpoints', '0');
  });
});
