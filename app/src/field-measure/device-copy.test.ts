// EZD-1417 (S17b Header "Saved on phone"; States "offline (saved on phone)"): the phone's copy of the rooms is kept
// per user, company and project, read back whole, and ignored when it no longer reads as rooms.
import { describe, expect, it } from 'vitest';
import { clearDeviceCopy, deviceCopyKey, readDeviceCopy, writeDeviceCopy } from './device-copy';
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
