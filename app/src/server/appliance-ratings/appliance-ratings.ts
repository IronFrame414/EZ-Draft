// EZD-614 (S15e Appliance rating defaults; Q-0766; assumptions EZD-614): the server side of the company's appliance
// rating defaults. Read under the member's session (RLS: their own company); written through
// save_appliance_rating_defaults, which checks settings_catalog again and replaces the company's list.
import type { SupabaseClient } from '@supabase/supabase-js';
import { sortRatings, type ApplianceRating } from '../../lib/appliance-ratings/ratings';
import type { Database, Json } from '../db/database.types';

type Client = SupabaseClient<Database>;

export async function loadApplianceRatings(client: Client): Promise<ApplianceRating[]> {
  const { data, error } = await client
    .from('appliance_rating_default')
    .select('appliance_type, name, volts, amps');
  if (error) throw error;
  return sortRatings(
    (data ?? []).map((r) => ({
      applianceType: r.appliance_type,
      name: r.name,
      volts: r.volts,
      amps: Number(r.amps),
    })),
  );
}

export type SaveApplianceRatingsResult =
  | { ok: true; tenantId: string; changed: string[] }
  | { ok: false; code: 'permission_denied' | 'invalid_input' };

export async function saveApplianceRatings(
  client: Client,
  rows: readonly ApplianceRating[],
): Promise<SaveApplianceRatingsResult> {
  const p_rows = rows.map((r) => ({
    appliance_type: r.applianceType,
    name: r.name,
    volts: r.volts,
    amps: r.amps,
  })) as unknown as Json;
  const { data, error } = await client.rpc('save_appliance_rating_defaults', { p_rows });
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === '22023') return { ok: false, code: 'invalid_input' };
    throw error;
  }
  const row = data?.[0];
  if (!row) throw new Error('save_appliance_rating_defaults_no_row');
  return { ok: true, tenantId: row.tenant_id, changed: row.changed };
}
