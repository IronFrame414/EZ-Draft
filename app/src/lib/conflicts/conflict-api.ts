// EZD-299b Build step 4 (vault/plans/EZD-299b.md section 3 conflict-api row; Decided D-Api; P299a section 3;
// Q-0530): the browser's calls to the sync-conflicts routes. No app-version header (saves only); nothing here is
// reported, the callers decide.
import { MEMBERSHIP_HEADER } from '../outbox/outbox';
import type { RecordedChange, SyncConflictItem } from './conflicts';

export async function getConflicts(fetchImpl: typeof fetch): Promise<SyncConflictItem[] | null> {
  try {
    const res = await fetchImpl('/api/sync-conflicts');
    if (res.status !== 200) return null;
    const items = ((await res.json()) as { items?: unknown } | null)?.items;
    return Array.isArray(items) ? (items as SyncConflictItem[]) : null;
  } catch {
    return null;
  }
}

export async function postConflicts(
  fetchImpl: typeof fetch,
  membershipId: string,
  projectId: string,
  changes: RecordedChange[],
): Promise<
  { kind: 'recorded'; ids: string[] } | { kind: 'refused'; status: number } | { kind: 'failed' }
> {
  try {
    const res = await fetchImpl(`/api/projects/${encodeURIComponent(projectId)}/sync-conflicts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [MEMBERSHIP_HEADER]: membershipId },
      body: JSON.stringify({ changes }),
    });
    if (res.status === 201) {
      const ids = ((await res.json()) as { ids?: unknown } | null)?.ids;
      if (
        Array.isArray(ids) &&
        ids.length === changes.length &&
        ids.every((id: unknown) => typeof id === 'string')
      ) {
        return { kind: 'recorded', ids: ids as string[] };
      }
      return { kind: 'failed' };
    }
    if ([400, 401, 403, 404].includes(res.status)) return { kind: 'refused', status: res.status };
    return { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}

export async function removeServerConflict(
  fetchImpl: typeof fetch,
  serverId: string,
): Promise<'removed' | 'failed'> {
  try {
    const res = await fetchImpl(`/api/sync-conflicts/${encodeURIComponent(serverId)}`, {
      method: 'DELETE',
    });
    return res.status === 200 || res.status === 404 ? 'removed' : 'failed';
  } catch {
    return 'failed';
  }
}
