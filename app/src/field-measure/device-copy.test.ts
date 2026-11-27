// EZD-1417 (S17b Header "Saved on phone"; States "offline (saved on phone)"): the phone's copy of the rooms is kept
// per user, company and project, read back whole, and ignored when it no longer reads as rooms.
import { describe, expect, it } from 'vitest';
import {
  clearDeviceCopy,
  deviceCopyKey,
  openingRooms,
  readDeviceCopy,
  writeDeviceCopy,
} from './device-copy';
import { emptyRoom, initialRooms, withShape } from './rooms';

function memoryStore() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const A = { appUserId: 'u1', tenantId: 't1' };
const P = '00000000-0000-4000-8000-000000000001';
const ROOMS = [initialRooms()[0]!, withShape(emptyRoom('r1', 'room', 'Kitchen'), 'rectangle')];

describe('EZD-1417 rooms saved on the phone', () => {
  it('a written copy reads back whole, unsynced until marked', () => {
    const s = memoryStore();
    expect(writeDeviceCopy(A, P, { rooms: ROOMS, synced: false }, s)).toBe(true);
    expect(readDeviceCopy(A, P, s)).toEqual({ rooms: ROOMS, synced: false });
    writeDeviceCopy(A, P, { rooms: ROOMS, synced: true }, s);
    expect(readDeviceCopy(A, P, s)?.synced).toBe(true);
    clearDeviceCopy(A, P, s);
    expect(readDeviceCopy(A, P, s)).toBeNull();
  });

  it('another user, company or project reads nothing', () => {
    const s = memoryStore();
    writeDeviceCopy(A, P, { rooms: ROOMS, synced: false }, s);
    expect(readDeviceCopy({ appUserId: 'u2', tenantId: 't1' }, P, s)).toBeNull();
    expect(readDeviceCopy({ appUserId: 'u1', tenantId: 't2' }, P, s)).toBeNull();
    expect(readDeviceCopy(A, '00000000-0000-4000-8000-000000000002', s)).toBeNull();
    expect(deviceCopyKey(A, P)).toBe(`ezdraft-field-measure:u1:t1:${P}`);
  });

  it('a copy that is not a room list, or no storage, is ignored', () => {
    const s = memoryStore();
    s.setItem(deviceCopyKey(A, P), JSON.stringify({ rooms: [{ id: 'x' }], synced: false }));
    expect(readDeviceCopy(A, P, s)).toBeNull();
    s.setItem(deviceCopyKey(A, P), '{not json');
    expect(readDeviceCopy(A, P, s)).toBeNull();
    expect(writeDeviceCopy(A, P, { rooms: ROOMS, synced: false }, undefined)).toBe(false);
  });
});

// EZD-2002 (audit 2026-11-27 A2; AC-EZD-2002-2 "Field measure uses the phone's copy of the rooms whenever it is newer
// than the page's copy, so rooms saved online and reopened offline are the latest ones"; AC-EZD-2002-3). Times are
// the database's (field_measure_session.updated_at as PostgREST writes it).
describe("EZD-2002 the newer of the phone's copy and the page's rooms", () => {
  const EMPTY = [initialRooms()[0]!];
  const EARLY = '2026-11-27T14:00:00.000001+00:00';
  const LATER = '2026-11-27T14:05:30.25+00:00';

  it('the save time is kept with the copy and read back; a copy kept before it reads as before', () => {
    const s = memoryStore();
    writeDeviceCopy(A, P, { rooms: ROOMS, synced: true, savedAt: LATER }, s);
    expect(readDeviceCopy(A, P, s)).toEqual({ rooms: ROOMS, synced: true, savedAt: LATER });
    s.setItem(deviceCopyKey(A, P), JSON.stringify({ rooms: ROOMS, synced: true }));
    expect(readDeviceCopy(A, P, s)).toEqual({ rooms: ROOMS, synced: true });
  });

  it('saved online, reopened offline from the first visit (no rooms saved then): the phone copy', () => {
    const open = openingRooms(
      { rooms: EMPTY, savedAt: null },
      { rooms: ROOMS, synced: true, savedAt: LATER },
    );
    expect(open).toEqual({ rooms: ROOMS, savedAt: LATER, from: 'phone' });
  });

  it('saved online, reopened offline from an older stored page: the phone copy', () => {
    const open = openingRooms(
      { rooms: EMPTY, savedAt: EARLY },
      { rooms: ROOMS, synced: true, savedAt: LATER },
    );
    expect(open.from).toBe('phone');
    expect(open.rooms).toEqual(ROOMS);
  });

  it("a page saved later than the phone's copy (or at the same save) wins", () => {
    expect(
      openingRooms(
        { rooms: EMPTY, savedAt: LATER },
        { rooms: ROOMS, synced: true, savedAt: EARLY },
      ),
    ).toEqual({ rooms: EMPTY, savedAt: LATER, from: 'page' });
    expect(
      openingRooms({ rooms: ROOMS, savedAt: LATER }, { rooms: ROOMS, synced: true, savedAt: LATER })
        .from,
    ).toBe('page');
  });

  it('a copy not saved yet wins, as in EZD-1417; a saved copy with no save time gives way, as before', () => {
    expect(
      openingRooms(
        { rooms: EMPTY, savedAt: LATER },
        { rooms: ROOMS, synced: false, savedAt: EARLY },
      ),
    ).toEqual({ rooms: ROOMS, savedAt: EARLY, from: 'phone' });
    expect(openingRooms({ rooms: EMPTY, savedAt: null }, { rooms: ROOMS, synced: true }).from).toBe(
      'page',
    );
    expect(openingRooms({ rooms: EMPTY, savedAt: null }, null)).toEqual({
      rooms: EMPTY,
      savedAt: null,
      from: 'page',
    });
  });
});
