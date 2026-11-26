// EZD-509 (S05 Controls "Auto-layout cans | Left panel, Lighting | Opens auto-layout: by count, by spacing, or by
// light-level target in foot-candles. Places cans in the room. | Edit model. Result shown for confirmation before it
// is committed"; S05 Decision 6 "the lumen method with the fixture's catalog lumens"; phase-05 EZD-509 row "count =
// target fc × room area ÷ (lumens per fixture × CU × LLF), rounded up"; AC-EZD-509-1, -2; vault/build/assumptions/
// EZD-509.md "Even grid", "Light-level count arithmetic", "Lumens"): where auto-layout puts cans in one room, and the
// change that places them. Pure: no React, no DOM.
import {
  CURRENT_SCHEMA_VERSION,
  parseStoredObject,
  pointInRing,
  roomAreaSqFt,
  type Point,
} from '@ezdraft/geometry';
import type { Change, Objects } from '../model/patches';

export type LayoutMode = 'count' | 'spacing' | 'light';

/** The decimal places the light-level inputs are kept to, so the count is worked in whole numbers. */
const SCALE = 1000n;
const scaled = (n: number) => BigInt(Math.round(n * Number(SCALE)));

/**
 * The lumen method's can count: target fc × area ÷ (lumens × CU × LLF), rounded up; null when an input is not above
 * 0. Worked in whole numbers (each decimal input to thousandths), so an exact quotient such as 9,600 ÷ 384 = 25 is
 * never pushed to 26 by float noise.
 */
export function lightLevelCount(input: {
  targetFc: number;
  areaSqFt: number;
  lumens: number;
  cu: number;
  llf: number;
}): number | null {
  const { targetFc, areaSqFt, lumens, cu, llf } = input;
  for (const v of [targetFc, areaSqFt, lumens, cu, llf])
    if (!Number.isFinite(v) || v <= 0) return null;
  // (T/S) × (A/S) ÷ ((L/S) × (C/S) × (F/S)) = T × A × S³ ÷ (S² × L × C × F) = T × A × S ÷ (L × C × F).
  const num = scaled(targetFc) * scaled(areaSqFt) * SCALE;
  const den = scaled(lumens) * scaled(cu) * scaled(llf);
  if (den === 0n || num === 0n) return null;
  const q = num / den;
  return Number(q * den < num ? q + 1n : q);
}

/** The room's frame: its bounding box along its longest wall (origin at a corner, `u` along that wall). */
export type RoomFrame = { origin: Point; u: Point; v: Point; long: number; short: number; uIsLong: boolean };

export function roomFrame(ring: readonly Point[]): RoomFrame | null {
  if (ring.length < 3) return null;
  let best = -1;
  let u: Point = { x: 1, y: 0 };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    // A longer wall wins; between equal walls the first stays, so the frame does not depend on float noise.
    if (len > best + 1e-9) {
      best = len;
      u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    }
  }
  if (best <= 0) return null;
  // Keep the frame's axes pointing the plan's way when the wall runs along an axis (east or north first).
  if (u.x < -1e-9 || (Math.abs(u.x) <= 1e-9 && u.y < 0)) u = { x: -u.x, y: -u.y };
  const v = { x: -u.y, y: u.x };
  const us = ring.map((p) => p.x * u.x + p.y * u.y);
  const vs = ring.map((p) => p.x * v.x + p.y * v.y);
  const u0 = Math.min(...us);
  const v0 = Math.min(...vs);
  const du = Math.max(...us) - u0;
  const dv = Math.max(...vs) - v0;
  if (du <= 0 || dv <= 0) return null;
  return {
    origin: { x: u0 * u.x + v0 * v.x, y: u0 * u.y + v0 * v.y },
    u,
    v,
    long: Math.max(du, dv),
    short: Math.min(du, dv),
    uIsLong: du >= dv,
  };
}

/** A point at `a` along the frame's long side and `b` along its short side. */
function at(frame: RoomFrame, a: number, b: number): Point {
  const [du, dv] = frame.uIsLong ? [a, b] : [b, a];
  return {
    x: frame.origin.x + du * frame.u.x + dv * frame.v.x,
    y: frame.origin.y + du * frame.u.y + dv * frame.v.y,
  };
}

/** `n` positions across `side`, each centred in its share (half a spacing from each end). */
const shares = (n: number, side: number) => Array.from({ length: n }, (_, i) => ((i + 0.5) * side) / n);

/**
 * An even grid of `count` cans: cols = ceil(√(n × long ÷ short)) along the long side, rows = ceil(n ÷ cols); each can
 * centred in its cell; a short last row keeps the column spacing and is centred. Points outside a room that is not a
 * rectangle are dropped. Worked example: 8 in 20' × 16' → 4 × 2 at 2' 6", 7' 6", 12' 6", 17' 6" and 4' 0", 12' 0".
 */
export function gridByCount(ring: readonly Point[], count: number): Point[] {
  const frame = roomFrame(ring);
  if (frame === null || !Number.isInteger(count) || count < 1) return [];
  const cols = Math.min(count, Math.ceil(Math.sqrt((count * frame.long) / frame.short)));
  const rows = Math.ceil(count / cols);
  const across = shares(cols, frame.long);
  const step = frame.long / cols;
  const out: Point[] = [];
  shares(rows, frame.short).forEach((b, r) => {
    const inRow = r === rows - 1 ? count - cols * (rows - 1) : cols;
    const shift = ((cols - inRow) * step) / 2;
    for (let c = 0; c < inRow; c++) out.push(at(frame, across[c]! + shift, b));
  });
  return inside(out, ring);
}

/**
 * A grid at an on-centre spacing: floor(side ÷ spacing) cans per side (at least one), the grid centred in the room.
 * Points outside a room that is not a rectangle are dropped.
 */
export function gridBySpacing(ring: readonly Point[], spacing: number): Point[] {
  const frame = roomFrame(ring);
  if (frame === null || !Number.isFinite(spacing) || spacing <= 0) return [];
  const line = (side: number) => {
    const n = Math.max(1, Math.floor(side / spacing + 1e-9));
    const start = (side - (n - 1) * spacing) / 2;
    return Array.from({ length: n }, (_, i) => start + i * spacing);
  };
  const out: Point[] = [];
  for (const b of line(frame.short)) for (const a of line(frame.long)) out.push(at(frame, a, b));
  return inside(out, ring);
}

const inside = (points: Point[], ring: readonly Point[]) => points.filter((p) => pointInRing(p, ring));

/**
 * Each point moved by `snap` (EZD-511: a light in an ACT room goes to the centre of its tile), keeping the first of any
 * that land on the same spot, so two grid points in one tile give one can and the count line stays true.
 */
export function snapPoints(points: readonly Point[], snap: (p: Point) => Point): Point[] {
  const seen = new Set<string>();
  const out: Point[] = [];
  for (const p of points) {
    const q = snap(p);
    const k = `${Math.round(q.x * 64)},${Math.round(q.y * 64)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(q);
  }
  return out;
}

/** The room's outline and area, or null when the id names no room with an outline. */
export function layoutRoom(
  objects: Objects,
  roomId: string,
): { id: string; ring: readonly Point[]; areaSqFt: number; roomType: string | null; level: string } | null {
  const key = [...objects.keys()].find((k) => k.toLowerCase() === roomId.toLowerCase());
  const v = key === undefined ? undefined : objects.get(key);
  if (v === undefined || v.type !== 'room') return null;
  const data = v.data as {
    level?: unknown;
    geometry?: { boundary?: unknown };
    attributes?: { roomType?: unknown };
  };
  const ring = data.geometry?.boundary;
  if (!Array.isArray(ring) || ring.length < 3 || typeof data.level !== 'string') return null;
  const roomType = data.attributes?.roomType;
  return {
    id: key!,
    ring: ring as Point[],
    areaSqFt: roomAreaSqFt(ring as Point[]),
    roomType: typeof roomType === 'string' ? roomType : null,
    level: data.level,
  };
}

/** One recessed-light type: its tag and the type attributes a new can copies (from the first can with the tag). */
export type CanType = {
  typeTag: string;
  lumens: number | null;
  attributes: Readonly<Record<string, unknown>>;
};

const TYPE_FIELDS = ['typeTag', 'lumens', 'colorTemp', 'trim', 'catalogItemId'] as const;

/**
 * The recessed-light types in the model, by tag in tag order. A tag's lumens are the first lumens any can with that tag
 * has (EZD-507 sets them per light; assumption EZD-509 "Lumens").
 */
export function canTypes(objects: Objects): CanType[] {
  const byTag = new Map<string, { lumens: number | null; attributes: Record<string, unknown> }>();
  for (const v of objects.values()) {
    if (v.type !== 'device') continue;
    const a = (v.data as { attributes?: Record<string, unknown> }).attributes;
    if (a?.kind !== 'recessed_light' || typeof a.typeTag !== 'string' || a.typeTag.trim() === '') continue;
    const lumens = typeof a.lumens === 'number' && a.lumens > 0 ? a.lumens : null;
    const seen = byTag.get(a.typeTag);
    if (seen === undefined) {
      const attributes: Record<string, unknown> = {};
      for (const f of TYPE_FIELDS) if (a[f] !== undefined && a[f] !== null) attributes[f] = a[f];
      byTag.set(a.typeTag, { lumens, attributes });
    } else if (seen.lumens === null && lumens !== null) {
      seen.lumens = lumens;
      seen.attributes = { ...seen.attributes, lumens };
    }
  }
  return [...byTag.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([typeTag, t]) => ({ typeTag, lumens: t.lumens, attributes: t.attributes }));
}

/**
 * The changes Place makes: one recessed light per point, on the room's floor with the given status and the chosen
 * type's attributes. Null when any can would not be a valid object (nothing is placed then).
 */
export function placeCans(
  points: readonly Point[],
  ctx: {
    level: string;
    status: 'existing' | 'demo' | 'new';
    newId: () => string;
    type?: CanType | null;
  },
): Change[] | null {
  const out: Change[] = [];
  for (const p of points) {
    const id = ctx.newId();
    const data = {
      geometry: { point: { x: p.x, y: p.y } },
      status: ctx.status,
      level: ctx.level,
      attributes: { ...(ctx.type?.attributes ?? {}), kind: 'recessed_light' },
    };
    const parsed = parseStoredObject({ id, type: 'device', schema_version: CURRENT_SCHEMA_VERSION, data });
    if (!parsed.ok) return null;
    out.push({
      id,
      value: {
        type: 'device',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: parsed.object.data as unknown as Record<string, unknown>,
      },
    });
  }
  return out;
}
