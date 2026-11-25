// EZD-1417 (S17b Header "Saved on phone status"; States "offline (saved on phone)"; vault/build/assumptions.md
// EZD-1417): the phone's own copy of one project's rooms, kept in localStorage for the signed-in user and company.
// Every change is written here first, so measuring goes on offline and a reload keeps it; `synced` turns true when
// the server has the same rooms. A copy that does not read as rooms is ignored. Storage errors are swallowed: the
// screen keeps working from memory.
import { roomsSchema, type FieldRoom } from './rooms';

export type DeviceCopy = { rooms: FieldRoom[]; synced: boolean };

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
    const parsed = JSON.parse(raw) as { rooms?: unknown; synced?: unknown };
    const rooms = roomsSchema.safeParse(parsed.rooms);
    if (!rooms.success) return null;
    return { rooms: rooms.data, synced: parsed.synced === true };
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
