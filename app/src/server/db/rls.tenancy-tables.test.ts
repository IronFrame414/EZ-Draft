// EZD-006 T11-T14 (vault/plans/EZD-006.md Tests): the isolation helper on the five tenancy tables, the
// read-only grants for members (Step 5) and anonymous access (Step 5; EZD-004 Step 2: health stays
// public). Required project columns come from EZD-005's migration (name, address, type).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminDb,
  anonDb,
  cleanup,
  closeHarness,
  createAppUser,
  createMember,
  createProjects,
  createTenant,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';

const PRIVILEGE = '42501';
const TABLES = ['tenant', 'app_user', 'membership', 'membership_project', 'project'];

describe('EZD-006 tenancy tables', () => {
  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  describe('T11 isolation helper on project', () => {
    describeTenantIsolation('project', {
      makeRow: (t) => ({ tenant_id: t, name: 'x', address: 'y', type: 'kitchen' }),
      update: { name: 'changed' },
    });
  });

  describe('T12 isolation on the read-only tenancy tables', () => {
    describeTenantIsolation('membership', {
      makeRow: (t, ctx) => ({
        tenant_id: t,
        user_id: ctx.spareAppUserId,
        status: 'invited',
        scope: 'listed',
      }),
      update: { scope: 'all' },
    });
    describeTenantIsolation('membership_project', {
      makeRow: (t, ctx) => ({
        tenant_id: t,
        membership_id: ctx.member.membershipId,
        project_id: ctx.projectIds[0],
      }),
    });

    describe('exempt tables: tenant and app_user', () => {
      let tenantA: string;
      let aOnly: Member;
      let b: Session;

      beforeAll(async () => {
        tenantA = await createTenant();
        const tenantB = await createTenant();
        aOnly = await createMember({ tenantId: tenantA, scope: 'all' });
        const memberB = await createMember({ tenantId: tenantB, scope: 'all' });
        b = await signIn(memberB.email);
      });

      it("another tenant's member reads neither the tenant row nor its user", async () => {
        const tenant = await b.serverDb.from('tenant').select('id').eq('id', tenantA);
        expect(tenant.error).toBeNull();
        expect(tenant.data).toEqual([]);
        const user = await b.serverDb.from('app_user').select('id').eq('id', aOnly.appUserId);
        expect(user.error).toBeNull();
        expect(user.data).toEqual([]);
      });
    });
  });

  describe('T13 tenancy tables are read-only to members', () => {
    let tenantA: string;
    let p1: string;
    let o: Member;
    let s: Session;
    let spareUserId: string;

    beforeAll(async () => {
      tenantA = await createTenant();
      [p1] = await createProjects(tenantA, 1);
      o = await createMember({ tenantId: tenantA, scope: 'all' });
      s = await signIn(o.email);
      spareUserId = (await createAppUser()).appUserId;
    });

    it('every write to tenant, app_user, membership and membership_project is refused', async () => {
      const before = {
        membership: (
          await adminDb().from('membership').select('*').eq('id', o.membershipId).single()
        ).data,
        tenant: (await adminDb().from('tenant').select('*').eq('id', tenantA).single()).data,
        appUser: (await adminDb().from('app_user').select('*').eq('id', o.appUserId).single()).data,
      };

      const attempts = [
        s.serverDb.from('membership').update({ scope: 'all' }).eq('id', o.membershipId),
        s.serverDb.from('membership').update({ status: 'invited' }).eq('id', o.membershipId),
        s.serverDb
          .from('membership_project')
          .insert({ tenant_id: tenantA, membership_id: o.membershipId, project_id: p1 }),
        s.serverDb.from('tenant').update({ name: 'renamed by member' }).eq('id', tenantA),
        s.serverDb.from('app_user').update({ language: 'es' }).eq('id', o.appUserId),
        s.serverDb
          .from('membership')
          .insert({ tenant_id: tenantA, user_id: spareUserId, status: 'active', scope: 'all' }),
      ];
      for (const attempt of attempts) {
        const r = await attempt;
        expect(r.error?.code).toBe(PRIVILEGE);
      }

      const after = {
        membership: (
          await adminDb().from('membership').select('*').eq('id', o.membershipId).single()
        ).data,
        tenant: (await adminDb().from('tenant').select('*').eq('id', tenantA).single()).data,
        appUser: (await adminDb().from('app_user').select('*').eq('id', o.appUserId).single()).data,
      };
      expect(after).toEqual(before);
      const listed = await adminDb()
        .from('membership_project')
        .select('*')
        .eq('membership_id', o.membershipId);
      expect(listed.data).toEqual([]);
      const memberships = await adminDb().from('membership').select('id').eq('tenant_id', tenantA);
      expect((memberships.data ?? []).map((r) => r.id)).toEqual([o.membershipId]);
    });
  });

  describe('T14 anonymous reads nothing', () => {
    it('anon with the gate header gets 42501 on every table; health still answers', async () => {
      const anon = anonDb({ gate: true });
      for (const table of TABLES) {
        const r = await anon.from(table).select('*');
        expect(r.error?.code, table).toBe(PRIVILEGE);
      }
      const health = await anon.rpc('health');
      expect(health.error).toBeNull();
      const rows = health.data as { status: string }[];
      expect(rows[0].status).toBe('ok');
    });
  });
});
