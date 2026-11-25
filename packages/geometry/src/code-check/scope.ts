// EZD-611a (09c Code check engine "Alterations"; FBC Existing Building): which objects a remodel alters. A rule
// applies to new work and to rooms that contain new or demolished objects; existing conditions that are not
// altered show as notes. vault/build/assumptions.md EZD-611a lists the choices made here.
//
// - An object of status New or Demo is altered.
// - A room is altered when its own status is New or Demo, or a New or Demo object sits in it: an object that names
//   the room (`roomId`), a wall that borders the room, an object hosted on such a wall (a door, window or blocking:
//   `hostWallId`), or an object whose point lies inside the room's outline on the same floor.
// - An existing object in an altered room is altered (its room is being remodeled).
// - An object with no status of its own (a circuit, a panel schedule) that no room holds is altered when anything
//   in the project is.
import { pointInRing } from '../rooms/area';
import type { ModelDocument, ModelObject, Point } from '../schema';

type RoomObject = Extract<ModelObject, { type: 'room' }>;
type WallObject = Extract<ModelObject, { type: 'wall' }>;

export type AlterationScope = {
  anyAltered: boolean;
  isAltered: (object: ModelObject) => boolean;
  isDemolished: (object: ModelObject) => boolean;
};

const lower = (id: string) => id.toLowerCase();

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isPoint = (v: unknown): v is Point =>
  isRecord(v) && typeof v.x === 'number' && typeof v.y === 'number';

function statusOf(object: ModelObject): string | null {
  const data = object.data as unknown;
  return isRecord(data) && typeof data.status === 'string' ? data.status : null;
}

function levelOf(object: ModelObject): string | null {
  const data = object.data as unknown;
  return isRecord(data) && typeof data.level === 'string' ? lower(data.level) : null;
}

// The room an object names, if it names one.
function roomIdOf(object: ModelObject): string | null {
  const data = object.data as unknown;
  if (!isRecord(data)) return null;
  for (const holder of [data, data.geometry, data.attributes]) {
    if (isRecord(holder) && typeof holder.roomId === 'string') return lower(holder.roomId);
  }
  return null;
}

// One point that places the object on its floor: its point, center or position, the middle of its line, or the
// average of its outline's corners.
function pointOf(object: ModelObject): Point | null {
  const data = object.data as unknown;
  if (!isRecord(data) || !isRecord(data.geometry)) return null;
  const g = data.geometry;
  for (const key of ['point', 'center', 'position']) {
    if (isPoint(g[key])) return g[key];
  }
  if (isPoint(g.start) && isPoint(g.end)) {
    return { x: (g.start.x + g.end.x) / 2, y: (g.start.y + g.end.y) / 2 };
  }
  for (const key of ['boundary', 'outline', 'footprint']) {
    const ring = g[key];
    if (Array.isArray(ring) && ring.length > 0 && ring.every(isPoint)) {
      const pts = ring as Point[];
      return {
        x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
        y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
      };
    }
  }
  return null;
}

// A wall borders a room when one of the room's outline edges runs along it: the edge is parallel to the wall and its
// middle lies within the wall's thickness of the wall's line, on the same floor. Room outlines are on the walls'
// inside finished faces (Q-0559), so a wall's own line is never inside an outline.
const BORDER_TOLERANCE_IN = 0.01;
const PARALLEL_SIN_TOLERANCE = 0.02;

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function roomsBordering(wall: WallObject, rooms: readonly RoomObject[]): RoomObject[] {
  const { start, end } = wall.data.geometry;
  const wx = end.x - start.x;
  const wy = end.y - start.y;
  const wLen = Math.hypot(wx, wy);
  if (wLen === 0) return [];
  const reach = wall.data.attributes.thickness + BORDER_TOLERANCE_IN;
  const level = lower(wall.data.level);
  return rooms.filter((r) => {
    if (lower(r.data.level) !== level) return false;
    const ring = r.data.geometry.boundary;
    return ring.some((a, i) => {
      const b = ring[(i + 1) % ring.length] as Point;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const eLen = Math.hypot(ex, ey);
      if (eLen === 0) return false;
      if (Math.abs(ex * wy - ey * wx) / (eLen * wLen) > PARALLEL_SIN_TOLERANCE) return false;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return distanceToSegment(mid, start, end) <= reach;
    });
  });
}

// The wall an object is hosted on (an opening, blocking), if it names one.
function hostWallIdOf(object: ModelObject): string | null {
  const data = object.data as unknown;
  if (!isRecord(data) || !isRecord(data.geometry)) return null;
  return typeof data.geometry.hostWallId === 'string' ? lower(data.geometry.hostWallId) : null;
}

type Plan = { rooms: readonly RoomObject[]; walls: ReadonlyMap<string, WallObject> };

// The rooms an object sits in: the room it names; for a wall, every room it borders; for an object hosted on a wall,
// the rooms that wall borders; and the rooms whose outline holds its point.
function roomsHolding(object: ModelObject, plan: Plan): RoomObject[] {
  const { rooms, walls } = plan;
  const named = roomIdOf(object);
  if (named !== null) return rooms.filter((r) => lower(r.id) === named);
  const held = new Set<RoomObject>();
  if (object.type === 'wall') for (const r of roomsBordering(object, rooms)) held.add(r);
  const host = hostWallIdOf(object);
  const hostWall = host === null ? undefined : walls.get(host);
  if (hostWall) for (const r of roomsBordering(hostWall, rooms)) held.add(r);
  const p = pointOf(object);
  if (p !== null) {
    const level = levelOf(object);
    for (const r of rooms) {
      if (
        lower(r.id) !== lower(object.id) &&
        (level === null || lower(r.data.level) === level) &&
        pointInRing(p, r.data.geometry.boundary)
      ) {
        held.add(r);
      }
    }
  }
  return [...held];
}

const isWork = (object: ModelObject) => {
  const s = statusOf(object);
  return s === 'new' || s === 'demo';
};

export function alterationScope(model: ModelDocument): AlterationScope {
  const rooms = model.objects.filter((o): o is RoomObject => o.type === 'room');
  const walls = new Map(
    model.objects.filter((o): o is WallObject => o.type === 'wall').map((w) => [lower(w.id), w]),
  );
  const plan: Plan = { rooms, walls };
  const alteredRooms = new Set<string>();
  for (const r of rooms) if (isWork(r)) alteredRooms.add(lower(r.id));
  for (const o of model.objects) {
    if (o.type === 'room' || !isWork(o)) continue;
    for (const r of roomsHolding(o, plan)) alteredRooms.add(lower(r.id));
  }
  const anyAltered = model.objects.some(isWork);

  const isAltered = (object: ModelObject): boolean => {
    if (isWork(object)) return true;
    if (object.type === 'room') return alteredRooms.has(lower(object.id));
    const holding = roomsHolding(object, plan);
    if (holding.some((r) => alteredRooms.has(lower(r.id)))) return true;
    if (holding.length === 0 && statusOf(object) === null) return anyAltered;
    return false;
  };

  return { anyAltered, isAltered, isDemolished: (o) => statusOf(o) === 'demo' };
}
