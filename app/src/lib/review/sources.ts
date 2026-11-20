// EZD-127 (04 Header card "N to review" pill; phase-01 EZD-127 "list fed by typed sources that later features
// register"): the review sources, shared by the browser and the server. No React, no Supabase. The order is the
// 04 Header card row's order and the review list's order. The database check on review_item.source holds the same
// seven values (supabase/migrations/20261118231270_create_review_item.sql); a source feature opens and resolves its
// items with private.add_review_item / private.resolve_review_item.
import type { MessageKey } from '../../server/messages/catalog';

export const REVIEW_SOURCES = [
  'render_approval',
  'translation',
  'field_conflict',
  'field_measure',
  'client_comment',
  'code_warning',
  'orphan_flag',
] as const;

export type ReviewSource = (typeof REVIEW_SOURCES)[number];

export const REVIEW_SOURCE_LABEL_KEYS: Record<ReviewSource, MessageKey> = {
  render_approval: 'office.review_list.source.render_approval',
  translation: 'office.review_list.source.translation',
  field_conflict: 'office.review_list.source.field_conflict',
  field_measure: 'office.review_list.source.field_measure',
  client_comment: 'office.review_list.source.client_comment',
  code_warning: 'office.review_list.source.code_warning',
  orphan_flag: 'office.review_list.source.orphan_flag',
};

export const isReviewSource = (v: unknown): v is ReviewSource =>
  typeof v === 'string' && (REVIEW_SOURCES as readonly string[]).includes(v);

// One line of the review list: a source and how many of its items are open.
export type ReviewGroup = { source: ReviewSource; count: number };

// The pill reads only the project's stored count; the list (opened on demand) also gets the groups.
export type ReviewSummary = { count: number; groups?: ReviewGroup[] };

export function reviewUrl(projectId: string, withList: boolean): string {
  const base = `/api/projects/${encodeURIComponent(projectId)}/review`;
  return withList ? `${base}?list=1` : base;
}

// Groups in REVIEW_SOURCES order, sources with no open item left out.
export function groupReviewItems(sources: readonly ReviewSource[]): ReviewGroup[] {
  const counts = new Map<ReviewSource, number>();
  for (const s of sources) counts.set(s, (counts.get(s) ?? 0) + 1);
  return REVIEW_SOURCES.filter((s) => counts.has(s)).map((s) => ({
    source: s,
    count: counts.get(s) ?? 0,
  }));
}
