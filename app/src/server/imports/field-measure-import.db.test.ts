// EZD-1418 on the local stack (AC-EZD-1418-1 "A sent L-shaped room becomes six existing walls and a room on the plan";
// S17b Desktop side "sent rooms appear in Import review as Field measure items with high confidence; accepting them
// creates existing walls and rooms"; S02 Entry points "rooms sent from the phone ... source kind field_measure";
// CLAUDE.md rule 4). Expected values: the L of lib/imports/field-measure-items.test.ts (A 180", B 120", C 96", D 96",
// E 84", F 216"), placed with corners (0,216) (180,216) (180,96) (84,96) (84,0) (0,0). A recorded send becomes one
// import (job id = the send's id) of six walls and one room at 100 % confidence; the office's review list shows one
// field measurement that opens it; accepting every item and Finish import puts six Existing walls and one Existing
// room named Kitchen on the project's floor, and resolves the field measurement. A resend makes no second import; a
// send recorded without its import gets it on the resend; a send that found rooms already sent makes none. Another
// company can neither read the import nor make one on this project, and a member cannot make one from a send that
// is not theirs.
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
  type Session,
} from '../../../test-harness/rls/fixtures';
import { emptyRoom, initialRooms, withShape, type FieldRoom } from '../../field-measure/rooms';
import { syncFieldAction, type SyncBody } from '../outbox/field-actions';
import { readReviewSummary } from '../review/review';
import type { DbClient } from '../storage/objects';
import { finishImport } from './finish-import';
import { FIELD_MEASURE_FILE, readImportReview, saveImportReview } from './review';

const DEVICE = '44444444-4444-4444-8444-444444444444';
const QUEUED_AT = Date.UTC(2026, 10, 24, 15, 0, 0);

type Who = { session: Session; appUserId: string };
const db = (w: Who) => w.session.serverDb as unknown as DbClient;

async function memberWith(tenant: string, permissions: string[]): Promise<Who> {
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return { session: await signIn(m.email), appUserId: m.appUserId };
}

function lRooms(): FieldRoom[] {
  const kitchen = withShape(emptyRoom('r1', 'room', 'Kitchen'), 'l');
  return [initialRooms()[0]!, { ...kitchen, lengths: [180, 120, 96, 96, 84, 216], ceiling: 96 }];
}

const L_CORNERS = [
  { x: 0, y: 216 },
  { x: 180, y: 216 },
  { x: 180, y: 96 },
  { x: 84, y: 96 },
  { x: 84, y: 0 },
  { x: 0, y: 0 },
];

const send = (rooms: unknown, id: string = crypto.randomUUID()): SyncBody => ({
  id,
  deviceId: DEVICE,
  kind: 'field_measure_send',
  ops: { rooms },
  baseVersionId: null,
  queuedAt: QUEUED_AT,
  photo: null,
});

const importJobs = async (projectId: string) =>
  harnessSql()<{ id: string; status: string }[]>`
    select id::text, status from public.job where project_id = ${projectId}::uuid and kind = 'import'`;

type Obj = {
  type: string;
  data: {
    status?: string;
    level?: string;
    attributes?: { name?: string };
    geometry?: { start?: unknown; end?: unknown; boundary?: unknown };
  };
};
const objects = async (projectId: string): Promise<Obj[]> => {
  const { data, error } = await adminDb()
    .from('model_object')
    .select('type, data')
    .eq('project_id', projectId)
    .eq('deleted', false);
  if (error) throw error;
  return data as Obj[];
};

let releaseJobQueue: (() => Promise<void>) | undefined;
beforeAll(async () => {
  releaseJobQueue = await holdJobQueueShared();
}, 180000);
afterAll(async () => {
  await releaseJobQueue?.();
});

describe('EZD-1418 Field measure into Import review', () => {
  let tA = '';
  let pL = '';
  let pDup = '';
  let pSent = '';
  let pOther = '';
  let measurer: Who;
  let office: Who;
  let otherCo: Who;

  beforeAll(async () => {
    tA = await createTenant();
    [pL, pDup, pSent] = await createProjects(tA, 3);
    measurer = await memberWith(tA, ['view_projects', 'send_field_measurement']);
    office = await memberWith(tA, [
      'view_projects',
      'edit_model',
      'approve_field_measurements',
    ]);
    const tB = await createTenant();
    [pOther] = await createProjects(tB, 1);
    otherCo = await memberWith(tB, [
      'view_projects',
      'edit_model',
      'send_field_measurement',
      'approve_field_measurements',
    ]);
  }, 180000);

  afterAll(async () => {
    try {
      if (tA) await adminDb().from('job').delete().eq('tenant_id', tA);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  it('AC-EZD-1418-1: a sent L-shaped room becomes six existing walls and a room on the plan', async () => {
    const action = send(lRooms());
    expect(await syncFieldAction(db(measurer), pL, action)).toMatchObject({
      ok: true,
      status: 'synced',
    });

    // The send is one import, done (no runner claims it), whose id is the send's id.
    expect(await importJobs(pL)).toEqual([{ id: action.id, status: 'done' }]);

    const review = await readImportReview(db(office), pL, action.id);
    expect(review).not.toBeNull();
    if (!review) return;
    expect(review.status).toBe('ready');
    expect(review.files).toEqual([FIELD_MEASURE_FILE]);
    const walls = review.items.filter((i) => i.type === 'wall');
    const rooms = review.items.filter((i) => i.type === 'room');
    expect(walls).toHaveLength(6);
    expect(rooms).toHaveLength(1);
    expect(review.items.every((i) => i.confidence === 100)).toBe(true);

    // The office's review list: one field measurement, opening this Import review.
    const summary = await readReviewSummary(office.session.serverDb as never, pL, true);
    expect(summary?.count).toBe(1);
    expect(summary?.groups).toEqual([
      { source: 'field_measure', count: 1, href: `/projects/${pL}/import/${action.id}` },
    ]);

    await saveImportReview(db(office), pL, action.id, {
      mode: null,
      changes: review.items.map((i) => ({ item_id: i.id, decision: 'accepted' as const, fix: null })),
    });
    const floor = await floorId(pL);
    const result = await finishImport(db(office), pL, action.id, office.appUserId);
    expect(result.status).toBe('finished');
    if (result.status !== 'finished') return;
    expect(result.imported).toEqual({ walls: 6, windows: 0, doors: 0, rooms: 1 });

    const made = (await objects(pL)).filter((o) => o.type !== 'floor');
    const madeWalls = made.filter((o) => o.type === 'wall');
    const madeRooms = made.filter((o) => o.type === 'room');
    expect(madeWalls).toHaveLength(6);
    expect(madeRooms).toHaveLength(1);
    expect(made).toHaveLength(7);
    for (const o of made) {
      expect(o.data.status).toBe('existing');
      expect(o.data.level).toBe(floor);
    }
    expect(madeRooms[0]!.data.attributes?.name).toBe('Kitchen');
    expect(madeRooms[0]!.data.geometry?.boundary).toEqual(L_CORNERS);
    expect(madeWalls.map((w) => w.data.geometry)).toEqual(
      expect.arrayContaining([
        { start: { x: 180, y: 216 }, end: { x: 0, y: 216 } },
        { start: { x: 180, y: 96 }, end: { x: 180, y: 216 } },
        { start: { x: 84, y: 96 }, end: { x: 180, y: 96 } },
        { start: { x: 84, y: 0 }, end: { x: 84, y: 96 } },
        { start: { x: 0, y: 0 }, end: { x: 84, y: 0 } },
        { start: { x: 0, y: 216 }, end: { x: 0, y: 0 } },
      ]),
    );

    // Finish resolved the field measurement.
    const after = await readReviewSummary(office.session.serverDb as never, pL, true);
    expect(after).toEqual({ count: 0, groups: [] });
  });

  it('a resend makes no second import, and a send recorded without its import gets it on the resend', async () => {
    const action = send(lRooms());
    // The send recorded, its import not made (as when the answer is lost after sync_field_action).
    const direct = await measurer.session.serverDb.rpc('sync_field_action', {
      p_id: action.id,
      p_project: pDup,
      p_device: DEVICE,
      p_kind: 'field_measure_send',
      p_ops: action.ops as never,
      p_base_version: null as never,
      p_queued_at: new Date(QUEUED_AT).toISOString(),
      p_photo: null as never,
    });
    expect(direct.error).toBeNull();
    expect(await importJobs(pDup)).toEqual([]);

    expect(await syncFieldAction(db(measurer), pDup, action)).toMatchObject({
      ok: true,
      status: 'duplicate',
    });
    expect(await importJobs(pDup)).toEqual([{ id: action.id, status: 'done' }]);

    expect(await syncFieldAction(db(measurer), pDup, action)).toMatchObject({
      ok: true,
      status: 'duplicate',
    });
    expect(await importJobs(pDup)).toHaveLength(1);
    const sessions = await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.import_session where project_id = ${pDup}::uuid`;
    expect(sessions[0]!.n).toBe(1);
    const open = await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.review_item
      where project_id = ${pDup}::uuid and source = 'field_measure' and resolved_at is null`;
    expect(open[0]!.n).toBe(1);
  });

  it('a send that found the rooms already sent makes no import', async () => {
    const first = send(lRooms());
    await syncFieldAction(db(measurer), pSent, first);
    const second = send(lRooms());
    expect(await syncFieldAction(db(measurer), pSent, second)).toMatchObject({
      ok: true,
      status: 'synced',
    });
    expect(await importJobs(pSent)).toEqual([{ id: first.id, status: 'done' }]);
    const r = await measurer.session.serverDb.rpc('create_field_measure_import', {
      p_project: pSent,
      p_change: second.id,
      p_items: [{ id: 'fm-x', type: 'wall' }] as never,
    });
    expect(r.error).toBeNull();
    expect(r.data).toEqual({ status: 'not_sent', job_id: null });
  });

  it("another company can neither read the import nor make one; no one makes one from another's send", async () => {
    const [job] = await importJobs(pL);
    expect(job).toBeDefined();
    expect(await readImportReview(db(otherCo), pL, job!.id)).toBeNull();
    for (const table of ['job', 'import_session', 'review_item'] as const) {
      const rows = await otherCo.session.serverDb.from(table).select('id').eq('project_id', pL);
      expect(rows.data ?? [], table).toEqual([]);
    }
    const items = [{ id: 'fm-x', type: 'wall' }] as never;
    // On this company's project: not found.
    const onA = await otherCo.session.serverDb.rpc('create_field_measure_import', {
      p_project: pL,
      p_change: job!.id,
      p_items: items,
    });
    expect(onA.error?.code).toBe('P0002');
    // On its own project, naming this company's send: refused.
    const ownWithA = await otherCo.session.serverDb.rpc('create_field_measure_import', {
      p_project: pOther,
      p_change: job!.id,
      p_items: items,
    });
    expect(ownWithA.error?.code).toBe('22023');
    // Without Send field measurement: refused.
    const noSwitch = await office.session.serverDb.rpc('create_field_measure_import', {
      p_project: pL,
      p_change: job!.id,
      p_items: items,
    });
    expect(noSwitch.error?.code).toBe('42501');
    expect(await importJobs(pOther)).toEqual([]);
  });

  async function floorId(projectId: string): Promise<string> {
    const { data, error } = await adminDb()
      .from('model_object')
      .select('object_id')
      .eq('project_id', projectId)
      .eq('type', 'floor')
      .single();
    if (error) throw error;
    return (data as { object_id: string }).object_id;
  }
});
