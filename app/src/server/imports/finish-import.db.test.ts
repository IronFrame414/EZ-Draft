// EZD-313 on the local stack (AC-EZD-313-2 "after Finish it holds only accepted items"; S02 Controls Finish import
// "Writes accepted items to the model as a new model version"; W2 step 5 "accepted items become model objects with
// status Existing"; S02 Decisions "Nothing imports with a pending flag"; S02 Permissions "Edit model ... Also
// requires holding the edit lock"; CLAUDE.md rule 4). Items: the room-12x10 fixture's walls, door and room
// (fixtures/synthetic/room-12x10.dxf.expected.json `semantic`, as in review-save.db.test.ts). The review accepts the
// south, east and north walls, the door on the south wall and the room, and deletes the west wall, so the model
// gains exactly three walls, one door hosted on the new south wall and one room, all Existing, on the project's
// floor, and one new model version holding them. Wall thickness 4.5" is the default drywall 1/2" + stud 3 1/2" +
// drywall 1/2" (packages/geometry walls/wall.ts DEFAULT_WALL_LAYERS).
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
import { finishImport, ImportCloseError } from './finish-import';
import { readImportReview, saveImportReview } from './review';

const db = (s: Session) => s.serverDb as unknown as DbClient;

const wall = (n: number, side: string, sx: number, sy: number, ex: number, ey: number) => ({
  id: `w${n}`,
  type: 'wall',
  number: n,
  side,
  confidence: 95,
  geometry: { start: { x: sx, y: sy }, end: { x: ex, y: ey } },
  thickness: 4.5,
});
const BOUNDARY = [
  { x: 0, y: 0 },
  { x: 144, y: 0 },
  { x: 144, y: 120 },
  { x: 0, y: 120 },
];
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
    boundary: BOUNDARY,
    closed: true,
    areaSqIn: 17280,
  },
];
const ACCEPT_ALL_BUT_WEST = [
  { item_id: 'w1', decision: 'accepted' as const, fix: null },
  { item_id: 'w2', decision: 'accepted' as const, fix: null },
  { item_id: 'w3', decision: 'accepted' as const, fix: null },
  { item_id: 'w4', decision: 'rejected' as const, fix: null },
  { item_id: 'o1', decision: 'accepted' as const, fix: null },
  { item_id: 'r1', decision: 'accepted' as const, fix: null },
];
const LAYERS = [
  { material: 'drywall', thickness: 0.5 },
  { material: 'stud', thickness: 3.5 },
  { material: 'drywall', thickness: 0.5 },
];

type Row = { object_id: string; type: string; data: Record<string, unknown>; deleted: boolean };

describe('EZD-313 Finish import', () => {
  let release: (() => Promise<void>) | undefined;
  let tA = '';
  let pA = '';
  let a: Member;
  let other: Member;
  let sA: Session;
  let sViewer: Session;
  let sOther: Session;
  let sB: Session;
  let sourceFileId = '';
  let floorId = '';

  async function importJob(project = pA): Promise<string> {
    const { data, error } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tA,
        project_id: project,
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
      project_id: project,
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

  const objects = async (project: string): Promise<Row[]> => {
    const { data, error } = await adminDb()
      .from('model_object')
      .select('object_id, type, data, deleted')
      .eq('project_id', project);
    if (error) throw error;
    return data as Row[];
  };
  const versions = async (project: string) => {
    const { data, error } = await adminDb()
      .from('model_version')
      .select('id, model_json')
      .eq('project_id', project);
    if (error) throw error;
    return data as { id: string; model_json: { objects: { id: string; type: string }[] } }[];
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
    sOther = await signIn(other.email);
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
    floorId = (await objects(pA)).find((o) => o.type === 'floor')!.object_id;
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

  it('AC-EZD-313-2: after Finish the model holds only the accepted items, Existing, in one new version', async () => {
    const [pFresh] = await createProjects(tA, 1);
    const job = await importJob(pFresh);
    await saveImportReview(db(sA), pFresh, job, { mode: null, changes: ACCEPT_ALL_BUT_WEST });
    const before = await objects(pFresh);
    expect(before.map((o) => o.type)).toEqual(['floor']);
    const floor = before[0]!.object_id;
    const versionsBefore = (await versions(pFresh)).length;

    const result = await finishImport(db(sA), pFresh, job, a.appUserId);
    expect(result.status).toBe('finished');
    if (result.status !== 'finished') return;
    expect(result.counts).toEqual({ accepted: 5, deleted: 1 });
    expect(result.imported).toEqual({ walls: 3, windows: 0, doors: 1, rooms: 1 });
    expect(result.sourceFileIds).toEqual([sourceFileId]);
    expect(result.overridden).toEqual([]);

    const after = (await objects(pFresh)).filter((o) => o.type !== 'floor');
    expect(after.map((o) => o.type).sort()).toEqual(['opening', 'room', 'wall', 'wall', 'wall']);
    expect(after.every((o) => !o.deleted)).toBe(true);
    for (const o of after) {
      expect(o.data.status, o.type).toBe('existing');
      expect(o.data.level, o.type).toBe(floor);
    }
    const walls = after
      .filter((o) => o.type === 'wall')
      .map((o) => (o.data as { geometry: unknown }).geometry);
    // South, east and north; the deleted west wall (0,0)-(0,120) is not in the model.
    expect(walls).toEqual(
      expect.arrayContaining([
        { start: { x: 144, y: 0 }, end: { x: 0, y: 0 } },
        { start: { x: 144, y: 120 }, end: { x: 144, y: 0 } },
        { start: { x: 0, y: 120 }, end: { x: 144, y: 120 } },
      ]),
    );
    expect(walls).not.toContainEqual({ start: { x: 0, y: 0 }, end: { x: 0, y: 120 } });
    const south = after.find(
      (o) =>
        o.type === 'wall' &&
        (o.data as { geometry: { end: { x: number; y: number } } }).geometry.end.x === 0 &&
        (o.data as { geometry: { start: { y: number } } }).geometry.start.y === 0,
    )!;
    expect(
      (south.data as { attributes: { thickness: number; layers: unknown } }).attributes,
    ).toMatchObject({
      thickness: 4.5,
      layers: LAYERS,
    });
    const door = after.find((o) => o.type === 'opening')!.data as {
      geometry: { center: unknown; hostWallId: string | null };
      attributes: { kind: string; width: number };
    };
    expect(door.geometry.center).toEqual({ x: 30, y: 0 });
    expect(door.geometry.hostWallId).toBe(south.object_id);
    expect(door.attributes).toMatchObject({ kind: 'door', width: 36 });
    const room = after.find((o) => o.type === 'room')!.data as {
      geometry: { boundary: unknown };
      attributes: { name: string };
      closureOverride: unknown;
    };
    expect(room.geometry.boundary).toEqual(BOUNDARY);
    expect(room.attributes.name).toBe('Room 1');
    expect(room.closureOverride).toBeNull();

    const all = await versions(pFresh);
    expect(all).toHaveLength(versionsBefore + 1);
    const made = all.find((v) => v.id === result.modelVersionId)!;
    expect(made.model_json.objects.map((o) => o.type).sort()).toEqual([
      'floor',
      'opening',
      'room',
      'wall',
      'wall',
      'wall',
    ]);

    // The review is closed: it reads as finished, and a later save or Finish answers closed and writes nothing.
    expect((await readImportReview(db(sA), pFresh, job))?.status).toBe('finished');
    expect(
      await saveImportReview(db(sA), pFresh, job, {
        mode: null,
        changes: [{ item_id: 'w4', decision: 'accepted', fix: null }],
      }),
    ).toBe('closed');
    expect((await finishImport(db(sA), pFresh, job, a.appUserId)).status).toBe('closed');
    const direct = await db(sA).rpc('finish_import', {
      p_project: pFresh,
      p_job: job,
      p_objects: [],
    });
    expect(direct.data).toEqual({ status: 'closed' });
    expect((await objects(pFresh)).length).toBe(6);
  });

  it('a room kept out of square carries its closure override', async () => {
    const [pKeep] = await createProjects(tA, 1);
    const job = await importJob(pKeep);
    await saveImportReview(db(sA), pKeep, job, {
      mode: null,
      changes: [
        ...ACCEPT_ALL_BUT_WEST.filter((c) => c.item_id !== 'r1'),
        {
          item_id: 'r1',
          decision: 'accepted',
          fix: { boundary: BOUNDARY, keep: { gap: { x: 0, y: 2 } } },
        },
      ],
    });
    const now = new Date('2026-11-17T12:00:00.000Z');
    const result = await finishImport(db(sA), pKeep, job, a.appUserId, { now: () => now });
    expect(result.status).toBe('finished');
    if (result.status !== 'finished') return;
    const room = (await objects(pKeep)).find((o) => o.type === 'room')!;
    expect(room.data.closureOverride).toEqual({
      who: a.appUserId,
      when: '2026-11-17T12:00:00.000Z',
      gap: { x: 0, y: 2 },
    });
    expect(result.overridden).toEqual([{ roomId: room.object_id, gapIn: 2 }]);
  });

  it('refuses while an item is unresolved, writing nothing (S02 "Nothing imports with a pending flag")', async () => {
    const job = await importJob();
    await saveImportReview(db(sA), pA, job, {
      mode: null,
      changes: ACCEPT_ALL_BUT_WEST.filter((c) => c.item_id !== 'r1'),
    });
    const before = await objects(pA);
    expect((await finishImport(db(sA), pA, job, a.appUserId)).status).toBe('unresolved');
    // The function checks again itself.
    const direct = await db(sA).rpc('finish_import', { p_project: pA, p_job: job, p_objects: [] });
    expect(direct.data).toEqual({ status: 'unresolved' });
    expect(await objects(pA)).toEqual(before);
    expect((await readImportReview(db(sA), pA, job))?.status).toBe('ready');
  });

  it('refuses a member without Edit model, another company, and while another user holds the edit lock', async () => {
    const job = await importJob();
    await saveImportReview(db(sA), pA, job, { mode: null, changes: ACCEPT_ALL_BUT_WEST });
    const before = await objects(pA);
    const call = (s: Session) =>
      db(s).rpc('finish_import', { p_project: pA, p_job: job, p_objects: [] });
    expect((await call(sViewer)).error?.code).toBe('42501');
    expect((await call(sB)).error?.code).toBe('P0002');
    await expect(finishImport(db(sB), pA, job, a.appUserId)).resolves.toEqual({
      status: 'not_found',
    });

    const sql = harnessSql();
    await sql`insert into public.edit_lock (project_id, tenant_id, lock_epoch, holder_app_user_id, since, device_id)
      values (${pA}::uuid, ${tA}::uuid, 1, ${other.appUserId}::uuid, now(), 'device-1')
      on conflict (project_id) do update set holder_app_user_id = excluded.holder_app_user_id,
        since = excluded.since, device_id = excluded.device_id, lock_epoch = excluded.lock_epoch`;
    try {
      expect((await finishImport(db(sA), pA, job, a.appUserId)).status).toBe('locked');
    } finally {
      await sql`update public.edit_lock set holder_app_user_id = null, since = null, device_id = null
        where project_id = ${pA}::uuid`;
    }
    expect(await objects(pA)).toEqual(before);
    expect((await readImportReview(db(sA), pA, job))?.status).toBe('ready');
    // The holder may finish.
    expect((await finishImport(db(sOther), pA, job, other.appUserId)).status).toBe('finished');
  });

  it('refuses an object outside the rules and a job that is not an import', async () => {
    const job = await importJob();
    const bad = await db(sA).rpc('finish_import', {
      p_project: pA,
      p_job: job,
      p_objects: [{ id: 'nope', type: 'wall', schema_version: 6, data: {} }],
    });
    expect(bad.error?.code).toBe('22023');
    const other = await db(sA).rpc('finish_import', {
      p_project: pA,
      p_job: floorId,
      p_objects: [],
    });
    expect(other.error?.code).toBe('P0002');
    expect(new ImportCloseError('not_found').code).toBe('not_found');
  });
});
