// EZD-230 (Q-0038 "each user can set the order of the tools on the rail"; Q-0122): server-only helpers for the
// signed-in user's own rail tool order. The read and the write go through the caller's session client: the read is
// the caller's own app_user row (app_user_select), the write is update_my_rail_order, which touches only that row.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Session } from '../auth/session';
import type { Database } from '../db/database.types';

// The migration's rule (20261120200000_add_app_user_rail_order.sql): up to 64 distinct ids of lower-case letters,
// digits and hyphens, starting with a letter, at most 40 long.
const ID = /^[a-z][a-z0-9-]{0,39}$/;
export const RAIL_ORDER_MAX = 64;

export function parseRailOrderInput(raw: unknown): { ok: true; order: string[] } | { ok: false } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false };
  const order = (raw as { order?: unknown }).order;
  if (!Array.isArray(order) || order.length > RAIL_ORDER_MAX) return { ok: false };
  if (!order.every((id): id is string => typeof id === 'string' && ID.test(id)))
    return { ok: false };
  if (new Set(order).size !== order.length) return { ok: false };
  return { ok: true, order };
}

export async function loadRailOrder(
  client: SupabaseClient<Database>,
  session: Session,
): Promise<string[]> {
  const { data, error } = await client
    .from('app_user')
    .select('rail_order')
    .eq('id', session.appUserId)
    .single();
  if (error) throw error;
  return data.rail_order ?? [];
}

export async function saveRailOrder(
  client: SupabaseClient<Database>,
  order: string[],
): Promise<string[]> {
  const { data, error } = await client.rpc('update_my_rail_order', { p_order: order });
  if (error) throw error;
  return data ?? [];
}
