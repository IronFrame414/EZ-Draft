// EZD-310 (Round 24 #30 "One tolerance setting covers field measurements and scan-vs-typed conflicts"; S02 Data
// shown "Tolerance from company settings under Defaults"; AC-EZD-310-1; CLAUDE.md rule 4): the review carries the
// company's own measurement_tolerance, 1/2" while it is Not set (vault/build/assumptions.md EZD-310), never another
// company's; a typed value is saved in the item's fix and comes back on reload, so its conflicts come back too.
// No new table or policy: the typed value rides in import_review_item.fix (EZD-309's RLS tests cover the table).
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
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { itemConflicts } from '../../lib/imports/review-conflicts';
import { startSourceFileUpload, type DbClient } from '../storage';
import { readImportReview, saveImportReview } from './review';

const db = (s: Session) => s.serverDb as unknown as DbClient;

const wall = (n: number, side: string, sx: number, sy: number, ex: number, ey: number) => ({
  id: `w${n}`,
  type: 'wall',
  number: n,
  side,
  confidence: 62,
  geometry: { start: { x: sx, y: sy }, end: { x: ex, y: ey } },
  thickness: 4.5,
});
// A 12' x 10' room walked SW, SE, NE, NW; the east wall drawn north to south.
const ITEMS = [
  wall(1, 'south', 144, 0, 0, 0),
  wall(2, 'east', 144, 120, 144, 0),
  wall(3, 'north', 0, 120, 144, 120),
  wall(4, 'west', 0, 0, 0, 120),
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
// East wall typed 10' 0 3/4" (120.75 in): its start stays, its end moves to (144, -0.75).
const EAST_TYPED = { geometry: { start: { x: 144, y: 120 }, end: { x: 144, y: -0.75 } }, typed: 120.75 };

describe('EZD-310 tolerance and typed values on the server', () => {
  let release: (() => Promise<void>) | undefined;
  let tA = '';
  let tB = '';
  let pA = '';
  let a: Member;
  let sA: Session;
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

  const setDefaults = async (tenant: string, defaults: object) => {
    const { error } = await adminDb().from('tenant').update({ defaults }).eq('id', tenant);
    if (error) throw error;
  };

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tA = await createTenant();
    [pA] = await createProjects(tA, 1);
    a = await createMember({ tenantId: tA, scope: 'all' });
    await setPermissions(tA, a.membershipId, ['view_projects', 'edit_model']);
    sA = await signIn(a.email);
    tB = await createTenant();
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

  it('carries the company Defaults tolerance, 1/2" while Not set, never another company\'s', async () => {
    const job = await importJob();
    expect((await readImportReview(db(sA), pA, job))?.tolerance).toBe(0.5);
    await setDefaults(tB, { measurement_tolerance: 3 });
    expect((await readImportReview(db(sA), pA, job))?.tolerance).toBe(0.5);
    await setDefaults(tA, { measurement_tolerance: 0.125 });
    expect((await readImportReview(db(sA), pA, job))?.tolerance).toBe(0.125);
    await setDefaults(tA, {});
  });

  it('AC-EZD-310-1: a saved typed value comes back on reload with the conflicts it creates', async () => {
    const job = await importJob();
    expect(
      await saveImportReview(db(sA), pA, job, {
        mode: null,
        changes: [{ item_id: 'w2', decision: 'accepted', fix: EAST_TYPED }],
      }),
    ).toBe('saved');
    const view = await readImportReview(db(sA), pA, job);
    expect(view?.fixes).toEqual({ w2: EAST_TYPED });
    // The east wall walks south to north (dir +y); 3/4" more leaves a 3/4" gap at the first corner, (0, 0).
    expect(itemConflicts(view?.items ?? [], view?.fixes ?? {}, 'w2', view?.tolerance ?? 0)).toEqual([
      { kind: 'gap', severity: 'error', id: 'r1', inches: 0.75, point: { x: 0, y: 0 }, corner: 'southwest' },
    ]);
  });
});
