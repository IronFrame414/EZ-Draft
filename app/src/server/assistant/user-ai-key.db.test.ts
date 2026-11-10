// EZD-5601 T7-T10 (vault/plans/EZD-5601.md section 1 Data, section 3, section 4; AC-EZD-5601-4, -5, -7): the
// user_ai_key and ai_key_attempt tables and the *_my_ai_key / take_ai_key_attempt functions on the local
// stack. Expected values: 42501 for a caller that is not the owner of the ids or has no active membership,
// 22023 for a value that fails the column checks, 5 attempts per 15 minutes (AC-EZD-5601-7), and a key row
// that ends with its membership (AC-EZD-5601-5; Q-0637). Copied pattern:
// app/src/server/profile/my-profile-functions.db.test.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSION_KEYS } from '../../lib/permissions/catalog';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';

type KeyRow = {
  tenant_id: string | null;
  app_user_id: string | null;
  last4: string | null;
  secret_version: number | null;
  ciphertext: string | null;
};

const CIPHER = 'A'.repeat(48);

async function keyRows(appUserId: string) {
  return harnessSql()<{ last4: string; secret_version: number; ciphertext: string }[]>`
    select last4, secret_version, ciphertext from public.user_ai_key
    where app_user_id = ${appUserId}::uuid`;
}

async function getMine(s: Session): Promise<KeyRow[]> {
  const r = await s.serverDb.rpc('get_my_ai_key');
  expect(r.error).toBeNull();
  return r.data as KeyRow[];
}

describe('EZD-5601 user AI key tables and functions', () => {
  describeTenantIsolation('user_ai_key', {
    apiAccess: 'none',
    makeRow: (tenantId, ctx) => ({
      tenant_id: tenantId,
      app_user_id: ctx.member.appUserId,
      ciphertext: 'A'.repeat(48),
      secret_version: 1,
      last4: 'abcd',
    }),
  });
  describeTenantIsolation('ai_key_attempt', {
    apiAccess: 'none',
    makeRow: (tenantId, ctx) => ({ tenant_id: tenantId, app_user_id: ctx.member.appUserId }),
  });

  describe('functions', () => {
    let tenant = '';
    let m: Member;
    let c: Member;
    let o: Member;
    let sm: Session;
    let sc: Session;
    let so: Session;

    beforeAll(async () => {
      tenant = await createTenant();
      m = await createMember({ tenantId: tenant, scope: 'all' });
      c = await createMember({ tenantId: tenant, scope: 'all' });
      o = await createMember({ tenantId: tenant, scope: 'all' });
      await setPermissions(tenant, o.membershipId, PERMISSION_KEYS);
      sm = await signIn(m.email);
      sc = await signIn(c.email);
      so = await signIn(o.email);
    }, 120000);

    afterAll(async () => {
      await cleanup();
      await closeHarness();
    });

    const save = (
      s: Session,
      args: {
        tenant?: string | null;
        user?: string | null;
        ciphertext?: string | null;
        version?: number | null;
        last4?: string | null;
      } = {},
    ) =>
      s.serverDb.rpc('save_my_ai_key', {
        p_tenant_id: args.tenant === undefined ? tenant : args.tenant,
        p_app_user_id: args.user === undefined ? m.appUserId : args.user,
        p_ciphertext: args.ciphertext === undefined ? CIPHER : args.ciphertext,
        p_secret_version: args.version === undefined ? 1 : args.version,
        p_last4: args.last4 === undefined ? 'abcd' : args.last4,
      });

    it('T8 the owner of the ids saves and reads; a colleague and the Owner get nothing and change nothing; values are checked', async () => {
      const saved = await save(sm);
      expect(saved.error).toBeNull();
      expect(await getMine(sm)).toEqual([
        {
          tenant_id: tenant,
          app_user_id: m.appUserId,
          last4: 'abcd',
          secret_version: 1,
          ciphertext: CIPHER,
        },
      ]);

      for (const [who, s] of [
        [c, sc],
        [o, so],
      ] as const) {
        expect(await getMine(s), who.email).toEqual([
          {
            tenant_id: tenant,
            app_user_id: who.appUserId,
            last4: null,
            secret_version: null,
            ciphertext: null,
          },
        ]);
        const forged = await save(s);
        expect(forged.error?.code, who.email).toBe('42501');
        const theirDelete = await s.serverDb.rpc('delete_my_ai_key');
        expect(theirDelete.error, who.email).toBeNull();
        expect(theirDelete.data, who.email).toEqual([{ deleted: false, last4: null }]);
      }
      expect(await keyRows(m.appUserId)).toEqual([
        { last4: 'abcd', secret_version: 1, ciphertext: CIPHER },
      ]);

      for (const s of [sm, sc, so]) {
        for (const table of ['user_ai_key', 'ai_key_attempt']) {
          const r = await s.serverDb.from(table).select('*');
          expect(r.error?.code, table).toBe('42501');
        }
      }

      const wrongTenant = await save(sm, { tenant: await createTenant() });
      expect(wrongTenant.error?.code).toBe('42501');

      const bad: Array<[string, Parameters<typeof save>[1]]> = [
        ['39 characters', { ciphertext: 'A'.repeat(39) }],
        ['513 characters', { ciphertext: 'A'.repeat(513) }],
        ['not base64', { ciphertext: 'not base64!' }],
        ['null ciphertext', { ciphertext: null }],
        ['version 0', { version: 0 }],
        ['version 1000000', { version: 1000000 }],
        ['last4 abc', { last4: 'abc' }],
        ['last4 with a space', { last4: 'ab d' }],
        ['last4 abcde', { last4: 'abcde' }],
      ];
      for (const [name, args] of bad) {
        const r = await save(sm, args);
        expect(r.error?.code, name).toBe('22023');
      }
      expect(await keyRows(m.appUserId)).toEqual([
        { last4: 'abcd', secret_version: 1, ciphertext: CIPHER },
      ]);

      for (const args of [
        { ciphertext: 'B'.repeat(40) },
        { ciphertext: 'C'.repeat(512) },
        { version: 999999 },
      ]) {
        const r = await save(sm, args);
        expect(r.error, JSON.stringify(args).slice(0, 40)).toBeNull();
      }

      const first = await sm.serverDb.rpc('delete_my_ai_key');
      expect(first.error).toBeNull();
      expect(first.data).toEqual([{ deleted: true, last4: 'abcd' }]);
      const second = await sm.serverDb.rpc('delete_my_ai_key');
      expect(second.data).toEqual([{ deleted: false, last4: null }]);
      expect(await keyRows(m.appUserId)).toEqual([]);
    }, 120000);

    it('T9 take_ai_key_attempt allows 5 in 15 minutes per user and forgets older ones', async () => {
      const results: boolean[] = [];
      for (let i = 0; i < 6; i++) {
        const r = await sm.serverDb.rpc('take_ai_key_attempt');
        expect(r.error).toBeNull();
        results.push(r.data as boolean);
      }
      expect(results).toEqual([true, true, true, true, true, false]);

      const other = await sc.serverDb.rpc('take_ai_key_attempt');
      expect(other.data).toBe(true);

      await harnessSql()`
        update public.ai_key_attempt set at = now() - interval '16 minutes'
        where app_user_id = ${m.appUserId}::uuid`;
      const again = await sm.serverDb.rpc('take_ai_key_attempt');
      expect(again.data).toBe(true);
    }, 60000);

    it('T10 a key ends with its membership: deactivated, deleted, or moved to another company', async () => {
      const withKey = async () => {
        const member = await createMember({ tenantId: tenant, scope: 'all' });
        const s = await signIn(member.email);
        const r = await save(s, { user: member.appUserId });
        expect(r.error).toBeNull();
        expect(await keyRows(member.appUserId)).toHaveLength(1);
        return member;
      };

      const a = await withKey();
      await harnessSql()`
        update public.membership set status = 'deactivated' where id = ${a.membershipId}::uuid`;
      expect(await keyRows(a.appUserId)).toEqual([]);

      const b = await withKey();
      await harnessSql()`delete from public.membership where id = ${b.membershipId}::uuid`;
      expect(await keyRows(b.appUserId)).toEqual([]);

      const cMember = await withKey();
      await harnessSql()`
        update public.membership set status = 'deactivated' where id = ${cMember.membershipId}::uuid`;
      const moved = await adminDb()
        .from('membership')
        .insert({
          tenant_id: await createTenant(),
          user_id: cMember.appUserId,
          status: 'active',
          scope: 'all',
        });
      expect(moved.error).toBeNull();
      const again = await signIn(cMember.email);
      const rows = await getMine(again);
      expect(rows).toHaveLength(1);
      expect(rows[0].last4).toBeNull();
      expect(await keyRows(cMember.appUserId)).toEqual([]);
    }, 120000);
  });
});
