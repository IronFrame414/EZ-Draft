// EZD-218 AC-EZD-218-4, AC-EZD-218-6: the room type, floor finish and ceiling type in the stored schema, and the
// v5 to v6 step. Expected values: 03 Q-0664 "Rooms gain type (Kitchen, Bath, Laundry, Other; S15h), floor finish
// (free text until EZD-1611a) and ceiling type (flat, single slope, vaulted/cathedral, tray, coffered; S05) … with a
// migrate step"; AC-6 "a room stored before phase 6 opens with no type, an empty floor finish and no ceiling type".
import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../walls/test-utils/fixtures';
import { CURRENT_SCHEMA_VERSION, migrateStoredObject } from './migrate';
import {
  CEILING_TYPES,
  newRoomAttributes,
  parseStoredObject,
  ROOM_TYPES,
  type StoredObject,
} from './index';
import v2 from './samples/v2.json';
import v4 from './samples/v4.json';
import v5 from './samples/v5.json';

type Rec = Record<string, unknown>;
const roomOf = (doc: unknown): StoredObject => {
  const room = structuredClone((doc as { objects: StoredObject[] }).objects).find(
    (o) => o.type === 'room',
  );
  if (room === undefined) throw new Error('sample has no room');
  return room;
};

describe('EZD-218 room fields', () => {
  it('AC-6 a v5 room opens with no type, an empty floor finish and no ceiling type; the input is not changed', () => {
    const room = deepFreeze(roomOf(v5));
    const m = migrateStoredObject(room);
    expect(m?.schema_version).toBe(7);
    const a = (m?.data as { attributes: Rec }).attributes;
    expect(a).toEqual({
      ...((room.data as { attributes: Rec }).attributes as Rec),
      roomType: null,
      floorFinish: '',
      ceilingType: null,
      ceiling: null,
    });
    expect(parseStoredObject(m as StoredObject).ok).toBe(true);
  });

  it('AC-6 v2 and v4 rooms reach v6 the same way', () => {
    for (const doc of [v2, v4]) {
      const m = migrateStoredObject(roomOf(doc));
      expect(m?.schema_version).toBe(CURRENT_SCHEMA_VERSION);
      expect((m?.data as { attributes: Rec }).attributes).toMatchObject({
        roomType: null,
        floorFinish: '',
        ceilingType: null,
      });
      expect(parseStoredObject(m as StoredObject).ok).toBe(true);
    }
  });

  it('AC-6 the v5 → v6 step leaves other objects as they were', () => {
    const wall = deepFreeze(
      structuredClone((v5 as { objects: StoredObject[] }).objects).find((o) => o.type === 'wall')!,
    );
    const m = migrateStoredObject(wall);
    expect(m?.schema_version).toBe(7);
    expect(m?.data).toEqual(wall.data);
  });

  it('AC-4 the type lists are the spec lists', () => {
    expect(ROOM_TYPES).toEqual(['kitchen', 'bath', 'laundry', 'other']);
    expect(CEILING_TYPES).toEqual(['flat', 'single_slope', 'vaulted', 'tray', 'coffered']);
    expect(newRoomAttributes('Kitchen')).toEqual({
      name: 'Kitchen',
      floorLevel: 0,
      photos: [],
      roomType: null,
      floorFinish: '',
      ceilingType: null,
      ceiling: null,
    });
  });

  it('AC-4 each type and ceiling saves; an unknown one, a missing field and a blank name are refused', () => {
    const base = migrateStoredObject(roomOf(v5))!;
    const withAttrs = (change: (a: Rec) => void): boolean => {
      const o = structuredClone(base);
      change((o.data as { attributes: Rec }).attributes);
      return parseStoredObject(o).ok;
    };
    for (const t of ROOM_TYPES)
      expect(
        withAttrs((a) => (a.roomType = t)),
        t,
      ).toBe(true);
    for (const c of CEILING_TYPES)
      expect(
        withAttrs((a) => (a.ceilingType = c)),
        c,
      ).toBe(true);
    expect(withAttrs((a) => (a.floorFinish = 'Porcelain tile'))).toBe(true);
    expect(withAttrs((a) => (a.roomType = 'garage'))).toBe(false);
    expect(withAttrs((a) => (a.ceilingType = 'cathedral'))).toBe(false);
    expect(withAttrs((a) => delete a.roomType)).toBe(false);
    expect(withAttrs((a) => delete a.floorFinish)).toBe(false);
    expect(withAttrs((a) => (a.name = ''))).toBe(false);
  });
});
