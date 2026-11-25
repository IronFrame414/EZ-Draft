// EZD-229 (Q-0704 03-data-model row 2 "Transitions are derived, never stored. One is drawn at each opening, and along
// each shared room edge with no wall, between two rooms whose floorLevel differs or whose floorFinish differs ... It
// is labelled with the level difference when there is one"; Q-0704 09-calculations "Room floor level: any finite
// signed value in inches, stored to 1/16" with the 03g halfway rule ... no limit", "Two levels are the same when they
// differ by 1/64" or less"; 09q Floor level, Transitions; AC-EZD-229-1, -3, -4): the signed floor level reader and the
// floor transitions between the rooms of one level, worked out from the rooms, walls and openings each time. Nothing
// is stored. Pure. It is app code that uses only the geometry package's exports, and only the lazy plan details and
// room fields import it, so it is not in the editor's first download (11 Budgets; EZD-120c B11;
// vault/build/assumptions.md EZD-229).
import {
  COMPARISON_TOLERANCE_IN,
  formatLength,
  LENGTH_REFUSED_MESSAGE_KEY,
  pointInRing,
  readLength,
  wallFaceOffsets,
  type DisplayDenominator,
  type ModelObject,
  type ParseLengthResult,
  type Point,
  type RoomData,
  type WallObject,
  hasLevel,
} from '@ezdraft/geometry';

const MAX_TEXT_LENGTH = 32;
const refused: ParseLengthResult = {
  ok: false,
  reason: 'format',
  messageKey: LENGTH_REFUSED_MESSAGE_KEY,
};

export function parseSignedLength(text: string): ParseLengthResult {
  const t = text.trim().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const negative = t.startsWith('-') || t.startsWith('−');
  const s = (negative ? t.slice(1) : t).trim();
  if (s.length === 0 || s.length > MAX_TEXT_LENGTH) return refused;
  const value = readLength(s);
  if (value === null) return refused;
  const inches = Math.floor((negative ? -value : value) * 16 + 0.5) / 16;
  return { ok: true, inches: inches === 0 ? 0 : inches };
}

// A signed length at a display denominator; below 0 it starts with −.
export function formatSignedLength(inches: number, denominator: DisplayDenominator): string {
  if (!Number.isFinite(inches)) throw new RangeError('inches must be finite');
  const text = formatLength(Math.abs(inches), denominator);
  return inches < 0 && text !== '0"' ? `−${text}` : text;
}

export type TransitionRoom = { id: string; type: 'room'; data: RoomData };

export type RoomTransition = {
  // The two rooms, in stored order.
  roomIds: [string, string];
  // Where it is drawn: across the opening on its wall's line, or the part of the shared edge with no wall.
  from: Point;
  to: Point;
  at: 'opening' | 'edge';
  openingId: string | null;
  // The level difference in inches when the levels differ, else null (finishes differ only).
  levelDifference: number | null;
  // The level difference at 1/16" (03g detail precision), e.g. 3/4"; null when the levels are the same.
  label: string | null;
};

// How far past a wall face an opening looks for the room on that side (vault/build/assumptions.md EZD-229).
export const TRANSITION_PROBE_IN = 1;

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const along = (p: Point, d: Point, s: number): Point => ({ x: p.x + d.x * s, y: p.y + d.y * s });

// Two finishes are the same when they match after trimming, in any letter case (vault/build/assumptions.md EZD-229).
const sameFinish = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Two levels are the same when they differ by 1/64" or less (Q-0704).
export function sameFloorLevel(a: number, b: number): boolean {
  return Math.abs(a - b) <= COMPARISON_TOLERANCE_IN;
}

// What a transition between two rooms says, or null when they have the same level and finish.
function difference(
  a: TransitionRoom,
  b: TransitionRoom,
): { levelDifference: number | null; label: string | null } | null {
  const la = a.data.attributes.floorLevel;
  const lb = b.data.attributes.floorLevel;
  const levelSame = sameFloorLevel(la, lb);
  if (levelSame && sameFinish(a.data.attributes.floorFinish, b.data.attributes.floorFinish))
    return null;
  if (levelSame) return { levelDifference: null, label: null };
  const d = Math.abs(la - lb);
  return { levelDifference: d, label: formatLength(d, 16) };
}

type Frame = { start: Point; d: Point; n: Point; length: number };

function frameOf(from: Point, to: Point): Frame | null {
  const v = sub(to, from);
  const length = Math.hypot(v.x, v.y);
  if (length <= COMPARISON_TOLERANCE_IN) return null;
  const d = { x: v.x / length, y: v.y / length };
  return { start: from, d, n: { x: -d.y, y: d.x }, length };
}

function edges(ring: readonly Point[]): [Point, Point][] {
  return ring.map((p, i) => [p, ring[(i + 1) % ring.length]!]);
}

// Removes [lo, hi] from a sorted list of disjoint intervals.
function cut(pieces: [number, number][], lo: number, hi: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of pieces) {
    if (hi <= a || lo >= b) {
      out.push([a, b]);
      continue;
    }
    if (lo > a) out.push([a, lo]);
    if (hi < b) out.push([hi, b]);
  }
  return out.filter(([a, b]) => b - a > COMPARISON_TOLERANCE_IN);
}

// The parts of the edge frame `f` that lie along a wall's footprint, as intervals of the edge's length.
function wallCover(f: Frame, wall: WallObject): [number, number] | null {
  const w = frameOf(wall.data.geometry.start, wall.data.geometry.end);
  if (w === null) return null;
  if (Math.abs(cross(f.d, w.d)) > 1e-9) return null;
  const { oL, oR } = wallFaceOffsets(wall);
  const off = dot(sub(f.start, w.start), w.n);
  if (off < oR - COMPARISON_TOLERANCE_IN || off > oL + COMPARISON_TOLERANCE_IN) return null;
  const s0 = dot(sub(wall.data.geometry.start, f.start), f.d);
  const s1 = dot(sub(wall.data.geometry.end, f.start), f.d);
  return [Math.min(s0, s1), Math.max(s0, s1)];
}

// Every transition on one level of the objects given, openings first, then shared edges, each in stored order.
export function roomTransitions(objects: readonly ModelObject[], level: string): RoomTransition[] {
  const lv = level.toLowerCase();
  const here = objects.filter((o) => hasLevel(o) && o.data.level.toLowerCase() === lv);
  const rooms = here.filter((o): o is TransitionRoom => o.type === 'room');
  if (rooms.length < 2) return [];
  const walls = here.filter((o): o is WallObject => o.type === 'wall');
  const wallById = new Map(walls.map((w) => [w.id.toLowerCase(), w]));
  const out: RoomTransition[] = [];
  const roomAt = (p: Point) => rooms.find((r) => pointInRing(p, r.data.geometry.boundary)) ?? null;
  const order = (a: TransitionRoom, b: TransitionRoom): [string, string] =>
    rooms.indexOf(a) < rooms.indexOf(b) ? [a.id, b.id] : [b.id, a.id];

  for (const o of here) {
    if (o.type !== 'opening') continue;
    const hostId = o.data.geometry.hostWallId;
    if (hostId === null) continue;
    const host = wallById.get(hostId.toLowerCase());
    if (host === undefined) continue;
    const f = frameOf(host.data.geometry.start, host.data.geometry.end);
    if (f === null) continue;
    const { oL, oR } = wallFaceOffsets(host);
    const c = along(f.start, f.d, dot(sub(o.data.geometry.center, f.start), f.d));
    const left = roomAt(along(c, f.n, oL + TRANSITION_PROBE_IN));
    const right = roomAt(along(c, f.n, oR - TRANSITION_PROBE_IN));
    if (left === null || right === null || left === right) continue;
    const diff = difference(left, right);
    if (diff === null) continue;
    const half = o.data.attributes.width / 2;
    out.push({
      roomIds: order(left, right),
      from: along(c, f.d, -half),
      to: along(c, f.d, half),
      at: 'opening',
      openingId: o.id,
      ...diff,
    });
  }

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i]!;
      const b = rooms[j]!;
      const diff = difference(a, b);
      if (diff === null) continue;
      for (const [p0, p1] of edges(a.data.geometry.boundary)) {
        const f = frameOf(p0, p1);
        if (f === null) continue;
        for (const [q0, q1] of edges(b.data.geometry.boundary)) {
          const g = frameOf(q0, q1);
          if (g === null || Math.abs(cross(f.d, g.d)) > 1e-9) continue;
          if (Math.abs(dot(sub(q0, f.start), f.n)) > COMPARISON_TOLERANCE_IN) continue;
          const t0 = dot(sub(q0, f.start), f.d);
          const t1 = dot(sub(q1, f.start), f.d);
          const lo = Math.max(0, Math.min(t0, t1));
          const hi = Math.min(f.length, Math.max(t0, t1));
          if (hi - lo <= COMPARISON_TOLERANCE_IN) continue;
          let pieces: [number, number][] = [[lo, hi]];
          for (const w of walls) {
            const cover = wallCover(f, w);
            if (cover !== null) pieces = cut(pieces, cover[0], cover[1]);
          }
          for (const [s0, s1] of pieces) {
            out.push({
              roomIds: [a.id, b.id],
              from: along(f.start, f.d, s0),
              to: along(f.start, f.d, s1),
              at: 'edge',
              openingId: null,
              ...diff,
            });
          }
        }
      }
    }
  }
  return out;
}

// The transitions that touch one room.
export function transitionsOfRoom(
  transitions: readonly RoomTransition[],
  roomId: string,
): RoomTransition[] {
  const id = roomId.toLowerCase();
  return transitions.filter((t) => t.roomIds.some((r) => r.toLowerCase() === id));
}
