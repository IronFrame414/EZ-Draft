// EZD-1415 on the local stack (S17b Permissions "Send field measurement to create and send; View projects to view";
// CLAUDE.md rule 4: one company cannot read or change another company's field_measure_session rows). Rooms are
// written only through save_field_measure_session; a member's direct write is refused by RLS.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
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
import { FieldMeasureError, readFieldMeasure, saveFieldMeasure } from './session';

const db = (s: Session) => s.serverDb as unknown as DbClient;

const ROOMS = [initialRooms()[0]!, withShape(emptyRoom('r1', 'room', 'Kitchen'), 'l')];

describe('EZD-1415 field_measure_session', () => {
  let pA = '';
  let sMeasurer: Session;
  let sViewer: Session;
  let sB: Session;

  beforeAll(async () => {
    const tA = await createTenant();
    [pA] = await createProjects(tA, 1);
    const measurer = await createMember({ tenantId: tA, scope: 'all' });
    const viewer = await createMember({ tenantId: tA, scope: 'all' });
    await setPermissions(tA, measurer.membershipId, ['view_projects', 'send_field_measurement']);
    await setPermissions(tA, viewer.membershipId, ['view_projects']);
    sMeasurer = await signIn(measurer.email);
    sViewer = await signIn(viewer.email);
    const tB = await createTenant();
    const b = await createMember({ tenantId: tB, scope: 'all' });
    await setPermissions(tB, b.membershipId, ['view_projects', 'send_field_measurement']);
    sB = await signIn(b.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('Send field measurement saves the rooms; a View projects member reads them', async () => {
    await saveFieldMeasure(db(sMeasurer), pA, ROOMS);
    const view = await readFieldMeasure(db(sViewer), pA);
    expect(view?.rooms).toEqual(ROOMS);
    expect(view?.rooms[1]?.lengths).toHaveLength(6);
    // Saved again, the one row is replaced.
    const renamed = [ROOMS[0]!, { ...ROOMS[1]!, name: 'Kitchen 2' }];
    await saveFieldMeasure(db(sMeasurer), pA, renamed);
    expect((await readFieldMeasure(db(sViewer), pA))?.rooms[1]?.name).toBe('Kitchen 2');
  });

  it('without Send field measurement the save is refused (42501)', async () => {
    await expect(saveFieldMeasure(db(sViewer), pA, ROOMS)).rejects.toEqual(
      new FieldMeasureError('permission_denied'),
    );
  });

  it("another company can neither read nor save this project's rooms", async () => {
    expect(await readFieldMeasure(db(sB), pA)).toBeNull();
    await expect(saveFieldMeasure(db(sB), pA, ROOMS)).rejects.toEqual(
      new FieldMeasureError('not_found'),
    );
    const direct = await sB.serverDb.from('field_measure_session').select('id').eq('project_id', pA);
    expect(direct.data ?? []).toEqual([]);
  });

  it('a member cannot write the table directly', async () => {
    const { error } = await sMeasurer.serverDb
      .from('field_measure_session')
      .update({ rooms: [] })
      .eq('project_id', pA)
      .select('id');
    // RLS has no update policy: nothing is changed.
    expect(error === null || error.code === '42501').toBe(true);
    expect((await readFieldMeasure(db(sViewer), pA))?.rooms).toHaveLength(2);
  });

  describeTenantIsolation('field_measure_session', {
    makeRow: (t, ctx) => ({ tenant_id: t, project_id: ctx.projectIds[0], rooms: ROOMS }),
  });
});
