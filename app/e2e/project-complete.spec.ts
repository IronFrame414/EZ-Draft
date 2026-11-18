// EZD-137 (AC-EZD-137-1 to -4). Untagged, so desktop 1600 x 1000. Each test makes its own company; fixture S is
// app/test-harness/projects-fixture.ts (six active projects, one In build; golf archived). Expected values:
// Q-0191 (Mark complete moves the project to a Completed filter; it stays viewable and can be reopened); Q-0702
// (Completed tab after In build, with its count; All shows active projects only; the pill is grey like Draft);
// Q-0700 decisions 03 (Reopen restores the prior status); examples 09p Status moves rows 1, 2, 5.
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { FIXTURE_S, seedFixtureS } from '../test-harness/projects-fixture';

const wrapOf = (page: Page, id: string) =>
  page.locator(`[data-testid="project-card-wrap"][data-project-id="${id}"]`);
const counts = (page: Page) => page.getByTestId('projects-tab-count');

async function openMenu(page: Page, id: string) {
  const wrap = wrapOf(page, id);
  await wrap.hover();
  await wrap.getByTestId('project-card-menu').click();
  await expect(page.getByTestId('project-card-menu-items')).toBeVisible();
}

test.describe('EZD-137 Mark complete and Completed', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('Mark complete, the Completed tab, archive and restore, open, and Reopen', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model', 'delete_projects']);
    const inBuild = FIXTURE_S.find((r) => r.status === 'in_build' && !r.archived)!;
    const id = ids[inBuild.key];
    await signInAs(m.email);
    await page.goto('/');
    await expect(counts(page)).toHaveText(['6', '2', '1', '1', '1', '1', '0', '1']);
    await expect(page.getByTestId('projects-tab-complete')).toContainText('Completed');

    // Mark complete: it leaves All and In build; Completed counts it.
    await openMenu(page, id);
    await page.getByTestId('project-card-complete').click();
    await expect(wrapOf(page, id)).toHaveCount(0);
    await expect(counts(page)).toHaveText(['5', '2', '1', '1', '1', '0', '1', '1']);
    const [done] = await harnessSql()<{ status: string; completed_from: string | null }[]>`
      select status, completed_from from public.project where id = ${id}::uuid`;
    expect(done).toEqual({ status: 'complete', completed_from: 'in_build' });

    // Under Completed with the grey Completed pill.
    await page.getByTestId('projects-tab-complete').click();
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    const pill = wrapOf(page, id).getByTestId('project-card-status');
    await expect(pill).toHaveText('Completed');
    const draftLike = await pill.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.getByTestId('projects-tab-draft').click();
    const draftPill = page.locator('[data-testid="project-card-status"][data-status="draft"]').first();
    await expect(draftPill).toHaveCSS('background-color', draftLike);
    await page.getByTestId('projects-tab-complete').click();

    // A completed card offers Reopen in place of Set status and Mark complete.
    await openMenu(page, id);
    await expect(page.getByTestId('project-card-menu-items').getByRole('menuitem')).toHaveText([
      'Rename',
      'Reopen',
      'Archive',
      'Delete',
    ]);
    // 09p row 5: archived, then restored, still complete.
    await page.getByTestId('project-card-archive').click();
    await expect(wrapOf(page, id)).toHaveCount(0);
    await expect(counts(page)).toHaveText(['5', '2', '1', '1', '1', '0', '0', '2']);
    await page.getByTestId('projects-tab-archived').click();
    await openMenu(page, id);
    await page.getByTestId('project-card-restore').click();
    await expect(counts(page)).toHaveText(['5', '2', '1', '1', '1', '0', '1', '1']);
    await page.getByTestId('projects-tab-complete').click();
    await expect(wrapOf(page, id).getByTestId('project-card-status')).toHaveText('Completed');

    // Reopen: back to In build and the active list.
    await openMenu(page, id);
    await page.getByTestId('project-card-reopen').click();
    await expect(wrapOf(page, id)).toHaveCount(0);
    await expect(counts(page)).toHaveText(['6', '2', '1', '1', '1', '1', '0', '1']);
    await page.getByTestId('projects-tab-in_build').click();
    await expect(wrapOf(page, id).getByTestId('project-card-status')).toHaveText('In build');
  });

  test('a completed project still opens in the editor', async ({ page, signInAs }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model']);
    await harnessSql()`update public.project set status = 'complete', completed_from = 'approved',
      completed_at = now() where id = ${ids.P1}::uuid`;
    await signInAs(m.email);
    await page.goto('/');
    await page.getByTestId('projects-tab-complete').click();
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    await page.locator(`[data-testid="project-card"][data-project-id="${ids.P1}"]`).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/projects/${ids.P1}`);
  });
});
