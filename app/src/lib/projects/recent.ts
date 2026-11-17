// EZD-128 Build step 3 (vault/plans/EZD-128.md Decided "Limit"; Q-0697 decisions 04; Q-0698): the project
// switcher's recent list, shared by the browser and the server. No React, no Supabase.

// Q-0698: the 8 most recently opened projects; the database refuses a limit above 20.
export const RECENT_PROJECTS_MAX = 8;
export const RECENT_PROJECTS_LIMIT_MAX = 20;

export type RecentProject = { id: string; name: string; clientName: string | null };

// Q-0726: the open project is left out.
export function recentProjectsUrl(exclude: string): string {
  return `/api/projects/recent?exclude=${encodeURIComponent(exclude)}`;
}
