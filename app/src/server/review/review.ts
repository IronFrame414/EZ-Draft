// EZD-127 (04 Header card "N to review" pill; phase-01 EZD-127 "same count on the project card, kept in
// project.open_items_count ... never counted across tables on page load"): read one project's review summary
// through the member's session client (RLS: a project out of scope reads as none). The count is always the stored
// project.open_items_count; the open review_item rows are read only when the list is asked for.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  groupReviewItems,
  isReviewSource,
  type ReviewSource,
  type ReviewSummary,
} from '../../lib/review/sources';
import type { Database } from '../db/database.types';

// `list=1` asks for the groups as well; no other value is accepted. Null = 400.
export function parseReviewQuery(params: URLSearchParams): { list: boolean } | null {
  const all = params.getAll('list');
  if (all.length === 0) return { list: false };
  if (all.length === 1 && all[0] === '1') return { list: true };
  return null;
}

// Null when the project is not visible to the caller.
export async function readReviewSummary(
  client: SupabaseClient<Database>,
  projectId: string,
  withList: boolean,
): Promise<ReviewSummary | null> {
  const project = await client
    .from('project')
    .select('open_items_count')
    .eq('id', projectId)
    .maybeSingle();
  if (project.error) throw project.error;
  if (project.data === null) return null;
  const count = project.data.open_items_count;
  if (!withList) return { count };
  const rows = await client
    .from('review_item')
    .select('source')
    .eq('project_id', projectId)
    .is('resolved_at', null);
  if (rows.error) throw rows.error;
  const sources: ReviewSource[] = [];
  for (const r of rows.data) if (isReviewSource(r.source)) sources.push(r.source);
  return { count, groups: groupReviewItems(sources) };
}
