// EZD-123 E1-E2 (AC-EZD-123-2, -5, -6, -10). Desktop 1600 x 1000, untagged. Each test makes its own company with
// fixture S (app/test-harness/projects-fixture.ts, P1 "bravo") and its own members, as versions-panel.spec.ts. Due rows
// are written straight to model_version with cleanup_shown_at set, as the daily run leaves them. Expected values:
// board S20 cleanup sheet ("Clean up working versions", "N keep · N delete", "Keep N, delete N unticked", "Later",
// "Snapshot name", "Deletes"); Q-0700 05 (the sheet opens on a project with due rows for users with Edit model; users
// without it never see it; someone without the lock sees Later only); S20 Keep row (a ticked row becomes a named
// snapshot; unticked rows delete now); Q-0664 (a null preview shows a placeholder).
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
import { seedFixtureS } from '../test-harness/projects-fixture';

const id = (page: Page, testId: string) => page.getByTestId(testId);

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

// A working row made `days` ago, shown by the daily run two days ago unless `shown` is false.
async function due(tenant: string, project: string, days: number, shown = true): Promise<string> {
  const [row] = await harnessSql()<{ id: string }[]>`
    insert into public.model_version
      (project_id, tenant_id, model_json, schema_version, cause, created_at, cleanup_shown_at)
    values (${project}::uuid, ${tenant}::uuid, '{"objects":[]}'::jsonb, 1, 'stop_editing',
      now() - make_interval(days => ${days}),
      case when ${shown}::boolean then now() - interval '2 days' end)
    returning id`;
  return row.id;
}

const rows = (project: string) =>
  harnessSql()<{ id: string; is_snapshot: boolean; label: string | null }[]>`
    select id, is_snapshot, label from public.model_version where project_id = ${project}::uuid
    order by created_at, id`;

test.describe('EZD-123 version cleanup sheet', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-123 E1 @smoke a project with due rows opens the sheet; Save keeps the ticked row as a named snapshot and deletes the rest', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model'] as never);
    const oldest = await due(tenant, ids.P1, 40);
    const middle = await due(tenant, ids.P1, 35);
    const newest = await due(tenant, ids.P1, 31);
    const young = await due(tenant, ids.P1, 3, false);
    await signInAs(user.email);

    await openReady(page, ids.P1);
    const sheet = id(page, 'cleanup-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Clean up working versions' })).toBeVisible();
    await expect(id(page, 'cleanup-row')).toHaveCount(3);
    await expect(id(page, 'cleanup-no-preview')).toHaveCount(3);
    await expect(id(page, 'cleanup-counts')).toHaveText('0 keep · 3 delete');
    await expect(id(page, 'cleanup-save')).toHaveText('Keep 0, delete 3 unticked');

    // Newest first: tick the newest and name it.
    const first = id(page, 'cleanup-row').first();
    await expect(first).toHaveAttribute('data-id', newest);
    await first.getByTestId('cleanup-keep').check();
    await expect(first.getByText('Snapshot name')).toBeVisible();
    await first.getByTestId('cleanup-name').fill('Before the island change');
    await expect(id(page, 'cleanup-counts')).toHaveText('1 keep · 2 delete');
    await expect(id(page, 'cleanup-deletes')).toHaveCount(2);

    // All / None.
    await id(page, 'cleanup-all').click();
    await expect(id(page, 'cleanup-counts')).toHaveText('3 keep · 0 delete');
    await id(page, 'cleanup-none').click();
    await expect(id(page, 'cleanup-counts')).toHaveText('0 keep · 3 delete');
    await first.getByTestId('cleanup-keep').check();
    await expect(first.getByTestId('cleanup-name')).toHaveValue('Before the island change');

    await id(page, 'cleanup-save').click();
    await expect(sheet).toHaveCount(0);
    expect(await rows(ids.P1)).toEqual([
      { id: newest, is_snapshot: true, label: 'Before the island change' },
      { id: young, is_snapshot: false, label: null },
    ]);
    expect([oldest, middle].some((v) => v === newest)).toBe(false);

    // Nothing is due now: the rows are not read again and the sheet stays closed.
    const reads: string[] = [];
    page.on('request', (r) => {
      if (r.url().endsWith('/versions/cleanup')) reads.push(r.url());
    });
    await openReady(page, ids.P1);
    await page.waitForTimeout(500);
    await expect(id(page, 'cleanup-sheet')).toHaveCount(0);
    expect(reads).toEqual([]);
  });

  test('EZD-123 E2 without the lock the sheet shows Later only; without Edit model it never shows', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const holder = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, holder.membershipId, ['view_projects', 'edit_model'] as never);
    const editor = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model'] as never);
    const viewer = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, viewer.membershipId, ['view_projects'] as never);
    await due(tenant, ids.P1, 40);
    await harnessSql()`
      insert into public.edit_lock (project_id, tenant_id, holder_app_user_id, lock_epoch, since, device_id)
      values (${ids.P1}::uuid, ${tenant}::uuid, ${holder.appUserId}::uuid, 1, now(), 'other-device')
      on conflict (project_id) do update set holder_app_user_id = excluded.holder_app_user_id,
        lock_epoch = excluded.lock_epoch, since = excluded.since, device_id = excluded.device_id`;

    await signInAs(editor.email);
    await openReady(page, ids.P1);
    await expect(id(page, 'cleanup-sheet')).toBeVisible();
    await expect(id(page, 'cleanup-row')).toHaveCount(1);
    await expect(id(page, 'cleanup-save')).toHaveCount(0);
    await id(page, 'cleanup-later').click();
    await expect(id(page, 'cleanup-sheet')).toHaveCount(0);
    expect(await rows(ids.P1)).toHaveLength(1);

    // Without Edit model the rows are never read.
    const reads: string[] = [];
    page.on('request', (r) => {
      if (r.url().endsWith('/versions/cleanup')) reads.push(r.url());
    });
    await signInAs(viewer.email);
    await openReady(page, ids.P1);
    await expect(id(page, 'cleanup-sheet')).toHaveCount(0);
    expect(reads).toEqual([]);
  });
});
