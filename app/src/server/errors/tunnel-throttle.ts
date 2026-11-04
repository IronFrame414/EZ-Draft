// EZD-143 (vault/plans/EZD-143.md D3, D7, D8; Q-0276 (a)): the error tunnel's per-address count. The address
// is EZD-033's clientIp and its key throttleKey('ip', ...), so no address reaches the database. The call goes
// through alertStoreClient() (anon behind the request gate), so the supabase package is imported as a type
// only (EZD-007c T34).
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientIp, throttleKey } from '../auth/throttle';
import type { Database } from '../db/database.types';
import { alertStoreClient } from './report';

// Takes `events` slots for the key. Throws on any database error.
export async function tunnelThrottleTake(
  client: SupabaseClient<Database>,
  ipKey: string,
  events: number,
): Promise<boolean> {
  const { data, error } = await client.rpc('error_tunnel_take', {
    p_ip_key: ipKey,
    p_events: events,
  });
  if (error || typeof data !== 'boolean') throw new Error('tunnel_throttle_unavailable');
  return data;
}

// True when the envelope's events may pass. No address means no count. Never throws: a failed count lets the
// envelope through (reporting never breaks the app), and nothing is logged or reported, which would loop.
export async function tunnelAllows(
  headers: Headers,
  events: number,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const ip = clientIp(headers, env);
  if (ip === null) return true;
  try {
    const ipKey = throttleKey('ip', ip);
    const client = alertStoreClient();
    return await tunnelThrottleTake(client, ipKey, events);
  } catch {
    return true;
  }
}
