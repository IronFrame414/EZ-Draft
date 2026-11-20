// EZD-117a Step 4 (vault/plans/EZD-117a.md Decided "Query params", "projectsUrl", "Paging", "Sort orders";
// S01 Controls, Data shown): the Projects page types and constants shared by the browser and the server.
// No React, no Supabase.
// EZD-117b Build step 3 (vault/plans/EZD-117b.md Decided "URLs", "parseProjectSearch"; Q-0448): the search cap,
// the search debounce and the `q` param.

export const PROJECT_PAGE_SIZE = 48;
export const PROJECT_STATUSES = [
  'draft',
  'client_review',
  'permit_submitted',
  'approved',
  'in_build',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
// EZD-137 (Q-0191; Q-0199; Q-0700 decisions 03): Mark complete sets complete; it is not one of the five
// hand-moved statuses, so Set status never offers it.
export const PROJECT_COMPLETE = 'complete';
export type ProjectState = ProjectStatus | typeof PROJECT_COMPLETE;
export const PROJECT_STATES = [...PROJECT_STATUSES, PROJECT_COMPLETE] as const;
// EZD-124 (Q-0702; Q-0201): Archived is the last tab; All and the five status tabs list active projects only.
// EZD-137 (Q-0702; Q-0700): Completed sits after In build, before Archived; All and the five status tabs exclude it.
export const PROJECT_TABS = ['all', ...PROJECT_STATUSES, PROJECT_COMPLETE, 'archived'] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];
export const PROJECT_SORTS = ['edited', 'name', 'client', 'status', 'open_items'] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];
export const DEFAULT_PROJECT_SORT: ProjectSort = 'edited';
export const PROJECT_SEARCH_MAX = 1000;
export const SEARCH_DEBOUNCE_MS = 250;

export type ProjectSummary = {
  id: string;
  name: string;
  clientName: string | null;
  address: string;
  status: ProjectState;
  openItems: number;
  hasThumbnail: boolean;
  // EZD-121 (S01 Data shown; Q-0700 05): the highest sent version number; null (or absent) before any send.
  versionNo?: number | null;
  // EZD-124 (Q-0201): archived_at is set; such a card sits under Archived and offers Restore.
  archived?: boolean;
  // EZD-314 (S01 States "Import in progress"): an import of the project is detecting or in review.
  importing?: boolean;
};

export function projectThumbnailSrc(projectId: string): string {
  return `/api/projects/${projectId}/thumbnail`;
}

export type ProjectPage = { items: ProjectSummary[]; next: string | null };

export type ProjectCounts = Record<ProjectTab, number>;

// Cursor characters are [A-Za-z0-9_-], so `after` needs no encoding.
export function projectsUrl(q: {
  tab: ProjectTab;
  sort: ProjectSort;
  after: string | null;
  search?: string;
}): string {
  const base = `/api/projects?status=${q.tab}&sort=${q.sort}`;
  const paged = q.after === null ? base : `${base}&after=${q.after}`;
  return q.search ? `${paged}&q=${encodeURIComponent(q.search)}` : paged;
}

export function projectCountsUrl(search?: string): string {
  const base = '/api/projects/counts';
  return search ? `${base}?q=${encodeURIComponent(search)}` : base;
}
