// EZD-1417 on the local stack (AC-EZD-1417-1 "Measured offline, sent on reconnect, office notified once"; S17b Send
// to office "Sends rooms to the project; office notified"; 07 field.measure_sent "office notified"; CLAUDE.md rule 4).
// A Send to office is a field_measure_send field action whose ops are { rooms } (EZD-1402). Expected values: once
// recorded, the project's field_measure_session holds the sent rooms with sent_at, sent_by and the action id; each
// office member (Approve field measurements, vault/build/assumptions.md EZD-1417) gets exactly one
// field_measurements_received notification for the project; the sender and members without the switch get none; a
// resend of the same action is `duplicate` and adds no notification; a second send of already sent rooms changes
// nothing and notifies no one; rooms that are not a room list are refused before anything is recorded (the route's schema check, then the database's); another
// company can neither send to this project nor read its sent state, and its members are never notified.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { fieldActionOpsValid, syncFieldAction, type SyncBody } from '../outbox/field-actions';
import type { DbClient } from '../storage/objects';
import { readFieldMeasure } from './session';

const DEVICE = '33333333-3333-4333-8333-333333333333';
const QUEUED_AT = Date.UTC(2026, 10, 21, 15, 0, 0);

type Who = { session: Session; appUserId: string };
const db = (w: Who) => w.session.serverDb as unknown as DbClient;

async function memberWith(tenant: string, permissions: string[]): Promise<Who> {
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return { session: await signIn(m.email), appUserId: m.appUserId };
}

// A 12' x 10' rectangle: walls A to D, 144", 120", 144", 120".
function rectangleRooms(): FieldRoom[] {
  const kitchen = withShape(emptyRoom('r1', 'room', 'Kitchen'), 'rectangle');
  return [initialRooms()[0]!, { ...kitchen, lengths: [144, 120, 144, 120], ceiling: 96 }];
}

const send = (rooms: unknown, id: string = crypto.randomUUID()): SyncBody => ({
  id,
  deviceId: DEVICE,
  kind: 'field_measure_send',
  ops: { rooms },
  baseVersionId: null,
  queuedAt: QUEUED_AT,
  photo: null,
});

const notes = async (projectId: string, userId: string) =>
  (
    await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.notification
      where project_id = ${projectId}::uuid and user_id = ${userId}::uuid
        and kind = 'field_measurements_received'`
  )[0]!.n;

describe('EZD-1417 Send to office', () => {
  let pA = '';
  let pA2 = '';
  let measurer: Who;
  let office: Who;
  let office2: Who;
  let viewer: Who;
  let otherCo: Who;

  beforeAll(async () => {
    const tA = await createTenant();
    [pA, pA2] = await createProjects(tA, 2);
    measurer = await memberWith(tA, [
      'view_projects',
      'send_field_measurement',
      'approve_field_measurements',
    ]);
    office = await memberWith(tA, ['view_projects', 'approve_field_measurements']);
    office2 = await memberWith(tA, ['view_projects', 'edit_model', 'approve_field_measurements']);
    viewer = await memberWith(tA, ['view_projects', 'edit_model']);
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

  it('a recorded send applies the rooms, marks them sent and notifies each office member once', async () => {
    const rooms = rectangleRooms();
    const action = send(rooms);
    const r = await syncFieldAction(db(measurer), pA, action);
    expect(r).toMatchObject({ ok: true, status: 'synced' });

    const view = await readFieldMeasure(db(viewer), pA);
    expect(view?.rooms).toEqual(rooms);
    expect(view?.sentAt).not.toBeNull();
    const [row] = await harnessSql()<{ sent_by: string; sent_change_id: string }[]>`
      select sent_by, sent_change_id from public.field_measure_session where project_id = ${pA}::uuid`;
    expect(row).toEqual({ sent_by: measurer.appUserId, sent_change_id: action.id });

    expect(await notes(pA, office.appUserId)).toBe(1);
    expect(await notes(pA, office2.appUserId)).toBe(1);
    // The sender holds the switch too but is never notified of their own send; no switch, no notification.
    expect(await notes(pA, measurer.appUserId)).toBe(0);
    expect(await notes(pA, viewer.appUserId)).toBe(0);
    expect(await notes(pA, otherCo.appUserId)).toBe(0);

    // The resend after a lost answer: duplicate, still one notification each.
    const again = await syncFieldAction(db(measurer), pA, action);
    expect(again).toMatchObject({ ok: true, status: 'duplicate' });
    expect(await notes(pA, office.appUserId)).toBe(1);
  });

  it('a second send of already sent rooms changes nothing and notifies no one again', async () => {
    const before = await readFieldMeasure(db(viewer), pA);
    const other = [initialRooms()[0]!];
    const r = await syncFieldAction(db(measurer), pA, send(other));
    expect(r).toMatchObject({ ok: true, status: 'synced' });
    const after = await readFieldMeasure(db(viewer), pA);
    expect(after?.rooms).toEqual(before?.rooms);
    expect(after?.sentAt).toBe(before?.sentAt);
    expect(await notes(pA, office.appUserId)).toBe(1);
  });

  it('rooms that are not a room list are refused and nothing is recorded or sent', async () => {
    // The route's check (fieldActionOpsValid) refuses a room that is not a room; the database refuses a send whose
    // rooms are not 1 to 40 objects.
    const notRoom = {
      kind: 'field_measure_send' as const,
      ops: { rooms: [{ id: 'x', kind: 'room' }] },
    };
    expect(fieldActionOpsValid(notRoom)).toBe(false);
    expect(
      fieldActionOpsValid({ kind: 'field_measure_send', ops: { rooms: rectangleRooms() } }),
    ).toBe(true);
    for (const rooms of [[], 'Kitchen', [1, 2]]) {
      const bad = send(rooms);
      expect(await syncFieldAction(db(measurer), pA2, bad)).toEqual({
        ok: false,
        code: 'invalid_input',
      });
      const rows = await harnessSql()<{ n: number }[]>`
        select count(*)::int as n from public.offline_change where id = ${bad.id}::uuid`;
      expect(rows[0]!.n).toBe(0);
    }
    expect((await readFieldMeasure(db(viewer), pA2))?.sentAt).toBeNull();
    expect(await notes(pA2, office.appUserId)).toBe(0);
  });

  it('another company can neither send to this project nor read its sent state', async () => {
    expect(await syncFieldAction(db(otherCo), pA2, send(rectangleRooms()))).toEqual({
      ok: false,
      code: 'project_not_found',
    });
    expect(await readFieldMeasure(db(otherCo), pA)).toBeNull();
    const direct = await otherCo.session.serverDb
      .from('field_measure_session')
      .select('sent_at, sent_by')
      .eq('project_id', pA);
    expect(direct.data ?? []).toEqual([]);
    expect(await notes(pA2, office.appUserId)).toBe(0);
  });

  it('a member cannot mark rooms sent directly', async () => {
    const { error } = await measurer.session.serverDb
      .from('field_measure_session')
      .update({ sent_at: null })
      .eq('project_id', pA)
      .select('id');
    expect(error === null || error.code === '42501').toBe(true);
    expect((await readFieldMeasure(db(viewer), pA))?.sentAt).not.toBeNull();
  });
});
