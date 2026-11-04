// EZD-101 T2-T11 (vault/plans/EZD-101.md section 4): permission and role tables. Expected values come from
// the plan's Data section (KEYS, preset rules), AC-EZD-101-1..6, S15 Decisions 3, 6, 13 and the Q-ids there.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminSql, withRollback, type Sql } from '../../../test-harness/rls/db';
import { auditRls } from '../../../test-harness/rls/audit';
import {
  adminDb,
  cleanup,
  closeHarness,
  createAppUser,
  createMember,
  createTenant,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  CREW_USER_ID,
  DESIGNER_USER_ID,
  FOREMAN_USER_ID,
  JOSH_USER_ID,
  TENANT_1_ID,
  TENANT_2_ID,
  TENANT_2_OWNER_USER_ID,
} from '../../../test-utils/seed-ids';
import { PERMISSION_KEYS } from '../../lib/permissions/catalog';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const KEYS = [
  'view_projects',
  'create_projects',
  'edit_model',
  'delete_projects',
  'upload_references',
  'add_markup',
  'run_code_check',
  'run_fast_renders',
  'run_standard_renders',
  'run_photoreal_renders',
  'approve_renders',
  'mark_client_ready',
  'see_company_costs',
  'see_sell_prices',
  'edit_catalog',
  'create_change_orders',
  'flag_to_supplier',
  'issue_permit_sets',
  'issue_revisions',
  'send_to_client',
  'export',
  'edit_field_tasks',
  'check_off_tasks',
  'photo_notes',
  'flag_conflict',
  'send_field_measurement',
  'approve_field_measurements',
  'settings_company',
  'settings_users',
  'settings_title_block',
  'settings_sheet_presets',
  'settings_defaults',
  'settings_catalog',
  'settings_render_models',
  'settings_code_edition',
  'settings_libraries',
  'settings_system_status',
];

// Data section: Designer = KEYS minus delete_projects, issue_permit_sets, issue_revisions and minus every
// settings_* except settings_catalog and settings_libraries.
const DESIGNER = KEYS.filter(
  (k) =>
    !['delete_projects', 'issue_permit_sets', 'issue_revisions'].includes(k) &&
    (!k.startsWith('settings_') || ['settings_catalog', 'settings_libraries'].includes(k)),
);
const FOREMAN = [
  'view_projects',
  'create_projects',
  'add_markup',
  'run_fast_renders',
  'export',
  'edit_field_tasks',
  'check_off_tasks',
  'photo_notes',
  'flag_conflict',
  'send_field_measurement',
  'settings_libraries',
];
const CREW = ['view_projects', 'check_off_tasks', 'photo_notes', 'flag_conflict'];
const PRESETS: Record<string, string[]> = {
  owner: KEYS,
  designer: DESIGNER,
  foreman: FOREMAN,
  crew: CREW,
};

const PRIVILEGE = '42501';
const sorted = (a: string[]) => [...a].sort();

type RoleRow = { id: string; name: string; preset: string | null; default_permissions: string[] };

describe('EZD-101 permission and role tables', () => {
  let sql: Sql;

  beforeAll(() => {
    sql = adminSql();
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
    await cleanup();
    await closeHarness();
  });

  const rolesOf = (tenantId: string) =>
    sql<RoleRow[]>`
      select id, name, preset, default_permissions from public.role
      where tenant_id = ${tenantId}::uuid and preset is not null order by preset`;

  const presetRoleId = async (tenantId: string, preset: string) => {
    const rows = await sql<{ id: string }[]>`
      select id from public.role where tenant_id = ${tenantId}::uuid and preset = ${preset}`;
    return rows[0].id;
  };

  const grantedKeys = async (membershipId: string) =>
    (
      await sql<{ permission_key: string }[]>`
      select permission_key from public.user_permission
      where membership_id = ${membershipId}::uuid and granted`
    ).map((r) => r.permission_key);

  // OWNER SETUP (T8): a member holding the tenant's Owner role with its 37 switches, then signed in.
  async function ownerMember(tenantId: string) {
    const member = await createMember({ tenantId, scope: 'all' });
    const ownerId = await presetRoleId(tenantId, 'owner');
    await sql`update public.membership set role_id = ${ownerId}::uuid where id = ${member.membershipId}::uuid`;
    await sql`select private.seed_member_permissions(${member.membershipId}::uuid)`;
    const session = await signIn(member.email);
    return { member, session };
  }

  it('T2 keys in the DB: permission_keys equals the catalog', async () => {
    const rows = await sql<{ k: string[] }[]>`select private.permission_keys() as k`;
    expect(rows[0].k).toEqual([...PERMISSION_KEYS]);
    expect(rows[0].k).toEqual(KEYS);
  });

  it('T2 keys in the DB: an unknown switch key and a bogus role default are refused 23514', async () => {
    const tenantId = await createTenant();
    const member = await createMember({ tenantId, scope: 'all' });
    await withRollback(sql, async (tx) => {
      await expect(
        tx`insert into public.user_permission (tenant_id, membership_id, permission_key, granted)
           values (${tenantId}::uuid, ${member.membershipId}::uuid, 'approve_translations', true)`,
      ).rejects.toMatchObject({ code: '23514' });
    });
    await withRollback(sql, async (tx) => {
      await expect(
        tx`insert into public.role (tenant_id, name, default_permissions)
           values (${tenantId}::uuid, 'Bogus', '{bogus}'::text[])`,
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('T3 presets per tenant: a fresh tenant and both seeded tenants have the four presets', async () => {
    const fresh = await createTenant();
    for (const tenantId of [fresh, TENANT_1_ID, TENANT_2_ID]) {
      const rows = await rolesOf(tenantId);
      expect(rows.map((r) => [r.preset, r.name])).toEqual([
        ['crew', 'Crew'],
        ['designer', 'Designer'],
        ['foreman', 'Foreman'],
        ['owner', 'Owner'],
      ]);
      const all = await sql`select 1 from public.role where tenant_id = ${tenantId}::uuid`;
      expect(all.length).toBeGreaterThanOrEqual(4);
    }
    const freshAll = await sql`select 1 from public.role where tenant_id = ${fresh}::uuid`;
    expect(freshAll).toHaveLength(4);
  });

  it('T4 presets fixed: no change or delete of a preset row, by the service role or a member', async () => {
    const tenantId = await createTenant();
    const { session } = await ownerMember(tenantId);
    const ownerId = await presetRoleId(tenantId, 'owner');
    const before = (await rolesOf(tenantId)).find((r) => r.preset === 'owner');

    const refused = { code: 'P0001', message: 'preset_role_change_refused' };
    const clients: [string, ReturnType<typeof adminDb> | Session['serverDb']][] = [
      ['admin', adminDb()],
      ['member', session.serverDb],
    ];
    for (const [who, db] of clients) {
      const rename = await db.from('role').update({ name: 'Renamed' }).eq('id', ownerId).select();
      expect(rename.error, `${who} rename`).toMatchObject(refused);
      const reset = await db
        .from('role')
        .update({ default_permissions: ['view_projects'] })
        .eq('id', ownerId)
        .select();
      expect(reset.error, `${who} default_permissions`).toMatchObject(refused);
      const del = await db.from('role').delete().eq('id', ownerId).select();
      expect(del.error, `${who} delete`).toMatchObject(refused);
    }

    // A custom role cannot be turned into a preset.
    const custom = await adminDb()
      .from('role')
      .insert({ tenant_id: tenantId, name: 'Custom', default_permissions: ['view_projects'] })
      .select()
      .single();
    expect(custom.error).toBeNull();
    const promote = await adminDb()
      .from('role')
      .update({ preset: 'owner' })
      .eq('id', (custom.data as RoleRow).id)
      .select();
    expect(promote.error).toMatchObject(refused);

    // A second owner row, and a preset insert by a member.
    const second = await adminDb()
      .from('role')
      .insert({ tenant_id: tenantId, name: 'Second owner', preset: 'owner' });
    expect(second.error?.code).toBe('23505');
    const byMember = await session.serverDb
      .from('role')
      .insert({ tenant_id: tenantId, name: 'Member owner', preset: 'crew' });
    expect(byMember.error?.code).toBe(PRIVILEGE);

    const after = (await rolesOf(tenantId)).find((r) => r.preset === 'owner');
    expect(after).toEqual(before);

    // A tenant delete cascades through the guard.
    await sql`delete from public.membership where tenant_id = ${tenantId}::uuid`;
    await sql`delete from public.tenant where id = ${tenantId}::uuid`;
    const left = await sql`select 1 from public.role where tenant_id = ${tenantId}::uuid`;
    expect(left).toHaveLength(0);
  });

  it('T5 preset switches: the four rows hold the Data arrays', async () => {
    const tenantId = await createTenant();
    const rows = await rolesOf(tenantId);
    expect(rows).toHaveLength(4);
    const sizes: Record<string, number> = {};
    for (const r of rows) {
      expect(r.default_permissions, r.preset ?? '').toEqual(PRESETS[r.preset as string]);
      sizes[r.preset as string] = r.default_permissions.length;
    }
    expect(sizes).toEqual({ owner: 37, designer: 26, foreman: 11, crew: 4 });
    for (const preset of Object.keys(PRESETS)) {
      const fn = await sql<{ p: string[] }[]>`select private.preset_permissions(${preset}) as p`;
      expect(fn[0].p, preset).toEqual(PRESETS[preset]);
    }
    await expect(sql`select private.preset_permissions('client')`).rejects.toMatchObject({
      code: '22023',
    });
  });

  it('T6 seeding twice changes nothing', async () => {
    const tenantId = await createTenant();
    const { member } = await ownerMember(tenantId);
    const m = member.membershipId;
    await sql`update public.user_permission set granted = false
              where membership_id = ${m}::uuid and permission_key = 'export'`;

    const snapshot = async () => ({
      roles: await sql`
        select id, name, preset, default_permissions, updated_at from public.role
        where tenant_id = ${tenantId}::uuid order by id`,
      perms: await sql`
        select permission_key, granted from public.user_permission
        where membership_id = ${m}::uuid order by permission_key`,
    });
    const before = await snapshot();
    expect(before.perms).toHaveLength(37);
    for (let i = 0; i < 2; i++) {
      await sql`select private.seed_preset_roles(${tenantId}::uuid)`;
      await sql`select private.seed_member_permissions(${m}::uuid)`;
    }
    const after = await snapshot();
    expect(after.roles).toEqual(before.roles);
    expect(after.perms).toEqual(before.perms);
    const exportRow = after.perms.find((p) => p.permission_key === 'export');
    expect(exportRow?.granted).toBe(false);
  });

  it('EZD-101 done when: the seed gives Owner 37, Designer 26, Foreman 11, Crew 4 (T7 seeded users)', async () => {
    const cases: [string, string, string, string, number, string][] = [
      [JOSH_USER_ID, TENANT_1_ID, 'owner', 'all', 37, 'owner'],
      [DESIGNER_USER_ID, TENANT_1_ID, 'designer', 'all', 26, 'designer'],
      [FOREMAN_USER_ID, TENANT_1_ID, 'foreman', 'listed', 11, 'foreman'],
      [CREW_USER_ID, TENANT_1_ID, 'crew', 'listed', 4, 'crew'],
      [TENANT_2_OWNER_USER_ID, TENANT_2_ID, 'owner', 'all', 37, 'owner'],
    ];
    for (const [userId, tenantId, preset, scope, granted] of cases) {
      const rows = await sql<
        { id: string; status: string; scope: string; role_id: string; preset: string | null }[]
      >`
        select m.id, m.status, m.scope, m.role_id, r.preset
        from public.membership m left join public.role r on r.id = m.role_id and r.tenant_id = m.tenant_id
        where m.user_id = ${userId}::uuid and m.tenant_id = ${tenantId}::uuid`;
      expect(rows, `${preset} membership`).toHaveLength(1);
      const row = rows[0];
      expect(row.status).toBe('active');
      expect(row.scope).toBe(scope);
      expect(row.preset).toBe(preset);
      expect(row.role_id).toBe(await presetRoleId(tenantId, preset));
      const all =
        await sql`select 1 from public.user_permission where membership_id = ${row.id}::uuid`;
      expect(all, `${preset} rows`).toHaveLength(37);
      const keys = await grantedKeys(row.id);
      expect(keys).toHaveLength(granted);
      expect(sorted(keys)).toEqual(sorted(PRESETS[preset]));
    }
  });

  describe('T8 custom role and T10 switches read-only', () => {
    let tenantA = '';
    let tenantB = '';
    let a: Awaited<ReturnType<typeof ownerMember>>;
    let b: Awaited<ReturnType<typeof ownerMember>>;

    beforeAll(async () => {
      tenantA = await createTenant();
      tenantB = await createTenant();
      a = await ownerMember(tenantA);
      b = await ownerMember(tenantB);
    });

    it('T8 custom role: create, isolation, delete, held role refused', async () => {
      const created = await a.session.serverDb
        .from('role')
        .insert({
          tenant_id: tenantA,
          name: 'Kitchen lead',
          default_permissions: ['view_projects', 'add_markup'],
        })
        .select()
        .single();
      expect(created.error).toBeNull();
      const role = created.data as RoleRow & { tenant_id: string };
      expect(role.preset).toBeNull();
      expect(role.tenant_id).toBe(tenantA);

      const seenByB = await b.session.serverDb.from('role').select('id').eq('id', role.id);
      expect(seenByB.error).toBeNull();
      expect(seenByB.data).toHaveLength(0);
      const insertByB = await b.session.serverDb
        .from('role')
        .insert({ tenant_id: tenantA, name: 'Cross tenant', default_permissions: [] });
      expect(insertByB.error?.code).toBe(PRIVILEGE);

      // Held by a membership: the delete is refused by the foreign key.
      const other = await createMember({ tenantId: tenantA, scope: 'all' });
      await sql`update public.membership set role_id = ${role.id}::uuid where id = ${other.membershipId}::uuid`;
      const held = await a.session.serverDb.from('role').delete().eq('id', role.id).select();
      expect(held.error?.code).toBe('23503');

      // Released: the delete removes one row.
      await sql`update public.membership set role_id = null where id = ${other.membershipId}::uuid`;
      const gone = await a.session.serverDb.from('role').delete().eq('id', role.id).select();
      expect(gone.error).toBeNull();
      expect(gone.data).toHaveLength(1);
    });

    it('T10 switches read-only: a member reads but never writes its own rows; audit is clean', async () => {
      const db = a.session.serverDb;
      const own = await db
        .from('user_permission')
        .select('permission_key')
        .eq('membership_id', a.member.membershipId);
      expect(own.error).toBeNull();
      expect(own.data).toHaveLength(37);

      const ins = await db.from('user_permission').insert({
        tenant_id: tenantA,
        membership_id: a.member.membershipId,
        permission_key: 'view_projects',
        granted: true,
      });
      expect(ins.error?.code).toBe(PRIVILEGE);
      const upd = await db
        .from('user_permission')
        .update({ granted: false })
        .eq('membership_id', a.member.membershipId)
        .select();
      expect(upd.error?.code).toBe(PRIVILEGE);
      const del = await db
        .from('user_permission')
        .delete()
        .eq('membership_id', a.member.membershipId)
        .select();
      expect(del.error?.code).toBe(PRIVILEGE);

      const problems = await auditRls(sql, { repoRoot });
      expect(problems.filter((p) => ['role', 'user_permission'].includes(p.table))).toEqual([]);
    });
  });

  describe('T9 isolation', () => {
    describeTenantIsolation('role', {
      makeRow: (t) => ({
        tenant_id: t,
        name: 'Isolation role',
        default_permissions: ['view_projects'],
      }),
    });
    describeTenantIsolation('user_permission', {
      makeRow: (t, c) => ({
        tenant_id: t,
        membership_id: c.member.membershipId,
        permission_key: 'view_projects',
        granted: true,
      }),
    });
  });

  it('T11 new memberships: default role from role_preset, custom role, backfill', async () => {
    const tenantId = await createTenant();
    const insertMembership = async (userId: string, roleId: string | null = null) => {
      const rows = await sql<{ id: string; role_id: string | null }[]>`
        insert into public.membership (tenant_id, user_id, status, scope, role_id)
        values (${tenantId}::uuid, ${userId}::uuid, 'active', 'all', ${roleId}::uuid)
        returning id, role_id`;
      return rows[0];
    };

    // Foreman preset on the person.
    const foremanUser = await createAppUser();
    const set = await adminDb()
      .from('app_user')
      .update({ role_preset: 'foreman' })
      .eq('id', foremanUser.appUserId);
    expect(set.error).toBeNull();
    const foreman = await insertMembership(foremanUser.appUserId);
    expect(foreman.role_id).toBe(await presetRoleId(tenantId, 'foreman'));
    expect(await grantedKeys(foreman.id)).toHaveLength(11);
    const foremanRows =
      await sql`select 1 from public.user_permission where membership_id = ${foreman.id}::uuid`;
    expect(foremanRows).toHaveLength(37);

    // No preset on the person.
    const nobody = await createAppUser();
    const none = await insertMembership(nobody.appUserId);
    expect(none.role_id).toBeNull();
    const noneRows =
      await sql`select 1 from public.user_permission where membership_id = ${none.id}::uuid`;
    expect(noneRows).toHaveLength(0);

    // A custom role given on insert.
    const customRole = await adminDb()
      .from('role')
      .insert({
        tenant_id: tenantId,
        name: 'Custom T11',
        default_permissions: ['view_projects', 'add_markup'],
      })
      .select()
      .single();
    expect(customRole.error).toBeNull();
    const customId = (customRole.data as RoleRow).id;
    const customUser = await createAppUser();
    const custom = await insertMembership(customUser.appUserId, customId);
    expect(custom.role_id).toBe(customId);
    expect(sorted(await grantedKeys(custom.id))).toEqual(['add_markup', 'view_projects']);

    // Backfill statements of step 6, verbatim.
    const ownerUser = await createAppUser();
    const setOwner = await adminDb()
      .from('app_user')
      .update({ role_preset: 'owner' })
      .eq('id', ownerUser.appUserId);
    expect(setOwner.error).toBeNull();
    const owner = await insertMembership(ownerUser.appUserId);
    const ownerRoleId = await presetRoleId(tenantId, 'owner');
    expect(owner.role_id).toBe(ownerRoleId);
    await withRollback(sql, async (tx) => {
      await tx`update public.membership set role_id = null where id = ${owner.id}::uuid`;
      await tx`delete from public.user_permission where membership_id = ${owner.id}::uuid`;
      await tx.unsafe(
        'update public.membership m set role_id = r.id from public.app_user u, public.role r where m.role_id is null and u.id = m.user_id and r.tenant_id = m.tenant_id and r.preset = u.role_preset;',
      );
      await tx.unsafe('select private.seed_member_permissions(id) from public.membership;');
      const back = await tx<{ role_id: string }[]>`
        select role_id from public.membership where id = ${owner.id}::uuid`;
      expect(back[0].role_id).toBe(ownerRoleId);
      const granted = await tx`
        select 1 from public.user_permission where membership_id = ${owner.id}::uuid and granted`;
      expect(granted).toHaveLength(37);
    });
  });
});
