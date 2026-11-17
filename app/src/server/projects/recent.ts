// EZD-128 Build step 4 (vault/plans/EZD-128.md section 3 server row; Decided "`exclude` query param", "Record at
// load"; Q-0697 decisions 04): server-only helpers for the project switcher's recent list. Each goes through the
// caller's session client, one rpc each, never `.from()` (project_recent is reached only through its definer
// functions).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { RecentProject } from '../../lib/projects/recent';
import type { Database } from '../db/database.types';

// null = 400 invalid_input: `exclude` empty, malformed or given more than once. Absent = nothing left out.
export function parseRecentQuery(params: URLSearchParams): { exclude: string | null } | null {
  const all = params.getAll('exclude');
  if (all.length === 0) return { exclude: null };
  if (all.length > 1) return null;
  const v = all[0] ?? '';
  return z.uuid().safeParse(v).success ? { exclude: v.toLowerCase() } : null;
}

export async function recordProjectOpen(
  client: SupabaseClient<Database>,
  projectId: string,
): Promise<void> {
  const { error } = await client.rpc('record_project_open', { p_project: projectId });
  if (error) throw error;
}

const listSchema = z.array(
  z.object({ id: z.string(), name: z.string(), clientName: z.string().nullable() }),
);

export async function listRecentProjects(
  client: SupabaseClient<Database>,
  q: { limit: number; exclude: string | null },
): Promise<RecentProject[]> {
  const { data, error } = await client.rpc('list_recent_projects', {
    p_limit: q.limit,
    ...(q.exclude === null ? {} : { p_exclude: q.exclude }),
  });
  if (error) throw error;
  const parsed = listSchema.safeParse(data);
  if (!parsed.success) throw new Error('list_recent_projects_bad_result');
  return parsed.data.map((p) => ({ id: p.id, name: p.name, clientName: p.clientName }));
}
