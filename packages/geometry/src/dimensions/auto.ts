// EZD-216 (09-calculations Q-0664 "Auto room dimensions: inside width and depth of each room's bounding box; auto
// overall: outer extents of all walls per axis; both recomputed through EZD-235, a user offset kept after a move";
// 03 Q-0667 "an auto room dimension takes its room's status and the auto overall dimension is Existing"; Q-0686
// case 2 (a) "a wall-face dimension is deleted in the same edit as its wall"; S03 rail Dimension "Auto dimensions
// (overall, rooms) placed automatically, then adjustable"). Pure.
//
// The values are never stored: an auto dimension stores its axis and offset, and its box is worked out through the
// derived cache (ROOM_INSIDE_BOX, FLOOR_WALL_BOX), so a wall move redraws it with the user's offset kept.
// `autoDimensionChanges` names the stored auto dimensions to add, update or remove after an edit: exactly one per
// room and axis, and one per floor and axis while the floor has walls.
import type { DerivedDef } from '../derived/derived';
import type { DimensionData, ModelObject, ObjectStatus, Point } from '../schema';
import { wallFaceOffsets, type WallObject } from '../walls/wall';
import type { Box, DimensionObject } from './measure';

type RoomObject = Extract<ModelObject, { type: 'room' }>;

/** Board S03Plan: the room's width above it and its depth to its left, 12 1/2" and 15 5/8" out at 3.2 px/in. */
export const AUTO_ROOM_OFFSET_IN = 18;
/** The overall dimensions sit outside the room dimensions. */
export const AUTO_OVERALL_OFFSET_IN = 36;

const AXES = ['x', 'y'] as const;

export function pointsBox(points: readonly Point[]): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/** A room's inside bounding box (its boundary is the walls' inside faces, room.ts). */
export function roomInsideBox(room: RoomObject): Box | null {
  return pointsBox(room.data.geometry.boundary);
}

/** The outer extents of walls: every face corner, thickness included. */
export function wallsOuterBox(walls: readonly WallObject[]): Box | null {
  const corners: Point[] = [];
  for (const w of walls) {
    const { start, end } = w.data.geometry;
    const L = Math.hypot(end.x - start.x, end.y - start.y);
    if (!(L > 0)) {
      corners.push(start);
      continue;
    }
    const n = { x: -(end.y - start.y) / L, y: (end.x - start.x) / L };
    const { oL, oR } = wallFaceOffsets(w);
    for (const p of [start, end])
      for (const o of [oL, oR]) corners.push({ x: p.x + n.x * o, y: p.y + n.y * o });
  }
  return pointsBox(corners);
}

/** EZD-235 derived value: a room's inside box, keyed by the room id. */
export const ROOM_INSIDE_BOX: DerivedDef<Box | null> = {
  name: 'room-inside-box',
  compute(read, key) {
    const o = read.object(key);
    return o !== null && o.type === 'room' ? roomInsideBox(o) : null;
  },
};

/** EZD-235 derived value: the outer extents of a floor's walls, keyed by the floor id. */
export const FLOOR_WALL_BOX: DerivedDef<Box | null> = {
  name: 'floor-wall-box',
  compute(read, key) {
    return wallsOuterBox(read.objectsOf('wall', key) as readonly WallObject[]);
  },
};

export type AutoDimensionChanges = {
  create: DimensionObject[];
  update: DimensionObject[];
  remove: string[];
};

const lower = (s: string) => s.toLowerCase();

export function autoDimensionData(
  level: string,
  axis: 'x' | 'y',
  room: RoomObject | null,
): DimensionData {
  return {
    geometry: { kind: 'auto', axis },
    status: room === null ? 'existing' : room.data.status,
    level,
    attributes: {
      kind: 'linear',
      offset: room === null ? AUTO_OVERALL_OFFSET_IN : AUTO_ROOM_OFFSET_IN,
      override: null,
      auto: room === null ? 'overall' : 'room',
      room: room === null ? null : room.id,
    },
  };
}

/**
 * The auto dimension and wall-face changes of one floor after an edit. `objects` is the floor's objects after the
 * edit (its rooms, walls and dimensions; others are skipped).
 */
export function autoDimensionChanges(
  objects: readonly ModelObject[],
  level: string,
  newId: () => string,
): AutoDimensionChanges {
  const lvl = lower(level);
  const onLevel = objects.filter(
    (o) => o.type !== 'floor' && 'level' in o.data && lower((o.data as { level: string }).level) === lvl,
  );
  const rooms = onLevel.filter((o): o is RoomObject => o.type === 'room');
  const wallIds = new Set(onLevel.filter((o) => o.type === 'wall').map((o) => lower(o.id)));
  const dims = onLevel.filter((o): o is DimensionObject => o.type === 'dimension');
  const out: AutoDimensionChanges = { create: [], update: [], remove: [] };

  // Q-0686 case 2 (a): a wall-face or angular dimension whose wall is gone goes with it.
  for (const d of dims) {
    const g = d.data.geometry;
    const gone =
      (g.kind === 'wall_face' && !wallIds.has(lower(g.wallId))) ||
      (g.kind === 'walls' && g.wallIds.some((w) => !wallIds.has(lower(w))));
    if (gone) out.remove.push(d.id);
  }

  const keep = (
    room: RoomObject | null,
    status: ObjectStatus,
    want: boolean,
    have: DimensionObject[],
  ) => {
    for (const axis of AXES) {
      const mine = have.filter((d) => d.data.geometry.kind === 'auto' && d.data.geometry.axis === axis);
      if (!want) {
        for (const d of mine) out.remove.push(d.id);
        continue;
      }
      const [first, ...extra] = mine;
      for (const d of extra) out.remove.push(d.id);
      if (first === undefined) {
        out.create.push({ id: newId(), type: 'dimension', data: autoDimensionData(level, axis, room) });
      } else if (first.data.status !== status) {
        out.update.push({ ...first, data: { ...first.data, status } });
      }
    }
  };

  const roomIds = new Set(rooms.map((r) => lower(r.id)));
  const byRoom = new Map<string, DimensionObject[]>();
  const overall: DimensionObject[] = [];
  for (const d of dims) {
    const a = d.data.attributes;
    if (a.auto === 'overall') overall.push(d);
    else if (a.auto === 'room' && a.room !== null) {
      const k = lower(a.room);
      if (!roomIds.has(k)) out.remove.push(d.id);
      else byRoom.set(k, [...(byRoom.get(k) ?? []), d]);
    }
  }
  for (const r of rooms) keep(r, r.data.status, true, byRoom.get(lower(r.id)) ?? []);
  keep(null, 'existing', wallIds.size > 0, overall);
  return out;
}
