// EZD-105b database tests (AC-EZD-105b-1, -3, -4). Expected values: Q-0096 P4 (an Owner sets the password; no
// settings_users needed), P7 (signed out on every device); Q-0731 (a) (active members with a confirmed account
// only; never another Owner or a settings_users holder, never yourself, never one with a membership in another
// company); Q-0695 decisions 10 row 59 (the one exception to settings_users) and 03 row 33 (one event_log row in
// the same transaction as the change). 203.0.113.7 is a documentation address (RFC 5737).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMembership,
  cleanupTestMembers,
  createTestMember,
  createUnconfirmedPasswordUser,
  randomPassword,
} from '../../../test-harness/auth-users';
import { withRollback, type TransactionSql } from '../../../test-harness/rls/db';
import {
  adminDb,
  claimsOf,
  cleanup,
  closeHarness,
  createTenant,
  harnessSql,
  sessionCount,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { addUser, PRESET_KEYS } from '../../../test-harness/users/fixtures';
import { PERMISSION_KEYS } from '../../lib/permissions/catalog';

type RpcResult = { data: unknown; error: { code: string; message: string } | null };
type Row = { membershipId: string; canSetPassword: boolean };

const ALL = [...PERMISSION_KEYS];
const target = (s: Session, id: string): Promise<RpcResult> =>
  s.serverDb.rpc('owner_password_target', { p_membership_id: id }) as unknown as Promise<RpcResult>;
const record = (s: Session, id: string, ip: string | null): Promise<RpcResult> =>
  s.serverDb.rpc('record_member_password_set', {
    p_membership_id: id,
    p_ip: ip,
  }) as unknown as Promise<RpcResult>;

async function customRole(tenant: string, name: string, keys: readonly string[]): Promise<string> {
  const { data, error } = await adminDb()
    .from('role')
    .insert({ tenant_id: tenant, name, default_permissions: keys })
    .select('id')
    .single();
  if (error || !data) throw new Error(`role insert failed: ${error?.message}`);
  return data.id as string;
}

async function logRows(objectId: string) {
  return harnessSql()<
    {
      tenant_id: string;
      actor_app_user_id: string;
      action: string;
      object_type: string;
      details: unknown;
      ip: string | null;
    }[]
  >`select tenant_id, actor_app_user_id, action, object_type, details, host(ip) as ip
    from public.event_log where object_id = ${objectId}::uuid order by at, id`;
}

async function codeOf(tx: TransactionSql, run: (sp: TransactionSql) => Promise<unknown>) {
  try {
    await tx.savepoint(async (sp) => {
      await run(sp);
    });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

describe('EZD-105b Owner-set password database functions', () => {
  let a: string;
  let b: string;
  let tenantAName: string;
  let O: Member, D: Member, F: Member, I: Member, X: Member, O2: Member, O3: Member;
  let S: Member, H: Member, C37: Member, M: Member, Y: Member;
  let N: { membershipId: string };
  let U: { membershipId: string };
  let so: Session;

  beforeAll(async () => {
    a = await createTenant();
    b = await createTenant();
    await harnessSql()`update public.tenant set contact = '{"email": "office@example.test"}'::jsonb
      where id = ${a}::uuid`;
    tenantAName = (await harnessSql()<{ name: string }[]>`
      select name from public.tenant where id = ${a}::uuid`)[0].name;
    O = await addUser(a, { preset: 'owner', name: 'Zed Owner' });
    D = await addUser(a, { preset: 'designer', name: 'Ann Lee' });
    F = await addUser(a, { preset: 'foreman' });
    I = await addUser(a, { preset: 'crew', status: 'invited' });
    X = await addUser(a, { preset: 'designer', status: 'deactivated' });
    O2 = await addUser(a, { preset: 'owner' });
    O3 = await addUser(a, { preset: 'owner', granted: ALL.filter((k) => k !== 'settings_users') });
    S = await addUser(a, { preset: 'designer', granted: [...PRESET_KEYS.designer, 'settings_users'] });
    H = await addUser(a, {
      customRoleId: await customRole(a, 'Office lead', ['settings_users']),
      granted: ['settings_users'],
    });
    C37 = await addUser(a, { customRoleId: await customRole(a, 'Full custom', ALL), granted: ALL });
    N = await createTestMember({ tenantId: a, status: 'active' });
    const u = await createTestMember({ tenantId: a, status: 'active' });
    const { authUserId } = await createUnconfirmedPasswordUser(u.email, await randomPassword(u.email));
    await adminDb().from('app_user').update({ auth_user_id: authUserId }).eq('id', u.appUserId);
    U = u;
    M = await addUser(a, { preset: 'designer' });
    await addMembership({ appUserId: M.appUserId, tenantId: b, status: 'invited' });
    Y = await addUser(b, { preset: 'designer' });
    so = await signIn(O.email);
  });

  afterAll(async () => {
    await cleanupTestMembers();
    await cleanup();
    await closeHarness();
  });

  it('D1 target refusals: only active, confirmed, non-admin members of this company only', async () => {
    for (const m of [D, F]) {
      const r = await target(so, m.membershipId);
      expect(r.error).toBeNull();
      expect(r.data).toEqual({ authUserId: m.authUserId, email: m.email });
    }
    for (const id of [O, I, X, O2, O3, H, C37, M, S].map((m) => m.membershipId).concat(
      N.membershipId,
      U.membershipId,
    )) {
      const r = await target(so, id);
      expect(r.error?.code, id).toBe('P0001');
      expect(r.error?.message, id).toBe('password_target_refused');
    }
    for (const id of [Y.membershipId, randomUUID()]) {
      const r = await target(so, id);
      expect(r.error?.code).toBe('P0002');
      expect(r.error?.message).toBe('user_not_found');
    }
  });

  it('D2 callers: the Owner preset decides, not a permission switch', async () => {
    for (const caller of [S, C37]) {
      const r = await target(await signIn(caller.email), D.membershipId);
      expect(r.error?.code).toBe('42501');
      expect(r.error?.message).toBe('permission_denied');
    }
    const r = await target(await signIn(O3.email), D.membershipId);
    expect(r.error).toBeNull();
    expect(r.data).toEqual({ authUserId: D.authUserId, email: D.email });
  });

  it('D3 record ends every session of the member and writes one event_log row', async () => {
    await signIn(D.email);
    await signIn(D.email);
    expect(await sessionCount(D.authUserId)).toBeGreaterThanOrEqual(2);
    const r = await record(so, D.membershipId, '203.0.113.7');
    expect(r.error).toBeNull();
    expect(r.data).toEqual({
      tenantId: a,
      appUserId: D.appUserId,
      memberEmail: D.email,
      memberName: 'Ann Lee',
      actorLabel: 'Zed Owner',
      actorEmail: O.email,
      companyName: tenantAName,
      companyReplyTo: 'office@example.test',
    });
    expect(await sessionCount(D.authUserId)).toBe(0);
    expect(await sessionCount(O.authUserId)).toBeGreaterThanOrEqual(1);
    expect(await logRows(D.membershipId)).toEqual([
      {
        tenant_id: a,
        actor_app_user_id: O.appUserId,
        action: 'user.password_set',
        object_type: 'membership',
        details: { membershipId: D.membershipId, appUserId: D.appUserId },
        ip: '203.0.113.7',
      },
    ]);
  });

  it('D4 record: a refused caller changes nothing; a failed log write keeps the sessions', async () => {
    await signIn(F.email);
    const before = await sessionCount(F.authUserId);
    expect(before).toBeGreaterThanOrEqual(1);
    const r = await record(await signIn(S.email), F.membershipId, null);
    expect(r.error?.code).toBe('42501');
    expect(await sessionCount(F.authUserId)).toBe(before);
    expect(await logRows(F.membershipId)).toEqual([]);

    const claims = JSON.stringify(claimsOf(so.accessToken));
    await withRollback(harnessSql(), async (tx) => {
      await tx.unsafe(`create function private.ezd105b_fail_log() returns trigger language plpgsql as $$
        begin raise exception 'ezd105b_log_fail'; end $$`);
      await tx.unsafe(`create trigger ezd105b_fail_log before insert on public.event_log for each row
        when (new.object_id = '${F.membershipId}') execute function private.ezd105b_fail_log()`);
      const count = async () =>
        (await tx<{ n: number }[]>`select count(*)::int as n from auth.sessions
          where user_id = ${F.authUserId}::uuid`)[0].n;
      const was = await count();
      expect(was).toBeGreaterThanOrEqual(1);
      const message = await codeOf(tx, async (sp) => {
        await sp.unsafe('set local role authenticated');
        await sp`select set_config('request.jwt.claims', ${claims}, true)`;
        await sp`select public.record_member_password_set(${F.membershipId}::uuid, null)`;
      });
      expect(message).toContain('ezd105b_log_fail');
      await tx.unsafe('reset role');
      expect(await count()).toBe(was);
    });
  });

  it('D5 list_users canSetPassword is the same rule', async () => {
    const rowsOf = async (s: Session) => {
      const r = (await s.serverDb.rpc('list_users', { p_search: '', p_page: 1 })) as RpcResult;
      expect(r.error).toBeNull();
      return new Map(
        (r.data as { rows: Row[] }).rows.map((row) => [row.membershipId, row.canSetPassword]),
      );
    };
    const owner = await rowsOf(await signIn(O.email));
    expect(owner.get(D.membershipId)).toBe(true);
    expect(owner.get(F.membershipId)).toBe(true);
    for (const m of [O, O2, O3, H, C37, I, M, S, X]) expect(owner.get(m.membershipId)).toBe(false);
    expect(owner.get(N.membershipId)).toBe(false);
    expect(owner.get(U.membershipId)).toBe(false);
    const holder = await rowsOf(await signIn(S.email));
    expect(holder.size).toBeGreaterThan(0);
    for (const v of holder.values()) expect(v).toBe(false);
  });

  it('D6 grants: authenticated only', async () => {
    for (const fn of [
      'private.owner_password_refusal(uuid)',
      'public.owner_password_target(uuid)',
      'public.record_member_password_set(uuid, inet)',
    ]) {
      const rows = await harnessSql()<{ anon: boolean; auth: boolean; svc: boolean }[]>`
        select has_function_privilege('anon', ${fn}, 'execute') as anon,
          has_function_privilege('authenticated', ${fn}, 'execute') as auth,
          has_function_privilege('service_role', ${fn}, 'execute') as svc`;
      expect(rows[0], fn).toEqual({ anon: false, auth: true, svc: false });
    }
  });
});
