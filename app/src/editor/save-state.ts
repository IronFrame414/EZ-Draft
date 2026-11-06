// EZD-120c Build step 3 (vault/plans/EZD-120c.md Decided "Save word", "Next change"; S03 States; Q-0505;
// Q-0507 gaps 4, 5): the header's save word from the sync state and the clock, and when that word next changes.
// Pure: no React, no timers.
import type { SyncState } from '../lib/outbox/outbox-sync';

type S = Pick<SyncState, 'status' | 'lastSavedAt'>;

export type SaveWordKey =
  | 'saved'
  | 'saving'
  | 'saved_on_device'
  | 'not_saved'
  | 'saved_just_now'
  | 'saved_min_ago'
  | 'saved_at';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

export function formatClock(ms: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(
    ms,
  );
}

export function saveWord(
  s: S,
  now: number,
  timeZone?: string,
): { key: SaveWordKey; params?: { minutes: number } | { time: string } } {
  switch (s.status) {
    case 'idle':
      return { key: 'saved' };
    case 'pending':
    case 'saving':
      return { key: 'saving' };
    case 'offline':
      return { key: 'saved_on_device' };
    case 'error':
      return { key: 'not_saved' };
    case 'saved': {
      if (s.lastSavedAt === null) return { key: 'saved' };
      const e = Math.max(0, now - s.lastSavedAt);
      if (e < MINUTE_MS) return { key: 'saved_just_now' };
      if (e < HOUR_MS)
        return { key: 'saved_min_ago', params: { minutes: Math.floor(e / MINUTE_MS) } };
      return { key: 'saved_at', params: { time: formatClock(s.lastSavedAt, timeZone) } };
    }
  }
}

export function nextSaveWordChangeMs(s: S, now: number): number | null {
  if (s.status !== 'saved' || s.lastSavedAt === null) return null;
  const e = Math.max(0, now - s.lastSavedAt);
  if (e < MINUTE_MS) return MINUTE_MS - e;
  if (e < HOUR_MS) return MINUTE_MS - (e % MINUTE_MS);
  return null;
}
