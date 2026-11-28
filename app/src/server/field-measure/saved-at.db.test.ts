// EZD-2002 (audit 2026-11-27 A2; AC-EZD-2002-2) on the local stack: the field measure page carries when its rooms
// were last saved, and a save answers the same time, so the phone can tell which copy of the rooms is newer. Null
// while nothing is saved; a later save answers a later time. Another company's member reads no project.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { DbClient } from '../storage/objects';
import { emptyRoom, initialRooms, withShape } from '../../field-measure/rooms';
import { readFieldMeasure, saveFieldMeasure } from './session';

const db = (s: Session) => s.serverDb as unknown as DbClient;

const ROOMS = [initialRooms()[0]!, withShape(emptyRoom('r1', 'room', 'Kitchen'), 'rectangle')];

describe('EZD-2002 field measure save time', () => {
  let pA = '';
  let sMeasurer: Session;
  let sB: Session;

  beforeAll(async () => {
    const tA = await createTenant();
    [pA] = await createProjects(tA, 1);
    const measurer = await createMember({ tenantId: tA, scope: 'all' });
    await setPermissions(tA, measurer.membershipId, ['view_projects', 'send_field_measurement']);
    sMeasurer = await signIn(measurer.email);
    const tB = await createTenant();
    const b = await createMember({ tenantId: tB, scope: 'all' });
    await setPermissions(tB, b.membershipId, ['view_projects']);
    sB = await signIn(b.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('null before the first save; each save answers the time the page then carries, later each time', async () => {
    expect((await readFieldMeasure(db(sMeasurer), pA))?.savedAt).toBeNull();
    const first = await saveFieldMeasure(db(sMeasurer), pA, ROOMS);
    expect(typeof first).toBe('string');
    expect((await readFieldMeasure(db(sMeasurer), pA))?.savedAt).toBe(first);
    const second = await saveFieldMeasure(db(sMeasurer), pA, [
      ROOMS[0]!,
      { ...ROOMS[1]!, name: 'Kitchen 2' },
    ]);
    expect(Date.parse(second!)).toBeGreaterThan(Date.parse(first!));
    expect((await readFieldMeasure(db(sMeasurer), pA))?.savedAt).toBe(second);
  });

  it("another company's member reads nothing of the project", async () => {
    expect(await readFieldMeasure(db(sB), pA)).toBeNull();
  });
});
