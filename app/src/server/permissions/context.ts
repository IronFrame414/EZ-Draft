// EZD-102 Step 5 (vault/plans/EZD-102.md): the signed-in member's permission set, loaded once per request
// through public.current_permissions() (one indexed query; 11 rule 10). Null means no active membership
// in the claim tenant, or an ended session (42501 from the policy helpers, Q-0052 (c)); any other database
// error rejects (Q-0168 (b)). Pattern: getSession in app/src/server/auth/session.ts.
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isPermissionKey, type PermissionKey } from '../../lib/permissions/catalog';
import { getSession } from '../auth/session';
import { createSessionClient } from '../auth/supabase-server';
import type { Database } from '../db/database.types';
import { touchLastActive } from '../users/users';

export type PermissionContext = {
  appUserId: string;
  membershipId: string;
  scope: 'all' | 'listed';
  permissions: ReadonlySet<PermissionKey>;
  listedProjectIds: ReadonlySet<string>;
};

export async function loadPermissionContext(
  client: SupabaseClient<Database>,
  appUserId: string,
): Promise<PermissionContext | null> {
  const { data, error } = await client.rpc('current_permissions');
  if (error) {
    if (error.code === '42501') return null;
    throw error;
  }
  const row = data?.[0];
  if (!row) return null;
  return {
    appUserId,
    membershipId: row.membership_id,
    // membership.scope is check-constrained to all | listed; anything else narrows to listed.
    scope: row.project_scope === 'all' ? 'all' : 'listed',
    permissions: new Set(row.permission_keys.filter(isPermissionKey)),
    listedProjectIds: new Set(row.listed_project_ids),
  };
}

// EZD-104 Build step 5 (vault/plans/EZD-104.md Decided "Where the touch runs"; Q-0695 03-data-model row 34):
// every signed-in request also moves the member's own last_active_at, in parallel on the same session
// client; touchLastActive never rejects, so it never changes the context.
export const getPermissionContext = cache(async (): Promise<PermissionContext | null> => {
  const s = await getSession();
  if (!s) return null;
  const client = createSessionClient();
  const [ctx] = await Promise.all([
    loadPermissionContext(client, s.appUserId),
    touchLastActive(client),
  ]);
  return ctx;
});

export function permissionList(ctx: PermissionContext | null): PermissionKey[] {
  return ctx ? [...ctx.permissions].sort() : [];
}
