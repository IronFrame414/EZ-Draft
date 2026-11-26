// EZD-1998 (AC-EZD-1998-2 "the saved-copy check that pulls zod at load is replaced by a hand-written check with the
// same rules and tests ... and the offline copy is still validated before use"): the phone screen's check of its
// saved rooms (device-copy.ts) without zod. The rules are rooms.ts roomsSchema's, one for one, and the answer is
// the schema's parsed value: names trimmed, a corner keeps only x and y, a room with any other key is refused.
// room-check.test.ts runs one table of inputs through both and requires the same answer.
import { MAX_FIELD_LENGTH_IN } from './entry';
import { MAX_FREE_CORNERS, MAX_ROOMS, MAX_ROOM_NAME, type FieldRoom } from './room-model';
import { CANVAS_H, CANVAS_W, SHAPE_KINDS, wallCount, type Pt, type ShapeKind } from './shapes';

const ROOM_KEYS = new Set([
  'id',
  'kind',
  'name',
  'shape',
  'corners',
  'closed',
  'lengths',
  'ceiling',
]);
const ID = /^[A-Za-z0-9_-]{1,40}$/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const inRange = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;

function inches(v: unknown): number | null | undefined {
  if (v === null) return null;
  return inRange(v, MAX_FIELD_LENGTH_IN) ? v : undefined;
}

function point(v: unknown): Pt | null {
  if (!isRecord(v) || !inRange(v.x, CANVAS_W) || !inRange(v.y, CANVAS_H)) return null;
  return { x: v.x, y: v.y };
}

/** One room as roomSchema reads it, or null when roomSchema would refuse it. */
export function checkRoom(v: unknown): FieldRoom | null {
  if (!isRecord(v)) return null;
  for (const k of Object.keys(v)) if (!ROOM_KEYS.has(k)) return null;
  const { id, kind, name, shape, corners, closed, lengths, ceiling } = v;
  if (typeof id !== 'string' || !ID.test(id)) return null;
  if (kind !== 'building' && kind !== 'room') return null;
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_ROOM_NAME) return null;
  if (shape !== null && !SHAPE_KINDS.includes(shape as ShapeKind)) return null;
  if (!Array.isArray(corners) || corners.length > MAX_FREE_CORNERS) return null;
  const pts: Pt[] = [];
  for (const c of corners) {
    const p = point(c);
    if (p === null) return null;
    pts.push(p);
  }
  if (typeof closed !== 'boolean') return null;
  if (!Array.isArray(lengths) || lengths.length > MAX_FREE_CORNERS) return null;
  const ls: (number | null)[] = [];
  for (const l of lengths) {
    const n = inches(l);
    if (n === undefined) return null;
    ls.push(n);
  }
  const ceil = inches(ceiling);
  if (ceil === undefined) return null;
  const s = shape as ShapeKind | null;
  // roomSchema's two refine rules: one length per wall; corners only in Walls mode.
  if (ls.length !== wallCount(s, pts, closed)) return null;
  if (!(s === 'walls' || (pts.length === 0 && closed === (s !== null)))) return null;
  return { id, kind, name: trimmed, shape: s, corners: pts, closed, lengths: ls, ceiling: ceil };
}

/** The rooms as roomsSchema reads them, or null when roomsSchema would refuse them. */
export function checkRooms(v: unknown): FieldRoom[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_ROOMS) return null;
  const rooms: FieldRoom[] = [];
  for (const r of v) {
    const room = checkRoom(r);
    if (room === null) return null;
    rooms.push(room);
  }
  if (rooms[0]?.kind !== 'building' || !rooms.slice(1).every((r) => r.kind === 'room')) return null;
  if (new Set(rooms.map((r) => r.id)).size !== rooms.length) return null;
  return rooms;
}
