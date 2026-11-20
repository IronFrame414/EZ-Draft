// EZD-312 on the local stack (AC-EZD-312-1 "A slope item saves by each of the three inputs"; S02 Decisions "Ceiling
// slope items are fixed in the inspector with the same three inputs as Round 1: heights at points (low/high wall),
// pitch, or the value read from the mesh"; Q-0215 "saved until Finish or Cancel"). A ceiling slope item is fixed by
// each input in turn through save_import_review, as the page's saver sends it, and the review is read again as a
// reload would. Values from fixtures/synthetic/room-12x10-sloped.glb.expected.json (west wall 96 in, east wall 144
// in, 4/12 over the 144 in room), worked by hand: pitch 6/12 from 96 in rises 6 × 144 ÷ 12 = 72 to 168 in.
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
import type { CeilingSlopeFix } from '../../lib/imports/ceiling-slope';
import { fixedItems } from '../../lib/imports/review-fix';
import { startSourceFileUpload, type DbClient } from '../storage';
import { readImportReview, saveImportReview } from './review';

const db = (s: Session) => s.serverDb as unknown as DbClient;

const ROOM = {
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
};
const SLOPE = {
  id: 's1',
  type: 'ceiling_slope',
  number: 1,
  confidence: 47,
  roomId: 'r1',
  lowSide: 'west',
  highSide: 'east',
  run: 144,
  lowHeight: 95,
  highHeight: 140,
  pitchPer12: 3.75,
};

const FIXES: Record<string, CeilingSlopeFix> = {
  points: { input: 'points', lowHeight: 96, highHeight: 144, pitchPer12: 4 },
  pitch: { input: 'pitch', lowHeight: 96, highHeight: 168, pitchPer12: 6 },
  mesh: { input: 'mesh', lowHeight: 96, highHeight: 144, pitchPer12: 4 },
};

describe('EZD-312 saving a ceiling slope fix', () => {
  let release: (() => Promise<void>) | undefined;
  let tA = '';
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
      items: [ROOM, SLOPE],
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
    await setPermissions(tA, a.membershipId, ['view_projects', 'edit_model']);
    sA = await signIn(a.email);
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

  it('the review reads the detected slope item', async () => {
    const job = await importJob();
    const view = await readImportReview(db(sA), pA, job);
    expect(view?.items.map((i) => i.id)).toEqual(['r1', 's1']);
    expect(view?.items[1]).toEqual(SLOPE);
  });

  it.each(Object.keys(FIXES))(
    'AC-EZD-312-1: a slope fixed by %s is saved and a reload restores it',
    async (input) => {
      const job = await importJob();
      const fix = FIXES[input];
      expect(
        await saveImportReview(db(sA), pA, job, {
          mode: null,
          changes: [{ item_id: 's1', decision: 'accepted', fix }],
        }),
      ).toBe('saved');
      const view = await readImportReview(db(sA), pA, job);
      expect(view?.decisions).toEqual({ s1: 'accepted' });
      expect(view?.fixes).toEqual({ s1: fix });
      const shown = fixedItems(view!.items, view!.fixes).find((i) => i.id === 's1');
      expect(shown).toMatchObject({
        lowHeight: fix.lowHeight,
        highHeight: fix.highHeight,
        pitchPer12: fix.pitchPer12,
      });
    },
  );

  it('a later input replaces the earlier one', async () => {
    const job = await importJob();
    for (const input of ['points', 'pitch', 'mesh']) {
      await saveImportReview(db(sA), pA, job, {
        mode: null,
        changes: [{ item_id: 's1', decision: 'accepted', fix: FIXES[input] }],
      });
      const view = await readImportReview(db(sA), pA, job);
      expect(view?.fixes.s1).toEqual(FIXES[input]);
    }
  });
});
