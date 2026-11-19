// EZD-613 (S15g; Q-0210; AC-EZD-613-1): the server side of Settings > Code edition. The company's edition
// (tenant.code_edition) and the optional load-calc method default (tenant.defaults.optional_load_calc) are read
// under the member's session (RLS: their own company) and written through update_tenant_code_edition, which
// checks settings_code_edition again and never touches a project.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  settingsOf,
  type CodeEditionPatch,
  type CodeEditionSettings,
} from '../../lib/code-edition/editions';
import type { Database } from '../db/database.types';

type Client = SupabaseClient<Database>;

export async function loadCodeEditionSettings(client: Client): Promise<CodeEditionSettings> {
  const { data, error } = await client.from('tenant').select('code_edition, defaults').maybeSingle();
  if (error) throw error;
  return settingsOf(data?.code_edition ?? null, data?.defaults ?? null);
}

export type SaveCodeEditionResult =
  | { ok: true; tenantId: string; settings: CodeEditionSettings; changed: string[] }
  | { ok: false; code: 'permission_denied' | 'invalid_input' };

export async function saveCodeEditionSettings(
  client: Client,
  patch: CodeEditionPatch,
): Promise<SaveCodeEditionResult> {
  // The generated Args type marks both arguments non-null; null leaves that value unchanged.
  const args = {
    p_code_edition: patch.edition ?? null,
    p_optional_load_calc: patch.optionalLoadCalc ?? null,
  } as unknown as Database['public']['Functions']['update_tenant_code_edition']['Args'];
  const { data, error } = await client.rpc('update_tenant_code_edition', args);
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === '22023') return { ok: false, code: 'invalid_input' };
    throw error;
  }
  const row = data?.[0];
  if (!row) throw new Error('update_tenant_code_edition_no_row');
  return {
    ok: true,
    tenantId: row.tenant_id,
    settings: settingsOf(row.code_edition, row.tenant_defaults),
    changed: row.changed,
  };
}
