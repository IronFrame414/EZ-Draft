// EZD-129 (S15 Decision 13; Q-0202; Q-0695 decisions 10 rows 59, 63, 64; AC-EZD-129-2, -3, -4): server-only
// helpers for Project access and the wizard's Foreman candidates. Each call is one definer function under the
// caller's session (supabase/migrations/20261113160000_create_member_scope_functions.sql,
// 20261113160001_create_project_foreman.sql); this file parses the request, calls it and maps its refusals to
// HTTP answers (architecture "Errors and logging": a known refusal is a 4xx with its own code; anything else
// is thrown to the route's 500).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  SCOPE_PROJECTS_MAX,
  SCOPE_SEARCH_MAX,
  type ForemanCandidate,
  type ProjectScope,
  type ScopeProjectPage,
  type ScopeProject,
} from '../../lib/users/scope';
import type { Database } from '../db/database.types';
import { requestIp } from '../events/event-log';
import type { MemberRefusal } from './members';

export type SaveScopeInput = { scope: ProjectScope; projectIds: string[] };

// The full new list: at most SCOPE_PROJECTS_MAX ids, no repeats, none for All.
const saveSchema = z.strictObject({
  scope: z.enum(['all', 'listed']),
  projectIds: z.array(z.uuid()).max(SCOPE_PROJECTS_MAX),
});

export function parseSaveScopeInput(raw: unknown): SaveScopeInput | null {
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) return null;
  const ids = parsed.data.projectIds.map((id) => id.toLowerCase());
  if (new Set(ids).size !== ids.length) return null;
  if (parsed.data.scope === 'all' && ids.length > 0) return null;
  return { scope: parsed.data.scope, projectIds: ids };
}

// `q` of GET /api/settings/users/projects: trimmed, at most SCOPE_SEARCH_MAX characters; null when longer.
export function parseScopeSearch(params: URLSearchParams): string | null {
  const q = (params.get('q') ?? '').trim();
  return q.length > SCOPE_SEARCH_MAX ? null : q;
}

type DbError = { code?: string; message?: string };

export function scopeRefusal(error: DbError): MemberRefusal | null {
  switch (error.code) {
    case '42501':
      return { status: 403, code: 'permission_denied' };
    case 'P0002':
      return { status: 404, code: 'member_not_found' };
    case '22023':
      return error.message === 'project_unavailable'
        ? { status: 400, code: 'project_unavailable' }
        : { status: 400, code: 'invalid_input' };
    default:
      return null;
  }
}

const projectSchema = z.object({ id: z.string(), name: z.string() });
const scopeSchema = z.object({
  scope: z.enum(['all', 'listed']),
  projects: z.array(projectSchema),
});
const saveResult = scopeSchema.extend({
  membershipId: z.string(),
  appUserId: z.string(),
  tenantId: z.string(),
  changed: z.boolean(),
  oldScope: z.enum(['all', 'listed']),
  added: z.array(z.string()),
  removed: z.array(z.string()),
});
const pageSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string(), address: z.string() })),
  more: z.boolean(),
});
const candidatesSchema = z.object({
  members: z.array(
    z.object({
      membershipId: z.string(),
      name: z.string().nullable(),
      email: z.string(),
      scope: z.enum(['all', 'listed']),
    }),
  ),
});

type Outcome<T> = { ok: true; value: T } | { ok: false; refusal: MemberRefusal };

function refuseOrThrow(error: DbError): { ok: false; refusal: MemberRefusal } {
  const refusal = scopeRefusal(error);
  if (refusal) return { ok: false, refusal };
  throw error;
}

export async function getMemberScope(
  client: SupabaseClient<Database>,
  membershipId: string,
): Promise<Outcome<{ scope: ProjectScope; projects: ScopeProject[] }>> {
  const { data, error } = await client.rpc('member_scope', { p_membership_id: membershipId });
  if (error) return refuseOrThrow(error);
  const parsed = scopeSchema.safeParse(data);
  if (!parsed.success) throw new Error('member_scope_bad_result');
  return { ok: true, value: parsed.data };
}

export type SaveScopeResult = z.infer<typeof saveResult>;

export async function saveMemberScope(
  client: SupabaseClient<Database>,
  membershipId: string,
  input: SaveScopeInput,
): Promise<Outcome<SaveScopeResult>> {
  const { data, error } = await client.rpc('save_member_scope', {
    p_membership_id: membershipId,
    p_scope: input.scope,
    p_project_ids: input.projectIds,
    // The request IP for the event_log row the function writes (null outside a request).
    p_ip: (await requestIp()) as string,
  });
  if (error) return refuseOrThrow(error);
  const parsed = saveResult.safeParse(data);
  if (!parsed.success) throw new Error('save_member_scope_bad_result');
  return { ok: true, value: parsed.data };
}

export async function listScopeProjects(
  client: SupabaseClient<Database>,
  search: string,
): Promise<Outcome<ScopeProjectPage>> {
  const { data, error } = await client.rpc('list_scope_projects', { p_search: search });
  if (error) return refuseOrThrow(error);
  const parsed = pageSchema.safeParse(data);
  if (!parsed.success) throw new Error('list_scope_projects_bad_result');
  return { ok: true, value: parsed.data };
}

export async function listForemanCandidates(
  client: SupabaseClient<Database>,
): Promise<Outcome<ForemanCandidate[]>> {
  const { data, error } = await client.rpc('list_foreman_candidates');
  if (error) return refuseOrThrow(error);
  const parsed = candidatesSchema.safeParse(data);
  if (!parsed.success) throw new Error('list_foreman_candidates_bad_result');
  return { ok: true, value: parsed.data.members };
}
