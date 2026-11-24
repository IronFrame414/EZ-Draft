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
import { importReviewPath } from '../imports/field-measure-import';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    .select('source, source_ref, created_at')
    .eq('project_id', projectId)
    .is('resolved_at', null)
    .order('created_at', { ascending: false });
  if (rows.error) throw rows.error;
  const sources: ReviewSource[] = [];
  for (const r of rows.data) if (isReviewSource(r.source)) sources.push(r.source);
  const groups = groupReviewItems(sources);
  // EZD-1418 (S02 Entry points "rooms sent from the phone"): a field measurement's source_ref is its import job, so
  // the line opens Import review of the newest one (supabase/migrations/…_field_measure_import.sql).
  const measured = rows.data.find((r) => r.source === 'field_measure' && UUID.test(r.source_ref));
  return {
    count,
    groups: groups.map((g) =>
      g.source === 'field_measure' && measured
        ? { ...g, href: importReviewPath(projectId, measured.source_ref) }
        : g,
    ),
  };
}
