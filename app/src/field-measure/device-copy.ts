// EZD-1417 (S17b Header "Saved on phone status"; States "offline (saved on phone)"; vault/build/assumptions.md
// EZD-1417): the phone's own copy of one project's rooms, kept in localStorage for the signed-in user and company.
// Every change is written here first, so measuring goes on offline and a reload keeps it; `synced` turns true when
// the server has the same rooms. A copy that does not read as rooms is ignored. Storage errors are swallowed: the
// screen keeps working from memory.
// EZD-1998 (AC-EZD-1998-2): the copy is checked by hand with roomsSchema's rules (room-check.ts), so the screen's
// first load carries no zod.
// EZD-2002 (audit 2026-11-27 A2; AC-EZD-2002-2): the copy also keeps savedAt, the database's time of the last save
// its rooms are built on (the PUT answer, or the page's savedAt). The page's rooms can be a stored copy from an
// earlier visit, so the screen opens with the newer of the two (openingRooms).
import { checkRooms } from './room-check';
import type { FieldRoom } from './room-model';

export type DeviceCopy = { rooms: FieldRoom[]; synced: boolean; savedAt?: string | null };

type Who = { appUserId: string; tenantId: string };

export const deviceCopyKey = (who: Who, projectId: string) =>
  `ezdraft-field-measure:${who.appUserId}:${who.tenantId}:${projectId}`;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const store = (): Store | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export function readDeviceCopy(
  who: Who,
  projectId: string,
  s: Store | undefined = store(),
): DeviceCopy | null {
  try {
    const raw = s?.getItem(deviceCopyKey(who, projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { rooms?: unknown; synced?: unknown; savedAt?: unknown };
    const rooms = checkRooms(parsed.rooms);
    if (rooms === null) return null;
    const copy: DeviceCopy = { rooms, synced: parsed.synced === true };
    // A copy kept before EZD-2002 has no save time.
    if (typeof parsed.savedAt === 'string' || parsed.savedAt === null)
      copy.savedAt = parsed.savedAt;
    return copy;
  } catch {
    return null;
  }
}

/** True when the copy was written. */
export function writeDeviceCopy(
  who: Who,
  projectId: string,
  copy: DeviceCopy,
  s: Store | undefined = store(),
): boolean {
  try {
    if (!s) return false;
    s.setItem(deviceCopyKey(who, projectId), JSON.stringify(copy));
    return true;
  } catch {
    return false;
  }
}

export function clearDeviceCopy(who: Who, projectId: string, s: Store | undefined = store()): void {
  try {
    s?.removeItem(deviceCopyKey(who, projectId));
  } catch {
    /* nothing kept */
  }
}

const timeOf = (at: string | null | undefined): number | null => {
  if (typeof at !== 'string') return null;
  const t = Date.parse(at);
  return Number.isNaN(t) ? null : t;
};

/**
 * EZD-2002 (AC-EZD-2002-2): the rooms the screen opens with, and where they came from. A copy the server does not
 * have yet (measured offline) wins, as in EZD-1417. A saved copy wins when its save is newer than the page's (the
 * page is a stored copy from an earlier visit, its rooms possibly empty); otherwise the page's rooms are the newest.
 * A saved copy with no save time (kept before EZD-2002) gives way to the page, as before.
 */
export function openingRooms(
  page: { rooms: FieldRoom[]; savedAt: string | null },
  copy: DeviceCopy | null,
): { rooms: FieldRoom[]; savedAt: string | null; from: 'page' | 'phone' } {
  const fromPage = { rooms: page.rooms, savedAt: page.savedAt, from: 'page' as const };
  if (copy === null) return fromPage;
  const fromPhone = { rooms: copy.rooms, savedAt: copy.savedAt ?? null, from: 'phone' as const };
  if (!copy.synced) return fromPhone;
  const phoneAt = timeOf(copy.savedAt);
  if (phoneAt === null) return fromPage;
  const pageAt = timeOf(page.savedAt);
  return pageAt === null || phoneAt > pageAt ? fromPhone : fromPage;
}
