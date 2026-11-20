// EZD-314 (S02 States Loading "progress with item count so far", Error "message with file name and Retry; Cancel
// import stays available", Locked / view-only "lock banner shows who and since when, with Request edit",
// Permission-denied "read-only with a note 'You can view this import but not change it'"; S01 States "Import in
// progress: card shows Importing"; S02 Validation "Bearing walls detected or marked: flagged"; AC-EZD-314-1 to -6).
// Untagged, so desktop 1600 x 1000. Each test makes its own company (never tenant 1); imports are written
// directly (job and import_session rows, as import-finish.spec.ts does). A running job's lease is set far ahead so
// no runner takes it. Items: the room-12x10 fixture's four walls, door and room (fixtures/synthetic/
// room-12x10.dxf.expected.json `semantic`), all 95%, above the cutoff 80, so Accept 6 accepts them all; the south
// wall w1 is read as bearing. Retry reads fixtures/synthetic/room-12x10.dxf for real: 4 walls, 1 door, 1 window,
// 1 room, 7 found (EZD-307's counts for the joined fixture).
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import type { PermissionKey } from '../src/lib/permissions/catalog';
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

function repoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error('no pnpm-workspace.yaml above ' + process.cwd());
    dir = up;
  }
}
const DXF = path.join(repoRoot(), 'fixtures/synthetic/room-12x10.dxf');

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
  { ...wall(1, 'south', 144, 0, 0, 0), bearing: true },
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

const tenants: string[] = [];

async function company() {
  const tenant = await createTenant();
  tenants.push(tenant);
  const [project] = await createProjects(tenant, 1);
  return { tenant, project };
}

async function sourceFile(tenant: string, project: string, name: string, bytes?: Buffer) {
  const id = randomUUID();
  const storagePath = `${tenant}/${project}/${id}`;
  if (bytes) {
    const up = await adminDb()
      .storage.from('sources')
      .upload(storagePath, bytes, { contentType: 'image/vnd.dxf' });
    if (up.error) throw up.error;
  }
  const file = await adminDb()
    .from('source_file')
    .insert({
      id,
      tenant_id: tenant,
      project_id: project,
      kind: 'polycam_dxf',
      storage_path: storagePath,
      original_name: name,
      content_type: 'image/vnd.dxf',
      size_bytes: bytes?.length ?? 10,
      uploaded_at: new Date().toISOString(),
    });
  if (file.error) throw file.error;
  return id;
}

async function job(
  tenant: string,
  project: string,
  files: string[],
  status: 'running' | 'done' | 'failed',
  by: string,
) {
  const running = status === 'running';
  const r = await adminDb()
    .from('job')
    .insert({
      tenant_id: tenant,
      project_id: project,
      kind: 'import',
      payload: { sourceFileIds: files },
      status,
      attempts: running ? 1 : 3,
      max_attempts: 3,
      error: status === 'failed' ? 'handler_failed' : null,
      run_after: '2099-01-01T00:00:00Z',
      run_id: running ? randomUUID() : null,
      lease_expires_at: running ? '2099-01-01T00:00:00Z' : null,
      created_by: by,
      finished_at: running ? null : new Date().toISOString(),
    })
    .select('id')
    .single();
  if (r.error) throw r.error;
  return (r.data as { id: string }).id;
}

async function session(
  tenant: string,
  project: string,
  jobId: string,
  file: string,
  items: unknown[],
) {
  const s = await adminDb()
    .from('import_session')
    .insert({
      tenant_id: tenant,
      project_id: project,
      source_file_id: file,
      job_id: jobId,
      source_kind: 'scan',
      status: 'ready',
      items: items as never,
      summary: {},
    });
  if (s.error) throw s.error;
}

async function member(tenant: string, permissions: readonly PermissionKey[], name: string) {
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m.membershipId, permissions);
  const { error } = await adminDb().from('app_user').update({ name }).eq('id', m.appUserId);
  if (error) throw new Error(`name update failed: ${error.code}`);
  return m;
}

const reviewUrl = (project: string, jobId: string) => `/projects/${project}/import/${jobId}`;

test.describe('EZD-314 Import states', () => {
  test.afterAll(async () => {
    try {
      for (const tenant of tenants) {
        const rows = await harnessSql()<{ storage_path: string }[]>`
          select storage_path from public.source_file where tenant_id = ${tenant}::uuid`;
        if (rows.length > 0)
          await adminDb()
            .storage.from('sources')
            .remove(rows.map((r) => r.storage_path));
        await harnessSql()`delete from public.import_session where tenant_id = ${tenant}::uuid`;
        await harnessSql()`delete from public.job where tenant_id = ${tenant}::uuid`;
      }
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-314-1, -5: detecting shows the items found so far, and the project card shows Importing', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const { tenant, project } = await company();
    const m = await member(tenant, ['view_projects', 'edit_model'], 'Dana Office');
    const kitchen = await sourceFile(tenant, project, 'kitchen.dxf');
    const bath = await sourceFile(tenant, project, 'bath.dxf');
    const j = await job(tenant, project, [kitchen, bath], 'running', m.appUserId);
    // kitchen.dxf is read (its 4 walls), bath.dxf is still being read.
    await session(tenant, project, j, kitchen, ITEMS.slice(0, 4));
    await signInAs(m.email);

    await page.goto('/');
    const card = page.locator(`[data-testid="project-card"][data-project-id="${project}"]`);
    await expect(card.getByTestId('project-card-importing')).toHaveText('Importing');
    await expect(card.getByTestId('project-card-open')).toHaveCount(0);

    await page.goto(reviewUrl(project, j));
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'detecting');
    await expect(tid(page, 'import-review-detecting')).toHaveText(
      'Detecting items… 4 items found so far',
    );
  });

  test('AC-EZD-314-2: a failed detection shows the file name and Retry; Retry reads the file again', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(180_000);
    const { tenant, project } = await company();
    const m = await member(tenant, ['view_projects', 'edit_model'], 'Dana Office');
    const file = await sourceFile(tenant, project, 'family-room.dxf', readFileSync(DXF));
    const j = await job(tenant, project, [file], 'failed', m.appUserId);
    await signInAs(m.email);

    await page.goto(reviewUrl(project, j));
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'failed');
    await expect(tid(page, 'import-review-failed')).toHaveText("Couldn't read family-room.dxf.");
    await expect(tid(page, 'import-review-retry')).toHaveText('Retry');
    await expect(tid(page, 'import-review-retry')).toBeEnabled();
    await expect(tid(page, 'import-review-cancel')).toBeEnabled();

    const retried = page.waitForResponse(
      (r) => r.url().endsWith(`/imports/${j}/retry`) && r.request().method() === 'POST',
    );
    await tid(page, 'import-review-retry').click();
    expect((await retried).status()).toBe(200);
    // The job reads the file this time and the review opens by itself with what it found.
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', {
      timeout: 90_000,
    });
    await expect(tid(page, 'import-review-summary')).toContainText('7 found');
  });

  test('AC-EZD-314-3: while another user holds the edit lock the review shows Request edit and is read-only', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const { tenant, project } = await company();
    const m = await member(tenant, ['view_projects', 'edit_model'], 'Dana Office');
    const holder = await member(tenant, ['view_projects', 'edit_model'], 'Alex Holder');
    const file = await sourceFile(tenant, project, 'family-room.dxf');
    const j = await job(tenant, project, [file], 'done', m.appUserId);
    await session(tenant, project, j, file, ITEMS);
    await harnessSql()`insert into public.edit_lock (project_id, tenant_id, lock_epoch, holder_app_user_id, since, device_id)
      values (${project}::uuid, ${tenant}::uuid, 1, ${holder.appUserId}::uuid, now(), 'device-1')
      on conflict (project_id) do update set holder_app_user_id = excluded.holder_app_user_id,
        since = excluded.since, device_id = excluded.device_id, lock_epoch = excluded.lock_epoch`;
    await signInAs(m.email);

    await page.goto(reviewUrl(project, j));
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready');
    await expect(tid(page, 'lock-banner')).toHaveText(
      /^Alex Holder is editing since \d{1,2}:\d\d [AP]M · view onlyYou can pan, zoom and measure/,
    );
    await expect(tid(page, 'lock-request-edit')).toHaveText('Request edit');
    await expect(tid(page, 'lock-request-edit')).toBeEnabled();
    await expect(tid(page, 'import-review-accept-n')).toBeDisabled();
    await expect(tid(page, 'import-review-finish')).toBeDisabled();
    await expect(tid(page, 'import-review-cancel')).toBeDisabled();
    await expect(tid(page, 'import-review-read-only')).toHaveCount(0);
  });

  test('AC-EZD-314-4: a user without Edit model sees the read-only note', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const { tenant, project } = await company();
    const m = await member(tenant, ['view_projects', 'edit_model'], 'Dana Office');
    const viewer = await member(tenant, ['view_projects'], 'Vic Viewer');
    const file = await sourceFile(tenant, project, 'family-room.dxf');
    const j = await job(tenant, project, [file], 'done', m.appUserId);
    await session(tenant, project, j, file, ITEMS);
    await signInAs(viewer.email);

    await page.goto(reviewUrl(project, j));
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready');
    await expect(tid(page, 'import-review-read-only')).toHaveText(
      'You can view this import but not change it',
    );
    await expect(tid(page, 'import-review-accept-n')).toBeDisabled();
    await expect(tid(page, 'import-review-finish')).toBeDisabled();
    await expect(tid(page, 'import-review-cancel')).toBeDisabled();
    await expect(tid(page, 'lock-banner')).toHaveCount(0);
  });

  test('AC-EZD-314-6: a bearing-wall item carries its flag in review and into the model on Finish', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const { tenant, project } = await company();
    const m = await member(tenant, ['view_projects', 'edit_model'], 'Dana Office');
    const file = await sourceFile(tenant, project, 'family-room.dxf');
    const j = await job(tenant, project, [file], 'done', m.appUserId);
    await session(tenant, project, j, file, ITEMS);
    await signInAs(m.email);

    await page.goto(reviewUrl(project, j));
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready');
    await tid(page, 'import-review-mode').and(page.locator('[data-mode="one_by_one"]')).click();
    const rows = tid(page, 'import-review-row');
    await expect(rows).toHaveCount(6);
    await expect(rows.filter({ has: tid(page, 'import-review-row-bearing') })).toHaveCount(1);
    await expect(
      page
        .locator('[data-testid="import-review-row"][data-id="w1"]')
        .getByTestId('import-review-row-bearing'),
    ).toHaveText('Bearing');
    await page.locator('[data-testid="import-review-row"][data-id="w1"]').click();
    await expect(tid(page, 'import-review-inspector-bearing')).toHaveText('Bearing');

    await tid(page, 'import-review-accept-n').click();
    await expect(tid(page, 'import-review-finish')).toBeEnabled();
    await tid(page, 'import-review-finish').click();
    await page.waitForURL(new RegExp(`/projects/${project}\\?imported=`));

    const walls = await harnessSql()<{ bearing: boolean; x: number; y: number }[]>`
      select (data -> 'attributes' ->> 'bearing')::boolean as bearing,
        (data -> 'geometry' -> 'start' ->> 'x')::float as x,
        (data -> 'geometry' -> 'start' ->> 'y')::float as y
      from public.model_object
      where project_id = ${project}::uuid and type = 'wall' and not deleted`;
    // Only w1, the south wall starting at (144, 0), is bearing; the other three are not.
    expect(walls).toHaveLength(4);
    expect(walls.filter((w) => w.bearing).map((w) => [w.x, w.y])).toEqual([[144, 0]]);
  });
});
