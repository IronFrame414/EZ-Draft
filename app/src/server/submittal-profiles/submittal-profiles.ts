// EZD-712 (S15c; 03c submittal_profile): the server side of Settings > Sheet presets. Profiles are read under the
// member's session (RLS: their own company) and written only through the definer functions of
// 20261119140000_create_submittal_profile.sql, which check settings_sheet_presets again.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  changedColumns,
  profileOf,
  sortProfiles,
  type CreateProfileBody,
  type PatchProfileBody,
  type SubmittalProfile,
} from '../../lib/submittal-profiles/profiles';
import type { Database } from '../db/database.types';

type Client = SupabaseClient<Database>;

export type ProfileFailure =
  'permission_denied' | 'invalid_input' | 'name_taken' | 'not_found' | 'is_default';

const failureOf = (code: string | undefined): ProfileFailure | null => {
  switch (code) {
    case '42501':
      return 'permission_denied';
    case '22023':
      return 'invalid_input';
    case '23505':
      return 'name_taken';
    case 'P0002':
      return 'not_found';
    case 'P0001':
      return 'is_default';
    default:
      return null;
  }
};

// Every profile of the caller's company with the number of projects (that the caller can see) using it.
export async function listSubmittalProfiles(client: Client): Promise<SubmittalProfile[]> {
  const { data, error } = await client.from('submittal_profile').select('*');
  if (error) throw error;
  const counts = new Map<string, number>();
  const used = await client
    .from('project')
    .select('submittal_profile_id')
    .not('submittal_profile_id', 'is', null);
  if (used.error) throw used.error;
  for (const r of used.data ?? []) {
    const id = r.submittal_profile_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return sortProfiles((data ?? []).map((r) => profileOf(r, counts.get(r.id) ?? 0)));
}

async function one(client: Client, id: string): Promise<SubmittalProfile> {
  const list = await listSubmittalProfiles(client);
  const p = list.find((x) => x.id === id);
  if (!p) throw new Error('submittal_profile_missing_after_write');
  return p;
}

export type WriteResult<T> =
  { ok: true; tenantId: string; value: T } | { ok: false; code: ProfileFailure };

const fail = <T>(error: { code?: string }): WriteResult<T> => {
  const code = failureOf(error.code);
  if (code === null) throw error;
  return { ok: false, code };
};

export async function createSubmittalProfile(
  client: Client,
  body: CreateProfileBody,
): Promise<WriteResult<{ profile: SubmittalProfile; sourceId: string | null }>> {
  const args = {
    p_department: body.department,
    p_source: body.sourceId,
  } as unknown as Database['public']['Functions']['create_submittal_profile']['Args'];
  const { data, error } = await client.rpc('create_submittal_profile', args);
  if (error) return fail(error);
  const row = (data as unknown as Record<string, unknown>[] | null)?.[0];
  if (!row) throw new Error('create_submittal_profile_no_row');
  return {
    ok: true,
    tenantId: String(row.tenant_id),
    value: { profile: await one(client, String(row.id)), sourceId: body.sourceId },
  };
}

export async function patchSubmittalProfile(
  client: Client,
  id: string,
  body: PatchProfileBody,
): Promise<WriteResult<{ profile: SubmittalProfile; fields: string[] }>> {
  let fields: string[] = [];
  if (body.kind === 'fields') {
    const { data, error } = await client.rpc('update_submittal_profile', {
      p_id: id,
      p_changes: body.columns as never,
    });
    if (error) return fail(error);
    fields = changedColumns((data as { changed?: unknown } | null)?.changed);
  } else if (body.kind === 'default') {
    const { data, error } = await client.rpc('set_default_submittal_profile', { p_id: id });
    if (error) return fail(error);
    // null: it already was the default.
    if (data !== null) fields = ['is_default'];
  } else {
    const { data, error } = await client.rpc('archive_submittal_profile', {
      p_id: id,
      p_archived: body.archived,
    });
    if (error) return fail(error);
    if (data === true) fields = ['archived_at'];
  }
  const profile = await one(client, id);
  const tenant = await client.from('submittal_profile').select('tenant_id').eq('id', id).single();
  if (tenant.error) throw tenant.error;
  return { ok: true, tenantId: tenant.data.tenant_id, value: { profile, fields } };
}

export async function deleteSubmittalProfile(
  client: Client,
  id: string,
): Promise<WriteResult<{ movedProjects: number }>> {
  const tenant = await client
    .from('submittal_profile')
    .select('tenant_id')
    .eq('id', id)
    .maybeSingle();
  if (tenant.error) throw tenant.error;
  const { data, error } = await client.rpc('delete_submittal_profile', { p_id: id });
  if (error) return fail(error);
  if (!tenant.data) return { ok: false, code: 'not_found' };
  return { ok: true, tenantId: tenant.data.tenant_id, value: { movedProjects: Number(data ?? 0) } };
}
