// EZD-208a Build step 7 (vault/plans/EZD-208a.md section 3 A8-A9; section 1 R1, R17; Q-0630 rows 7, 8; 11 rule 4):
// the walls and openings a click or a box can select on the open floor, on the EZD-206 spatial index (one query per
// pick, never a scan), kept current per changed object and per opening hosted on a changed wall.
// EZD-234 Build (S03 Fixtures, Select): fixtures and utility points pick too, each by its own shape.
// EZD-226 Build: tile showers pick by their footprint.
import {
  createSpatialIndex,
  fixturePickShape,
  openingPickShape,
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
  type SpatialIndex,
  type TileShowerObject,
  type UtilityPointObject,
  type WallObject,
} from '@ezdraft/geometry';
import type { Objects } from '../model/patches';

export type PickIndex = {
  readonly floorId: string | null;
  sync(objects: Objects, floorId: string | null, changedIds: readonly string[]): number;
  pick(p: Point, toleranceIn: number): string[];
  inRect(rect: Rect, mode: 'inside' | 'touch'): string[];
  all(): string[];
  has(id: string): boolean;
  body(id: string): readonly Point[] | null;
  lastQueryExamined(): number;
};

type Entry = { id: string; key: string; shape: PickShape; hosted: boolean };

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

function parseOnFloor(id: string, objects: Objects, floorId: string | null): ModelObject | null {
  const value = objects.get(id);
  if (value === undefined || floorId === null) return null;
  const r = parseStoredObject({
    id,
    type: value.type,
    schema_version: value.schemaVersion,
    data: value.data,
  });
  if (!r.ok || r.object.type === 'floor') return null;
  return r.object.data.level.toLowerCase() === floorId.toLowerCase() ? r.object : null;
}

export function createPickIndex(): PickIndex {
  let spatial: SpatialIndex = createSpatialIndex();
  let floor: string | null = null;
  // Keyed by lower-cased id.
  let entries = new Map<string, Entry>();
  let walls = new Map<string, WallObject>();
  let openings = new Map<string, OpeningObject>();
  let loose = new Map<string, FixtureObject | UtilityPointObject | TileShowerObject>();
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
  };

  // Records the parsed object under its lower-cased key (walls and openings only); anything else is dropped.
  const record = (key: string, object: ModelObject | null) => {
    walls.delete(key);
    loose.delete(key);
    dropOpening(key);
    if (
      object !== null &&
      (object.type === 'fixture' ||
        object.type === 'utility_point' ||
        object.type === 'tile_shower')
    ) {
      loose.set(key, object);
    } else if (object !== null && object.type === 'wall') {
      walls.set(key, object);
    } else if (object !== null && object.type === 'opening') {
      openings.set(key, object);
      const host = object.data.geometry.hostWallId?.toLowerCase() ?? null;
      hostOf.set(key, host);
      if (host !== null) {
        let set = byHost.get(host);
        if (set === undefined) {
          set = new Set<string>();
          byHost.set(host, set);
        }
        set.add(key);
      }
    }
  };

  const shapeOf = (key: string): { id: string; shape: PickShape; hosted: boolean } | null => {
    const wall = walls.get(key);
    if (wall !== undefined) {
      const shape = wallPickShape(wall);
      return shape === null ? null : { id: wall.id, shape, hosted: false };
    }
    const free = loose.get(key);
    if (free !== undefined) {
      const shape =
        free.type === 'fixture'
          ? fixturePickShape(free)
          : free.type === 'tile_shower'
            ? tileShowerPickShape(free)
            : utilityPointPickShape(free);
      return { id: free.id, shape, hosted: false };
    }
    const opening = openings.get(key);
    if (opening === undefined) return null;
    const hostId = opening.data.geometry.hostWallId;
    const host = hostId === null ? null : (walls.get(hostId.toLowerCase()) ?? null);
    const shape = openingPickShape(opening, host);
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
    entries.set(key, { id: next.id, key, shape: next.shape, hosted: next.hosted });
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
    sync(objects, floorId, changedIds) {
      if (floorId !== floor) {
        spatial = createSpatialIndex();
        floor = floorId;
        entries = new Map();
        walls = new Map();
        openings = new Map();
        loose = new Map();
        hostOf = new Map();
        byHost = new Map();
        for (const id of objects.keys())
          record(id.toLowerCase(), parseOnFloor(id, objects, floorId));
        let count = 0;
        for (const key of [...walls.keys(), ...openings.keys(), ...loose.keys()])
          if (place(key)) count += 1;
        return count;
      }
      const affected = new Set<string>();
      for (const id of changedIds) {
        const key = id.toLowerCase();
        affected.add(key);
        for (const o of byHost.get(key) ?? []) affected.add(o);
      }
      for (const id of changedIds) record(id.toLowerCase(), parseOnFloor(id, objects, floorId));
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
      const scored = found.map((e) => ({ e, d: shapeDistance(e.shape, p) }));
      const under = scored.filter((s) => s.d === 0);
      const hits = under.length > 0 ? under : scored.filter((s) => s.d <= t);
      return sorted(hits.map((s) => s.e));
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
    lastQueryExamined() {
      return spatial.lastQueryExamined();
    },
  };
}
