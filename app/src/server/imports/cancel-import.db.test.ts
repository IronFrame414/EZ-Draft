// EZD-313 on the local stack (AC-EZD-313-1 "The model is unchanged after Cancel"; S02 Controls Cancel import
// "discards detected items. Uploaded source files are kept", "No model changes are made"; Q-0215 "Cancel returns to
// the project with nothing imported"; CLAUDE.md rule 4). The review has accepted items saved; after Cancel the
// project's model_object and model_version rows are exactly as before, the source file row is kept, the review
// rows are gone and the review reads as cancelled, so a later save, Finish or Cancel answers closed. Items: the
// room-12x10 fixture's walls (fixtures/synthetic/room-12x10.dxf.expected.json `semantic`).
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
import { cancelImport } from './cancel-import';
import { finishImport, ImportCloseError } from './finish-import';
import { readImportReview, saveImportReview } from './review';

const db = (s: Session) => s.serverDb as unknown as DbClient;

const wall = (n: number, sx: number, sy: number, ex: number, ey: number) => ({
  id: `w${n}`,
  type: 'wall',
  number: n,
  side: ['south', 'east', 'north', 'west'][n - 1],
  confidence: 95,
  geometry: { start: { x: sx, y: sy }, end: { x: ex, y: ey } },
  thickness: 4.5,
});
const ITEMS = [
  wall(1, 144, 0, 0, 0),
  wall(2, 144, 120, 144, 0),
  wall(3, 0, 120, 144, 120),
  wall(4, 0, 0, 0, 120),
];

describe('EZD-313 Cancel import', () => {
  let release: (() => Promise<void>) | undefined;
  let tA = '';
  let pA = '';
  let a: Member;
  let other: Member;
  let sA: Session;
  let sViewer: Session;
  let sB: Session;
  let sourceFileId = '';

  async function importJob(): Promise<string> {
    const { data, error } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tA,
        project_id: pA,
        kind: 'import',
        payload: { sourceFileIds: [sourceFileId] },
        status: 'done',
        max_attempts: 3,
        run_after: '2099-01-01T00:00:00Z',
        created_by: a.appUserId,
        finished_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    const id = (data as { id: string }).id;
    const s = await adminDb().from('import_session').insert({
      tenant_id: tA,
      project_id: pA,
      source_file_id: sourceFileId,
      job_id: id,
      source_kind: 'scan',
      status: 'ready',
      items: ITEMS,
      summary: {},
    });
    if (s.error) throw s.error;
    return id;
  }

  const snapshot = async () => {
    const sql = harnessSql();
    const objects = await sql`select object_id, type, data, updated_seq, deleted, updated_at
      from public.model_object where project_id = ${pA}::uuid order by object_id`;
    const versions = await sql`select id, model_json from public.model_version
      where project_id = ${pA}::uuid order by id`;
    return { objects: [...objects], versions: [...versions] };
  };

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

  it('AC-EZD-313-1: the model is unchanged after Cancel, the source file is kept and the review is discarded', async () => {
    const job = await importJob();
    await saveImportReview(db(sA), pA, job, {
      mode: null,
      changes: ITEMS.map((i) => ({ item_id: i.id, decision: 'accepted' as const, fix: null })),
    });
    const before = await snapshot();
    expect(before.objects.map((o) => o.type)).toEqual(['floor']);

    expect(await cancelImport(db(sA), pA, job)).toEqual({ status: 'cancelled', tenantId: tA });

    expect(await snapshot()).toEqual(before);
    const file = await adminDb()
      .from('source_file')
      .select('id')
      .eq('id', sourceFileId)
      .maybeSingle();
    expect(file.data).toEqual({ id: sourceFileId });
    const rows = await adminDb().from('import_review_item').select('id').eq('job_id', job);
    expect(rows.data).toEqual([]);
    const sessions = await adminDb().from('import_session').select('status').eq('job_id', job);
    expect(sessions.data).toEqual([{ status: 'cancelled' }]);
    expect((await readImportReview(db(sA), pA, job))?.status).toBe('cancelled');

    // Closed: nothing more is saved, finished or cancelled, and the model stays as it was.
    expect(
      await saveImportReview(db(sA), pA, job, {
        mode: null,
        changes: [{ item_id: 'w1', decision: 'accepted', fix: null }],
      }),
    ).toBe('closed');
    expect((await finishImport(db(sA), pA, job, a.appUserId)).status).toBe('closed');
    const direct = await db(sA).rpc('finish_import', { p_project: pA, p_job: job, p_objects: [] });
    expect(direct.data).toEqual({ status: 'closed' });
    expect(await cancelImport(db(sA), pA, job)).toEqual({ status: 'closed' });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses a member without Edit model, another company, and while another user holds the edit lock', async () => {
    const job = await importJob();
    await expect(cancelImport(db(sViewer), pA, job)).rejects.toEqual(
      new ImportCloseError('permission_denied'),
    );
    await expect(cancelImport(db(sB), pA, job)).rejects.toEqual(new ImportCloseError('not_found'));
    const sql = harnessSql();
    await sql`insert into public.edit_lock (project_id, tenant_id, lock_epoch, holder_app_user_id, since, device_id)
      values (${pA}::uuid, ${tA}::uuid, 1, ${other.appUserId}::uuid, now(), 'device-1')
      on conflict (project_id) do update set holder_app_user_id = excluded.holder_app_user_id,
        since = excluded.since, device_id = excluded.device_id, lock_epoch = excluded.lock_epoch`;
    try {
      expect(await cancelImport(db(sA), pA, job)).toEqual({ status: 'locked' });
    } finally {
      await sql`update public.edit_lock set holder_app_user_id = null, since = null, device_id = null
        where project_id = ${pA}::uuid`;
    }
    const sessions = await adminDb().from('import_session').select('status').eq('job_id', job);
    expect(sessions.data).toEqual([{ status: 'ready' }]);
  });
});
