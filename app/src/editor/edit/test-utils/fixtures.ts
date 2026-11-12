// EZD-217 test fixtures (vault/plans/EZD-217.md section 4 intro): WALLS, ROOM, DOOR, WINDOW. Model data comes from
// the geometry package only (lesson EZD-120d). `withObjectNumber` is applied to the whole stored value (it reads
// `type`), so the numbers really land in `data.attributes.number`.
import {
  CURRENT_SCHEMA_VERSION,
  NO_NUMBERS,
  createOpeningData,
  createWallData,
  withObjectNumber,
  type NumberHighs,
  type Point,
} from '@ezdraft/geometry';
import type { ObjectValue } from '../../../lib/outbox/model-api';
import { wallEditChanges } from '../../tools/model-changes';
import {
  F1,
  F2,
  applyChanges,
  baseObjects,
  idSeq,
  uid,
  wallsOf,
  withWalls,
} from '../../tools/test-utils/fixtures';

export { F1, F2, applyChanges, baseObjects, idSeq, uid, wallsOf };

export const p = (x: number, y: number): Point => ({ x, y });

export const highs: NumberHighs = { wall: 4, door: 1, window: 1 };

function numbered(objects: Map<string, ObjectValue>): Map<string, ObjectValue> {
  const next = new Map(objects);
  let n = 1;
  for (const [key, v] of objects) {
    if (v.type === 'wall') next.set(key, withObjectNumber(v, n++));
  }
  return next;
}

export const WALLS: Map<string, ObjectValue> = numbered(
  withWalls(baseObjects(), 1, [p(0, 0), p(144, 0), p(144, 120), p(0, 120)], true),
);

export const ROOM: Map<string, ObjectValue> = applyChanges(
  WALLS,
  wallEditChanges(WALLS, F1, wallsOf(WALLS), idSeq(5), NO_NUMBERS),
);

const wall = (n: number) => {
  const w = wallsOf(WALLS).find((x) => x.id === uid(n));
  if (w === undefined) throw new Error(`fixture wall ${n}`);
  return w;
};

function opening(kind: 'door' | 'window', host: number, center: Point): ObjectValue {
  return withObjectNumber(
    {
      type: 'opening',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: createOpeningData({ kind, host: wall(host), center }) as unknown as Record<
        string,
        unknown
      >,
    },
    1,
  );
}

export const DOOR: ObjectValue = opening('door', 1, p(72, 0));

export const WINDOW: ObjectValue = opening('window', 2, p(144, 60));

export function withOpenings(
  objects: Map<string, ObjectValue>,
  ...which: ('door' | 'window')[]
): Map<string, ObjectValue> {
  const next = new Map(objects);
  if (which.includes('door')) next.set(uid(50), DOOR);
  if (which.includes('window')) next.set(uid(51), WINDOW);
  return next;
}

export function wallOnF2(): ObjectValue {
  const r = createWallData({ start: p(0, 500), end: p(144, 500), level: F2 });
  if (!r.ok) throw new Error('fixture wall on F2');
  return {
    type: 'wall',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: r.data as unknown as Record<string, unknown>,
  };
}

type Geo = {
  start: Point;
  end: Point;
  center: Point;
  hostWallId: string | null;
  axis: Point | null;
};
type Data = {
  geometry: Geo;
  level: string;
  status: string;
  attributes: Record<string, unknown>;
};
export function dataOf(v: ObjectValue | null | undefined): Data {
  if (v === null || v === undefined) throw new Error('no value');
  return v.data as unknown as Data;
}
