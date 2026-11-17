// EZD-309 on the local stack (AC-EZD-309-1 "A fixed wall is written in its fixed position on Finish"; AC-EZD-309-2
// "reloading mid-review restores accepted and fixed items"; Q-0215 "saved until Finish or Cancel, even if the
// browser closes"; S02 Permissions "Edit model: required for every accept, fix, delete ... Also requires holding
// the edit lock"; CLAUDE.md rule 4). Review changes are written through save_import_review as the page's saver
// sends them, then the review is read again as a reload would. Items: the room-12x10 fixture's walls, door and
// room (fixtures/synthetic/room-12x10.dxf.expected.json `semantic`, as in review.db.test.ts). The north wall's
// east end is moved from (144, 120) to (144, 118) by hand.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
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
import { finishItems } from '../../lib/imports/review-fix';
import { startSourceFileUpload, type DbClient } from '../storage';
import { readImportReview, ReviewSaveError, saveImportReview } from './review';

const db = (s: Session) => s.serverDb as unknown as DbClient;

const wall = (n: number, side: string, sx: number, sy: number, ex: number, ey: number) => ({
  id: `w${n}`,
  type: 'wall',
  number: n,
  side,
  confidence: n === 3 ? 62 : 95,
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
    confidence: 90,
    hostWallId: 'w1',
    width: 36,
    center: { x: 30, y: 0 },
  },
  {
    id: 'r1',
    type: 'room',
    number: 1,
    confidence: 90,
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
const NORTH_FIXED = { geometry: { start: { x: 0, y: 120 }, end: { x: 144, y: 118 } } };

describe('EZD-309 saving review changes', () => {
  let release: (() => Promise<void>) | undefined;
  let tA = '';
  let pA = '';
  let a: Member;
  let viewer: Member;
  let other: Member;
  let sA: Session;
  let sViewer: Session;
  let sOther: Session;
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

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tA = await createTenant();
    [pA] = await createProjects(tA, 1);
    a = await createMember({ tenantId: tA, scope: 'all' });
    viewer = await createMember({ tenantId: tA, scope: 'all' });
    other = await createMember({ tenantId: tA, scope: 'all' });
    await setPermissions(tA, a.membershipId, ['view_projects', 'edit_model']);
    await setPermissions(tA, viewer.membershipId, ['view_projects']);
    await setPermissions(tA, other.membershipId, ['view_projects', 'edit_model']);
    sA = await signIn(a.email);
    sViewer = await signIn(viewer.email);
    sOther = await signIn(other.email);
    const tB = await createTenant();
    const b = await createMember({ tenantId: tB, scope: 'all' });
    await setPermissions(tB, b.membershipId, ['view_projects', 'edit_model']);
    sB = await signIn(b.email);
    // The session row only needs a source_file row to point at; nothing is uploaded.
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

  it('AC-EZD-309-2: a reload restores accepted, fixed and deleted items and the mode', async () => {
    const job = await importJob();
    const fresh = await readImportReview(db(sA), pA, job);
    expect(fresh?.decisions).toEqual({});
    expect(fresh?.fixes).toEqual({});
    expect(fresh?.mode).toBe('accept_fix');

    expect(
      await saveImportReview(db(sA), pA, job, {
        mode: 'one_by_one',
        changes: [
          { item_id: 'w1', decision: 'accepted', fix: null },
          { item_id: 'w3', decision: 'accepted', fix: NORTH_FIXED },
          { item_id: 'o1', decision: 'rejected', fix: null },
        ],
      }),
    ).toBe('saved');

    const view = await readImportReview(db(sA), pA, job);
    expect(view?.mode).toBe('one_by_one');
    expect(view?.decisions).toEqual({ w1: 'accepted', w3: 'accepted', o1: 'rejected' });
    expect(view?.fixes).toEqual({ w3: NORTH_FIXED });
    // The detected item is unchanged; the fix is kept beside it.
    expect(view?.items.find((i) => i.id === 'w3')).toMatchObject({
      geometry: { start: { x: 0, y: 120 }, end: { x: 144, y: 120 } },
    });

    // A later batch replaces an item's row; both null (an undo back to unresolved) removes it.
    await saveImportReview(db(sA), pA, job, {
      mode: null,
      changes: [
        { item_id: 'w1', decision: null, fix: null },
        { item_id: 'o1', decision: 'accepted', fix: null },
      ],
    });
    const again = await readImportReview(db(sA), pA, job);
    expect(again?.decisions).toEqual({ w3: 'accepted', o1: 'accepted' });
    expect(again?.mode).toBe('one_by_one');
  });

  it('AC-EZD-309-1: what Finish writes from the saved review has the fixed wall at its fixed position', async () => {
    const job = await importJob();
    await saveImportReview(db(sA), pA, job, {
      mode: null,
      changes: [{ item_id: 'w3', decision: 'accepted', fix: NORTH_FIXED }],
    });
    const view = await readImportReview(db(sA), pA, job);
    const out = finishItems(view?.items ?? [], view?.decisions ?? {}, view?.fixes ?? {});
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'w3',
      type: 'wall',
      geometry: { start: { x: 0, y: 120 }, end: { x: 144, y: 118 } },
    });
  });

  it('refuses a member without Edit model, an unknown item and another company', async () => {
    const job = await importJob();
    const change = {
      mode: null,
      changes: [{ item_id: 'w1', decision: 'accepted' as const, fix: null }],
    };
    await expect(saveImportReview(db(sViewer), pA, job, change)).rejects.toEqual(
      new ReviewSaveError('permission_denied'),
    );
    await expect(
      saveImportReview(db(sA), pA, job, {
        mode: null,
        changes: [{ item_id: 'nope', decision: 'accepted', fix: null }],
      }),
    ).rejects.toEqual(new ReviewSaveError('invalid_input'));
    await expect(saveImportReview(db(sB), pA, job, change)).rejects.toEqual(
      new ReviewSaveError('not_found'),
    );
    // Another company can neither read the saved rows nor the review.
    await saveImportReview(db(sA), pA, job, change);
    const rows = await db(sB).from('import_review_item').select('id').eq('job_id', job);
    expect(rows.data ?? []).toEqual([]);
    expect(await readImportReview(db(sB), pA, job)).toBeNull();
    // A member cannot write a row directly; only save_import_review writes.
    const direct = await db(sA).from('import_review_item').insert({
      tenant_id: tA,
      project_id: pA,
      job_id: job,
      item_id: 'w2',
      decision: 'accepted',
    });
    expect(direct.error).not.toBeNull();
  });

  it('answers locked while another user holds the edit lock, and closed after Finish or Cancel', async () => {
    const job = await importJob();
    const change = {
      mode: null,
      changes: [{ item_id: 'w2', decision: 'accepted' as const, fix: null }],
    };
    const sql = harnessSql();
    await sql`insert into public.edit_lock (project_id, tenant_id, lock_epoch, holder_app_user_id, since, device_id)
      values (${pA}::uuid, ${tA}::uuid, 1, ${other.appUserId}::uuid, now(), 'device-1')
      on conflict (project_id) do update set holder_app_user_id = excluded.holder_app_user_id,
        since = excluded.since, device_id = excluded.device_id, lock_epoch = excluded.lock_epoch`;
    try {
      expect(await saveImportReview(db(sA), pA, job, change)).toBe('locked');
      expect(await saveImportReview(db(sOther), pA, job, change)).toBe('saved');
    } finally {
      await sql`update public.edit_lock set holder_app_user_id = null, since = null, device_id = null
        where project_id = ${pA}::uuid`;
    }
    expect((await readImportReview(db(sA), pA, job))?.decisions).toEqual({ w2: 'accepted' });
    await adminDb().from('import_session').update({ status: 'finished' }).eq('job_id', job);
    expect(await saveImportReview(db(sA), pA, job, change)).toBe('closed');
  });

  describeTenantIsolation('import_review_item', {
    makeRow: async (t, ctx) => {
      const { data, error } = await adminDb()
        .from('job')
        .insert({
          tenant_id: t,
          project_id: ctx.projectIds[0],
          kind: 'import',
          payload: {},
          status: 'done',
          max_attempts: 3,
          run_after: '2099-01-01T00:00:00Z',
          finished_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (error) throw error;
      return {
        tenant_id: t,
        project_id: ctx.projectIds[0],
        job_id: (data as { id: string }).id,
        item_id: 'w1',
        decision: 'accepted',
      };
    },
  });
});
