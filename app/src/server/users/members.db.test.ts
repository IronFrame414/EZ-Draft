// EZD-106 database tests (AC-EZD-106-1, -2, -6, -7, -8, -9). Expected values: 09n "Last settings_users holder"
// rows 1-5 (counted: active memberships with settings_users granted; only 1 to 0 is refused); Q-0695 decisions
// 10 rows 59 (every write needs settings_users; a holder edits any row, their own included, and grants any
// switch), 60 (trigger, per-company lock, recount, last_settings_users_holder), 62 (Deactivate ends sessions
// and keeps rows; Reactivate refused when active elsewhere; Remove deletes membership, switches, listed
// projects and the AI key, keeps app_user; sessions end only when the old status was active), 64 (a scope
// change ends an active member's sessions); 09n Status bar row 1 (deactivated listed, not counted).
// Calls go through the gated serverDb of `signIn` (the real API path); the two-at-once case uses two raw
// connections as `authenticated` with the members' claims.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminSql, type Sql } from '../../../test-harness/rls/db';
import {
  adminDb,
  claimsOf,
  cleanup,
  closeHarness,
  createProjects,
  createTenant,
  harnessSql,
  sessionCount,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { addUser, PRESET_KEYS, roleId } from '../../../test-harness/users/fixtures';
import { PERMISSION_KEYS, type PermissionKey } from '../../lib/permissions/catalog';

const HOLDER = 'last_settings_users_holder';
const ALL = [...PERMISSION_KEYS];
const without = (keys: readonly PermissionKey[], drop: PermissionKey) =>
  keys.filter((k) => k !== drop);
const sorted = (keys: readonly string[]) => [...keys].sort();

type RpcResult = { data: unknown; error: { code: string; message: string } | null };

const save = (
  s: Session,
  membershipId: string,
  roleIdValue: string,
  language: string,
  granted: readonly string[],
): Promise<RpcResult> =>
  s.serverDb.rpc('save_member', {
    p_membership_id: membershipId,
    p_role_id: roleIdValue,
    p_language: language,
    p_granted: granted,
  }) as unknown as Promise<RpcResult>;

const call = (
  s: Session,
  fn: 'deactivate_member' | 'reactivate_member' | 'remove_member',
  membershipId: string,
): Promise<RpcResult> =>
  s.serverDb.rpc(fn, { p_membership_id: membershipId }) as unknown as Promise<RpcResult>;

async function grantedOf(membershipId: string): Promise<string[]> {
  const rows = await harnessSql()<{ k: string }[]>`
    select permission_key as k from public.user_permission
    where membership_id = ${membershipId}::uuid and granted order by permission_key`;
  return rows.map((r) => r.k);
}

async function statusOf(membershipId: string): Promise<string | null> {
  const rows = await harnessSql()<{ status: string }[]>`
    select status from public.membership where id = ${membershipId}::uuid`;
  return rows[0]?.status ?? null;
}

async function holders(tenant: string): Promise<number> {
  const rows = await harnessSql()<{ n: number }[]>`
    select count(*)::int as n from public.membership m
    join public.user_permission up on up.membership_id = m.id
    where m.tenant_id = ${tenant}::uuid and m.status = 'active'
      and up.permission_key = 'settings_users' and up.granted`;
  return rows[0].n;
}

afterAll(async () => {
  await cleanup();
  await closeHarness();
});

describe('EZD-106 last settings_users holder (09n rows 1-5)', () => {
  it('row 1: 2 active holders, untick one: allowed (2 to 1)', async () => {
    const t = await createTenant();
    const a = await addUser(t, { preset: 'owner', name: 'A Owner' });
    const b = await addUser(t, { preset: 'owner', name: 'B Owner' });
    const sa = await signIn(a.email);
    const r = await save(
      sa,
      b.membershipId,
      await roleId(t, 'owner'),
      'en',
      without(ALL, 'settings_users'),
    );
    expect(r.error).toBeNull();
    expect(await grantedOf(b.membershipId)).not.toContain('settings_users');
    expect(await holders(t)).toBe(1);
  }, 120000);

  it('row 2: 1 active holder: deactivating, unticking or removing them is refused', async () => {
    const t = await createTenant();
    const a = await addUser(t, { preset: 'owner', name: 'Only Owner' });
    await addUser(t, { preset: 'crew', name: 'Crew One' });
    const sa = await signIn(a.email);
    const off = await save(
      sa,
      a.membershipId,
      await roleId(t, 'owner'),
      'en',
      without(ALL, 'settings_users'),
    );
    expect(off.error?.code).toBe('P0001');
    expect(off.error?.message).toBe(HOLDER);
    const de = await call(sa, 'deactivate_member', a.membershipId);
    expect(de.error?.message).toBe(HOLDER);
    const rm = await call(sa, 'remove_member', a.membershipId);
    expect(rm.error?.message).toBe(HOLDER);
    expect(await statusOf(a.membershipId)).toBe('active');
    expect(await grantedOf(a.membershipId)).toContain('settings_users');
    expect(await sessionCount(a.authUserId)).toBe(1);

    // The trigger, not only the functions: a direct status change is refused at commit.
    await expect(
      harnessSql()`update public.membership set status = 'deactivated' where id = ${a.membershipId}::uuid`,
    ).rejects.toMatchObject({ code: 'P0001', message: HOLDER });
    await expect(
      harnessSql()`update public.user_permission set granted = false
        where membership_id = ${a.membershipId}::uuid and permission_key = 'settings_users'`,
    ).rejects.toMatchObject({ code: 'P0001', message: HOLDER });
  }, 120000);

  it('row 3: 1 active holder and 1 invited holder: removing the active one is refused', async () => {
    const t = await createTenant();
    const a = await addUser(t, { preset: 'owner', name: 'Active Owner' });
    await addUser(t, { preset: 'owner', status: 'invited', name: null });
    const sa = await signIn(a.email);
    const rm = await call(sa, 'remove_member', a.membershipId);
    expect(rm.error?.code).toBe('P0001');
    expect(rm.error?.message).toBe(HOLDER);
    expect(await statusOf(a.membershipId)).toBe('active');
  }, 120000);

  it('row 4: 2 active holders untick each other at the same moment: one succeeds, one is refused', async () => {
    const t = await createTenant();
    const a = await addUser(t, { preset: 'owner', name: 'Pair A' });
    const b = await addUser(t, { preset: 'owner', name: 'Pair B' });
    const owner = await roleId(t, 'owner');
    const sa = await signIn(a.email);
    const sb = await signIn(b.email);
    const one: Sql = adminSql();
    const two: Sql = adminSql();
    const asMember = async (tx: Sql, token: string) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(claimsOf(token))}, true)`;
    };
    const off = without(ALL, 'settings_users');
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let firstSaved!: () => void;
    const saved = new Promise<void>((r) => (firstSaved = r));
    try {
      // The first transaction unticks B and stays open, holding the per-company lock.
      const first = one.begin(async (tx) => {
        await asMember(tx as unknown as Sql, sa.accessToken);
        await tx`select public.save_member(${b.membershipId}::uuid, ${owner}::uuid, 'en', ${off}::text[])`;
        firstSaved();
        await held;
      });
      await saved;
      // The second unticks A; it waits on the lock until the first commits, then recounts and is refused.
      let secondDone = false;
      const second = two
        .begin(async (tx) => {
          await asMember(tx as unknown as Sql, sb.accessToken);
          await tx`select public.save_member(${a.membershipId}::uuid, ${owner}::uuid, 'en', ${off}::text[])`;
        })
        .finally(() => {
          secondDone = true;
        });
      second.catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
      expect(secondDone).toBe(false);
      release();
      await first;
      await expect(second).rejects.toMatchObject({ code: 'P0001', message: HOLDER });
    } finally {
      release?.();
      await one.end();
      await two.end();
    }
    expect(await grantedOf(b.membershipId)).not.toContain('settings_users');
    expect(await grantedOf(a.membershipId)).toContain('settings_users');
    expect(await holders(t)).toBe(1);
  }, 120000);

  it('row 5: deleting the company passes; its memberships alone do not', async () => {
    const t = await createTenant();
    const a = await addUser(t, { preset: 'owner', name: 'Gone Co' });
    await expect(
      harnessSql()`delete from public.membership where tenant_id = ${t}::uuid`,
    ).rejects.toMatchObject({ code: 'P0001', message: HOLDER });
    await harnessSql().begin(async (tx) => {
      await tx`delete from public.membership where tenant_id = ${t}::uuid`;
      await tx`delete from public.tenant where id = ${t}::uuid`;
    });
    expect(await statusOf(a.membershipId)).toBeNull();
  }, 120000);

  it('a company with no holder is never checked (0 to 0)', async () => {
    const t = await createTenant();
    const c = await addUser(t, { preset: 'crew', name: 'No Holder' });
    await harnessSql()`update public.membership set status = 'deactivated' where id = ${c.membershipId}::uuid`;
    expect(await statusOf(c.membershipId)).toBe('deactivated');
  }, 120000);
});

describe('EZD-106 save_member (AC-1, AC-8, AC-9)', () => {
  let t: string;
  let other: string;
  let owner: Awaited<ReturnType<typeof addUser>>;
  let so: Session;

  beforeAll(async () => {
    t = await createTenant();
    other = await createTenant();
    owner = await addUser(t, { preset: 'owner', name: 'Save Owner' });
    so = await signIn(owner.email);
  }, 120000);

  it('switches, role and language are saved and apply on the member’s next request, without a sign-out', async () => {
    const f = await addUser(t, { preset: 'foreman', name: 'Fore Man', language: 'en' });
    const sf = await signIn(f.email);
    const before = await sf.serverDb.rpc('current_permissions');
    expect(sorted((before.data as { permission_keys: string[] }[])[0].permission_keys)).toEqual(
      sorted(PRESET_KEYS.foreman),
    );
    const crew = await roleId(t, 'crew');
    const r = await save(so, f.membershipId, crew, 'es', PRESET_KEYS.crew);
    expect(r.error).toBeNull();
    const out = r.data as { roleChanged: boolean; languageChanged: boolean; changedKeys: string[] };
    expect(out.roleChanged).toBe(true);
    expect(out.languageChanged).toBe(true);
    // Foreman 11 to Crew 4: view_projects, check_off_tasks, photo_notes, flag_conflict are in both; the other
    // 8 Foreman keys go off and none goes on.
    expect(out.changedKeys).toEqual(
      sorted(PRESET_KEYS.foreman.filter((k) => !PRESET_KEYS.crew.includes(k))),
    );
    expect(await grantedOf(f.membershipId)).toEqual(sorted(PRESET_KEYS.crew));
    const m = await harnessSql()<{ role_id: string; language: string }[]>`
      select m.role_id, u.language from public.membership m join public.app_user u on u.id = m.user_id
      where m.id = ${f.membershipId}::uuid`;
    expect(m[0]).toEqual({ role_id: crew, language: 'es' });
    const after = await sf.serverDb.rpc('current_permissions');
    expect(after.error).toBeNull();
    expect(sorted((after.data as { permission_keys: string[] }[])[0].permission_keys)).toEqual(
      sorted(PRESET_KEYS.crew),
    );
    expect(await sessionCount(f.authUserId)).toBe(1);
  }, 120000);

  it('a holder edits their own row and grants any switch', async () => {
    const custom = await adminDb()
      .from('role')
      .insert({ tenant_id: t, name: 'Users only', default_permissions: ['settings_users'] })
      .select('id')
      .single();
    expect(custom.error).toBeNull();
    const u = await addUser(t, {
      customRoleId: custom.data!.id as string,
      granted: ['settings_users'],
      name: 'User Admin',
    });
    const su = await signIn(u.email);
    const own = await save(su, u.membershipId, custom.data!.id as string, 'es', [
      'settings_users',
      'see_company_costs',
    ]);
    expect(own.error).toBeNull();
    expect(await grantedOf(u.membershipId)).toEqual(['see_company_costs', 'settings_users']);
    const c = await addUser(t, { preset: 'crew', name: 'Crew Two' });
    const r = await save(su, c.membershipId, await roleId(t, 'owner'), 'en', ALL);
    expect(r.error).toBeNull();
    expect(await grantedOf(c.membershipId)).toEqual(sorted(ALL));
  }, 120000);

  it('an invited member’s switches can be saved', async () => {
    const i = await addUser(t, { preset: 'crew', status: 'invited', name: null });
    const r = await save(so, i.membershipId, await roleId(t, 'crew'), 'en', [
      ...PRESET_KEYS.crew,
      'export',
    ]);
    expect(r.error).toBeNull();
    expect(await grantedOf(i.membershipId)).toEqual(sorted([...PRESET_KEYS.crew, 'export']));
  }, 120000);

  it('bad input is refused: unknown key, too many keys, a bad language, another company’s role', async () => {
    const c = await addUser(t, { preset: 'crew', name: 'Crew Three' });
    const crew = await roleId(t, 'crew');
    const cases: [string, string, readonly string[]][] = [
      [crew, 'en', ['view_projects', 'fly_drones']],
      [crew, 'en', [...ALL, 'view_projects']],
      [crew, 'fr', ['view_projects']],
      [await roleId(other, 'crew'), 'en', ['view_projects']],
    ];
    for (const [rid, lang, keys] of cases) {
      const r = await save(so, c.membershipId, rid, lang, keys);
      expect(r.error?.code, JSON.stringify([lang, keys.length])).toBe('22023');
    }
    expect(await grantedOf(c.membershipId)).toEqual(sorted(PRESET_KEYS.crew));
    const empty = await save(so, c.membershipId, crew, 'en', []);
    expect(empty.error).toBeNull();
    expect(await grantedOf(c.membershipId)).toEqual([]);
  }, 120000);

  it('another company’s member is not found', async () => {
    const x = await addUser(other, { preset: 'crew', name: 'Elsewhere' });
    const r = await save(so, x.membershipId, await roleId(t, 'crew'), 'en', []);
    expect(r.error?.code).toBe('P0002');
    for (const fn of ['deactivate_member', 'reactivate_member', 'remove_member'] as const) {
      expect((await call(so, fn, x.membershipId)).error?.code, fn).toBe('P0002');
    }
    expect(await statusOf(x.membershipId)).toBe('active');
    expect(await grantedOf(x.membershipId)).toEqual(sorted(PRESET_KEYS.crew));
  }, 120000);

  it('every write needs settings_users (42501)', async () => {
    const d = await addUser(t, { preset: 'designer', name: 'Des Igner' });
    const c = await addUser(t, { preset: 'crew', name: 'Crew Four' });
    const sd = await signIn(d.email);
    const r = await save(sd, c.membershipId, await roleId(t, 'crew'), 'en', []);
    expect(r.error?.code).toBe('42501');
    for (const fn of ['deactivate_member', 'reactivate_member', 'remove_member'] as const) {
      expect((await call(sd, fn, c.membershipId)).error?.code, fn).toBe('42501');
    }
    expect(await statusOf(c.membershipId)).toBe('active');
  }, 120000);
});

describe('EZD-106 deactivate, reactivate, remove and session ending (AC-6, AC-7, AC-1 scope)', () => {
  let t: string;
  let b: string;
  let so: Session;

  beforeAll(async () => {
    t = await createTenant();
    b = await createTenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Life Owner' });
    so = await signIn(owner.email);
  }, 120000);

  it('Deactivate keeps the rows and ends sessions; Reactivate restores the row', async () => {
    const m = await addUser(t, { preset: 'foreman', name: 'Deac Tivate' });
    await signIn(m.email);
    expect(await sessionCount(m.authUserId)).toBe(1);
    const r = await call(so, 'deactivate_member', m.membershipId);
    expect(r.error).toBeNull();
    expect(await statusOf(m.membershipId)).toBe('deactivated');
    expect(await sessionCount(m.authUserId)).toBe(0);
    expect(await grantedOf(m.membershipId)).toEqual(sorted(PRESET_KEYS.foreman));
    expect((await call(so, 'deactivate_member', m.membershipId)).error?.code).toBe('22023');

    const back = await call(so, 'reactivate_member', m.membershipId);
    expect(back.error).toBeNull();
    expect(await statusOf(m.membershipId)).toBe('active');
    expect(await grantedOf(m.membershipId)).toEqual(sorted(PRESET_KEYS.foreman));
    expect((await call(so, 'reactivate_member', m.membershipId)).error?.code).toBe('22023');
  }, 120000);

  it('Reactivate is refused while the person is active in another company; removing the deactivated row keeps their other session', async () => {
    const p = await addUser(t, { preset: 'crew', status: 'deactivated', name: 'Two Co' });
    await harnessSql()`insert into public.membership (tenant_id, user_id, status, scope)
      values (${b}::uuid, ${p.appUserId}::uuid, 'active', 'all')`;
    await signIn(p.email);
    expect(await sessionCount(p.authUserId)).toBe(1);
    const r = await call(so, 'reactivate_member', p.membershipId);
    expect(r.error?.code).toBe('P0001');
    expect(r.error?.message).toBe('active_elsewhere');
    expect(await statusOf(p.membershipId)).toBe('deactivated');

    const rm = await call(so, 'remove_member', p.membershipId);
    expect(rm.error).toBeNull();
    expect(await statusOf(p.membershipId)).toBeNull();
    expect(await sessionCount(p.authUserId)).toBe(1);
  }, 120000);

  it('Remove deletes membership, switches, listed projects and AI key; app_user stays; sessions end', async () => {
    const [p1] = await createProjects(t, 1);
    const r = await addUser(t, { preset: 'foreman', name: 'Re Move' });
    await harnessSql()`insert into public.membership_project (tenant_id, membership_id, project_id)
      values (${t}::uuid, ${r.membershipId}::uuid, ${p1}::uuid)`;
    await harnessSql()`insert into public.user_ai_key (tenant_id, app_user_id, ciphertext, secret_version, last4)
      values (${t}::uuid, ${r.appUserId}::uuid, ${'A'.repeat(44)}, 1, 'abcd')`;
    await signIn(r.email);
    const out = await call(so, 'remove_member', r.membershipId);
    expect(out.error).toBeNull();
    const left = await harnessSql()<{ m: number; up: number; mp: number; k: number; u: number }[]>`
      select
        (select count(*)::int from public.membership where id = ${r.membershipId}::uuid) as m,
        (select count(*)::int from public.user_permission where membership_id = ${r.membershipId}::uuid) as up,
        (select count(*)::int from public.membership_project where membership_id = ${r.membershipId}::uuid) as mp,
        (select count(*)::int from public.user_ai_key where tenant_id = ${t}::uuid and app_user_id = ${r.appUserId}::uuid) as k,
        (select count(*)::int from public.app_user where id = ${r.appUserId}::uuid) as u`;
    expect(left[0]).toEqual({ m: 0, up: 0, mp: 0, k: 0, u: 1 });
    expect(await sessionCount(r.authUserId)).toBe(0);
  }, 120000);

  it('an invited row cannot be deactivated or removed here (Cancel invite is EZD-105)', async () => {
    const i = await addUser(t, { preset: 'crew', status: 'invited', name: null });
    expect((await call(so, 'deactivate_member', i.membershipId)).error?.code).toBe('22023');
    expect((await call(so, 'remove_member', i.membershipId)).error?.code).toBe('22023');
    expect(await statusOf(i.membershipId)).toBe('invited');
  }, 120000);

  it('deleting an invited row or its listed project never signs the person out of another company', async () => {
    const p = await addUser(b, { preset: 'crew', name: 'Invited Elsewhere' });
    const [p1] = await createProjects(t, 1);
    const inv = await harnessSql()<{ id: string }[]>`
      insert into public.membership (tenant_id, user_id, status, scope)
      values (${t}::uuid, ${p.appUserId}::uuid, 'invited', 'listed') returning id`;
    await harnessSql()`insert into public.membership_project (tenant_id, membership_id, project_id)
      values (${t}::uuid, ${inv[0].id}::uuid, ${p1}::uuid)`;
    await signIn(p.email);
    await harnessSql()`delete from public.membership_project where membership_id = ${inv[0].id}::uuid`;
    expect(await sessionCount(p.authUserId)).toBe(1);
    await harnessSql()`update public.membership set scope = 'all' where id = ${inv[0].id}::uuid`;
    expect(await sessionCount(p.authUserId)).toBe(1);
    await harnessSql()`delete from public.membership where id = ${inv[0].id}::uuid`;
    expect(await sessionCount(p.authUserId)).toBe(1);
  }, 120000);

  it('a scope change on an active member ends their sessions (AC-1)', async () => {
    const m = await addUser(t, { preset: 'foreman', name: 'Scope Change' });
    await signIn(m.email);
    expect(await sessionCount(m.authUserId)).toBe(1);
    await harnessSql()`update public.membership set scope = 'listed' where id = ${m.membershipId}::uuid`;
    expect(await sessionCount(m.authUserId)).toBe(0);
  }, 120000);
});

describe('EZD-106 list_users with deactivated members and roles', () => {
  it('lists deactivated rows last, counts only active and invited, and returns the roles', async () => {
    const t = await createTenant();
    const v = await addUser(t, { preset: 'owner', name: 'View Er', language: 'en' });
    const c = await addUser(t, { preset: 'crew', status: 'invited', name: null, language: 'es' });
    const x = await addUser(t, {
      preset: 'crew',
      status: 'deactivated',
      name: 'Aa First',
      language: 'es',
    });
    const custom = await adminDb()
      .from('role')
      .insert({ tenant_id: t, name: 'Estimator', default_permissions: ['view_projects'] })
      .select('id')
      .single();
    const sv = await signIn(v.email);
    const { data, error } = await sv.serverDb.rpc('list_users', { p_search: '', p_page: 1 });
    expect(error).toBeNull();
    const r = data as {
      rows: {
        membershipId: string;
        status: string;
        role: { id: string } | null;
        canCopyLink: boolean;
      }[];
      roles: { id: string; name: string; preset: string | null }[];
      total: number;
      active: number;
      invited: number;
      en: number;
      es: number;
    };
    expect(r.rows.map((x) => x.membershipId)).toEqual([
      v.membershipId,
      c.membershipId,
      x.membershipId,
    ]);
    expect(r.rows[2].status).toBe('deactivated');
    expect(r.rows[2].canCopyLink).toBe(false);
    expect([r.total, r.active, r.invited, r.en, r.es]).toEqual([3, 1, 1, 1, 1]);
    expect(r.rows[0].role?.id).toBe(await roleId(t, 'owner'));
    expect(r.roles.map((x) => x.preset)).toEqual(['owner', 'designer', 'foreman', 'crew', null]);
    expect(r.roles[4]).toMatchObject({ id: custom.data!.id, name: 'Estimator' });
  }, 120000);
});
