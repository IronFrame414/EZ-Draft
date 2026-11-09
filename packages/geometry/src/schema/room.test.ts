// EZD-205a · T17, T18: room status and closure override in the stored schema, and the v2 to v3 migration
// (vault/plans/EZD-205a.md section 1 Decided "Room data shape", "closureOverride", "v2 → v3 step"; section 3;
// section 4). Expected values: Q-0570; Q-0558 (Existing); 03b rule 5; the ticket's Done when (a stored room of
// schema version 2 loads through migrate with status Existing and no override).
import { describe, expect, it } from 'vitest';
import { uid } from '../rooms/test-utils/fixtures';
import { deepFreeze } from '../walls/test-utils/fixtures';
import { migrateStoredObject } from './migrate';
import { parseStoredObject, type StoredObject } from './index';
import v1 from './samples/v1.json';
import v2 from './samples/v2.json';
import v3 from './samples/v3.json';
import v4 from './samples/v4.json';

type Rec = Record<string, unknown>;
type Doc = { objects: StoredObject[] };

const objectsOf = (doc: unknown): StoredObject[] => structuredClone((doc as Doc).objects);
const floor1Room = (doc: unknown): StoredObject => {
  const objects = objectsOf(doc);
  const floor1 = objects.find((o) => o.type === 'floor' && (o.data as Rec).name === 'Floor 1');
  const room = objects.find((o) => o.type === 'room' && (o.data as Rec).level === floor1?.id);
  if (!floor1 || !room) throw new Error('sample has no Floor 1 room');
  return room;
};
const OVERRIDE = { who: uid(7), when: '2026-11-06T12:00:00.000Z', gap: { x: 0, y: 0.5 } };

describe('EZD-205a room schema', () => {
  it('EZD-205a T17 schema: a room holds its status and closure override', () => {
    const cases: [string, (d: Rec) => void, 'ok' | 'invalid_data'][] = [
      ['as is', () => undefined, 'ok'],
      ['status demo', (d) => void (d.status = 'demo'), 'ok'],
      ['status new', (d) => void (d.status = 'new'), 'ok'],
      ['override set', (d) => void (d.closureOverride = structuredClone(OVERRIDE)), 'ok'],
      ['no status', (d) => void delete d.status, 'invalid_data'],
      ['status old', (d) => void (d.status = 'old'), 'invalid_data'],
      ['no closureOverride', (d) => void delete d.closureOverride, 'invalid_data'],
      ['override yes', (d) => void (d.closureOverride = 'yes'), 'invalid_data'],
      ['who u1', (d) => void (d.closureOverride = { ...OVERRIDE, who: 'u1' }), 'invalid_data'],
      [
        'when date only',
        (d) => void (d.closureOverride = { ...OVERRIDE, when: '2026-11-06' }),
        'invalid_data',
      ],
      [
        'when with offset',
        (d) => void (d.closureOverride = { ...OVERRIDE, when: '2026-11-06T12:00:00+02:00' }),
        'invalid_data',
      ],
      [
        'gap without y',
        (d) => void (d.closureOverride = { ...OVERRIDE, gap: { x: 0 } }),
        'invalid_data',
      ],
      [
        'override extra key',
        (d) => void (d.closureOverride = { ...OVERRIDE, note: 'x' }),
        'invalid_data',
      ],
    ];
    for (const [name, mutate, want] of cases) {
      const room = floor1Room(v3);
      expect(room.schema_version, name).toBe(3);
      mutate(room.data as Rec);
      const r = parseStoredObject(room);
      if (want === 'ok') expect(r.ok, name).toBe(true);
      else expect(r, name).toEqual({ ok: false, issue: { id: room.id, issue: 'invalid_data' } });
    }
  });

  it('EZD-205a T18 migrate v2 → v3: a v2 room gets status Existing and no override; nothing else changes', () => {
    const room = deepFreeze(floor1Room(v2));
    const wallFound = objectsOf(v2).find((o) => o.type === 'wall');
    if (!wallFound) throw new Error('samples/v2.json has no wall');
    const wall = deepFreeze(wallFound);
    const nullRoom = deepFreeze({ ...floor1Room(v2), data: null });

    const mRoom = migrateStoredObject(room);
    expect(mRoom?.schema_version).toBe(4);
    const d = mRoom?.data as Rec;
    const src = room.data as Rec;
    expect(d.status).toBe('existing');
    expect(d.closureOverride).toBeNull();
    expect(d.geometry).toEqual(src.geometry);
    expect(d.level).toEqual(src.level);
    expect(d.attributes).toEqual(src.attributes);

    const mWall = migrateStoredObject(wall);
    expect(mWall?.schema_version).toBe(4);
    expect(mWall?.data).toEqual(wall.data);

    const mNull = migrateStoredObject(nullRoom);
    expect(mNull?.schema_version).toBe(4);
    expect(mNull?.data).toBeNull();

    expect(objectsOf(v2).map((o) => migrateStoredObject(o))).toEqual(objectsOf(v4));
    expect(objectsOf(v1).map((o) => migrateStoredObject(o))).toEqual(objectsOf(v4));
  });
});
