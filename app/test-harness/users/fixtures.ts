// EZD-104 section 4 (vault/plans/EZD-104.md): shared fixtures for the Users page tests (D1-D5, R1-R3, B1-B10).
// A member's role is set with adminDb() on `role` and `membership`; name and language on `app_user`; times with
// harnessSql. Preset key arrays are copied from supabase/migrations/20261024100001_create_permission_catalog.sql:22-31
// (Owner = PERMISSION_KEYS). Test-only; no import.meta and no __dirname (L-017).
import { randomBytes } from 'node:crypto';
import { PERMISSION_KEYS, type PermissionKey } from '../../src/lib/permissions/catalog';
import { setPermissions } from '../permissions/grant';
import {
  adminDb,
  createMember,
  harnessSql,
  type Member,
  type MembershipStatus,
} from '../rls/fixtures';

export type Preset = 'owner' | 'designer' | 'foreman' | 'crew';

export const PRESET_KEYS: Record<Preset, PermissionKey[]> = {
  owner: [...PERMISSION_KEYS],
  designer: [
    'view_projects',
    'create_projects',
    'edit_model',
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
    'send_to_client',
    'export',
    'edit_field_tasks',
    'check_off_tasks',
    'photo_notes',
    'flag_conflict',
    'send_field_measurement',
    'approve_field_measurements',
    'settings_catalog',
    'settings_libraries',
  ],
  foreman: [
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
  ],
  crew: ['view_projects', 'check_off_tasks', 'photo_notes', 'flag_conflict'],
};

export const hex8 = () => randomBytes(4).toString('hex');

export async function roleId(tenant: string, preset: Preset): Promise<string> {
  const { data, error } = await adminDb()
    .from('role')
    .select('id')
    .eq('tenant_id', tenant)
    .eq('preset', preset)
    .single();
  if (error || !data) throw new Error(`role lookup failed: ${error?.message}`);
  return data.id as string;
}

export type UserOptions = {
  status?: MembershipStatus;
  preset?: Preset | null;
  // Role row id for a custom role; wins over `preset`.
  customRoleId?: string;
  granted?: readonly PermissionKey[];
  name?: string | null;
  language?: 'en' | 'es';
  email?: string;
  // SQL interval text such as '12 minutes 30 seconds'; null leaves the column null.
  lastActiveAgo?: string | null;
  invitedAgo?: string | null;
};

// One member in `tenant`: role, switches (default: the preset's keys), name, language, times.
export async function addUser(tenant: string, o: UserOptions = {}): Promise<Member> {
  const m = await createMember({ tenantId: tenant, scope: 'all', status: o.status ?? 'active' });
  const sql = harnessSql();
  const person: Record<string, unknown> = {};
  if (o.name !== undefined) person.name = o.name;
  if (o.language !== undefined) person.language = o.language;
  if (o.email !== undefined) person.email = o.email;
  if (Object.keys(person).length > 0) {
    const { error } = await adminDb().from('app_user').update(person).eq('id', m.appUserId);
    if (error) throw new Error(`app_user update failed: ${error.message}`);
  }
  const preset = o.preset === undefined ? null : o.preset;
  const rid = o.customRoleId ?? (preset ? await roleId(tenant, preset) : null);
  if (rid) {
    const { error } = await adminDb()
      .from('membership')
      .update({ role_id: rid })
      .eq('id', m.membershipId);
    if (error) throw new Error(`membership role update failed: ${error.message}`);
  }
  await setPermissions(tenant, m.membershipId, o.granted ?? (preset ? PRESET_KEYS[preset] : []));
  if (o.lastActiveAgo)
    await sql`update public.membership set last_active_at = now() - ${o.lastActiveAgo}::interval
      where id = ${m.membershipId}::uuid`;
  if (o.invitedAgo)
    await sql`update public.membership set invited_at = now() - ${o.invitedAgo}::interval
      where id = ${m.membershipId}::uuid`;
  return { ...m, email: o.email ?? m.email };
}

// `n` active members with no auth user, added by one statement; emails are `<prefix>-<i>@example.com`.
export async function addBulkMembers(tenant: string, n: number, prefix: string): Promise<void> {
  const emails = Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}@example.com`);
  await harnessSql()`
    with u as (insert into public.app_user (email) select unnest(${emails}::text[]) returning id)
    insert into public.membership (tenant_id, user_id, status, scope)
    select ${tenant}::uuid, u.id, 'active', 'all' from u`;
}

// Run after cleanup(): the bulk app_user rows have no tenant to cascade from.
export async function deleteBulkUsers(prefix: string): Promise<void> {
  await harnessSql()`delete from public.app_user where starts_with(email, ${prefix + '-'})`;
}

export async function lastActiveOf(membershipId: string): Promise<Date | null> {
  const rows = await harnessSql()<{ last_active_at: Date | null }[]>`
    select last_active_at from public.membership where id = ${membershipId}::uuid`;
  return rows[0].last_active_at;
}
