// EZD-007d Step 2 (vault/plans/EZD-007d.md; parent P-Step 3; D3): after verifyOtp, link the app_user,
// accept the most recently sent valid invite (EZD-007b link_app_user), emit user.joined and refresh the
// session so the token hook adds the tenant claim. Fails closed; logs nothing.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import { emit } from '../events';

type LinkRow = {
  app_user_id: string;
  has_access: boolean;
  accepted_membership_id: string | null;
  accepted_tenant_id: string | null;
};

export async function completeSignIn(
  client: SupabaseClient<Database>,
): Promise<'ok' | 'no_access'> {
  const { data, error } = await client.rpc('link_app_user');
  if (error) {
    await client.auth.signOut({ scope: 'local' });
    throw new Error('link_app_user_failed');
  }

  const row = (data as LinkRow[] | null)?.[0];
  if (!row || !row.has_access) {
    await client.auth.signOut({ scope: 'local' });
    return 'no_access';
  }

  if (row.accepted_membership_id && row.accepted_tenant_id) {
    try {
      await emit(
        'user.joined',
        { membershipId: row.accepted_membership_id, appUserId: row.app_user_id, via: 'sign_in' },
        { tenantId: row.accepted_tenant_id, actorId: row.app_user_id },
      );
    } catch {
      // The acceptance is already committed (P-Step 3); a failed emit does not fail the sign-in.
    }
  }

  const refreshed = await client.auth.refreshSession();
  if (refreshed.error) {
    await client.auth.signOut({ scope: 'local' });
    throw new Error('session_refresh_failed');
  }
  return 'ok';
}
