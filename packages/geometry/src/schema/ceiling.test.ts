// EZD-501 AC-EZD-501-1 "A vaulted room stores ridge height and pitch", and the v6 to v7 step. Expected values:
// S05 Room ceiling summary "walls 8' 0" · ridge 13' 0" · 9.4/12" (ridge 156", pitch 9.4 per 12); S05 Data shown
// "type, ridge line and direction, heights per wall or point, pitch"; phase-05 EZD-501 "default flat at wall
// height"; 03b rule 5 (a migrate step per version).
import { describe, expect, it } from 'vitest';
import { uid } from '../rooms/test-utils/fixtures';
import { deepFreeze } from '../walls/test-utils/fixtures';
import { CURRENT_SCHEMA_VERSION, migrateStoredObject } from './migrate';
import {
  newRoomAttributes,
  parseModelDocument,
  parseStoredObject,
  roomCeilingType,
  type RoomData,
  type StoredObject,
} from './index';
import v6 from './samples/v6.json';
import v7 from './samples/v7.json';

type Rec = Record<string, unknown>;
const objectsOf = (doc: unknown): StoredObject[] =>
  structuredClone((doc as { objects: StoredObject[] }).objects);
const v6Room = (): StoredObject => objectsOf(v6).find((o) => o.type === 'room')!;

// The S05 summary example: walls 8' 0", ridge 13' 0", 9.4/12, ridge running across the 20' room's middle.
const VAULT = {
  heightsBy: 'pitch',
  wallHeights: [],
  pointHeights: [],
  pitch: 9.4,
  ridge: { start: { x: 0, y: 96 }, end: { x: 240, y: 96 }, height: 156 },
};

function storedRoom(ceilingType: unknown, ceiling: unknown): StoredObject {
  const room = migrateStoredObject(v6Room())!;
  const data = structuredClone(room.data) as { attributes: Rec };
  data.attributes.ceilingType = ceilingType;
  data.attributes.ceiling = ceiling;
  return { ...room, data };
}

describe('EZD-501 ceiling data per room', () => {
  it('AC-EZD-501-1 a vaulted room stores ridge height and pitch', () => {
    const r = parseStoredObject(storedRoom('vaulted', structuredClone(VAULT)));
    expect(r.ok).toBe(true);
    if (!r.ok || r.object.type !== 'room') throw new Error('room did not parse');
    const a = (r.object.data as RoomData).attributes;
    expect(a.ceilingType).toBe('vaulted');
    expect(a.ceiling?.ridge?.height).toBe(156);
    expect(a.ceiling?.pitch).toBe(9.4);
    expect(a.ceiling?.ridge?.start).toEqual({ x: 0, y: 96 });
    expect(a.ceiling?.ridge?.end).toEqual({ x: 240, y: 96 });
  });

  it('heights per wall and per point are stored', () => {
    const byWall = {
      ...VAULT,
      heightsBy: 'wall',
      pitch: null,
      ridge: null,
      wallHeights: [
        { wall: uid(1), height: 96 },
        { wall: uid(2), height: 144 },
      ],
    };
    const byPoint = {
      ...VAULT,
      heightsBy: 'point',
      pitch: null,
      pointHeights: [
        { at: { x: 0, y: 0 }, height: 96 },
        { at: { x: 0, y: 96 }, height: 156 },
      ],
    };
    expect(parseStoredObject(storedRoom('single_slope', byWall)).ok).toBe(true);
    expect(parseStoredObject(storedRoom('vaulted', byPoint)).ok).toBe(true);
  });

  it('refuses ceiling data that cannot be a ceiling', () => {
    const bad: [string, Rec][] = [
      ['pitch 0', { ...VAULT, pitch: 0 }],
      ['pitch below 0', { ...VAULT, pitch: -9.4 }],
      ['ridge height 0', { ...VAULT, ridge: { ...VAULT.ridge, height: 0 } }],
      ['ridge of one point', { ...VAULT, ridge: { ...VAULT.ridge, end: { x: 0, y: 96 } } }],
      ['heights by slope', { ...VAULT, heightsBy: 'slope' }],
      ['unknown key', { ...VAULT, ridgeDirection: 'north' }],
      ['no pitch key', Object.fromEntries(Object.entries(VAULT).filter(([k]) => k !== 'pitch'))],
      [
        'one wall twice',
        {
          ...VAULT,
          wallHeights: [
            { wall: uid(1), height: 96 },
            { wall: uid(1).toUpperCase(), height: 120 },
          ],
        },
      ],
      ['wall height below 0', { ...VAULT, wallHeights: [{ wall: uid(1), height: -1 }] }],
      ['wall not a uuid', { ...VAULT, wallHeights: [{ wall: 'w1', height: 96 }] }],
      ['point height 0', { ...VAULT, pointHeights: [{ at: { x: 0, y: 0 }, height: 0 }] }],
    ];
    for (const [name, ceiling] of bad) {
      const r = parseStoredObject(storedRoom('vaulted', ceiling));
      expect(r.ok ? 'ok' : r.issue.issue, name).toBe('invalid_data');
    }
    const noKey = migrateStoredObject(v6Room())!;
    delete ((noKey.data as { attributes: Rec }).attributes as Rec).ceiling;
    expect(parseStoredObject(noKey).ok).toBe(false);
  });

  it('default flat at wall height: a new room has no stored ceiling and no type reads as flat', () => {
    expect(newRoomAttributes('Room 1').ceiling).toBeNull();
    expect(roomCeilingType({ ceilingType: null })).toBe('flat');
    expect(roomCeilingType({ ceilingType: 'vaulted' })).toBe('vaulted');
  });

  it('v6 → v7 gives a room no stored ceiling, leaves other objects as they were, and keeps the input', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
    const room = deepFreeze(v6Room());
    const m = migrateStoredObject(room);
    expect(m?.schema_version).toBe(7);
    expect((m?.data as { attributes: Rec }).attributes).toEqual({
      ...((room.data as { attributes: Rec }).attributes as Rec),
      ceiling: null,
    });
    const wall = deepFreeze(objectsOf(v6).find((o) => o.type === 'wall')!);
    expect(migrateStoredObject(wall)).toEqual({ ...wall, schema_version: 7 });
  });

  it('v7.json is v6.json one step on, then a vaulted room; it parses whole', () => {
    const six = objectsOf(v6);
    const seven = objectsOf(v7);
    expect(six.map((o) => migrateStoredObject(o))).toEqual(seven.slice(0, six.length));
    const vaulted = seven[six.length]!;
    expect(seven.length).toBe(six.length + 1);
    expect((vaulted.data as { attributes: Rec }).attributes).toMatchObject({
      ceilingType: 'vaulted',
      ceiling: { pitch: 6, ridge: { height: 144 } },
    });
    expect(parseModelDocument(structuredClone(v7)).ok).toBe(true);
  });
});
