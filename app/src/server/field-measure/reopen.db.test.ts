// EZD-1419 on the local stack (AC-EZD-1419-2 "a sent room is read-only on the phone"; S17b States "sent (read-only
// until reopened by office)"; CLAUDE.md rule 4). Expected values: once sent, a save of the rooms is refused (sent)
// and the stored rooms stay as sent; a member without Approve field measurements cannot reopen them; another
// company can neither reopen them nor see them; the office (Approve field measurements, assumptions EZD-1417)
// reopens them: the rooms are kept, sent_at is cleared, a save works again, and a later Send to office is applied
// and notifies the office again. Reopening rooms that are not sent answers not_sent.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
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
import type { DbClient } from '../storage/objects';
import {
  FieldMeasureError,
  readFieldMeasure,
  reopenFieldMeasure,
  saveFieldMeasure,
} from './session';

const DEVICE = '44444444-4444-4444-8444-444444444444';

type Who = { session: Session; appUserId: string };
const db = (w: Who) => w.session.serverDb as unknown as DbClient;

async function memberWith(tenant: string, permissions: string[]): Promise<Who> {
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return { session: await signIn(m.email), appUserId: m.appUserId };
}

// A 12' x 10' rectangle: walls A to D, 144", 120", 144", 120".
function rooms(a = 144): FieldRoom[] {
  const kitchen = withShape(emptyRoom('r1', 'room', 'Kitchen'), 'rectangle');
  return [initialRooms()[0]!, { ...kitchen, lengths: [a, 120, 144, 120] }];
}

const send = (r: FieldRoom[]): SyncBody => ({
  id: crypto.randomUUID(),
  deviceId: DEVICE,
  kind: 'field_measure_send',
  ops: { rooms: r },
  baseVersionId: null,
  queuedAt: Date.UTC(2026, 10, 22, 15, 0, 0),
  photo: null,
});

const notes = async (projectId: string, userId: string) =>
  (
    await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.notification
      where project_id = ${projectId}::uuid and user_id = ${userId}::uuid
        and kind = 'field_measurements_received'`
  )[0]!.n;

// This file leaves due job rows in the queue, so it holds the shared job-queue lock for its whole run
// (test-harness/jobs/README.md): the unscoped sweep tests then never claim them.
let releaseJobQueue: (() => Promise<void>) | undefined;
beforeAll(async () => {
  releaseJobQueue = await holdJobQueueShared();
}, 180000);
afterAll(async () => {
  await releaseJobQueue?.();
});

describe('EZD-1419 sent rooms are read-only until the office reopens them', () => {
  let pA = '';
  let measurer: Who;
  let office: Who;
  let otherCo: Who;

  beforeAll(async () => {
    const tA = await createTenant();
    [pA] = await createProjects(tA, 1);
    measurer = await memberWith(tA, ['view_projects', 'send_field_measurement']);
    office = await memberWith(tA, ['view_projects', 'approve_field_measurements']);
    const tB = await createTenant();
    otherCo = await memberWith(tB, [
      'view_projects',
      'send_field_measurement',
      'approve_field_measurements',
    ]);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('rooms not sent yet: reopening answers not_sent and changes nothing', async () => {
    await saveFieldMeasure(db(measurer), pA, rooms());
    expect(await reopenFieldMeasure(db(office), pA)).toBe('not_sent');
    expect((await readFieldMeasure(db(office), pA))?.sentAt).toBeNull();
  });

  it('AC-EZD-1419-2: once sent, a save is refused and the sent rooms stay', async () => {
    expect(await syncFieldAction(db(measurer), pA, send(rooms()))).toMatchObject({
      ok: true,
      status: 'synced',
    });
    expect((await readFieldMeasure(db(measurer), pA))?.sentAt).not.toBeNull();
    await expect(saveFieldMeasure(db(measurer), pA, rooms(150))).rejects.toEqual(
      new FieldMeasureError('sent'),
    );
    expect((await readFieldMeasure(db(office), pA))?.rooms).toEqual(rooms());
  });

  it('without Approve field measurements the rooms cannot be reopened', async () => {
    await expect(reopenFieldMeasure(db(measurer), pA)).rejects.toEqual(
      new FieldMeasureError('permission_denied'),
    );
    expect((await readFieldMeasure(db(office), pA))?.sentAt).not.toBeNull();
  });

  it('another company can neither reopen nor see the sent rooms', async () => {
    await expect(reopenFieldMeasure(db(otherCo), pA)).rejects.toEqual(
      new FieldMeasureError('not_found'),
    );
    expect(await readFieldMeasure(db(otherCo), pA)).toBeNull();
    expect((await readFieldMeasure(db(office), pA))?.sentAt).not.toBeNull();
  });

  it('the office reopens: rooms kept, saves work again, a new send notifies the office again', async () => {
    expect(await notes(pA, office.appUserId)).toBe(1);
    expect(await reopenFieldMeasure(db(office), pA)).toBe('reopened');
    const open = await readFieldMeasure(db(measurer), pA);
    expect(open?.sentAt).toBeNull();
    expect(open?.rooms).toEqual(rooms());
    const [row] = await harnessSql()<{ sent_by: string | null; sent_change_id: string | null }[]>`
      select sent_by, sent_change_id from public.field_measure_session where project_id = ${pA}::uuid`;
    expect(row).toEqual({ sent_by: null, sent_change_id: null });

    await saveFieldMeasure(db(measurer), pA, rooms(150));
    expect((await readFieldMeasure(db(office), pA))?.rooms[1]?.lengths[0]).toBe(150);

    expect(await syncFieldAction(db(measurer), pA, send(rooms(150)))).toMatchObject({
      ok: true,
      status: 'synced',
    });
    expect((await readFieldMeasure(db(office), pA))?.sentAt).not.toBeNull();
    expect(await notes(pA, office.appUserId)).toBe(2);
    expect(await reopenFieldMeasure(db(office), pA)).toBe('reopened');
    expect(await reopenFieldMeasure(db(office), pA)).toBe('not_sent');
  });
});
