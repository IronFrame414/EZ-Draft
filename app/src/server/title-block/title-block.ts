// EZD-709 (S15b; AC-EZD-709-1, AC-EZD-709-2): the server side of Settings > Title block. The company's title
// block switch (tenant.title_block), name, license, contact, logo and code edition are read under the member's
// session (RLS: their own company); the switch is written through update_tenant_title_block, which checks
// settings_title_block again.
import type { SupabaseClient } from '@supabase/supabase-js';
import { isCodeEdition } from '../../lib/code-edition/editions';
import {
  titleBlockOf,
  titleBlockSheetCount,
  type TitleBlockConfig,
  type TitleBlockSettings,
  type TitleBlockUsage,
} from '../../lib/title-block/title-block';
import { toCompanyData } from '../company/company';
import type { Database } from '../db/database.types';

type Client = SupabaseClient<Database>;

export async function loadTitleBlockSettings(client: Client): Promise<TitleBlockSettings | null> {
  const { data, error } = await client
    .from('tenant')
    .select('name, logo_path, license_no, contact, code_edition, title_block')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const company = await toCompanyData(client, data);
  return {
    config: titleBlockOf(data.title_block),
    company: {
      name: company.name,
      licenseNo: company.licenseNo,
      contact: company.contact,
      logoUrl: company.logo?.url ?? null,
    },
    codeEdition: isCodeEdition(data.code_edition) ? data.code_edition : null,
  };
}

export type SaveTitleBlockResult =
  | { ok: true; tenantId: string; config: TitleBlockConfig; changed: string[] }
  | { ok: false; code: 'permission_denied' | 'invalid_input' };

export async function saveTitleBlock(
  client: Client,
  patch: TitleBlockConfig,
): Promise<SaveTitleBlockResult> {
  const { data, error } = await client.rpc('update_tenant_title_block', {
    p_show_company: patch.showCompany,
  });
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === '22023') return { ok: false, code: 'invalid_input' };
    throw error;
  }
  const row = data?.[0];
  if (!row) throw new Error('update_tenant_title_block_no_row');
  return { ok: true, tenantId: row.tenant_id, config: titleBlockOf(row.title_block), changed: row.changed };
}

// EZD-1991 (Q-0813; AC-EZD-1991-1, -2): "Used on N sheets · Open Sheets". The member's projects are read under
// their session, so project RLS keeps N to the signed-in company's projects (and the member's project scope).
// Archived projects and the benchmark project are left out, as the Projects list leaves them out
// (vault/build/assumptions.md EZD-1991). Open Sheets opens the most recently changed project.
export async function loadTitleBlockUsage(client: Client): Promise<TitleBlockUsage> {
  const { data, error } = await client
    .from('project')
    .select('id, scope_trades, updated_at')
    .is('archived_at', null)
    .eq('is_benchmark', false)
    .order('updated_at', { ascending: false })
    .order('id');
  if (error) throw error;
  return {
    sheets: titleBlockSheetCount(data.map((p) => ({ scopeTrades: p.scope_trades }))),
    projectId: data[0]?.id ?? null,
  };
}
