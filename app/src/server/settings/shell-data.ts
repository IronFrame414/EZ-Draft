// EZD-103a Step 8 (vault/plans/EZD-103a.md Decided "Loader", "Active-member count",
// `settingsPermissionContext`; S15 Controls; AC-EZD-103-6): what the Settings shell shows, read through the
// session client (RLS: the tenant row is the claim tenant). Null means the load failed.
// EZD-108 Step 15: `userName` (the name already read for the initials) for the avatar menu.
import type { SupabaseClient } from '@supabase/supabase-js';
import { initialsFor } from '../../lib/users/initials';
import type { Session } from '../auth/session';
import type { Database } from '../db/database.types';
import { can, getPermissionContext, type PermissionContext } from '../permissions';

export type SettingsShellData = {
  companyName: string;
  initials: string;
  userName: string | null;
  activeMembers: number | null;
};

export async function loadSettingsShellData(
  client: SupabaseClient<Database>,
  session: Session,
  ctx: PermissionContext | null,
): Promise<SettingsShellData | null> {
  const [tenant, user] = await Promise.all([
    client.from('tenant').select('id, name').maybeSingle(),
    client.from('app_user').select('name').eq('id', session.appUserId).maybeSingle(),
  ]);
  if (tenant.error || user.error) return null;
  const userName = user.data?.name ?? null;
  const initials = initialsFor(userName, session.email);
  if (tenant.data === null) return { companyName: '', initials, userName, activeMembers: null };
  let activeMembers: number | null = null;
  if (can(ctx, 'settings_users')) {
    const { count, error } = await client
      .from('membership')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.data.id)
      .eq('status', 'active');
    if (error) return null;
    activeMembers = count ?? 0;
  }
  return { companyName: tenant.data.name, initials, userName, activeMembers };
}

// One context load per request (React cache() inside getPermissionContext), shared by layout and page; a
// rejected load is 'failed' so the layout shows the load error and the page renders nothing.
export function settingsPermissionContext(): Promise<PermissionContext | null | 'failed'> {
  return getPermissionContext().then(
    (c) => c,
    () => 'failed' as const,
  );
}
