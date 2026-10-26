// EZD-165 (vault/plans/EZD-165.md section 4; AC-EZD-165-1): membership end-sessions on user and company
// changes. A change of user_id ends the sessions of the old and the new person; a change of tenant_id
// ends the person's sessions; a change that is not narrowing keeps them (Q-0044 (b): invite acceptance
// keeps the session). 42501 is what private.tenant_id() raises for a dead session (EZD-006 Step 3).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createAppUser,
  createMember,
  createProjects,
  createTenant,
  sessionCount,
  signIn,
  sortedIds,
} from '../../../test-harness/rls/fixtures';

const PRIVILEGE = '42501';

describe('EZD-165 membership end-sessions on user and company changes', () => {
  let tenantA: string;
  let tenantB: string;
  let p1: string;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    [p1] = await createProjects(tenantA, 1);
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('T1 user_id change ends the old and the new person’s sessions', async () => {
    const a = await createMember({ tenantId: tenantA, scope: 'all' });
    const b = await createAppUser();
    const k = await createMember({ tenantId: tenantA, scope: 'all' });
    const sa = await signIn(a.email);
    await signIn(b.email);
    const sk = await signIn(k.email);
    expect(await sessionCount(a.authUserId)).toBe(1);
    expect(await sessionCount(b.authUserId)).toBe(1);
    expect(await sessionCount(k.authUserId)).toBe(1);

    const moved = await adminDb()
      .from('membership')
      .update({ user_id: b.appUserId })
      .eq('id', a.membershipId);
    expect(moved.error).toBeNull();

    expect(await sessionCount(a.authUserId)).toBe(0);
    expect(await sessionCount(b.authUserId)).toBe(0);
    expect(await sessionCount(k.authUserId)).toBe(1);
    const afterA = await sa.serverDb.from('project').select('id');
    expect(afterA.error?.code).toBe(PRIVILEGE);
    const afterK = await sk.serverDb.from('project').select('id');
    expect(afterK.error).toBeNull();
    expect(sortedIds(afterK.data)).toEqual([p1]);
  });

  it('T2 tenant_id change ends the person’s sessions', async () => {
    const c = await createMember({ tenantId: tenantA, scope: 'all' });
    const sc = await signIn(c.email);
    expect(await sessionCount(c.authUserId)).toBe(1);

    const moved = await adminDb()
      .from('membership')
      .update({ tenant_id: tenantB })
      .eq('id', c.membershipId);
    expect(moved.error).toBeNull();

    expect(await sessionCount(c.authUserId)).toBe(0);
    const after = await sc.serverDb.from('project').select('id');
    expect(after.error?.code).toBe(PRIVILEGE);
  });

  it('T3 invite acceptance together with a company change still ends sessions', async () => {
    const d = await createMember({ tenantId: tenantA, scope: 'all', status: 'invited' });
    await signIn(d.email);
    expect(await sessionCount(d.authUserId)).toBe(1);

    const moved = await adminDb()
      .from('membership')
      .update({ status: 'active', tenant_id: tenantB })
      .eq('id', d.membershipId);
    expect(moved.error).toBeNull();

    expect(await sessionCount(d.authUserId)).toBe(0);
  });

  it('T4 controls: changes that are not narrowing keep sessions', async () => {
    const e = await createMember({ tenantId: tenantA, scope: 'all', status: 'invited' });
    await signIn(e.email);
    expect(await sessionCount(e.authUserId)).toBe(1);
    const accepted = await adminDb()
      .from('membership')
      .update({ status: 'active' })
      .eq('id', e.membershipId);
    expect(accepted.error).toBeNull();
    expect(await sessionCount(e.authUserId)).toBe(1);

    const f = await createMember({ tenantId: tenantA, scope: 'all' });
    await signIn(f.email);
    expect(await sessionCount(f.authUserId)).toBe(1);
    const seen = await adminDb()
      .from('membership')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', f.membershipId);
    expect(seen.error).toBeNull();
    expect(await sessionCount(f.authUserId)).toBe(1);

    const g = await createMember({ tenantId: tenantA, scope: 'all' });
    await signIn(g.email);
    expect(await sessionCount(g.authUserId)).toBe(1);
    const same = await adminDb()
      .from('membership')
      .update({ user_id: g.appUserId, tenant_id: tenantA })
      .eq('id', g.membershipId);
    expect(same.error).toBeNull();
    expect(await sessionCount(g.authUserId)).toBe(1);
  });

  it('EZD-165 done when: updating a membership’s user_id as service_role ends the old user’s sessions', async () => {
    const a = await createMember({ tenantId: tenantA, scope: 'all' });
    const b = await createAppUser();
    await signIn(a.email);
    expect(await sessionCount(a.authUserId)).toBe(1);

    const moved = await adminDb()
      .from('membership')
      .update({ user_id: b.appUserId })
      .eq('id', a.membershipId);
    expect(moved.error).toBeNull();

    expect(await sessionCount(a.authUserId)).toBe(0);
  });
});
