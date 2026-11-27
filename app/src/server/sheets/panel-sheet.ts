// EZD-708c (S06 Events emitted "sheet.updated (new) on Add to E2.0"; S06 Permissions "Add to E2.0: Edit model"): the
// project a panel sheet event is logged on, read through the member's session so project RLS applies. Another
// company's project, or one outside the member's scope, reads as null.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';

export async function panelSheetProjectTenant(
  client: SupabaseClient<Database>,
  projectId: string,
): Promise<string | null> {
  const { data, error } = await client.from('project').select('tenant_id').eq('id', projectId).maybeSingle();
  if (error) throw error;
  return data?.tenant_id ?? null;
}
