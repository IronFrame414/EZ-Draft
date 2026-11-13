// EZD-107 database tests (AC-EZD-107-1, -2, -3, -4). Expected values: S15 Validation ("Custom role names are
// unique within the tenant"; AC-2 ignoring case), S15 Role card (presets fixed; custom roles deletable when no
// user holds them), Q-0695 decisions 03 row 35 (editing a custom role changes default_permissions only;
// delete only when no membership holds it), 10 row 59 (every role write needs settings_users), catalog.ts (37
// keys in catalog order; Approve translations removed by Q-0234), 09n Switch counts (Foreman 11, Crew 4), the
// app name bound 1000 (PROJECT_NAME_MAX). Calls go through the gated serverDb of `signIn`; the race uses two
// raw connections as `authenticated` with the members' claims (the members.db.test.ts pattern).
import { afterAll, describe, expect, it } from 'vitest';
import { adminSql, type Sql } from '../../../test-harness/rls/db';
import {
  adminDb,
  claimsOf,
  cleanup,
  closeHarness,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { addUser, PRESET_KEYS, roleId } from '../../../test-harness/users/fixtures';
import { PERMISSION_KEYS } from '../../lib/permissions/catalog';

type RpcResult = { data: unknown; error: { code: string; message: string } | null };
type Summary = {
  id: string;
  name: string;
  preset: string | null;
  defaultPermissions: string[];
  holders: number;
};

const create = (s: Session, name: unknown, granted: unknown): Promise<RpcResult> =>
  s.serverDb.rpc('create_role', {
    p_name: name as string,
    p_granted: granted as string[],
  }) as unknown as Promise<RpcResult>;
const update = (s: Session, id: string, name: string, granted: string[]): Promise<RpcResult> =>
  s.serverDb.rpc('update_role', {
    p_role_id: id,
    p_name: name,
    p_granted: granted,
  }) as unknown as Promise<RpcResult>;
const remove = (s: Session, id: string): Promise<RpcResult> =>
  s.serverDb.rpc('delete_role', { p_role_id: id }) as unknown as Promise<RpcResult>;
const list = async (s: Session): Promise<Summary[]> => {
  const { data, error } = await s.serverDb.rpc('list_roles');
  expect(error).toBeNull();
  return data as Summary[];
};

async function roleRow(id: string) {
  const rows = await harnessSql()<
    { name: string; preset: string | null; default_permissions: string[]; updated_at: Date }[]
  >`select name, preset, default_permissions, updated_at from public.role where id = ${id}::uuid`;
  return rows[0] ?? null;
}

async function grantedOf(membershipId: string): Promise<string[]> {
  const rows = await harnessSql()<{ k: string }[]>`
    select permission_key as k from public.user_permission
    where membership_id = ${membershipId}::uuid and granted order by permission_key`;
  return rows.map((r) => r.k);
}

async function roleCount(tenant: string): Promise<number> {
  const rows = await harnessSql()<{ n: number }[]>`
    select count(*)::int as n from public.role where tenant_id = ${tenant}::uuid`;
  return rows[0].n;
}

async function ownerSession(tenant: string): Promise<Session> {
  const o = await addUser(tenant, { preset: 'owner', name: 'Role Owner' });
  return signIn(o.email);
}

afterAll(async () => {
  await cleanup();
  await closeHarness();
});

describe('EZD-107 custom roles in the database', () => {
  it('R1 create: trimmed name, keys once each in catalog order, no preset, listed with 0 holders', async () => {
    const t = await createTenant();
    const s = await ownerSession(t);
    const r = await create(s, '  Lead carpenter  ', ['export', 'view_projects', 'export']);
    expect(r.error).toBeNull();
    const id = (r.data as { roleId: string }).roleId;
    expect(r.data).toMatchObject({
      roleId: id,
      tenantId: t,
      name: 'Lead carpenter',
      defaultPermissions: ['view_projects', 'export'],
    });
    const row = await roleRow(id);
    expect(row).toMatchObject({
      name: 'Lead carpenter',
      preset: null,
      default_permissions: ['view_projects', 'export'],
    });
    const listed = (await list(s)).find((x) => x.id === id);
    expect(listed).toEqual({
      id,
      name: 'Lead carpenter',
      preset: null,
      defaultPermissions: ['view_projects', 'export'],
      holders: 0,
    });
  }, 120000);

  it('R2 names: blank refused; a used name in any letter case refused (custom and preset); 1000 kept, 1001 refused; another company may reuse it', async () => {
    const t = await createTenant();
    const s = await ownerSession(t);
    const before = await roleCount(t);

    for (const blank of ['', '   ', null]) {
      const r = await create(s, blank, []);
      expect(r.error, String(blank)).toMatchObject({
        code: '22023',
        message: 'role_name_required',
      });
    }
    // A preset name, in another case (presets are rows of the company's role table).
    const preset = await create(s, 'foreman', []);
    expect(preset.error).toMatchObject({ code: '23505', message: 'role_name_taken' });

    const first = await create(s, 'Lead Carpenter', ['view_projects']);
    expect(first.error).toBeNull();
    const again = await create(s, '  lead CARPENTER ', []);
    expect(again.error).toMatchObject({ code: '23505', message: 'role_name_taken' });

    // Renaming another custom role onto a used name is refused too.
    const other = await create(s, 'Estimator', []);
    const otherId = (other.data as { roleId: string }).roleId;
    const rename = await update(s, otherId, 'LEAD carpenter', []);
    expect(rename.error).toMatchObject({ code: '23505', message: 'role_name_taken' });
    expect((await roleRow(otherId))?.name).toBe('Estimator');

    const long = await create(s, 'x'.repeat(1001), []);
    expect(long.error).toMatchObject({ code: '22023', message: 'invalid_input' });
    const max = await create(s, 'y'.repeat(1000), []);
    expect(max.error).toBeNull();

    expect(await roleCount(t)).toBe(before + 3);

    const t2 = await createTenant();
    const s2 = await ownerSession(t2);
    const elsewhere = await create(s2, 'Lead Carpenter', []);
    expect(elsewhere.error).toBeNull();
  }, 120000);

  it('R3 switch set: an unknown key and a null element refused; empty and all 37 kept', async () => {
    const t = await createTenant();
    const s = await ownerSession(t);
    const before = await roleCount(t);
    const unknown = await create(s, 'Translator', ['approve_translations']);
    expect(unknown.error).toMatchObject({ code: '22023', message: 'invalid_input' });
    const withNull = await create(s, 'Null key', ['view_projects', null]);
    expect(withNull.error).toMatchObject({ code: '22023', message: 'invalid_input' });
    const nullSet = await create(s, 'Null set', null);
    expect(nullSet.error).toMatchObject({ code: '22023', message: 'invalid_input' });
    expect(await roleCount(t)).toBe(before);

    const empty = await create(s, 'From scratch', []);
    expect(empty.error).toBeNull();
    expect((await roleRow((empty.data as { roleId: string }).roleId))?.default_permissions).toEqual(
      [],
    );
    const all = await create(s, 'Everything', [...PERMISSION_KEYS].reverse());
    expect(all.error).toBeNull();
    expect((await roleRow((all.data as { roleId: string }).roleId))?.default_permissions).toEqual([
      ...PERMISSION_KEYS,
    ]);
  }, 120000);

  it('R4 without settings_users: create, update and delete answer 42501 and write nothing', async () => {
    const t = await createTenant();
    const s = await ownerSession(t);
    const made = await create(s, 'Kept', ['view_projects']);
    const id = (made.data as { roleId: string }).roleId;
    const crew = await addUser(t, { preset: 'crew', name: 'No Users Switch' });
    const sc = await signIn(crew.email);
    const before = await roleCount(t);

    expect((await create(sc, 'Sneaky', [])).error).toMatchObject({
      code: '42501',
      message: 'permission_denied',
    });
    expect((await update(sc, id, 'Renamed', [])).error).toMatchObject({ code: '42501' });
    expect((await remove(sc, id)).error).toMatchObject({ code: '42501' });
    expect(await roleCount(t)).toBe(before);
    expect(await roleRow(id)).toMatchObject({
      name: 'Kept',
      default_permissions: ['view_projects'],
    });
  }, 120000);

  it('R5 update changes the role only: holders keep their own switches; nothing changed writes nothing', async () => {
    const t = await createTenant();
    const s = await ownerSession(t);
    const made = await create(s, 'Field lead', PRESET_KEYS.foreman);
    const id = (made.data as { roleId: string }).roleId;
    const holder = await addUser(t, {
      customRoleId: id,
      granted: PRESET_KEYS.foreman,
      name: 'Holder',
    });
    const heldBefore = await grantedOf(holder.membershipId);
    expect(heldBefore).toHaveLength(11);

    const r = await update(s, id, 'Field boss', PRESET_KEYS.crew);
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({
      roleId: id,
      name: 'Field boss',
      fields: ['name', 'default_permissions'],
    });
    const row = await roleRow(id);
    expect(row?.name).toBe('Field boss');
    expect([...(row?.default_permissions ?? [])].sort()).toEqual([...PRESET_KEYS.crew].sort());
    expect(await grantedOf(holder.membershipId)).toEqual(heldBefore);

    const stamp = row!.updated_at;
    const same = await update(s, id, ' Field boss ', PRESET_KEYS.crew);
    expect(same.error).toBeNull();
    expect((same.data as { fields: string[] }).fields).toEqual([]);
    expect((await roleRow(id))?.updated_at).toEqual(stamp);
  }, 120000);

  it('R6 presets, another company’s role and an unknown id are refused', async () => {
    const t = await createTenant();
    const s = await ownerSession(t);
    const foreman = await roleId(t, 'foreman');
    const up = await update(s, foreman, 'Foreman', []);
    expect(up.error).toMatchObject({ code: 'P0001', message: 'preset_role_change_refused' });
    const del = await remove(s, foreman);
    expect(del.error).toMatchObject({ code: 'P0001', message: 'preset_role_change_refused' });
    expect((await roleRow(foreman))?.default_permissions).toHaveLength(11);

    const t2 = await createTenant();
    const s2 = await ownerSession(t2);
    const theirs = await create(s2, 'Theirs', ['view_projects']);
    const theirId = (theirs.data as { roleId: string }).roleId;
    expect((await update(s, theirId, 'Mine now', [])).error).toMatchObject({
      code: 'P0002',
      message: 'role_not_found',
    });
    expect((await remove(s, theirId)).error).toMatchObject({ code: 'P0002' });
    expect(await roleRow(theirId)).toMatchObject({ name: 'Theirs' });

    const ghost = '00000000-0000-4000-8000-000000000000';
    expect((await update(s, ghost, 'Ghost', [])).error).toMatchObject({ code: 'P0002' });
    expect((await remove(s, ghost)).error).toMatchObject({ code: 'P0002' });
  }, 120000);

  it('R7 delete: refused while any member holds the role (invited counts); done when nobody does', async () => {
    const t = await createTenant();
    const s = await ownerSession(t);
    const made = await create(s, 'Temp', []);
    const id = (made.data as { roleId: string }).roleId;
    const invited = await addUser(t, { status: 'invited', customRoleId: id, name: null });
    const held = await remove(s, id);
    expect(held.error).toMatchObject({ code: 'P0001', message: 'role_in_use' });
    expect(await roleRow(id)).not.toBeNull();

    await harnessSql()`update public.membership set role_id = null where id = ${invited.membershipId}::uuid`;
    const gone = await remove(s, id);
    expect(gone.error).toBeNull();
    expect(gone.data).toMatchObject({ roleId: id, tenantId: t, name: 'Temp' });
    expect(await roleRow(id)).toBeNull();
  }, 120000);

  it('R8 race: an assignment held open while the delete runs; after its commit the delete is refused', async () => {
    const t = await createTenant();
    const a = await addUser(t, { preset: 'owner', name: 'Race A' });
    const b = await addUser(t, { preset: 'owner', name: 'Race B' });
    const crew = await addUser(t, { preset: 'crew', name: 'Race Crew' });
    const sa = await signIn(a.email);
    const sb = await signIn(b.email);
    const made = await create(sa, 'Racing', ['view_projects']);
    const id = (made.data as { roleId: string }).roleId;
    const one: Sql = adminSql();
    const two: Sql = adminSql();
    const asMember = async (tx: Sql, token: string) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(claimsOf(token))}, true)`;
    };
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    let assigned!: () => void;
    const didAssign = new Promise<void>((r) => (assigned = r));
    try {
      const first = one.begin(async (tx) => {
        await asMember(tx as unknown as Sql, sa.accessToken);
        await tx`select public.save_member(${crew.membershipId}::uuid, ${id}::uuid, 'en', ${['view_projects']}::text[])`;
        assigned();
        await hold;
      });
      await didAssign;
      let secondDone = false;
      const second = two
        .begin(async (tx) => {
          await asMember(tx as unknown as Sql, sb.accessToken);
          await tx`select public.delete_role(${id}::uuid)`;
        })
        .finally(() => {
          secondDone = true;
        });
      second.catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
      expect(secondDone).toBe(false);
      release();
      await first;
      await expect(second).rejects.toMatchObject({ code: 'P0001', message: 'role_in_use' });
    } finally {
      release?.();
      await one.end();
      await two.end();
    }
    expect(await roleRow(id)).not.toBeNull();
  }, 120000);

  it('R9 list_roles: presets in S15 order, then custom roles by name, holder counts across statuses, own company only', async () => {
    const t = await createTenant();
    const s = await ownerSession(t);
    const zed = (await create(s, 'zed crew', [])).data as { roleId: string };
    const alpha = (await create(s, 'Alpha', ['view_projects'])).data as { roleId: string };
    await addUser(t, { customRoleId: alpha.roleId, granted: ['view_projects'], name: 'A1' });
    await addUser(t, { customRoleId: alpha.roleId, status: 'invited', name: null });
    await addUser(t, { customRoleId: alpha.roleId, status: 'deactivated', name: 'A3' });
    await addUser(t, { preset: 'foreman', name: 'F1' });
    const t2 = await createTenant();
    const s2 = await ownerSession(t2);
    await create(s2, 'Other company role', []);

    const roles = await list(s);
    expect(roles.map((r) => r.name)).toEqual([
      'Owner',
      'Designer',
      'Foreman',
      'Crew',
      'Alpha',
      'zed crew',
    ]);
    const by = (name: string) => roles.find((r) => r.name === name)!;
    expect(by('Owner').holders).toBe(1);
    expect(by('Foreman').holders).toBe(1);
    expect(by('Foreman').defaultPermissions).toHaveLength(11);
    expect(by('Crew').defaultPermissions).toHaveLength(4);
    expect(by('Alpha')).toMatchObject({ id: alpha.roleId, preset: null, holders: 3 });
    expect(by('zed crew')).toMatchObject({ id: zed.roleId, holders: 0 });
  }, 120000);

  it('R10 a settings_users holder cannot write the role table directly', async () => {
    const t = await createTenant();
    const s = await ownerSession(t);
    const made = await create(s, 'Direct', ['view_projects']);
    const id = (made.data as { roleId: string }).roleId;
    const before = await roleCount(t);

    const ins = await s.serverDb
      .from('role')
      .insert({ tenant_id: t, name: 'Skips the log', default_permissions: [] });
    expect(ins.error?.code).toBe('42501');
    const upd = await s.serverDb.from('role').update({ name: 'Renamed' }).eq('id', id).select();
    expect(upd.data ?? []).toEqual([]);
    const del = await s.serverDb.from('role').delete().eq('id', id).select();
    expect(del.data ?? []).toEqual([]);

    expect(await roleCount(t)).toBe(before);
    expect(await roleRow(id)).toMatchObject({ name: 'Direct' });
    // The service role still writes (server paths and fixtures).
    const viaAdmin = await adminDb().from('role').select('id').eq('id', id);
    expect(viaAdmin.data).toHaveLength(1);
  }, 120000);
});
