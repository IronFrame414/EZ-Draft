// EZD-213a Build step 7 (vault/plans/EZD-213a.md section 1, Decided "Selection ids", "Rooms of a face", "Sub-line
// rooms", "Side labels (W9, W10)", "Hinge labels (W8)", "Door swing and hand types", "Offset (W5)", "Display text",
// "Mixed", "Bulk fields", "Numbers", "Status", "Speed"; Q-0630 row 8; Q-0640 row 5-1; Q-0641 row 1; Q-0642 row 3;
// Q-0645 (a); Q-0659 (a)): what the inspector shows for a selection. Pure; parses the level's objects once per call.
import {
  COMPARISON_TOLERANCE_IN,
  DETAIL_DISPLAY_DENOMINATOR,
  PLAN_DISPLAY_DENOMINATOR,
  coordsEqual,
  formatLength,
  isVerticalLine,
  objectNumber,
  openingOffsets,
  wallFaceLines,
  wallLength,
  wallThickness,
  type DoorHand,
  type DoorSwing,
  type ImpactRating,
  type ModelObject,
  type OpeningObject,
  type Point,
  type RoomObject,
  type ShutterType,
  type WallData,
  type WallLayer,
  type WallLine,
  type WallObject,
} from '@ezdraft/geometry';
import type { Objects } from '../model/patches';
import { levelModelObjects } from './inspector-edits';

export type Shared<T> = { mixed: false; value: T } | { mixed: true };

export type LayerRow = { material: WallLayer['material']; thickness: string };

export type HingeLabel = 'left' | 'right' | 'top' | 'bottom';

export type SideLabel =
  | { kind: 'room'; name: string }
  | { kind: 'outside' }
  | { kind: 'plan'; direction: 'up' | 'down' | 'left' | 'right' };

export type WallFields = {
  length: string;
  thickness: string;
  height: string;
  total: string;
  layers: LayerRow[];
  status: WallData['status'];
  bearing: boolean;
};

export type OpeningFields = {
  width: string;
  height: string;
  roughOpening: { width: string; height: string };
  roughOpeningAuto: boolean;
  sillHeight: string | null;
  impactRating: ImpactRating;
  shutterType: ShutterType | null;
};

export type DoorView = {
  swing: DoorSwing;
  hand: DoorHand;
  swingLabels: { left: SideLabel; right: SideLabel };
  hingeLabels: { left: HingeLabel; right: HingeLabel };
  result: { opensInto: SideLabel; hinge: HingeLabel };
};

export type OffsetView = { left: string; cornerWall: { number: number | null } | null };

export type BulkWallFields = {
  thickness: Shared<string>;
  height: Shared<string>;
  layers: Shared<LayerRow[]>;
  bearing: Shared<boolean>;
};

export type BulkOpeningFields = {
  width: Shared<string>;
  height: Shared<string>;
  roughOpening: Shared<{ width: string; height: string }>;
  impactRating: Shared<ImpactRating>;
  shutterType: Shared<ShutterType | null>;
  sillHeight: Shared<string> | null;
};

export type InspectorView =
  | { kind: 'empty' }
  | { kind: 'wall'; id: string; number: number | null; rooms: string[]; fields: WallFields }
  | {
      kind: 'opening';
      id: string;
      openingKind: 'door' | 'window';
      number: number | null;
      rooms: string[];
      host: { number: number | null } | null;
      fields: OpeningFields;
      offset: OffsetView | null;
      door: DoorView | null;
    }
  | {
      kind: 'bulk';
      count: number;
      noun: 'walls' | 'doors' | 'windows' | 'objects';
      walls: BulkWallFields | null;
      openings: BulkOpeningFields | null;
    };

const tol = COMPARISON_TOLERANCE_IN;

const lower = (id: string) => id.toLowerCase();

const plan = (inches: number) => formatLength(inches, PLAN_DISPLAY_DENOMINATOR);

const detail = (inches: number) => formatLength(inches, DETAIL_DISPLAY_DENOMINATOR);

type Side = 'left' | 'right';

// A face line as start, unit direction and length; null for a zero-length face.
type Face = { start: Point; u: Point; L: number };

function faceOf(line: WallLine): Face | null {
  const L = wallLength(line);
  if (L <= tol) return null;
  const u = { x: (line.end.x - line.start.x) / L, y: (line.end.y - line.start.y) / L };
  return { start: line.start, u, L };
}

const along = (f: Face, p: Point) => (p.x - f.start.x) * f.u.x + (p.y - f.start.y) * f.u.y;

const across = (f: Face, p: Point) =>
  Math.abs((p.x - f.start.x) * f.u.y - (p.y - f.start.y) * f.u.x);

// The room's boundary edges lying on the face's infinite line, as along-face intervals.
function edgesOnFace(room: RoomObject, f: Face): [number, number][] {
  const b = room.data.geometry.boundary;
  const out: [number, number][] = [];
  for (let i = 0; i < b.length; i++) {
    const p = b[i]!;
    const q = b[(i + 1) % b.length]!;
    if (across(f, p) > tol || across(f, q) > tol) continue;
    const a = along(f, p);
    const c = along(f, q);
    out.push([Math.min(a, c), Math.max(a, c)]);
  }
  return out;
}

function roomOnWallFace(room: RoomObject, f: Face): boolean {
  return edgesOnFace(room, f).some(([lo, hi]) => Math.min(hi, f.L) - Math.max(lo, 0) > tol);
}

function roomAtPoint(room: RoomObject, f: Face, p: Point): boolean {
  const t = along(f, p);
  return edgesOnFace(room, f).some(([lo, hi]) => t >= lo - tol && t <= hi + tol);
}

function faces(host: WallObject): { left: Face | null; right: Face | null } {
  const lines = wallFaceLines(host.data);
  return { left: faceOf(lines.left), right: faceOf(lines.right) };
}

function wallRooms(wall: WallObject, rooms: readonly RoomObject[]): string[] {
  const names: string[] = [];
  const f = faces(wall);
  for (const face of [f.left, f.right]) {
    if (face === null) continue;
    for (const r of rooms) {
      const name = r.data.attributes.name;
      if (roomOnWallFace(r, face) && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

function sideRoom(
  host: WallObject,
  side: Side,
  center: Point,
  rooms: readonly RoomObject[],
): string | null {
  const face = faces(host)[side];
  if (face === null) return null;
  const r = rooms.find((room) => roomAtPoint(room, face, center));
  return r === undefined ? null : r.data.attributes.name;
}

function layerRows(layers: readonly WallLayer[]): LayerRow[] {
  return layers.map((l) => ({ material: l.material, thickness: detail(l.thickness) }));
}

function wallFields(w: WallObject): WallFields {
  const a = w.data.attributes;
  return {
    length: plan(wallLength(w.data.geometry)),
    thickness: detail(a.thickness),
    height: detail(a.height),
    total: detail(wallThickness(a.layers)),
    layers: layerRows(a.layers),
    status: w.data.status,
    bearing: a.bearing,
  };
}

function openingFields(o: OpeningObject): OpeningFields {
  const a = o.data.attributes;
  return {
    width: detail(a.width),
    height: detail(a.height),
    roughOpening: { width: detail(a.roughOpening.width), height: detail(a.roughOpening.height) },
    roughOpeningAuto: a.roughOpeningMode === 'auto',
    sillHeight: a.kind === 'window' ? detail(a.sillHeight) : null,
    impactRating: a.impactRating,
    shutterType: a.shutterType,
  };
}

function hostOf(o: OpeningObject, walls: readonly WallObject[]): WallObject | null {
  const id = o.data.geometry.hostWallId;
  if (id === null) return null;
  return walls.find((w) => lower(w.id) === lower(id)) ?? null;
}

function doorView(
  o: OpeningObject,
  host: WallObject | null,
  rooms: readonly RoomObject[],
): DoorView {
  const a = o.data.attributes;
  const swing = a.swing!;
  const hand = a.hand!;
  const g = host === null ? null : host.data.geometry;
  const d: Point =
    g !== null
      ? { x: g.end.x - g.start.x, y: g.end.y - g.start.y }
      : (o.data.geometry.axis ?? { x: 1, y: 0 });
  const vertical = g !== null ? isVerticalLine(g) : coordsEqual(d.x, 0);
  const hingeLabels: DoorView['hingeLabels'] = vertical
    ? { left: 'top', right: 'bottom' }
    : { left: 'left', right: 'right' };
  const center = o.data.geometry.center;
  const roomOn = (s: Side) => (host === null ? null : sideRoom(host, s, center, rooms));
  const named = { left: roomOn('left'), right: roomOn('right') };
  const label = (s: Side): SideLabel => {
    const name = named[s];
    if (name !== null) return { kind: 'room', name };
    if (named[s === 'left' ? 'right' : 'left'] !== null) return { kind: 'outside' };
    const n = s === 'left' ? { x: -d.y, y: d.x } : { x: d.y, y: -d.x };
    if (vertical) return { kind: 'plan', direction: n.x < 0 ? 'left' : 'right' };
    return { kind: 'plan', direction: n.y > 0 ? 'up' : 'down' };
  };
  const swingLabels = { left: label('left'), right: label('right') };
  return {
    swing,
    hand,
    swingLabels,
    hingeLabels,
    result: { opensInto: swingLabels[swing], hinge: hingeLabels[hand] },
  };
}

function openingView(
  o: OpeningObject,
  walls: readonly WallObject[],
  rooms: readonly RoomObject[],
): InspectorView {
  const host = hostOf(o, walls);
  const center = o.data.geometry.center;
  const names: string[] = [];
  let offset: OffsetView | null = null;
  if (host !== null) {
    for (const s of ['left', 'right'] as const) {
      const name = sideRoom(host, s, center, rooms);
      if (name !== null) names.push(name);
    }
    const off = openingOffsets(o, host, walls);
    if (off !== null) {
      const cornerId = off.leftCorner.wallId;
      const corner =
        cornerId === null ? undefined : walls.find((w) => lower(w.id) === lower(cornerId));
      offset = {
        left: plan(off.left),
        cornerWall: cornerId === null ? null : { number: corner ? objectNumber(corner) : null },
      };
    }
  }
  const kind = o.data.attributes.kind;
  return {
    kind: 'opening',
    id: o.id,
    openingKind: kind,
    number: objectNumber(o),
    rooms: names,
    host: host === null ? null : { number: objectNumber(host) },
    fields: openingFields(o),
    offset,
    door: kind === 'door' ? doorView(o, host, rooms) : null,
  };
}

function shared<T, U>(
  values: readonly T[],
  eq: (a: T, b: T) => boolean,
  show: (v: T) => U,
): Shared<U> {
  const first = values[0]!;
  return values.every((v) => eq(first, v)) ? { mixed: false, value: show(first) } : { mixed: true };
}

const same = <T>(a: T, b: T) => a === b;

const id = <T>(v: T) => v;

function sameLayers(a: readonly WallLayer[], b: readonly WallLayer[]): boolean {
  return (
    a.length === b.length &&
    a.every((l, i) => l.material === b[i]!.material && coordsEqual(l.thickness, b[i]!.thickness))
  );
}

function bulkWalls(walls: readonly WallObject[]): BulkWallFields {
  const at = walls.map((w) => w.data.attributes);
  return {
    thickness: shared(
      at.map((a) => a.thickness),
      coordsEqual,
      detail,
    ),
    height: shared(
      at.map((a) => a.height),
      coordsEqual,
      detail,
    ),
    layers: shared(
      at.map((a) => a.layers),
      sameLayers,
      layerRows,
    ),
    bearing: shared(
      at.map((a) => a.bearing),
      same,
      id,
    ),
  };
}

function bulkOpenings(openings: readonly OpeningObject[]): BulkOpeningFields {
  const at = openings.map((o) => o.data.attributes);
  return {
    width: shared(
      at.map((a) => a.width),
      coordsEqual,
      detail,
    ),
    height: shared(
      at.map((a) => a.height),
      coordsEqual,
      detail,
    ),
    roughOpening: shared(
      at.map((a) => a.roughOpening),
      (p, q) => coordsEqual(p.width, q.width) && coordsEqual(p.height, q.height),
      (ro) => ({ width: detail(ro.width), height: detail(ro.height) }),
    ),
    impactRating: shared(
      at.map((a) => a.impactRating),
      same,
      id,
    ),
    shutterType: shared(
      at.map((a) => a.shutterType),
      same,
      id,
    ),
    sillHeight: at.every((a) => a.kind === 'window')
      ? shared(
          at.map((a) => a.sillHeight),
          coordsEqual,
          detail,
        )
      : null,
  };
}

export function inspectorView(
  objects: Objects,
  level: string,
  ids: readonly string[],
): InspectorView {
  const all = levelModelObjects(objects, level);
  const walls = all.filter((o): o is WallObject => o.type === 'wall');
  const rooms = all.filter((o): o is RoomObject => o.type === 'room');
  const byId = new Map<string, ModelObject>();
  for (const o of all) if (o.type === 'wall' || o.type === 'opening') byId.set(lower(o.id), o);

  const selected: (WallObject | OpeningObject)[] = [];
  for (const key of new Set(ids.map(lower))) {
    const o = byId.get(key);
    if (o !== undefined && (o.type === 'wall' || o.type === 'opening')) selected.push(o);
  }
  if (selected.length === 0) return { kind: 'empty' };
  if (selected.length === 1) {
    const o = selected[0]!;
    if (o.type === 'wall')
      return {
        kind: 'wall',
        id: o.id,
        number: objectNumber(o),
        rooms: wallRooms(o, rooms),
        fields: wallFields(o),
      };
    return openingView(o, walls, rooms);
  }
  const selWalls = selected.filter((o): o is WallObject => o.type === 'wall');
  const selOpenings = selected.filter((o): o is OpeningObject => o.type === 'opening');
  const kinds = new Set(selOpenings.map((o) => o.data.attributes.kind));
  const noun =
    selOpenings.length === 0
      ? 'walls'
      : selWalls.length > 0
        ? 'objects'
        : kinds.size === 1
          ? kinds.has('door')
            ? 'doors'
            : 'windows'
          : 'objects';
  return {
    kind: 'bulk',
    count: selected.length,
    noun,
    walls: selOpenings.length === 0 ? bulkWalls(selWalls) : null,
    openings: selWalls.length === 0 ? bulkOpenings(selOpenings) : null,
  };
}
