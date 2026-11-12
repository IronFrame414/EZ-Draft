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
export const PROJECT_TABS = ['all', ...PROJECT_STATUSES] as const;
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
  status: ProjectStatus;
  openItems: number;
  hasThumbnail: boolean;
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
