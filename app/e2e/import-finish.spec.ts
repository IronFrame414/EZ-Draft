// EZD-313 (AC-EZD-313-1 "The model is unchanged after Cancel"; AC-EZD-313-2 "after Finish it holds only accepted
// items"; S02 Controls Cancel import "Asks to confirm", Finish import "opens 03 Plan"; Decisions "opens 03 Plan with a
// short notice of the counts imported"; Q-0215 "Cancel returns to the project with nothing imported"). Untagged, so
// desktop 1600 x 1000. The test makes its own company (never tenant 1); the import is written directly (a finished
// detection job and its session), as the database tests do, so no detection runs. Items: the room-12x10 fixture's
// four walls, door and room (fixtures/synthetic/room-12x10.dxf.expected.json `semantic`), all at 95%, above the
// cutoff 80, so Accept 6 accepts them all. Finish then writes 4 walls, 1 door and 1 room; Cancel writes nothing.
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

const tid = (page: Page, id: string) => page.getByTestId(id);

const wall = (n: number, side: string, sx: number, sy: number, ex: number, ey: number) => ({
  id: `w${n}`,
  type: 'wall',
  number: n,
  side,
  confidence: 95,
  geometry: { start: { x: sx, y: sy }, end: { x: ex, y: ey } },
  thickness: 4.5,
});
const ITEMS = [
  wall(1, 'south', 144, 0, 0, 0),
  wall(2, 'east', 144, 120, 144, 0),
  wall(3, 'north', 0, 120, 144, 120),
  wall(4, 'west', 0, 0, 0, 120),
  {
    id: 'o1',
    type: 'opening',
    kind: 'door',
    number: 1,
    confidence: 95,
    hostWallId: 'w1',
    width: 36,
    center: { x: 30, y: 0 },
  },
  {
    id: 'r1',
    type: 'room',
    number: 1,
    confidence: 95,
    boundary: [
      { x: 0, y: 0 },
      { x: 144, y: 0 },
      { x: 144, y: 120 },
      { x: 0, y: 120 },
    ],
    closed: true,
    areaSqIn: 17280,
  },
];

async function makeImport(tenant: string, project: string, appUserId: string): Promise<string> {
  const fileId = randomUUID();
  const file = await adminDb()
    .from('source_file')
    .insert({
      id: fileId,
      tenant_id: tenant,
      project_id: project,
      kind: 'polycam_dxf',
      storage_path: `${tenant}/${project}/${fileId}`,
      original_name: 'family-room.dxf',
      content_type: 'image/vnd.dxf',
      size_bytes: 10,
      uploaded_at: new Date().toISOString(),
    });
  if (file.error) throw file.error;
  const job = await adminDb()
    .from('job')
    .insert({
      tenant_id: tenant,
      project_id: project,
      kind: 'import',
      payload: { sourceFileIds: [fileId] },
      status: 'done',
      max_attempts: 3,
      run_after: '2099-01-01T00:00:00Z',
      created_by: appUserId,
      finished_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (job.error) throw job.error;
  const jobId = (job.data as { id: string }).id;
  const s = await adminDb().from('import_session').insert({
    tenant_id: tenant,
    project_id: project,
    source_file_id: fileId,
    job_id: jobId,
    source_kind: 'scan',
    status: 'ready',
    items: ITEMS,
    summary: {},
  });
  if (s.error) throw s.error;
  return jobId;
}

const modelTypes = async (project: string): Promise<string[]> => {
  const rows = await harnessSql()<{ type: string }[]>`
    select type from public.model_object where project_id = ${project}::uuid and not deleted order by type`;
  return rows.map((r) => r.type);
};

test.describe('EZD-313 Finish and cancel', () => {
  let tenant = '';

  test.afterAll(async () => {
    try {
      if (tenant) await harnessSql()`delete from public.job where tenant_id = ${tenant}::uuid`;
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('Finish import writes the accepted items and opens Plan with the counts; Cancel imports nothing (AC-1, AC-2)', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(180_000);
    tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model']);
    const [pFinish, pCancel] = await createProjects(tenant, 2);
    await signInAs(m.email);

    // AC-EZD-313-2: Finish.
    const finishJob = await makeImport(tenant, pFinish!, m.appUserId);
    await page.goto(`/projects/${pFinish}/import/${finishJob}`);
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', {
      timeout: 60_000,
    });
    await expect(tid(page, 'import-review-finish')).toBeDisabled();
    await expect(tid(page, 'import-review-cancel')).toBeEnabled();
    await tid(page, 'import-review-accept-n').click();
    await expect(tid(page, 'import-review-finish')).toBeEnabled();
    await tid(page, 'import-review-finish').click();
    await page.waitForURL(new RegExp(`/projects/${pFinish}(\\?.*)?$`), { timeout: 60_000 });
    await expect(
      page.getByText('Import finished: 4 walls, 0 windows, 1 doors, 1 rooms added.'),
    ).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => new URL(page.url()).search).toBe('');
    expect(await modelTypes(pFinish!)).toEqual([
      'floor',
      'opening',
      'room',
      'wall',
      'wall',
      'wall',
      'wall',
    ]);
    // The review is closed now.
    await page.goto(`/projects/${pFinish}/import/${finishJob}`);
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'finished', {
      timeout: 30_000,
    });
    await expect(tid(page, 'import-review-finish')).toBeDisabled();
    await expect(tid(page, 'import-review-cancel')).toBeDisabled();

    // AC-EZD-313-1: Cancel asks to confirm, then returns to the project with the model unchanged.
    const cancelJob = await makeImport(tenant, pCancel!, m.appUserId);
    const before = await modelTypes(pCancel!);
    expect(before).toEqual(['floor']);
    await page.goto(`/projects/${pCancel}/import/${cancelJob}`);
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', {
      timeout: 60_000,
    });
    await tid(page, 'import-review-accept-n').click();
    await tid(page, 'import-review-cancel').click();
    const dialog = page.locator('[data-confirm]');
    await expect(dialog).toContainText('Cancel this import?');
    // Keep reviewing closes the dialog and changes nothing.
    await dialog.getByRole('button', { name: 'Keep reviewing' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/import/${cancelJob}$`));
    await tid(page, 'import-review-cancel').click();
    await dialog.getByRole('button', { name: 'Cancel import' }).click();
    await page.waitForURL(new RegExp(`/projects/${pCancel}$`), { timeout: 60_000 });
    expect(await modelTypes(pCancel!)).toEqual(before);
    const sessions = await harnessSql()<{ status: string }[]>`
      select status from public.import_session where job_id = ${cancelJob}::uuid`;
    expect(sessions.map((s) => s.status)).toEqual(['cancelled']);
    const files = await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.source_file where project_id = ${pCancel}::uuid`;
    expect(files[0]!.n).toBe(1);
  });
});
