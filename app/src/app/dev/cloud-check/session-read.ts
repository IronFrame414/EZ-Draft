// EZD-171 (vault/plans/EZD-171.md D7): server-only claims read for the cloud check page and its route.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../server/db/database.types';
import { createSessionClient } from '../../../server/auth/supabase-server';
import type { CloudCheckSession } from './cloud-check';

export type ClaimsRead =
  | { kind: 'client_unavailable' }
  | { kind: 'not_checked' }
  | { kind: 'signed_in'; client: SupabaseClient<Database>; tenantClaim: boolean };

export async function readClaims(): Promise<ClaimsRead> {
  let client: SupabaseClient<Database>;
  try {
    client = createSessionClient();
  } catch {
    return { kind: 'client_unavailable' };
  }
  try {
    const { data, error } = await client.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims?.sub) return { kind: 'not_checked' };
    const tenant = (claims as Record<string, unknown>).tenant_id;
    return { kind: 'signed_in', client, tenantClaim: typeof tenant === 'string' && tenant !== '' };
  } catch {
    return { kind: 'not_checked' };
  }
}

export async function sessionFromClaims(claims: ClaimsRead): Promise<CloudCheckSession> {
  if (claims.kind === 'client_unavailable') {
    return { signedIn: false, tenantClaim: false, gate: 'client_unavailable' };
  }
  if (claims.kind === 'not_checked') {
    return { signedIn: false, tenantClaim: false, gate: 'not_checked' };
  }
  try {
    const { error } = await claims.client.rpc('current_app_user_id');
    const gate = !error ? 'accepted' : error.code === '42501' ? 'refused' : 'error';
    return { signedIn: true, tenantClaim: claims.tenantClaim, gate };
  } catch {
    return { signedIn: true, tenantClaim: claims.tenantClaim, gate: 'error' };
  }
}
