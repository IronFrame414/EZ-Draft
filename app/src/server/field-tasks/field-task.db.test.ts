// EZD-1408 on the local stack (03c field_task; S22 Permissions "View: View projects. Draft, edit ... publish:
// Edit field tasks"; S22 Decisions 2 "the office reviews before publishing"; CLAUDE.md rule 4: one company cannot
// read or change another company's field_task rows). Members read the rows of projects in their scope (policies
// never read permission rows, EZD-102: hiding drafts from crew is EZD-1409's and EZD-1420's read path); no member
// writes the table directly (the draft job writes with the secret key).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';

const task = (tenantId: string, projectId: string, status: string, text: string) => ({
  tenant_id: tenantId,
  project_id: projectId,
  room: 'Kitchen',
  phase: 'Demo',
  phase_position: 0,
  position: 0,
  text_en: text,
  status,
});

describe('EZD-1408 field_task', () => {
  let tA = '';
  let pA = '';
  let pOther = '';
  let sOffice: Session;
  let sCrew: Session;
  let sListed: Session;
  let sB: Session;

  beforeAll(async () => {
    tA = await createTenant();
    [pA, pOther] = await createProjects(tA, 2);
    const office = await createMember({ tenantId: tA, scope: 'all' });
    const crew = await createMember({ tenantId: tA, scope: 'all' });
    // Listed on the other project only.
    const listed = await createMember({ tenantId: tA, scope: 'listed', listed: [pOther] });
    await setPermissions(tA, office.membershipId, ['view_projects', 'edit_field_tasks']);
    await setPermissions(tA, crew.membershipId, ['view_projects', 'check_off_tasks']);
    await setPermissions(tA, listed.membershipId, ['view_projects', 'edit_field_tasks']);
    sOffice = await signIn(office.email);
    sCrew = await signIn(crew.email);
    sListed = await signIn(listed.email);
    const tB = await createTenant();
    const b = await createMember({ tenantId: tB, scope: 'all' });
    await setPermissions(tB, b.membershipId, ['view_projects', 'edit_field_tasks']);
    sB = await signIn(b.email);

    const { error } = await adminDb()
      .from('field_task')
      .insert([
        task(tA, pA, 'draft', 'Remove the base cabinets'),
        task(tA, pA, 'published', 'Cap the sink supply lines'),
      ]);
    expect(error).toBeNull();
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  const texts = async (s: Session, projectId: string) => {
    const { data, error } = await s.serverDb
      .from('field_task')
      .select('text_en')
      .eq('project_id', projectId)
      .order('text_en');
    expect(error).toBeNull();
    return (data ?? []).map((r: { text_en: string }) => r.text_en);
  };

  it('members in scope read the project rows', async () => {
    expect(await texts(sOffice, pA)).toEqual([
      'Cap the sink supply lines',
      'Remove the base cabinets',
    ]);
    expect(await texts(sCrew, pA)).toEqual([
      'Cap the sink supply lines',
      'Remove the base cabinets',
    ]);
  });

  it('a listed member sees nothing of a project outside their list', async () => {
    expect(await texts(sListed, pA)).toEqual([]);
  });

  it('another company reads none of the rows', async () => {
    expect(await texts(sB, pA)).toEqual([]);
  });

  it('a member cannot insert, update or delete rows directly', async () => {
    const ins = await sOffice.serverDb
      .from('field_task')
      .insert(task(tA, pA, 'draft', 'Sneaked in'));
    expect(ins.error?.code).toBe('42501');
    await sOffice.serverDb
      .from('field_task')
      .update({ status: 'published' })
      .eq('project_id', pA)
      .select('id');
    await sOffice.serverDb.from('field_task').delete().eq('project_id', pA).select('id');
    const { data } = await adminDb()
      .from('field_task')
      .select('text_en, status')
      .eq('project_id', pA)
      .order('text_en');
    expect(data).toEqual([
      { text_en: 'Cap the sink supply lines', status: 'published' },
      { text_en: 'Remove the base cabinets', status: 'draft' },
    ]);
  });

  it('the table refuses a status outside draft, published and done, and empty text', async () => {
    const bad = await adminDb()
      .from('field_task')
      .insert(task(tA, pA, 'archived', 'x'));
    expect(bad.error?.code).toBe('23514');
    const empty = await adminDb()
      .from('field_task')
      .insert(task(tA, pA, 'draft', ' '));
    expect(empty.error?.code).toBe('23514');
  });

  describeTenantIsolation('field_task', {
    makeRow: (t, ctx) => task(t, ctx.projectIds[0], 'published', 'Hang drywall'),
  });
});
