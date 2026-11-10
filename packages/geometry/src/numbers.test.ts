// EZD-294 G1-G6 (vault/plans/EZD-294.md sections 3 N1-N7 and 4; Decided "Valid number", "numbers.ts bodies";
// Q-0625 (a); AC-EZD-294-1, -2). The v3 sample supplies a valid stored wall and door.
import { describe, expect, test } from 'vitest';
import {
  NO_NUMBERS,
  NUMBER_KEYS,
  NUMBER_MAX,
  numberKeyOf,
  numberNewObjects,
  objectNumber,
  raiseNumberHighs,
  withObjectNumber,
} from './numbers';
import { CURRENT_SCHEMA_VERSION, parseStoredObject, type StoredObject } from './schema';
import v3 from './schema/samples/v3.json';

type Rec = Record<string, unknown>;
type Like = { readonly type: string; readonly data: unknown };

const objects = () => structuredClone((v3 as unknown as { objects: StoredObject[] }).objects);
const sample = (type: string, kind?: string): StoredObject => {
  const found = objects().find(
    (o) =>
      o.type === type &&
      (kind === undefined || (o.data as Rec & { attributes: Rec }).attributes.kind === kind),
  );
  if (!found) throw new Error(`samples/v3.json has no ${type} ${kind ?? ''}`);
  return found;
};
const withNumber = (o: StoredObject, number: unknown): StoredObject => {
  const data = o.data as Rec & { attributes: Rec };
  return { ...o, data: { ...data, attributes: { ...data.attributes, number } } } as StoredObject;
};
const wallLike = (number?: unknown): Like => ({
  type: 'wall',
  data: { attributes: number === undefined ? {} : { number } },
});
const openingLike = (kind: string, number?: unknown): Like => ({
  type: 'opening',
  data: { attributes: number === undefined ? { kind } : { kind, number } },
});
const roomLike = (number?: unknown): Like => ({
  type: 'room',
  data: { attributes: number === undefined ? { name: 'Room 1' } : { name: 'Room 1', number } },
});
const numberIn = (o: Like): unknown => (o.data as { attributes: Rec }).attributes.number;

describe('EZD-294 numbers', () => {
  test('EZD-294 G1 wall number in the schema', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
    expect(NUMBER_KEYS).toEqual(['wall', 'door', 'window']);
    const wall = sample('wall');
    const kept = parseStoredObject(withNumber(wall, 3));
    expect(kept.ok).toBe(true);
    if (kept.ok)
      expect((kept.object.data as unknown as { attributes: Rec }).attributes.number).toBe(3);
    const bare = parseStoredObject(wall);
    expect(bare.ok).toBe(true);
    if (bare.ok)
      expect('number' in (bare.object.data as unknown as { attributes: Rec }).attributes).toBe(
        false,
      );
    for (const bad of [0, -1, 1.5, '3', null, 2 ** 53]) {
      expect(parseStoredObject(withNumber(wall, bad)), String(bad)).toEqual({
        ok: false,
        issue: { id: wall.id, issue: 'invalid_data' },
      });
    }
  });

  test('EZD-294 G2 opening number in the schema', () => {
    const door = sample('opening', 'door');
    const kept = parseStoredObject(withNumber(door, 2));
    expect(kept.ok).toBe(true);
    if (kept.ok)
      expect((kept.object.data as unknown as { attributes: Rec }).attributes.number).toBe(2);
    expect(parseStoredObject(withNumber(door, 0))).toEqual({
      ok: false,
      issue: { id: door.id, issue: 'invalid_data' },
    });
  });

  test('EZD-294 G3 numberKeyOf and objectNumber', () => {
    expect(numberKeyOf(wallLike())).toBe('wall');
    expect(numberKeyOf(openingLike('door'))).toBe('door');
    expect(numberKeyOf(openingLike('window'))).toBe('window');
    expect(numberKeyOf(roomLike())).toBeNull();
    expect(numberKeyOf({ type: 'floor', data: { name: 'Floor 1', order: 1 } })).toBeNull();
    expect(numberKeyOf(openingLike('arch'))).toBeNull();
    expect(numberKeyOf({ type: 'wall', data: null })).toBeNull();

    expect(objectNumber(wallLike(4))).toBe(4);
    for (const bad of [0, -2, 2.5, '4', undefined]) {
      expect(objectNumber(wallLike(bad)), String(bad)).toBeNull();
    }
    expect(objectNumber(roomLike(4))).toBeNull();
  });

  test('EZD-294 G4 raiseNumberHighs', () => {
    const list: Like[] = [
      wallLike(2),
      wallLike(5),
      wallLike(1.5),
      openingLike('door', 3),
      roomLike(9),
    ];
    const copy = structuredClone(list);
    expect(raiseNumberHighs(NO_NUMBERS, list)).toEqual({ wall: 5, door: 3, window: 0 });
    const high = { wall: 9, door: 0, window: 0 };
    const highCopy = { ...high };
    expect(raiseNumberHighs(high, list)).toEqual({ wall: 9, door: 3, window: 0 });
    expect(list).toEqual(copy);
    expect(high).toEqual(highCopy);
    expect(NO_NUMBERS).toEqual({ wall: 0, door: 0, window: 0 });
    expect(Object.isFrozen(NO_NUMBERS)).toBe(true);
  });

  test('EZD-294 G5 numberNewObjects numbers per kind in order', () => {
    const door1 = openingLike('door');
    const wall = wallLike(99);
    const window1 = openingLike('window');
    const door2 = openingLike('door');
    const room = roomLike();
    const input: Like[] = [door1, wall, window1, door2, room];
    const copy = structuredClone(input);
    const highs = { wall: 4, door: 1, window: 0 };
    const out = numberNewObjects(input, highs);
    expect(out.objects).toHaveLength(5);
    expect(numberIn(out.objects[0]!)).toBe(2);
    expect(numberIn(out.objects[1]!)).toBe(5);
    expect(numberIn(out.objects[2]!)).toBe(1);
    expect(numberIn(out.objects[3]!)).toBe(3);
    expect(out.objects[4]).toBe(room);
    expect(out.highs).toEqual({ wall: 5, door: 3, window: 1 });
    expect(input).toEqual(copy);
    expect(highs).toEqual({ wall: 4, door: 1, window: 0 });
  });

  test('EZD-294 G6 withObjectNumber copies', () => {
    const wall = wallLike();
    const copy = structuredClone(wall);
    const numbered = withObjectNumber(wall, 7);
    expect(numberIn(numbered)).toBe(7);
    expect(numbered).not.toBe(wall);
    expect('number' in (wall.data as { attributes: Rec }).attributes).toBe(false);
    expect(wall).toEqual(copy);
    const room = roomLike();
    expect(withObjectNumber(room, 7)).toBe(room);
  });
});

describe('EZD-366 number bound', () => {
  test('EZD-366 B1 the schema refuses a wall or opening number above 2147483647', () => {
    expect(NUMBER_MAX).toBe(2147483647);
    for (const base of [sample('wall'), sample('opening', 'door')]) {
      const kept = parseStoredObject(withNumber(base, 2147483647));
      expect(kept.ok).toBe(true);
      if (kept.ok)
        expect((kept.object.data as unknown as { attributes: Rec }).attributes.number).toBe(
          2147483647,
        );
      expect(parseStoredObject(withNumber(base, 2147483648))).toEqual({
        ok: false,
        issue: { id: base.id, issue: 'invalid_data' },
      });
    }
  });

  test('EZD-366 B2 numberNewObjects leaves a new object unnumbered past 2147483647', () => {
    const input: Like[] = [wallLike(), wallLike(), openingLike('door'), wallLike(7)];
    const copy = structuredClone(input);
    const highs = { wall: 2147483646, door: 0, window: 0 };
    const out = numberNewObjects(input, highs);
    expect(out.objects).toHaveLength(4);
    expect(numberIn(out.objects[0]!)).toBe(2147483647);
    expect('number' in (out.objects[1]!.data as { attributes: Rec }).attributes).toBe(false);
    expect(numberIn(out.objects[2]!)).toBe(1);
    expect('number' in (out.objects[3]!.data as { attributes: Rec }).attributes).toBe(false);
    expect(out.highs).toEqual({ wall: 2147483647, door: 1, window: 0 });
    expect(numberIn(input[3]!)).toBe(7);
    expect(input).toEqual(copy);
    expect(highs).toEqual({ wall: 2147483646, door: 0, window: 0 });
  });
});
