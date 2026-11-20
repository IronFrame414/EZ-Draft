// EZD-314 on the local stack (S02 States "Error: import job failed: message with file name and Retry"; AC-EZD-314-2;
// CLAUDE.md rule 4): Retry of a failed import through retry_import. A job that failed, and a job that finished with
// a failed session (an unreadable file), both go back on the queue as new (queued, no attempts, no error, no run)
// with the failed session removed, so the import job reads the file again; the review then reads as detecting.
// Refused: without Edit model, another company's import (not found, nothing changes), while another user holds
// the edit lock, an import still detecting or that has not failed, and a closed import.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { startSourceFileUpload, type DbClient } from '../storage';
import { ReviewSaveError, readImportReview, retryImport } from './review';

const db = (s: Session) => s.serverDb as unknown as DbClient;

const ITEMS = [
  {
    id: 'w1',
    type: 'wall',
    number: 1,
    side: 'south',
    confidence: 95,
    geometry: { start: { x: 144, y: 0 }, end: { x: 0, y: 0 } },
    thickness: 4.5,
  },
];

describe('EZD-314 Retry import', () => {
  let release: (() => Promise<void>) | undefined;
  let tA = '';
  let pA = '';
  let a: Member;
  let other: Member;
  let sA: Session;
  let sViewer: Session;
  let sB: Session;
  let sourceFileId = '';

  async function importJob(
    jobStatus: 'done' | 'failed' | 'queued',
    session: 'ready' | 'failed' | 'cancelled' | null,
  ): Promise<string> {
    const { data, error } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tA,
        project_id: pA,
        kind: 'import',
        payload: { sourceFileIds: [sourceFileId] },
        status: jobStatus,
        attempts: jobStatus === 'queued' ? 0 : 3,
        max_attempts: 3,
        error: jobStatus === 'failed' ? 'handler_failed' : null,
        // Never due while the test runs: a runner does not take it before the test reads it.
        run_after: '2099-01-01T00:00:00Z',
        created_by: a.appUserId,
        finished_at: jobStatus === 'queued' ? null : new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    const id = (data as { id: string }).id;
    if (session) {
      const s = await adminDb()
        .from('import_session')
        .insert({
          tenant_id: tA,
          project_id: pA,
          source_file_id: sourceFileId,
          job_id: id,
          source_kind: 'scan',
          status: session,
          items: session === 'failed' ? [] : ITEMS,
          summary: {},
          error: session === 'failed' ? 'dxf_unreadable' : null,
        });
      if (s.error) throw s.error;
    }
    return id;
  }

  const jobRow = async (id: string) => {
    const [row] = await harnessSql()<
      {
        status: string;
        attempts: number;
        error: string | null;
        run_id: string | null;
        due: boolean;
      }[]
    >`select status, attempts, error, run_id, run_after <= now() as due from public.job where id = ${id}::uuid`;
    return row;
  };
  const sessionsOf = async (id: string) =>
    (await adminDb().from('import_session').select('status').eq('job_id', id)).data;

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tA = await createTenant();
    [pA] = await createProjects(tA, 1);
    a = await createMember({ tenantId: tA, scope: 'all' });
    const viewer = await createMember({ tenantId: tA, scope: 'all' });
    other = await createMember({ tenantId: tA, scope: 'all' });
    await setPermissions(tA, a.membershipId, ['view_projects', 'edit_model']);
    await setPermissions(tA, viewer.membershipId, ['view_projects']);
    await setPermissions(tA, other.membershipId, ['view_projects', 'edit_model']);
    sA = await signIn(a.email);
    sViewer = await signIn(viewer.email);
    const tB = await createTenant();
    const b = await createMember({ tenantId: tB, scope: 'all' });
    await setPermissions(tB, b.membershipId, ['view_projects', 'edit_model']);
    sB = await signIn(b.email);
    const { sourceFile } = await startSourceFileUpload(db(sA), {
      projectId: pA,
      kind: 'polycam_dxf',
      originalName: 'family-room.dxf',
      contentType: 'image/vnd.dxf',
      size: 10,
      uploadedBy: a.appUserId,
    });
    sourceFileId = sourceFile.id;
  }, 180_000);

  afterAll(async () => {
    try {
      if (tA) await adminDb().from('job').delete().eq('tenant_id', tA);
      await cleanup();
    } finally {
      await release?.();
      await closeHarness();
    }
  });

  it('AC-EZD-314-2: a failed job goes back on the queue as new and the review reads as detecting', async () => {
    const job = await importJob('failed', null);
    expect((await readImportReview(db(sA), pA, job))?.status).toBe('failed');
    expect(await retryImport(db(sA), pA, job)).toBe('queued');
    expect(await jobRow(job)).toEqual({
      status: 'queued',
      attempts: 0,
      error: null,
      run_id: null,
      due: true,
    });
    // Parked again so no runner takes it while the test reads the review.
    await harnessSql()`update public.job set run_after = '2099-01-01' where id = ${job}::uuid`;
    expect((await readImportReview(db(sA), pA, job))?.status).toBe('detecting');
  });

  it('AC-EZD-314-2: a job done with a failed session loses that session, so the file is read again', async () => {
    const job = await importJob('done', 'failed');
    const read = await readImportReview(db(sA), pA, job);
    expect(read?.status).toBe('failed');
    expect(read?.failedFile).toBe('family-room.dxf');
    expect(await retryImport(db(sA), pA, job)).toBe('queued');
    expect(await sessionsOf(job)).toEqual([]);
    expect((await jobRow(job)).status).toBe('queued');
    await harnessSql()`update public.job set run_after = '2099-01-01' where id = ${job}::uuid`;
  });

  it('refuses without Edit model and for another company, and changes nothing', async () => {
    const job = await importJob('failed', null);
    await expect(retryImport(db(sViewer), pA, job)).rejects.toEqual(
      new ReviewSaveError('permission_denied'),
    );
    await expect(retryImport(db(sB), pA, job)).rejects.toEqual(new ReviewSaveError('not_found'));
    expect((await jobRow(job)).status).toBe('failed');
  });

  it('answers locked while another user holds the edit lock, and changes nothing', async () => {
    const job = await importJob('done', 'failed');
    const sql = harnessSql();
    await sql`insert into public.edit_lock (project_id, tenant_id, lock_epoch, holder_app_user_id, since, device_id)
      values (${pA}::uuid, ${tA}::uuid, 1, ${other.appUserId}::uuid, now(), 'device-1')
      on conflict (project_id) do update set holder_app_user_id = excluded.holder_app_user_id,
        since = excluded.since, device_id = excluded.device_id, lock_epoch = excluded.lock_epoch`;
    try {
      expect(await retryImport(db(sA), pA, job)).toBe('locked');
    } finally {
      await sql`update public.edit_lock set holder_app_user_id = null, since = null, device_id = null
        where project_id = ${pA}::uuid`;
    }
    expect(await sessionsOf(job)).toEqual([{ status: 'failed' }]);
    expect((await jobRow(job)).status).toBe('done');
  });

  it('answers busy while detecting, not_failed for a ready import, closed after Cancel', async () => {
    const queued = await importJob('queued', null);
    expect(await retryImport(db(sA), pA, queued)).toBe('busy');
    const ready = await importJob('done', 'ready');
    expect(await retryImport(db(sA), pA, ready)).toBe('not_failed');
    expect(await sessionsOf(ready)).toEqual([{ status: 'ready' }]);
    const cancelled = await importJob('done', 'cancelled');
    expect(await retryImport(db(sA), pA, cancelled)).toBe('closed');
  });
});
