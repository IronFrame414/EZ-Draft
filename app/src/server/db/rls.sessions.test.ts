// EZD-006 T4-T6 (vault/plans/EZD-006.md Tests): session ending on status, scope, listed-project and
// membership changes (ticket Scope; 11 Operations; plan Step 4; Q-0044 (b): only narrowing changes end
// sessions). 42501 is what private.tenant_id() raises for a dead session (Step 3).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  sessionCount,
  signIn,
  sortedIds,
} from '../../../test-harness/rls/fixtures';

const PRIVILEGE = '42501';

describe('EZD-006 session ending', () => {
  let tenantA: string;
  let p1: string;
  let p2: string;
  let p3: string;

  beforeAll(async () => {
    tenantA = await createTenant();
    [p1, p2, p3] = await createProjects(tenantA, 3);
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('T4 a scope change ends sessions (all to listed, listed to all)', async () => {
    const u = await createMember({ tenantId: tenantA, scope: 'all' });
    const su = await signIn(u.email);
    const toListed = await adminDb()
      .from('membership')
      .update({ scope: 'listed' })
      .eq('id', u.membershipId);
    expect(toListed.error).toBeNull();
    const afterU = await su.serverDb.from('project').select('id');
    expect(afterU.error?.code).toBe(PRIVILEGE);
    expect(await sessionCount(u.authUserId)).toBe(0);

    const v = await createMember({ tenantId: tenantA, scope: 'listed', listed: [p1] });
    const sv = await signIn(v.email);
    const toAll = await adminDb()
      .from('membership')
      .update({ scope: 'all' })
      .eq('id', v.membershipId);
    expect(toAll.error).toBeNull();
    const afterV = await sv.serverDb.from('project').select('id');
    expect(afterV.error?.code).toBe(PRIVILEGE);
    expect(await sessionCount(v.authUserId)).toBe(0);
  });

  it('T5 removing a listed project ends sessions; adding one does not; moving one ends them', async () => {
    const w = await createMember({ tenantId: tenantA, scope: 'listed', listed: [p1, p2] });
    const sw = await signIn(w.email);
    const removal = await adminDb()
      .from('membership_project')
      .delete()
      .match({ membership_id: w.membershipId, project_id: p2 });
    expect(removal.error).toBeNull();
    const afterW = await sw.serverDb.from('project').select('id');
    expect(afterW.error?.code).toBe(PRIVILEGE);
    expect(await sessionCount(w.authUserId)).toBe(0);

    const x = await createMember({ tenantId: tenantA, scope: 'listed', listed: [p1] });
    const sx = await signIn(x.email);
    const addition = await adminDb()
      .from('membership_project')
      .insert({ tenant_id: tenantA, membership_id: x.membershipId, project_id: p2 });
    expect(addition.error).toBeNull();
    expect(await sessionCount(x.authUserId)).toBe(1);
    const afterX = await sx.serverDb.from('project').select('id');
    expect(afterX.error).toBeNull();
    expect(sortedIds(afterX.data)).toEqual([p1, p2].sort());

    const y = await createMember({ tenantId: tenantA, scope: 'listed', listed: [p1, p2] });
    const sy = await signIn(y.email);
    const moved = await adminDb()
      .from('membership_project')
      .update({ project_id: p3 })
      .match({ membership_id: y.membershipId, project_id: p2 });
    expect(moved.error).toBeNull();
    const afterY = await sy.serverDb.from('project').select('id');
    expect(afterY.error?.code).toBe(PRIVILEGE);
    expect(await sessionCount(y.authUserId)).toBe(0);
  });

  it('T6 removing a membership ends that person’s sessions; other members are untouched', async () => {
    const r = await createMember({ tenantId: tenantA, scope: 'all' });
    const k = await createMember({ tenantId: tenantA, scope: 'all' });
    await signIn(r.email);
    const sk = await signIn(k.email);
    const removal = await adminDb().from('membership').delete().eq('id', r.membershipId);
    expect(removal.error).toBeNull();
    expect(await sessionCount(r.authUserId)).toBe(0);
    expect(await sessionCount(k.authUserId)).toBe(1);
    const still = await sk.serverDb.from('project').select('id');
    expect(still.error).toBeNull();
    expect(sortedIds(still.data)).toEqual([p1, p2, p3].sort());
  });
});
