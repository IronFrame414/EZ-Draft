// EZD-129 (S15 Decision 13; board S15AccessPassword; Q-0202; Q-0695 decisions 10 rows 59, 63, 64; Q-0725 (a)):
// a member's Project access, the picker's project choices and the wizard's Foreman candidates. Types, bounds
// and the access draft's pure helpers. No React, no fetch.

export type ProjectScope = 'all' | 'listed';

export type ScopeProject = { id: string; name: string };

// GET and PUT /api/settings/users/[id]/scope.
export type MemberScope = { scope: ProjectScope; projects: ScopeProject[] };

// GET /api/settings/users/projects?q=
export type ScopeProjectChoice = { id: string; name: string; address: string };
export type ScopeProjectPage = { items: ScopeProjectChoice[]; more: boolean };

// GET /api/projects/foremen
export type ForemanCandidate = {
  membershipId: string;
  name: string | null;
  email: string;
  scope: ProjectScope;
};

// Technical limits (no source gives one; vault/build/assumptions.md EZD-129): the listed projects one save
// carries, the search text, and the picker's page.
export const SCOPE_PROJECTS_MAX = 1000;
export const SCOPE_SEARCH_MAX = 200;
export const SCOPE_PICKER_PAGE = 50;

// The draft of the control. The ids are kept sorted, so equal lists compare equal. Picking All keeps the
// ids in the draft, so going back to Listed before Save restores them; Save sends none for All.
export type AccessDraft = { scope: ProjectScope; projectIds: string[] };

const sortIds = (ids: Iterable<string>): string[] => [...new Set(ids)].sort();

export function accessOf(m: MemberScope): AccessDraft {
  return {
    scope: m.scope,
    projectIds: m.scope === 'listed' ? sortIds(m.projects.map((p) => p.id)) : [],
  };
}

export function setAccessScope(d: AccessDraft, scope: ProjectScope): AccessDraft {
  return { ...d, scope };
}

export function toggleAccessProject(d: AccessDraft, id: string): AccessDraft {
  const on = new Set(d.projectIds);
  if (on.has(id)) on.delete(id);
  else on.add(id);
  return { ...d, projectIds: sortIds(on) };
}

// The list Save sends: none for All.
export const savedProjectIds = (d: AccessDraft): string[] =>
  d.scope === 'listed' ? sortIds(d.projectIds) : [];

// The footer's n for Project access (Q-0725 (a) counts each pending edit): 1 for a scope change, plus 1 for
// each project added or removed while the draft is Listed.
export function accessEdits(saved: AccessDraft, draft: AccessDraft): number {
  let n = saved.scope !== draft.scope ? 1 : 0;
  const a = new Set(savedProjectIds(saved));
  const b = new Set(savedProjectIds(draft));
  if (draft.scope === 'listed') {
    for (const id of a) if (!b.has(id)) n += 1;
    for (const id of b) if (!a.has(id)) n += 1;
  }
  return n;
}

// The line the wizard shows under a picked Foreman: only when their access is Listed, since an All projects
// person already sees every project (board S01bForemanStates note).
export const foremanGetsListed = (f: ForemanCandidate | null): boolean =>
  f !== null && f.scope === 'listed';

export const foremanName = (f: ForemanCandidate): string =>
  f.name !== null && f.name.trim() !== '' ? f.name : f.email;
