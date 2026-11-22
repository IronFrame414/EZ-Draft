// EZD-208a Build step 7 (vault/plans/EZD-208a.md section 3 A8-A9; section 1 R1, R17; Q-0630 rows 7, 8; 11 rule 4):
// the walls and openings a click or a box can select on the open floor, on the EZD-206 spatial index (one query per
// pick, never a scan), kept current per changed object and per opening hosted on a changed wall.
// EZD-234 Build (S03 Fixtures, Select): fixtures and utility points pick too, each by its own shape.
// EZD-226 Build: tile showers pick by their footprint.
// EZD-227 Build: blocking picks by its outline and, like an opening, is re-placed when its host wall changes.
// EZD-218 (AC-EZD-218-5; Q-0630 row 8; S03 Canvas "Repeated click"): rooms pick too, after every other object: a
// click takes walls, openings and fixtures as before (under the cursor, else within the tolerance), then the rooms
// that hold the point, smallest first, so a repeated click cycles outward to the room and a wall keeps its capture
// from inside a room. Box select and Select all take rooms.
// EZD-229 (AC-EZD-229-2): the existing details pick too, each by the shape it shares with a fixture, room or utility
// point.
// EZD-215 (AC-EZD-215-3, -4): an engineer note whose letter is not on file picks by the box around its triangle, so a
// note left by a deleted wall can be selected and its form opened; a note with the letter on file is not drawn and
// does not pick.
// EZD-505 (S05 Controls "Select", "Canvas drag on object"): a beam set picks by the box around its beams, worked out
// from its room, so like an opening on its host wall it is re-placed when its room changes.
// EZD-510 (S05 Controls "Select"; AC-EZD-510-1): a switching zone picks by its own outline while its room is there, so
// its inspector can turn the dimmer on or off; like a beam set it is held by its room.
import {
  beamSetPickShape,
  blockingPickShape,
  type BlockingObject,
  type BeamData,
  type SwitchZoneData,
  createSpatialIndex,
  engineerMark,
  engineerMarkCenter,
  engineerRequired,
  fixturePickShape,
  openingPickShape,
  roomPickShape,
  parseStoredObject,
  shapeBounds,
  shapeDistance,
  shapeInRect,
  shapeTouchesRect,
  tileShowerPickShape,
  utilityPointPickShape,
  wallPickShape,
  type FixtureObject,
  type ModelObject,
  type OpeningObject,
  type PickShape,
  type Point,
  type Rect,
  type RoomObject,
  type SpatialIndex,
  type TileShowerObject,
  type UtilityPointObject,
  type WallObject,
  hasLevel,
} from '@ezdraft/geometry';
import { objectShownBy, type PhaseFilter } from '../../lib/plan/phase-view';
import type { Objects } from '../model/patches';
import { pinPickRing, type PinObject } from '../plan/pins';

// EZD-220: a pin picks by the box around its head and stem.
function pinPickShape(o: PinObject): PickShape {
  const points = pinPickRing(o.data.geometry.point);
  const w = points[1].x - points[0].x;
  const h = points[2].y - points[1].y;
  return { kind: 'quad', points, area: w * h };
}

// EZD-215: the box around the note's triangle.
type NoteObject = Extract<ModelObject, { type: 'engineer_note' }>;
function notePickShape(o: NoteObject): PickShape | null {
  if (!engineerRequired(o.data)) return null;
  const [a, b, c] = engineerMark(engineerMarkCenter(o.data.geometry));
  const points: [Point, Point, Point, Point] = [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: c.y },
    { x: a.x, y: c.y },
  ];
  return { kind: 'quad', points, area: (b.x - a.x) * (c.y - a.y) };
}

// EZD-229: the objects that pick by their own shape, the existing details among them. A detail picks by the shape it
// shares: a soffit or chase by its polygon as a room, a detector at its point as a utility point, a register or attic
// hatch by its outline as a fixture (11 Budgets: one test and one shape-by-geometry fallthrough keep the editor's first
// download small).
type DetailObject = Extract<ModelObject, { type: 'hvac' | 'access' | 'device' | 'soffit' | 'chase' }>;
type LooseObject =
  | FixtureObject
  | UtilityPointObject
  | TileShowerObject
  | PinObject
  | DetailObject
  | NoteObject;
const isLoose = (o: ModelObject): o is LooseObject =>
  /^(fixture|utility_point|tile_shower|pin|hvac|access|device|soffit|chase|engineer_note)$/.test(o.type);

export type PickIndex = {
  readonly floorId: string | null;
  // EZD-214 (Q-0671 (a)): an object the phase view hides is not in the index, so it is not clicked, boxed or taken
  // by Select all; a new filter version resyncs in full.
  sync(
    objects: Objects,
    floorId: string | null,
    changedIds: readonly string[],
    phase?: PhaseFilter | null,
  ): number;
  pick(p: Point, toleranceIn: number): string[];
  inRect(rect: Rect, mode: 'inside' | 'touch'): string[];
  all(): string[];
  has(id: string): boolean;
  body(id: string): readonly Point[] | null;
  // EZD-218: whether the id is an indexed room, and its boundary ring.
  isRoom(id: string): boolean;
  outline(id: string): readonly Point[] | null;
  lastQueryExamined(): number;
};

type Entry = { id: string; key: string; shape: PickShape; hosted: boolean; room: boolean };

function validRect(r: Rect): boolean {
  return (
    Number.isFinite(r.minX) &&
    Number.isFinite(r.minY) &&
    Number.isFinite(r.maxX) &&
    Number.isFinite(r.maxY) &&
    r.minX <= r.maxX &&
    r.minY <= r.maxY
  );
}

// D1 order: area ascending, then id lower-cased ascending.
const d1 = (a: Entry, b: Entry) =>
  a.shape.area - b.shape.area || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

function parseOnFloor(
  id: string,
  objects: Objects,
  floorId: string | null,
  phase: PhaseFilter | null,
): ModelObject | null {
  const value = objects.get(id);
  if (value === undefined || floorId === null) return null;
  const r = parseStoredObject({
    id,
    type: value.type,
    schema_version: value.schemaVersion,
    data: value.data,
  });
  if (!r.ok || !hasLevel(r.object)) return null;
  // EZD-729: the kind puts a water or drain point in the Plumbing layer.
  const d = r.object.data as { status?: unknown; attributes?: { kind?: unknown } };
  if (!objectShownBy(phase, r.object.type, d.status, d.attributes?.kind)) return null;
  return r.object.data.level.toLowerCase() === floorId.toLowerCase() ? r.object : null;
}

export function createPickIndex(): PickIndex {
  let spatial: SpatialIndex = createSpatialIndex();
  let floor: string | null = null;
  let version: number | null = null;
  // Keyed by lower-cased id.
  let entries = new Map<string, Entry>();
  let walls = new Map<string, WallObject>();
  let openings = new Map<string, OpeningObject | BlockingObject>();
  let loose = new Map<string, LooseObject>();
  let rooms = new Map<string, RoomObject>();
  // EZD-510: the room-held objects, beam sets and switching zones, in one map.
  let beams = new Map<
    string,
    { id: string; type: 'beam'; data: BeamData } | { id: string; type: 'switch_zone'; data: SwitchZoneData }
  >();
  let hostOf = new Map<string, string | null>();
  let byHost = new Map<string, Set<string>>();

  const dropOpening = (key: string) => {
    const old = hostOf.get(key);
    if (old !== undefined && old !== null) {
      const set = byHost.get(old);
      set?.delete(key);
      if (set !== undefined && set.size === 0) byHost.delete(old);
    }
    hostOf.delete(key);
    openings.delete(key);
    beams.delete(key);
  };

  const hostBy = (key: string, host: string | null) => {
    hostOf.set(key, host);
    if (host === null) return;
    let set = byHost.get(host);
    if (set === undefined) {
      set = new Set<string>();
      byHost.set(host, set);
    }
    set.add(key);
  };

  // Records the parsed object under its lower-cased key (the types that pick); anything else is dropped.
  const record = (key: string, object: ModelObject | null) => {
    walls.delete(key);
    loose.delete(key);
    rooms.delete(key);
    dropOpening(key);
    if (object !== null && object.type === 'room') {
      rooms.set(key, object);
    } else if (object !== null && isLoose(object)) {
      loose.set(key, object);
    } else if (object !== null && object.type === 'wall') {
      walls.set(key, object);
    } else if (object !== null && (object.type === 'opening' || object.type === 'blocking')) {
      openings.set(key, object);
      hostBy(key, object.data.geometry.hostWallId?.toLowerCase() ?? null);
    } else if (object !== null && (object.type === 'beam' || object.type === 'switch_zone')) {
      beams.set(key, object);
      hostBy(key, object.data.geometry.roomId.toLowerCase());
    }
  };

  const shapeOf = (
    key: string,
  ): { id: string; shape: PickShape; hosted: boolean; room?: boolean } | null => {
    const room = rooms.get(key);
    if (room !== undefined) {
      const shape = roomPickShape(room);
      return shape === null ? null : { id: room.id, shape, hosted: false, room: true };
    }
    const wall = walls.get(key);
    if (wall !== undefined) {
      const shape = wallPickShape(wall);
      return shape === null ? null : { id: wall.id, shape, hosted: false };
    }
    const free = loose.get(key);
    if (free !== undefined) {
      // A fixture, register or hatch has neither a boundary nor a point; a utility point or detector has a point.
      const g = free.data.geometry as { boundary?: unknown; point?: unknown };
      const shape =
        free.type === 'engineer_note'
          ? notePickShape(free)
          : free.type === 'tile_shower'
          ? tileShowerPickShape(free)
          : free.type === 'pin'
            ? pinPickShape(free)
            : g.boundary
              ? roomPickShape(free as unknown as RoomObject)
              : g.point
                ? utilityPointPickShape(free as UtilityPointObject)
                : fixturePickShape(free as FixtureObject);
      return shape === null ? null : { id: free.id, shape, hosted: false };
    }
    const beam = beams.get(key);
    if (beam !== undefined) {
      const room = rooms.get(beam.data.geometry.roomId.toLowerCase());
      // EZD-510: a zone's outline picks as a room's does (a ring with area).
      const shape =
        room === undefined
          ? null
          : beam.type === 'beam'
            ? beamSetPickShape(beam.data, room.data)
            : roomPickShape(beam as unknown as RoomObject);
      return shape === null ? null : { id: beam.id, shape, hosted: false };
    }
    const opening = openings.get(key);
    if (opening === undefined) return null;
    const hostId = opening.data.geometry.hostWallId;
    const host = hostId === null ? null : (walls.get(hostId.toLowerCase()) ?? null);
    const shape =
      opening.type === 'blocking'
        ? blockingPickShape(opening, host)
        : openingPickShape(opening, host);
    return shape === null ? null : { id: opening.id, shape, hosted: hostId !== null };
  };

  // Upserts or removes the key's entry; true when the index was written.
  const place = (key: string): boolean => {
    const next = shapeOf(key);
    const old = entries.get(key);
    if (next === null) {
      if (old === undefined) return false;
      spatial.remove(old.id);
      entries.delete(key);
      return true;
    }
    if (old !== undefined && old.id !== next.id) spatial.remove(old.id);
    spatial.upsert(next.id, shapeBounds(next.shape));
    entries.set(key, {
      id: next.id,
      key,
      shape: next.shape,
      hosted: next.hosted,
      room: next.room === true,
    });
    return true;
  };

  const sorted = (list: Entry[]) => list.sort(d1).map((e) => e.id);

  const entriesOf = (ids: readonly string[]): Entry[] => {
    const out: Entry[] = [];
    for (const id of ids) {
      const e = entries.get(id.toLowerCase());
      if (e !== undefined) out.push(e);
    }
    return out;
  };

  return {
    get floorId() {
      return floor;
    },
    sync(objects, floorId, changedIds, phase = null) {
      const v = phase === null ? null : phase.version();
      if (floorId !== floor || v !== version) {
        spatial = createSpatialIndex();
        floor = floorId;
        version = v;
        entries = new Map();
        walls = new Map();
        openings = new Map();
        loose = new Map();
        rooms = new Map();
        beams = new Map();
        hostOf = new Map();
        byHost = new Map();
        for (const id of objects.keys())
          record(id.toLowerCase(), parseOnFloor(id, objects, floorId, phase));
        let count = 0;
        for (const key of [
          ...walls.keys(),
          ...openings.keys(),
          ...loose.keys(),
          ...rooms.keys(),
          ...beams.keys(),
        ])
          if (place(key)) count += 1;
        return count;
      }
      const affected = new Set<string>();
      for (const id of changedIds) {
        const key = id.toLowerCase();
        affected.add(key);
        for (const o of byHost.get(key) ?? []) affected.add(o);
      }
      for (const id of changedIds)
        record(id.toLowerCase(), parseOnFloor(id, objects, floorId, phase));
      for (const id of changedIds)
        for (const o of byHost.get(id.toLowerCase()) ?? []) affected.add(o);
      let count = 0;
      for (const key of affected) if (place(key)) count += 1;
      return count;
    },
    pick(p, toleranceIn) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
      if (!Number.isFinite(toleranceIn) || !(toleranceIn > 0)) return [];
      const t = toleranceIn;
      const found = entriesOf(
        spatial.query({ minX: p.x - t, minY: p.y - t, maxX: p.x + t, maxY: p.y + t }),
      );
      const scored = found.filter((e) => !e.room).map((e) => ({ e, d: shapeDistance(e.shape, p) }));
      const under = scored.filter((s) => s.d === 0);
      const hits = under.length > 0 ? under : scored.filter((s) => s.d <= t);
      const holding = found.filter((e) => e.room && shapeDistance(e.shape, p) === 0);
      return [...sorted(hits.map((s) => s.e)), ...sorted(holding)];
    },
    inRect(rect, mode) {
      if (!validRect(rect)) return [];
      const test = mode === 'inside' ? shapeInRect : shapeTouchesRect;
      return sorted(entriesOf(spatial.query(rect)).filter((e) => test(e.shape, rect)));
    },
    all() {
      return sorted([...entries.values()]);
    },
    has(id) {
      return entries.has(id.toLowerCase());
    },
    body(id) {
      const e = entries.get(id.toLowerCase());
      if (e === undefined || !e.hosted || e.shape.kind !== 'quad') return null;
      return e.shape.points;
    },
    isRoom(id) {
      return entries.get(id.toLowerCase())?.room === true;
    },
    outline(id) {
      const e = entries.get(id.toLowerCase());
      if (e === undefined || !e.room || e.shape.kind !== 'ring') return null;
      return e.shape.points;
    },
    lastQueryExamined() {
      return spatial.lastQueryExamined();
    },
  };
}
