// EZD-503 (S05 Controls "Room ceiling summary | Left panel | Shows type and ridge direction, wall heights, ridge height,
// pitch (e.g. "walls 8' 0" · ridge 13' 0" · 9.4/12"). | Read only. Updates when the active room changes.", "Change
// ceiling | Left panel, under summary | Opens the ceiling type editor for the active room: type, heights per wall or
// per point, or pitch, or read from Polycam mesh. | Edit model. Heights accept typed formats (12'6", 12' 6 1/2", 150",
// 12.5').", "Read heights from scan (not in mockup) | Ceiling type editor | Fills heights and slope from the Polycam
// mesh. | Only when a GLB mesh exists for the project."; S05 States "Empty: room has no ceiling set; default is flat at
// the wall height"; S05 Validation "Typed heights: invalid format shows inline error, value not applied"; board
// S05Ceiling left panel "Family room ceiling", "Vaulted, ridge east-west"; AC-EZD-503-1): the room ceiling summary,
// the ceiling type editor's draft, the one model change it saves, and the fill from the scan. Pure, no React.
//
// Stored shape (EZD-501 schema/room.ts): heights are inches above the room's floor; pitch is rise per 12" of run; the
// ridge line's start to end is the ridge direction and, for a single slope, the high edge.
// - By wall: one height per wall around the room. By point: one height per room corner. By pitch: the walls keep
//   their own heights and the pitch sets the ridge height.
// - A vaulted ridge runs through the middle of the room's box, east-west or north-south, so its run is half the span
//   across it; a single slope's high edge is one side of the box, so its run is the whole span (vault/build/
//   assumptions.md EZD-503).
// - Flat, tray and coffered store no ridge and no pitch (their details are EZD-513).
import {
  CEILING_TYPES,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_WALL_HEIGHT_IN,
  formatLength,
  parseLength,
  parseStoredObject,
  roomCeilingSchema,
  roomCeilingType,
  roomPlateHeight,
  roomWalls,
  type CeilingHeightsBy,
  type CeilingType,
  type ModelObject,
  type Point,
  type RoomCeiling,
  type RoomObject,
} from '@ezdraft/geometry';
import {
  ceilingHeightAt,
  type CeilingMesh,
  type WallSide,
} from '../../lib/imports/polycam-glb/ceiling';
import { MAX_CEILING_IN, MAX_PITCH } from '../../lib/imports/ceiling-slope';
import type { Change, Objects } from '../model/patches';

type WallObject = Extract<ModelObject, { type: 'wall' }>;

export const SLOPED_TYPES: ReadonlySet<CeilingType> = new Set(['single_slope', 'vaulted']);
export const isSloped = (t: CeilingType) => SLOPED_TYPES.has(t);

export type RidgeDirection = 'east_west' | 'north_south';
export const RIDGE_DIRECTIONS: readonly RidgeDirection[] = ['east_west', 'north_south'];
export const HIGH_SIDES: readonly WallSide[] = ['N', 'E', 'S', 'W'];

/** The ceiling type editor's typed state. Texts are what the user typed; they are read on Save. */
export type CeilingDraft = {
  type: CeilingType;
  heightsBy: CeilingHeightsBy;
  /** One row per wall around the room. */
  walls: { wall: string; side: WallSide; text: string }[];
  /** One row per room corner, in boundary order. */
  points: { at: Point; text: string }[];
  /** The ridge height (a single slope's high side) by wall or by point. */
  ridgeText: string;
  /** Rise per 12 by pitch; "9.4" or "9.4/12". */
  pitchText: string;
  /** Vaulted: the ridge direction. */
  ridgeDirection: RidgeDirection;
  /** Single slope: the high side. */
  highSide: WallSide;
};

export type DraftField = 'ridge' | 'pitch' | `wall:${number}` | `point:${number}`;
export type DraftError = 'format' | 'ridge_low' | 'pitch';
export type SaveResult =
  | { ok: true; change: Change | null }
  | { ok: false; errors: Partial<Record<DraftField, DraftError>> };

// ---------------------------------------------------------------- reading the model

function parsedAll(objects: Objects): ModelObject[] {
  const out: ModelObject[] = [];
  for (const [id, v] of objects) {
    const r = parseStoredObject({
      id,
      type: v.type,
      schema_version: v.schemaVersion,
      data: v.data,
    });
    if (r.ok) out.push(r.object);
  }
  return out;
}

export function findRoom(objects: Objects, id: string): RoomObject | null {
  const key = [...objects.keys()].find((k) => k.toLowerCase() === id.toLowerCase());
  if (key === undefined) return null;
  const v = objects.get(key)!;
  if (v.type !== 'room') return null;
  const r = parseStoredObject({
    id: key,
    type: v.type,
    schema_version: v.schemaVersion,
    data: v.data,
  });
  return r.ok && r.object.type === 'room' ? r.object : null;
}

function wallsOf(objects: Objects): WallObject[] {
  return parsedAll(objects).filter((o): o is WallObject => o.type === 'wall');
}

/**
 * The active room (vault/build/assumptions.md EZD-503): the selected room; else the room of a selected beam set; else
 * the open floor's first room in stored order; null when the floor has no room.
 */
export function activeRoomId(
  objects: Objects,
  floorId: string | null,
  selected: readonly string[],
): string | null {
  for (const id of selected) {
    const key = [...objects.keys()].find((k) => k.toLowerCase() === id.toLowerCase());
    const v = key === undefined ? undefined : objects.get(key);
    if (v?.type === 'room') return key!;
    if (v?.type === 'beam') {
      const roomId = (v.data as { geometry?: { roomId?: unknown } }).geometry?.roomId;
      if (typeof roomId === 'string' && findRoom(objects, roomId) !== null) return roomId;
    }
  }
  if (floorId === null) return null;
  const floor = floorId.toLowerCase();
  for (const [id, v] of objects) {
    if (v.type !== 'room') continue;
    const level = (v.data as { level?: unknown }).level;
    if (
      typeof level === 'string' &&
      level.toLowerCase() === floor &&
      findRoom(objects, id) !== null
    )
      return id;
  }
  return null;
}

type Box = { minX: number; maxX: number; minY: number; maxY: number };
function boxOf(points: readonly Point[]): Box {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** The side of the room a wall sits on: its middle against the room box's middle (plan y is north). */
function wallSide(wall: WallObject, box: Box): WallSide {
  const { start, end } = wall.data.geometry;
  const mx = (start.x + end.x) / 2 - (box.minX + box.maxX) / 2;
  const my = (start.y + end.y) / 2 - (box.minY + box.maxY) / 2;
  const w = Math.max(box.maxX - box.minX, 1e-9);
  const h = Math.max(box.maxY - box.minY, 1e-9);
  if (Math.abs(mx) / w >= Math.abs(my) / h) return mx >= 0 ? 'E' : 'W';
  return my >= 0 ? 'N' : 'S';
}

/** The ridge line for the type: a vaulted ridge through the box's middle, a single slope's high edge on its side. */
export function ridgeLine(
  boundary: readonly Point[],
  type: CeilingType,
  direction: RidgeDirection,
  highSide: WallSide,
): { start: Point; end: Point; run: number } {
  const b = boxOf(boundary);
  const midX = (b.minX + b.maxX) / 2;
  const midY = (b.minY + b.maxY) / 2;
  if (type === 'vaulted') {
    return direction === 'east_west'
      ? { start: { x: b.minX, y: midY }, end: { x: b.maxX, y: midY }, run: (b.maxY - b.minY) / 2 }
      : { start: { x: midX, y: b.minY }, end: { x: midX, y: b.maxY }, run: (b.maxX - b.minX) / 2 };
  }
  switch (highSide) {
    case 'N':
      return {
        start: { x: b.minX, y: b.maxY },
        end: { x: b.maxX, y: b.maxY },
        run: b.maxY - b.minY,
      };
    case 'S':
      return {
        start: { x: b.minX, y: b.minY },
        end: { x: b.maxX, y: b.minY },
        run: b.maxY - b.minY,
      };
    case 'E':
      return {
        start: { x: b.maxX, y: b.minY },
        end: { x: b.maxX, y: b.maxY },
        run: b.maxX - b.minX,
      };
    case 'W':
      return {
        start: { x: b.minX, y: b.minY },
        end: { x: b.minX, y: b.maxY },
        run: b.maxX - b.minX,
      };
  }
}

function directionOf(ridge: { start: Point; end: Point }): RidgeDirection {
  return Math.abs(ridge.end.x - ridge.start.x) >= Math.abs(ridge.end.y - ridge.start.y)
    ? 'east_west'
    : 'north_south';
}

function highSideOf(ridge: { start: Point; end: Point }, boundary: readonly Point[]): WallSide {
  const b = boxOf(boundary);
  const mx = (ridge.start.x + ridge.end.x) / 2 - (b.minX + b.maxX) / 2;
  const my = (ridge.start.y + ridge.end.y) / 2 - (b.minY + b.maxY) / 2;
  if (directionOf(ridge) === 'east_west') return my >= 0 ? 'N' : 'S';
  return mx >= 0 ? 'E' : 'W';
}

/** The plate (wall) height the summary and the pitch use: the lowest stored height, else the walls' own. */
function plateOf(room: RoomObject, walls: readonly WallObject[]): number {
  const c = room.data.attributes.ceiling;
  if (c !== null && c.heightsBy === 'point' && c.pointHeights.length > 0)
    return Math.min(...c.pointHeights.map((p) => p.height));
  return roomPlateHeight(room, walls) ?? DEFAULT_WALL_HEIGHT_IN;
}

// ---------------------------------------------------------------- summary

export type CeilingSummary = {
  roomId: string;
  name: string;
  type: CeilingType;
  /** Null on a flat, tray or coffered ceiling. */
  ridgeDirection: RidgeDirection | null;
  wallsIn: number;
  ridgeIn: number | null;
  pitch: number | null;
};

export function ceilingSummary(objects: Objects, roomId: string): CeilingSummary | null {
  const room = findRoom(objects, roomId);
  if (room === null) return null;
  const a = room.data.attributes;
  const type = roomCeilingType(a);
  const ridge = isSloped(type) ? (a.ceiling?.ridge ?? null) : null;
  return {
    roomId: room.id,
    name: a.name,
    type,
    ridgeDirection: ridge === null ? null : directionOf(ridge),
    wallsIn: plateOf(room, wallsOf(objects)),
    ridgeIn: ridge?.height ?? null,
    pitch: isSloped(type) ? (a.ceiling?.pitch ?? null) : null,
  };
}

/** Pitch as the summary writes it: one decimal, a whole number without one ("9.4/12", "4/12"). */
export function formatPitch(pitch: number): string {
  const r = Math.round(pitch * 10) / 10;
  return `${Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)}/12`;
}

/** The summary's heights line: `walls 8' 0" · ridge 13' 0" · 9.4/12` (board S05Ceiling). */
export function summaryHeights(
  s: Pick<CeilingSummary, 'wallsIn' | 'ridgeIn' | 'pitch'>,
  words: { walls: string; ridge: string },
): string {
  const parts = [`${words.walls} ${formatLength(s.wallsIn, 16)}`];
  if (s.ridgeIn !== null) parts.push(`${words.ridge} ${formatLength(s.ridgeIn, 16)}`);
  if (s.pitch !== null) parts.push(formatPitch(s.pitch));
  return parts.join(' · ');
}

// ---------------------------------------------------------------- draft

const lengthText = (inches: number) => formatLength(inches, 16);

export function ceilingDraft(objects: Objects, roomId: string): CeilingDraft | null {
  const room = findRoom(objects, roomId);
  if (room === null) return null;
  const allWalls = wallsOf(objects);
  const around = roomWalls(room, allWalls) as WallObject[];
  const a = room.data.attributes;
  const c = a.ceiling;
  const type = roomCeilingType(a);
  const plate = plateOf(room, allWalls);
  const box = boxOf(room.data.geometry.boundary);
  const storedWall = new Map((c?.wallHeights ?? []).map((w) => [w.wall.toLowerCase(), w.height]));
  const storedPoint = (p: Point) =>
    c?.pointHeights.find((q) => Math.abs(q.at.x - p.x) < 1e-6 && Math.abs(q.at.y - p.y) < 1e-6)
      ?.height;
  const ridge = c?.ridge ?? null;
  return {
    type,
    heightsBy: c?.heightsBy ?? 'wall',
    walls: around.map((w) => ({
      wall: w.id,
      side: wallSide(w, box),
      text: lengthText(storedWall.get(w.id.toLowerCase()) ?? w.data.attributes.height),
    })),
    points: room.data.geometry.boundary.map((p) => ({
      at: p,
      text: lengthText(storedPoint(p) ?? plate),
    })),
    ridgeText: ridge === null ? '' : lengthText(ridge.height),
    pitchText: c?.pitch == null ? '' : String(Math.round(c.pitch * 1000) / 1000),
    ridgeDirection: ridge === null ? 'east_west' : directionOf(ridge),
    highSide: ridge === null ? 'N' : highSideOf(ridge, room.data.geometry.boundary),
  };
}

/** A typed height: the S05 formats through the length reader, above 0 and at most MAX_CEILING_IN. */
export function parseHeight(text: string): number | null {
  const r = parseLength(text, 'positive');
  if (!r.ok || r.inches > MAX_CEILING_IN) return null;
  return r.inches;
}

/** A typed pitch: "9.4" or "9.4/12", above 0 and at most MAX_PITCH. */
export function parsePitch(text: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:\/\s*12)?\s*$/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n <= MAX_PITCH ? n : null;
}

/**
 * The one change Save writes for the draft, or the fields refused (each shows its inline error and nothing is
 * applied). A change that alters nothing is `{ ok: true, change: null }`.
 */
export function saveCeiling(objects: Objects, roomId: string, draft: CeilingDraft): SaveResult {
  const room = findRoom(objects, roomId);
  if (room === null) return { ok: true, change: null };
  const errors: Partial<Record<DraftField, DraftError>> = {};
  const sloped = isSloped(draft.type);
  const heightsBy: CeilingHeightsBy =
    !sloped && draft.heightsBy === 'pitch' ? 'wall' : draft.heightsBy;
  const line = ridgeLine(
    room.data.geometry.boundary,
    draft.type,
    draft.ridgeDirection,
    draft.highSide,
  );

  let wallHeights: RoomCeiling['wallHeights'] = [];
  let pointHeights: RoomCeiling['pointHeights'] = [];
  let low: number | null = null;
  if (heightsBy === 'wall') {
    wallHeights = draft.walls.flatMap((w, i) => {
      const h = parseHeight(w.text);
      if (h === null) errors[`wall:${i}`] = 'format';
      return h === null ? [] : [{ wall: w.wall, height: h }];
    });
    if (wallHeights.length > 0) low = Math.min(...wallHeights.map((w) => w.height));
  } else if (heightsBy === 'point') {
    pointHeights = draft.points.flatMap((p, i) => {
      const h = parseHeight(p.text);
      if (h === null) errors[`point:${i}`] = 'format';
      return h === null ? [] : [{ at: p.at, height: h }];
    });
    if (pointHeights.length > 0) low = Math.min(...pointHeights.map((p) => p.height));
  }
  if (draft.walls.length === 0 && heightsBy === 'wall' && low === null)
    low = roomPlateHeight(room, wallsOf(objects)) ?? DEFAULT_WALL_HEIGHT_IN;

  let ridge: RoomCeiling['ridge'] = null;
  let pitch: number | null = null;
  if (sloped) {
    if (heightsBy === 'pitch') {
      const p = parsePitch(draft.pitchText);
      if (p === null) errors.pitch = 'pitch';
      else {
        // The walls' own heights: this save stores no per-wall ceiling heights, so an earlier by-wall save's
        // heights must not set the plate (the summary reads the walls afterwards).
        const around = roomWalls(room, wallsOf(objects)) as WallObject[];
        const plate =
          around.length === 0
            ? DEFAULT_WALL_HEIGHT_IN
            : Math.min(...around.map((w) => w.data.attributes.height));
        const height = plate + (p * line.run) / 12;
        if (height > MAX_CEILING_IN) errors.pitch = 'pitch';
        else {
          pitch = p;
          ridge = { start: line.start, end: line.end, height };
        }
      }
    } else {
      const height = parseHeight(draft.ridgeText);
      if (height === null) errors.ridge = 'format';
      else if (low !== null && height <= low) errors.ridge = 'ridge_low';
      else if (low !== null) {
        const p = line.run > 0 ? (12 * (height - low)) / line.run : 0;
        if (!(p > 0) || p > MAX_PITCH) errors.ridge = 'pitch';
        else {
          pitch = p;
          ridge = { start: line.start, end: line.end, height };
        }
      }
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const ceiling = roomCeilingSchema.parse({ heightsBy, wallHeights, pointHeights, pitch, ridge });
  const attrs = room.data.attributes;
  const next = { ...attrs, ceilingType: draft.type, ceiling };
  if (JSON.stringify(next) === JSON.stringify(attrs)) return { ok: true, change: null };
  return {
    ok: true,
    change: {
      id: room.id,
      value: {
        type: 'room',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: { ...room.data, attributes: next } as unknown as Record<string, unknown>,
      },
    },
  };
}

// ---------------------------------------------------------------- read heights from scan

export type ScanRefusal = 'no_ceiling' | 'not_covered';
export type ScanFill = { ok: true; draft: CeilingDraft } | { ok: false; reason: ScanRefusal };

/** Corner heights within this spread read as a flat ceiling (scan noise; vault/build/assumptions.md EZD-503). */
export const SCAN_FLAT_TOLERANCE_IN = 1;

/**
 * "Read heights from scan": the draft with its heights and slope from the Polycam mesh, read inside this room only
 * (a scan can hold several rooms). Each room corner takes the mesh's ceiling height there (heights by point). The
 * room is vaulted, whatever the draft's type, when the middle of its box is more than SCAN_FLAT_TOLERANCE_IN above
 * every corner: the ridge runs along the box's higher middle line at the middle's height. Else it is flat when its
 * corner heights are within the tolerance (a sloped draft becomes flat), else a single slope whose high side is the
 * side of the box with the highest corners, with the highest corner as its height. Save works the pitch out from
 * the heights (vault/build/assumptions.md EZD-503). The plan and the mesh share coordinates (EZD-303 mapping).
 */
export function fillFromScan(draft: CeilingDraft, mesh: CeilingMesh | null): ScanFill {
  if (mesh === null) return { ok: false, reason: 'no_ceiling' };
  const corners = draft.points.map((p) => ceilingHeightAt(mesh, p.at));
  if (corners.some((h) => h === null || !(h > 0) || h > MAX_CEILING_IN))
    return { ok: false, reason: 'not_covered' };
  const heights = corners as number[];
  const points = draft.points.map((p, i) => ({ at: p.at, text: lengthText(heights[i]!) }));
  const boundary = draft.points.map((p) => p.at);
  const low = Math.min(...heights);
  const high = Math.max(...heights);
  const base = { ...draft, heightsBy: 'point' as const, points, pitchText: '' };
  const flat = {
    ok: true as const,
    draft: { ...base, type: isSloped(draft.type) ? ('flat' as const) : draft.type, ridgeText: '' },
  };
  const b = boxOf(boundary);

  // A vault, whatever the draft's type: the middle of the room's box is above every corner. The ridge runs along
  // the higher of the box's two middle lines.
  const mid = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const at = (x: number, y: number) => ceilingHeightAt(mesh, { x, y }) ?? low;
  const top = at(mid.x, mid.y);
  if (top - high > SCAN_FLAT_TOLERANCE_IN && top <= MAX_CEILING_IN) {
    const ew = (at(b.minX, mid.y) + at(b.maxX, mid.y)) / 2;
    const ns = (at(mid.x, b.minY) + at(mid.x, b.maxY)) / 2;
    const ridgeDirection: RidgeDirection = ew >= ns ? 'east_west' : 'north_south';
    return {
      ok: true,
      draft: { ...base, type: 'vaulted', ridgeDirection, ridgeText: lengthText(top) },
    };
  }
  if (high - low <= SCAN_FLAT_TOLERANCE_IN) return flat;
  // The mean corner height on each side of the room's box; the highest side is the high side.
  const on = (pick: (p: Point) => number, edge: number) => {
    const hs = heights.filter((_, i) => Math.abs(pick(boundary[i]!) - edge) < 1e-6);
    return hs.reduce((a, h) => a + h, 0) / hs.length;
  };
  const sides: [WallSide, number][] = [
    ['N', on((p) => p.y, b.maxY)],
    ['E', on((p) => p.x, b.maxX)],
    ['S', on((p) => p.y, b.minY)],
    ['W', on((p) => p.x, b.minX)],
  ];
  const highSide = sides.reduce((best, s) => (s[1] > best[1] ? s : best))[0];
  return {
    ok: true,
    draft: { ...base, type: 'single_slope', highSide, ridgeText: lengthText(high) },
  };
}

// ---------------------------------------------------------------- one scan read at a time

export type ScanTicket = { roomId: string; token: number };

/**
 * Ties a scan read to the editor that asked for it: `reset` on every open and close of the editor, `ask` at the
 * press, and the result is applied only when `accepts` (the same room's editor, not closed or reopened since).
 */
export function createScanGate() {
  let token = 0;
  return {
    reset(): void {
      token++;
    },
    ask(roomId: string): ScanTicket {
      return { roomId, token: ++token };
    },
    accepts(ticket: ScanTicket, openRoomId: string | null): boolean {
      return (
        ticket.token === token &&
        openRoomId !== null &&
        openRoomId.toLowerCase() === ticket.roomId.toLowerCase()
      );
    },
  };
}

export { CEILING_TYPES };
