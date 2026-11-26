// EZD-123 (S20 "Cleanup sheet: version row" one-line change summary; Q-0700 05 "Cleanup sheet"; AC-EZD-123-9, -5,
// -6): the cleanup sheet's browser parts (the summary text, the counts, the footer date, the default snapshot name,
// the route calls). No React. The rows and the change summary counts are app/src/lib/versions/cleanup.ts.
// - The change summary reads "N added · N changed · N removed", or "First version" when the row has no parent.
// - The footer date is the earliest cleanup_shown_at plus grace days (09p Cleanup clock row 6).
import type { CleanupCounts, CleanupList, CleanupRow } from '../../lib/versions/cleanup';
import { versionDate, type Text } from './versions-list';

export {
  cleanupCounts,
  storedObjects,
  type CleanupCounts,
  type CleanupList,
  type CleanupRow,
  type StoredObject,
} from '../../lib/versions/cleanup';

export function cleanupSummaryText(counts: CleanupCounts | null): Text {
  if (counts === null) return { key: 'office.versions.cleanup.first_version' };
  return { key: 'office.versions.cleanup.summary', params: { ...counts } };
}

const DAY_MS = 86_400_000;

// The earliest delete date of the rows shown: their first cleanup_shown_at plus grace days. Null with no rows.
export function cleanupDeleteOn(
  rows: readonly { shownAt: string }[],
  graceDays: number,
): Date | null {
  let first: number | null = null;
  for (const r of rows) {
    const t = Date.parse(r.shownAt);
    if (Number.isFinite(t) && (first === null || t < first)) first = t;
  }
  return first === null ? null : new Date(first + graceDays * DAY_MS);
}

// "Oct 18, 2026" (board S20 footer).
export function deleteOnText(d: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

// Whole days from the row's creation to now (the board's "30 days old · unsent").
export function ageDays(createdAt: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(createdAt)) / DAY_MS));
}

// The default snapshot name of a kept row: its date and time as the list shows it ("Oct 10 · 4:12 PM").
export function defaultSnapshotName(createdAt: string, timeZone?: string): string {
  const { date, time } = versionDate(createdAt, timeZone);
  return `${date} · ${time}`;
}

export type Choice = { keep: boolean; name: string };

// What Save choices sends: kept rows with their trimmed names (an empty name falls back to the default), and the
// unticked rows to delete.
export function cleanupChoices(
  rows: readonly CleanupRow[],
  choices: ReadonlyMap<string, Choice>,
  timeZone?: string,
): { keep: { id: string; name: string }[]; remove: string[] } {
  const keep: { id: string; name: string }[] = [];
  const remove: string[] = [];
  for (const r of rows) {
    const c = choices.get(r.id);
    if (c?.keep) {
      const name = c.name.trim();
      keep.push({
        id: r.id,
        name: name === '' ? defaultSnapshotName(r.createdAt, timeZone) : name,
      });
    } else remove.push(r.id);
  }
  return { keep, remove };
}

const cleanupUrl = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/versions/cleanup`;

async function errorCode(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { code?: unknown } } | null;
    const code = body?.error?.code;
    return typeof code === 'string' ? code : `http_${res.status}`;
  } catch {
    return `http_${res.status}`;
  }
}

// The browser's read of the due rows. Never throws.
export async function fetchCleanup(
  projectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; list: CleanupList } | { ok: false; code: string }> {
  try {
    const res = await fetchImpl(cleanupUrl(projectId), { cache: 'no-store' });
    if (!res.ok) return { ok: false, code: await errorCode(res) };
    const body = (await res.json()) as Partial<CleanupList> | null;
    if (
      !body ||
      !Array.isArray(body.rows) ||
      typeof body.graceDays !== 'number' ||
      typeof body.ageDays !== 'number'
    )
      return { ok: false, code: 'bad_response' };
    return {
      ok: true,
      list: { rows: body.rows, graceDays: body.graceDays, ageDays: body.ageDays },
    };
  } catch {
    return { ok: false, code: 'network_failed' };
  }
}

// Save choices. Never throws.
export async function postCleanup(
  projectId: string,
  body: { lockEpoch: number; keep: { id: string; name: string }[]; remove: string[] },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; kept: string[]; deleted: string[] } | { ok: false; code: string }> {
  try {
    const res = await fetchImpl(cleanupUrl(projectId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, code: await errorCode(res) };
    const r = (await res.json()) as { kept?: unknown; deleted?: unknown } | null;
    if (!Array.isArray(r?.kept) || !Array.isArray(r?.deleted))
      return { ok: false, code: 'bad_response' };
    return { ok: true, kept: r.kept as string[], deleted: r.deleted as string[] };
  } catch {
    return { ok: false, code: 'network_failed' };
  }
}
