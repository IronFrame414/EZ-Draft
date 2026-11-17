// EZD-135b B1-B5 (vault/plans/EZD-135b.md section 4; AC-EZD-135-1, -2, -3; S15i System status boards). Each test
// makes its own tenant with a member through createTenant / createMember / setPermissions and writes its own
// failed jobs with harnessSql(); B1 adds one system-wide backup row and deletes it by id. Expected texts: the
// approved S15i wording (W3 states board: "No failed webhook deliveries."; W10 + W11 error line); sizes in
// decimal units (7,340,032 bytes is 7.3 MB); 50 per page (Q-0664).
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  expectTouchTargets,
  harnessSql,
  setPermissions,
  test,
  type PermissionKey,
} from '../test-harness/e2e/test';

const tid = (page: Page, id: string) => page.getByTestId(id);
const LOAD_FAILED = "Couldn't load system status. Check your connection and try again.";

async function member(
  signInAs: (email: string) => Promise<unknown>,
  granted: PermissionKey[] = ['settings_system_status'],
) {
  const tenant = await createTenant();
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m.membershipId, granted);
  await signInAs(m.email);
  return tenant;
}

async function failedJobs(tenant: string, n: number) {
  for (let i = 1; i <= n; i++) {
    await harnessSql()`
      insert into public.job (tenant_id, kind, status, attempts, max_attempts, error, finished_at)
      values (${tenant}::uuid, 'test', 'failed', 5, 5, 'ezd135_probe_failed', now() - ${i} * interval '1 minute')
      returning id`;
  }
}

test.describe('EZD-135b system status page', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-135b done when: a failed test job and a stub backup record appear on the page', async ({
    page,
    signInAs,
  }) => {
    const tenant = await member(signInAs);
    await failedJobs(tenant, 1);
    // A day ahead, so it is the latest files copy (the backup tests write files only under buckets: scopes).
    const [row] = await harnessSql()<{ id: string }[]>`
      insert into public.backup_run (kind, scope, status, started_at, finished_at, bytes_copied)
      values ('files', 'all', 'succeeded', now() + interval '1 day', now() + interval '1 day', 7340032)
      returning id`;
    try {
      const res = await page.goto('/settings/system-status');
      expect(res?.status()).toBe(200);
      await expect(tid(page, 'system-status-job-row')).toHaveCount(1);
      await expect(tid(page, 'system-status-job-row')).toContainText('test');
      await expect(tid(page, 'system-status-job-row')).toContainText('ezd135_probe_failed');
      await expect(tid(page, 'system-status-webhooks-empty')).toHaveText(
        'No failed webhook deliveries.',
      );
      await expect(tid(page, 'system-status-backup-files-size')).toHaveText('7.3 MB');
      await expect(
        tid(page, 'system-status-drill-body').locator(
          '[data-testid="system-status-drill-empty"], [data-testid="system-status-drill-line"]',
        ),
      ).toHaveCount(1);
    } finally {
      await harnessSql()`delete from public.backup_run where id = ${row.id}::uuid`;
    }
  });

  test('B2 without the switch: no nav item, NoAccess, API 403', async ({ page, signInAs }) => {
    await member(signInAs, ['settings_libraries']);
    const res = await page.goto('/settings/system-status');
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/settings/system-status');
    await expect(tid(page, 'no-access')).toBeVisible();
    await expect(page.locator('[data-settings-nav="system_status"]')).toHaveCount(0);
    await expect(tid(page, 'system-status-panel')).toHaveCount(0);
    const api = await page.request.get('/api/settings/system-status?part=jobs');
    expect(api.status()).toBe(403);
    expect(await api.json()).toEqual({
      error: { code: 'permission_denied', message_key: 'error.not_authorized' },
    });
  });

  test('B3 paging and touch targets @ipad', async ({ page, signInAs }) => {
    const tenant = await member(signInAs);
    await failedJobs(tenant, 51);
    await page.goto('/settings/system-status');
    await expect(tid(page, 'system-status-jobs-range')).toHaveText('1–50 of 51');
    await expect(tid(page, 'system-status-job-row')).toHaveCount(50);
    await tid(page, 'system-status-jobs-next').evaluate((el) =>
      el.scrollIntoView({ block: 'center' }),
    );
    expect(await expectTouchTargets(page, tid(page, 'system-status-jobs-pager'))).toBe(2);
    await tid(page, 'system-status-jobs-next').click();
    await expect(tid(page, 'system-status-jobs-range')).toHaveText('51–51 of 51');
    await expect(tid(page, 'system-status-job-row')).toHaveCount(1);
    await expect(tid(page, 'system-status-jobs-next')).toBeDisabled();
  });

  test('B4 one card fails, the others show', async ({ page, signInAs }) => {
    const tenant = await member(signInAs);
    await failedJobs(tenant, 1);
    await page.route(
      (u) =>
        u.pathname === '/api/settings/system-status' && u.searchParams.get('part') === 'webhooks',
      (r) =>
        r.fulfill({
          status: 500,
          contentType: 'application/json',
          body: '{"error":{"code":"db_unavailable","message_key":"error.db_unavailable"}}',
        }),
    );
    await page.goto('/settings/system-status');
    const body = tid(page, 'system-status-webhooks-body');
    await expect(body.locator('[role="alert"]')).toContainText(LOAD_FAILED);
    await expect(tid(page, 'system-status-job-row')).toHaveCount(1);
    await page.unrouteAll();
    await body.getByRole('button', { name: 'Retry' }).click();
    await expect(tid(page, 'system-status-webhooks-empty')).toBeVisible();
    await expect(body.locator('[role="alert"]')).toHaveCount(0);
  });

  test('B5 past the end goes to the last page', async ({ page, signInAs }) => {
    const tenant = await member(signInAs);
    await failedJobs(tenant, 51);
    await page.route(
      (u) =>
        u.pathname === '/api/settings/system-status' &&
        u.searchParams.get('part') === 'jobs' &&
        u.searchParams.get('page') === '2',
      (r) =>
        r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"rows":[],"total":50,"page":2,"pageSize":50}',
        }),
    );
    await page.goto('/settings/system-status');
    await expect(tid(page, 'system-status-jobs-range')).toHaveText('1–50 of 51');
    const again = page.waitForRequest(
      (q) => q.url().includes('part=jobs') && q.url().includes('page=1'),
    );
    await tid(page, 'system-status-jobs-next').click();
    await again;
    await expect(tid(page, 'system-status-job-row')).toHaveCount(50);
    await expect(tid(page, 'system-status-jobs-range')).toHaveText('1–50 of 51');
  });

  test('B6 Refresh reloads the cards', async ({ page, signInAs }) => {
    const tenant = await member(signInAs);
    await page.goto('/settings/system-status');
    await expect(tid(page, 'system-status-jobs-empty')).toHaveText(
      'No failed jobs in the last 30 days.',
    );
    await expect(tid(page, 'system-status-updated')).toContainText('Updated');
    await failedJobs(tenant, 1);
    await tid(page, 'system-status-refresh').click();
    await expect(tid(page, 'system-status-job-row')).toHaveCount(1);
  });
});
