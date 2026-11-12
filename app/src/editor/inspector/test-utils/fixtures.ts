// EZD-213a test fixtures (vault/plans/EZD-213a.md section 4 "App fixture"). `baseObjects`, `withWalls`, `roomValue`,
// `uid`, `idSeq` and `F1` are copied from `app/src/editor/tools/test-utils/fixtures.ts` (EZD-210a); numbers are set with
// `withObjectNumber` (EZD-294); openings are built with `createOpeningData` (EZD-204a) on the host read back through
// `toModelObjects`. The builders' rooms are exactly the outlines of their walls' inside faces.
import {
  CURRENT_SCHEMA_VERSION,
  createOpeningData,
  createWallData,
  withObjectNumber,
  type ClosureOverride,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import type { ObjectValue } from '../../../lib/outbox/model-api';
import type { Objects } from '../../model/patches';
import { toModelObjects } from '../../tools/model-changes';

export const F1 = '11111111-1111-4111-8111-111111111111';

export function uid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

export function idSeq(start: number): () => string {
  let n = start;
  return () => uid(n++);
}

export const IDS = Object.freeze({
  W1: uid(1),
  W2: uid(2),
  W3: uid(3),
  W4: uid(4),
  PARTITION: uid(5),
  KITCHEN: uid(20),
  LAUNDRY: uid(21),
  EXTERIOR_DOOR: uid(30),
  INTERIOR_DOOR: uid(31),
  WINDOW: uid(32),
  LONE_WALL: uid(40),
  LONE_DOOR: uid(41),
  UNKNOWN: uid(99),
});

export function baseObjects(): Map<string, ObjectValue> {
  return new Map<string, ObjectValue>([
    [
      F1,
      { type: 'floor', schemaVersion: CURRENT_SCHEMA_VERSION, data: { name: 'Floor 1', order: 1 } },
    ],
  ]);
}

export function withWalls(
  objects: Objects,
  firstId: number,
  pts: Point[],
  closed: boolean,
  side: 'left' | 'right' | 'center' = 'right',
  level: string = F1,
): Map<string, ObjectValue> {
  const next = new Map(objects);
  const segs: [Point, Point][] = [];
  for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i]!, pts[i + 1]!]);
  if (closed) segs.push([pts[pts.length - 1]!, pts[0]!]);
  segs.forEach(([start, end], i) => {
    const r = createWallData({ start, end, level, thicknessSide: side });
    if (!r.ok) throw new Error(`withWalls: wall ${i} refused: ${r.reason}`);
    next.set(uid(firstId + i), {
      type: 'wall',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: r.data as unknown as Record<string, unknown>,
    });
  });
  return next;
}

export function roomValue(
  boundary: Point[],
  name: string,
  closureOverride: ClosureOverride | null,
  level: string = F1,
): ObjectValue {
  return {
    type: 'room',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { boundary: boundary.map((p) => ({ x: p.x, y: p.y })) },
      status: 'existing',
      level,
      attributes: { name },
      closureOverride,
    },
  };
}

const pt = (x: number, y: number): Point => ({ x, y });

function numbered(objects: Map<string, ObjectValue>, id: string, n: number): void {
  const v = objects.get(id);
  if (v === undefined) throw new Error(`numbered: no object ${id}`);
  objects.set(id, withObjectNumber(v, n));
}

function addOpening(
  objects: Map<string, ObjectValue>,
  id: string,
  kind: 'door' | 'window',
  hostId: string,
  center: Point,
  n: number,
): void {
  const host = toModelObjects(objects, F1).find(
    (o): o is WallObject => o.type === 'wall' && o.id === hostId,
  );
  if (host === undefined) throw new Error(`addOpening: no wall ${hostId}`);
  objects.set(
    id,
    withObjectNumber(
      {
        type: 'opening',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: createOpeningData({ kind, host, center }) as unknown as Record<string, unknown>,
      },
      n,
    ),
  );
}

function fourWalls(): Map<string, ObjectValue> {
  const m = withWalls(baseObjects(), 1, [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120)], true);
  for (let i = 1; i <= 4; i++) numbered(m, uid(i), i);
  return m;
}

// Floor; walls uid(1)-uid(4) closed, numbers 1-4; room Kitchen uid(20) on the 144 x 120 outline; window uid(32) on
// uid(1) at (72,0), number 1.
export function roomObjects(): Map<string, ObjectValue> {
  const m = fourWalls();
  m.set(IDS.KITCHEN, roomValue([pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120)], 'Kitchen', null));
  addOpening(m, IDS.WINDOW, 'window', IDS.W1, pt(72, 0), 1);
  return m;
}

// The four walls; partition uid(5) (60,0)->(60,120) `center`, number 5; rooms Kitchen uid(20) then Laundry uid(21);
// door uid(30) on uid(1) at (30,0) number 1; door uid(31) on uid(5) at (60,60) number 2; window uid(32) on uid(3) at
// (100,120) number 1.
export function houseObjects(): Map<string, ObjectValue> {
  const m = withWalls(fourWalls(), 5, [pt(60, 0), pt(60, 120)], false, 'center');
  numbered(m, IDS.PARTITION, 5);
  m.set(
    IDS.KITCHEN,
    roomValue([pt(0, 0), pt(57.75, 0), pt(57.75, 120), pt(0, 120)], 'Kitchen', null),
  );
  m.set(
    IDS.LAUNDRY,
    roomValue([pt(62.25, 0), pt(144, 0), pt(144, 120), pt(62.25, 120)], 'Laundry', null),
  );
  addOpening(m, IDS.EXTERIOR_DOOR, 'door', IDS.W1, pt(30, 0), 1);
  addOpening(m, IDS.INTERIOR_DOOR, 'door', IDS.PARTITION, pt(60, 60), 2);
  addOpening(m, IDS.WINDOW, 'window', IDS.W3, pt(100, 120), 1);
  return m;
}

// Floor; wall uid(40) (0,0)->end, number 9; door uid(41) at the wall's midpoint, number 3.
export function loneObjects(end: Point): Map<string, ObjectValue> {
  const m = withWalls(baseObjects(), 40, [pt(0, 0), end], false);
  numbered(m, IDS.LONE_WALL, 9);
  addOpening(m, IDS.LONE_DOOR, 'door', IDS.LONE_WALL, pt(end.x / 2, end.y / 2), 3);
  return m;
}
