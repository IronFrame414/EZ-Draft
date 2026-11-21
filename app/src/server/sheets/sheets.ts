// EZD-701 (AC-EZD-701-1, -2): a project's permit set, read through the member's session so project RLS applies.
// Another company's project, or one outside the member's scope, reads as null.
import type { SupabaseClient } from '@supabase/supabase-js';
import { isScopeTrade } from '../../lib/projects/new-project';
import { defaultSheetSet, type Sheet } from '../../lib/sheets/sheet-set';
import type { Database } from '../db/database.types';

export async function loadProjectSheets(
  client: SupabaseClient<Database>,
  projectId: string,
): Promise<Sheet[] | null> {
  const { data, error } = await client
    .from('project')
    .select('scope_trades')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw error;
  if (data === null) return null;
  return defaultSheetSet(data.scope_trades.filter(isScopeTrade));
}
