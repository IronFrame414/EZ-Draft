// EZD-124 (S01 Card overflow menu, Validation; Q-0199; Q-0201; Q-0202; Q-0700 decisions 10; Q-0702; examples 09p
// Delete confirmation): the project card menu's rules and requests, shared by the browser and the server. No
// React, no Supabase.
import { PROJECT_STATUSES, type ProjectStatus } from './projects';

// The typed confirmation is trimmed (09p row 3) and compared exactly, case included (09p rows 1, 2, 4).
export function normalizeDeleteConfirm(typed: string): string {
  return typed.trim();
}

export function deleteConfirmMatches(projectName: string, typed: string): boolean {
  const t = normalizeDeleteConfirm(typed);
  return t !== '' && t === projectName;
}

export type CardMenuItem = 'rename' | 'status' | 'archive' | 'restore' | 'delete';

// Items the user lacks permission for are absent (S01 Controls; Q-0700 decisions 10): Rename and Set status need
// Edit model; Archive, Restore and Delete need Delete projects. Delete is offered at any time, even after a send
// (Q-0201). An archived card offers Restore in place of Archive.
export function cardMenuItems(p: {
  canEdit: boolean;
  canDelete: boolean;
  archived: boolean;
}): CardMenuItem[] {
  const items: CardMenuItem[] = [];
  if (p.canEdit) items.push('rename', 'status');
  if (p.canDelete) items.push(p.archived ? 'restore' : 'archive', 'delete');
  return items;
}

// The five hand-moved statuses Set status offers (Q-0199); Complete is not one of them.
export const SETTABLE_STATUSES: readonly ProjectStatus[] = PROJECT_STATUSES;

export type CardActionsApi = {
  rename(projectId: string, name: string): Promise<void>;
  setStatus(projectId: string, status: ProjectStatus): Promise<void>;
  setArchived(projectId: string, archived: boolean): Promise<void>;
  remove(projectId: string, confirmName: string): Promise<void>;
};

export class CardActionError extends Error {
  constructor(readonly status: number) {
    super('project_card_action_failed');
  }
}

async function send(url: string, method: 'PATCH' | 'POST', body: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status !== 200) throw new CardActionError(res.status);
}

export const cardActionsHttpApi: CardActionsApi = {
  rename: (id, name) => send(`/api/projects/${id}`, 'PATCH', { name }),
  setStatus: (id, status) => send(`/api/projects/${id}`, 'PATCH', { status }),
  setArchived: (id, archived) => send(`/api/projects/${id}`, 'PATCH', { archived }),
  remove: (id, confirmName) =>
    send(`/api/projects/${id}/delete`, 'POST', { confirmName: normalizeDeleteConfirm(confirmName) }),
};
