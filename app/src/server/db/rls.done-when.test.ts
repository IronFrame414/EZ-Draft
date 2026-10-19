// EZD-006 T1-T3 (vault/plans/EZD-006.md Tests): the ticket's Done when. Expected values: ticket Done when
// (phase-00 EZD-006), phase-00 Build gate, plan Steps 3-5; error codes are SQLSTATE (42501 = privilege /
// RLS WITH CHECK / session_ended). Every member request goes through serverDb (gate header sent), so
// these test RLS and grants as the independent backstop (Q-0087).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JOSH_USER_ID, TENANT_1_ID } from '../../../test-utils/seed-ids';
import {
  adminDb,
  asClaims,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  sessionCount,
  signIn,
  sortedIds,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';

const PRIVILEGE = '42501';

describe('EZD-006 done when', () => {
  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  describe('T1 cross-tenant reads and writes', () => {
    let tenantA: string;
    let tenantB: string;
    let a1: string;
    let b1: string;
    let a: Member;
    let b: Member;
    let s: Session;
    let a1Name: string;

    beforeAll(async () => {
      tenantA = await createTenant();
      tenantB = await createTenant();
      [a1] = await createProjects(tenantA, 2);
      [b1] = await createProjects(tenantB, 1);
      a = await createMember({ tenantId: tenantA, scope: 'all' });
      b = await createMember({ tenantId: tenantB, scope: 'all' });
      s = await signIn(b.email);
      const { data } = await adminDb().from('project').select('name').eq('id', a1).single();
      a1Name = (data as { name: string }).name;
    });

    it('EZD-006 done when: tenant B user gets zero rows from tenant A @smoke', async () => {
      const project = await s.serverDb.from('project').select('id');
      expect(project.error).toBeNull();
      expect(sortedIds(project.data)).toEqual([b1]);

      const tenant = await s.serverDb.from('tenant').select('id');
      expect(tenant.error).toBeNull();
      expect(sortedIds(tenant.data)).toEqual([tenantB]);

      const membership = await s.serverDb.from('membership').select('id');
      expect(membership.error).toBeNull();
      expect(sortedIds(membership.data)).toEqual([b.membershipId]);

      const mp = await s.serverDb.from('membership_project').select('*');
      expect(mp.error).toBeNull();
      expect(mp.data).toEqual([]);

      const users = await s.serverDb.from('app_user').select('id');
      expect(users.error).toBeNull();
      expect(sortedIds(users.data)).toEqual([b.appUserId]);

      const filtered = [
        s.serverDb.from('project').select('id').eq('tenant_id', tenantA),
        s.serverDb.from('tenant').select('id').eq('id', tenantA),
        s.serverDb.from('tenant').select('id').eq('id', TENANT_1_ID),
        s.serverDb.from('app_user').select('id').eq('id', JOSH_USER_ID),
        s.serverDb.from('app_user').select('id').eq('id', a.appUserId),
        s.serverDb.from('membership').select('id').eq('tenant_id', TENANT_1_ID),
      ];
      for (const q of filtered) {
        const r = await q;
        expect(r.error).toBeNull();
        expect(r.data).toEqual([]);
      }

      const update = await s.serverDb
        .from('project')
        .update({ name: 'changed by B' })
        .eq('id', a1)
        .select('id');
      expect(update.error).toBeNull();
      expect(update.data).toEqual([]);

      const del = await s.serverDb.from('project').delete().eq('id', a1).select('id');
      expect(del.error).toBeNull();
      expect(del.data).toEqual([]);

      const reread = await adminDb().from('project').select('name').eq('id', a1).single();
      expect(reread.error).toBeNull();
      expect((reread.data as { name: string }).name).toBe(a1Name);

      const insert = await s.serverDb
        .from('project')
        .insert({ tenant_id: tenantA, name: 'B into A', address: '1 Test St', type: 'kitchen' });
      expect(insert.error?.code).toBe(PRIVILEGE);
    });
  });

  describe('T2 scoped user sees only listed projects', () => {
    let tenantA: string;
    let p1: string;
    let p2: string;
    let p3: string;
    let otherProject: string;
    let scoped: Session;
    let all: Session;
    let p2Name: string;

    beforeAll(async () => {
      tenantA = await createTenant();
      [p1, p2, p3] = await createProjects(tenantA, 3);
      const other = await createTenant();
      [otherProject] = await createProjects(other, 1);
      const sMember = await createMember({ tenantId: tenantA, scope: 'listed', listed: [p1, p3] });
      const oMember = await createMember({ tenantId: tenantA, scope: 'all' });
      scoped = await signIn(sMember.email);
      all = await signIn(oMember.email);
      const { data } = await adminDb().from('project').select('name').eq('id', p2).single();
      p2Name = (data as { name: string }).name;
    });

    it('EZD-006 done when: a scoped user sees only listed projects', async () => {
      const mine = await scoped.serverDb.from('project').select('id');
      expect(mine.error).toBeNull();
      expect(sortedIds(mine.data)).toEqual([p1, p3].sort());

      const hidden = await scoped.serverDb.from('project').select('id').eq('id', p2);
      expect(hidden.error).toBeNull();
      expect(hidden.data).toEqual([]);

      const listed = await scoped.serverDb.from('membership_project').select('project_id');
      expect(listed.error).toBeNull();
      expect((listed.data ?? []).map((r) => r.project_id).sort()).toEqual([p1, p3].sort());

      const update = await scoped.serverDb
        .from('project')
        .update({ name: 'changed by scoped' })
        .eq('id', p2)
        .select('id');
      expect(update.error).toBeNull();
      expect(update.data).toEqual([]);
      const reread = await adminDb().from('project').select('name').eq('id', p2).single();
      expect((reread.data as { name: string }).name).toBe(p2Name);

      const everything = await all.serverDb.from('project').select('id');
      expect(everything.error).toBeNull();
      expect(sortedIds(everything.data)).toEqual([p1, p2, p3].sort());

      const seen = await asClaims(scoped.accessToken, async (tx) => {
        const rows = await tx<{ ok: boolean }[]>`
          select private.can_see_project(${p1}::uuid) as ok
          union all select private.can_see_project(${p2}::uuid)
          union all select private.can_see_project(${otherProject}::uuid)`;
        return rows.map((r) => r.ok);
      });
      expect(seen).toEqual([true, false, false]);
    });
  });

  describe('T3 deactivated user', () => {
    let p1: string;
    let d: Member;
    let s: Session;

    beforeAll(async () => {
      const tenantA = await createTenant();
      [p1] = await createProjects(tenantA, 1);
      d = await createMember({ tenantId: tenantA, scope: 'all' });
      s = await signIn(d.email);
    });

    it("EZD-006 done when: a deactivated user's next request is refused", async () => {
      const before = await s.serverDb.from('project').select('id');
      expect(before.error).toBeNull();
      expect(sortedIds(before.data)).toEqual([p1]);

      const deactivate = await adminDb()
        .from('membership')
        .update({ status: 'deactivated' })
        .eq('id', d.membershipId);
      expect(deactivate.error).toBeNull();

      const after = await s.serverDb.from('project').select('id');
      expect(after.error?.code).toBe(PRIVILEGE);
      expect(after.data).toBeNull();

      const user = await s.browserDb.auth.getUser(s.accessToken);
      expect(user.error).not.toBeNull();
      expect(user.data.user).toBeNull();

      const refreshed = await s.browserDb.auth.refreshSession({ refresh_token: s.refreshToken });
      expect(refreshed.error).not.toBeNull();

      expect(await sessionCount(d.authUserId)).toBe(0);
    });
  });
});
