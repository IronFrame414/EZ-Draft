// Resize handles, typed handle and chip entries, and the selection frame (EZD-212c; vault/plans/EZD-212c.md D1-D7;
// S03 Drag selection handle, Live distance chips; Q-0630 rows 9, 10, 12, 14; Q-0633 G6; Q-0746 (b)). Pure: no React,
// no DOM.
import {
  applyChip,
  coordsEqual,
  DRAWING_FONTS,
  interiorPoint,
  measureTextPt,
  parseStoredObject,
  roomLabelText,
  ROOM_LABEL_LETTER_SPACING_EM,
  doorSymbol,
  endDragLength,
  isVerticalLine,
  leftEndIsLow,
  openingSpan,
  resizeOpening,
  resizeWall,
  wallFaceLines,
  wallLength,
  COMPARISON_TOLERANCE_IN,
  type ApplyChipResult,
  type ChipSide,
  type ModelObject,
  type OpeningObject,
  type Point,
  type ResizeOpeningResult,
  type ResizeWallResult,
  type WallChip,
  type WallEnd,
  type WallObject,
} from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import type { TypedValues } from '../typed-entry/typed-entry';
import type { Objects } from '../model/patches';
import { PLAN_ROOM_LABEL_PT } from '../plan/batches';
import { PT_TO_MODEL_IN } from '../plan/glyph-atlas';
// EZD-423: entryTool moved to entry-tool.ts (the editor entry reads it) and is re-exported here.
import { entryTool } from './entry-tool';
import { idKey } from '../shared/ids';

export { entryTool };

// D2: a handle is hit within 22 screen px (the 44 px round target).
export const HANDLE_HIT_PX = 22;
// D6: the size chip sits 36 screen px off the opening's centre.
export const SIZE_CHIP_OFFSET_PX = 36;

type ResizeRefusal =
  | Extract<ResizeWallResult, { ok: false }>['reason']
  | Extract<ResizeOpeningResult, { ok: false }>['reason'];
type ChipRefusal = Extract<ApplyChipResult, { ok: false }>['reason'];

// D4.
export const RESIZE_REFUSALS: Readonly<Record<ResizeRefusal, MessageKey>> = {
  zero_length: 'office.tools.gap.zero_length',
  too_long: 'office.tools.gap.too_long',
  join_lost: 'office.tools.gap.join_lost',
  past_corner: 'office.tools.opening.past_corner',
  overlap: 'office.tools.opening.overlap',
  wall_not_found: 'office.tools.resize.failed',
  not_found: 'office.tools.resize.failed',
  invalid_length: 'office.tools.resize.failed',
  invalid_input: 'office.tools.resize.failed',
  not_on_wall: 'office.tools.resize.failed',
};

export const CHIP_REFUSALS: Readonly<Record<ChipRefusal, MessageKey>> = {
  zero_length: 'office.tools.gap.zero_length',
  too_long: 'office.tools.gap.too_long',
  join_lost: 'office.tools.gap.join_lost',
  past_corner: 'office.tools.opening.past_corner',
  overlap: 'office.tools.opening.overlap',
  not_found: 'office.tools.move.failed',
  no_chip: 'office.tools.move.failed',
  invalid_input: 'office.tools.move.failed',
};

// D1.
export type ResizeHandle =
  | { kind: 'wall'; id: string; end: WallEnd; at: Point }
  | { kind: 'opening'; id: string; jamb: 'lo' | 'hi'; at: Point };

// D3.
export type ResizeOutcome =
  | { ok: true; changed: ModelObject[]; size: number }
  | { ok: false; message: MessageKey; size: number };

// D5.
export type SelectionEntry =
  | { kind: 'chip'; id: string; objectKind: 'wall' | 'door' | 'window'; side: ChipSide }
  | { kind: 'handle'; id: string; objectKind: 'wall' | 'door' | 'window' };

// D7.
export type SelectionFrame = {
  handles: readonly Point[];
  active: number | null;
  wallChips: readonly WallChip[];
  size: { at: Point; normal: Point; text: string } | null;
  // EZD-1984 (audit F19): the shown room labels, so a wall chip is moved off a label it would cover.
  labels?: readonly LabelBox[];
};

// EZD-1984: a room label's box on the plan in model inches: its centre and half its width and height.
export type LabelBox = { at: Point; halfWidth: number; halfHeight: number };

// EZD-1984: the label is drawn 1 em tall around its midline (glyph-atlas TEXT_MIDLINE_EM), so half a box is 0.5 em.
const LABEL_HALF_HEIGHT_EM = 0.5;

// EZD-1984: the boxes of the room labels the plan draws on `level` (as drawing/build.ts lays them out at
// PLAN_ROOM_LABEL_PT), leaving out a room `shown` hides.
export function roomLabelBoxes(
  objects: Objects,
  level: string,
  shown: (type: string, status: unknown) => boolean = () => true,
): LabelBox[] {
  const lvl = level.toLowerCase();
  const pt = PLAN_ROOM_LABEL_PT;
  const ls = pt * ROOM_LABEL_LETTER_SPACING_EM;
  const out: LabelBox[] = [];
  for (const [id, v] of objects) {
    if (v.type !== 'room') continue;
    if (typeof v.data.level !== 'string' || v.data.level.toLowerCase() !== lvl) continue;
    if (!shown(v.type, (v.data as { status?: unknown }).status)) continue;
    const r = parseStoredObject({
      id,
      type: v.type,
      schema_version: v.schemaVersion,
      data: v.data,
    });
    if (!r.ok || r.object.type !== 'room') continue;
    const boundary = r.object.data.geometry.boundary;
    if (boundary.length < 3) continue;
    let text: string;
    try {
      text = roomLabelText(r.object.data.attributes.name, boundary);
    } catch {
      continue;
    }
    const widthPt =
      measureTextPt(DRAWING_FONTS['instrument-sans-600'], text, pt) + ls * ([...text].length - 1);
    out.push({
      at: interiorPoint(boundary),
      halfWidth: (widthPt * PT_TO_MODEL_IN) / 2,
      halfHeight: pt * PT_TO_MODEL_IN * LABEL_HALF_HEIGHT_EM,
    });
  }
  return out;
}

const findWall = (objects: readonly ModelObject[], id: string): WallObject | null =>
  objects.find((o): o is WallObject => o.type === 'wall' && idKey(o.id) === idKey(id)) ?? null;

const findOpening = (objects: readonly ModelObject[], id: string): OpeningObject | null =>
  objects.find((o): o is OpeningObject => o.type === 'opening' && idKey(o.id) === idKey(id)) ??
  null;

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

// The host unit direction; null for a host of 1/64" or less.
function unitOf(host: WallObject): Point | null {
  const { start, end } = host.data.geometry;
  const L = wallLength(host.data.geometry);
  if (L <= COMPARISON_TOLERANCE_IN) return null;
  return { x: (end.x - start.x) / L, y: (end.y - start.y) / L };
}

// The frame an opening's jambs are measured in: origin, unit direction, the lo and hi along values, the across
// offset of the handles, and whether the left end is the low one; null when it has no usable host.
type JambFrame = {
  origin: Point;
  d: Point;
  lo: number;
  hi: number;
  m: number;
  lowIsLeft: boolean;
  host: WallObject | null;
};

function jambFrame(objects: readonly ModelObject[], o: OpeningObject): JambFrame | null {
  const g = o.data.geometry;
  if (g.hostWallId === null) {
    const d = g.axis ?? { x: 1, y: 0 };
    const w = o.data.attributes.width;
    return {
      origin: g.center,
      d,
      lo: -w / 2,
      hi: w / 2,
      m: 0,
      lowIsLeft: leftEndIsLow(d, coordsEqual(d.x, 0)),
      host: null,
    };
  }
  const host = findWall(objects, g.hostWallId);
  if (host === null) return null;
  const span = openingSpan(o, host);
  const d = unitOf(host);
  if (span === null || d === null) return null;
  const start = host.data.geometry.start;
  const n = { x: -d.y, y: d.x };
  const faces = wallFaceLines(host.data);
  const m = (dot(sub(faces.left.start, start), n) + dot(sub(faces.right.start, start), n)) / 2;
  return {
    origin: start,
    d,
    lo: span.lo,
    hi: span.hi,
    m,
    lowIsLeft: leftEndIsLow(d, isVerticalLine(host.data.geometry)),
    host,
  };
}

const jambAt = (f: JambFrame, s: number): Point => ({
  x: f.origin.x + f.d.x * s - f.d.y * f.m,
  y: f.origin.y + f.d.y * s + f.d.x * f.m,
});

export function resizeHandles(
  objects: readonly ModelObject[],
  ids: readonly string[],
): ResizeHandle[] {
  if (ids.length !== 1) return [];
  const id = ids[0]!;
  const wall = findWall(objects, id);
  if (wall !== null) {
    if (wallLength(wall.data.geometry) <= COMPARISON_TOLERANCE_IN) return [];
    const faces = wallFaceLines(wall.data);
    return [
      { kind: 'wall', id: wall.id, end: 'start', at: mid(faces.left.start, faces.right.start) },
      { kind: 'wall', id: wall.id, end: 'end', at: mid(faces.left.end, faces.right.end) },
    ];
  }
  const o = findOpening(objects, id);
  if (o === null) return [];
  const f = jambFrame(objects, o);
  if (f === null) return [];
  return [
    { kind: 'opening', id: o.id, jamb: 'lo', at: jambAt(f, f.lo) },
    { kind: 'opening', id: o.id, jamb: 'hi', at: jambAt(f, f.hi) },
  ];
}

export function hingeHandle(objects: readonly ModelObject[], id: string): ResizeHandle | null {
  const o = findOpening(objects, id);
  if (o === null || o.data.attributes.kind !== 'door') return null;
  const handles = resizeHandles(objects, [id]);
  const f = jambFrame(objects, o);
  if (handles.length !== 2 || f === null) return null;
  const symbol = doorSymbol(o, f.host);
  if (symbol === null) return null;
  const s = dot(sub(symbol.hinge, f.origin), f.d);
  return Math.abs(s - f.hi) < Math.abs(s - f.lo) ? handles[1]! : handles[0]!;
}

export function handleAt(
  handles: readonly ResizeHandle[],
  screen: Point,
  toScreen: (p: Point) => Point,
): ResizeHandle | null {
  let best: ResizeHandle | null = null;
  let bestD = Infinity;
  for (const h of handles) {
    const p = toScreen(h.at);
    const d = Math.hypot(p.x - screen.x, p.y - screen.y);
    if (d <= HANDLE_HIT_PX && d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

export function fixedPoint(objects: readonly ModelObject[], h: ResizeHandle): Point | null {
  if (h.kind === 'wall') {
    const wall = findWall(objects, h.id);
    if (wall === null) return null;
    const g = wall.data.geometry;
    return h.end === 'end' ? g.start : g.end;
  }
  const other = resizeHandles(objects, [h.id]).find(
    (x) => x.kind === 'opening' && x.jamb !== h.jamb,
  );
  return other === undefined ? null : other.at;
}

const failed = (): ResizeOutcome => ({
  ok: false,
  message: 'office.tools.resize.failed',
  size: NaN,
});

function outcomeOf(r: ResizeWallResult | ResizeOpeningResult, size: number): ResizeOutcome {
  if (r.ok) return { ok: true, changed: r.changed, size };
  return { ok: false, message: RESIZE_REFUSALS[r.reason], size };
}

// The size the point gives and the side kept, for an opening jamb.
function openingResize(
  objects: readonly ModelObject[],
  h: Extract<ResizeHandle, { kind: 'opening' }>,
  size: (f: JambFrame) => number,
): ResizeOutcome {
  const o = findOpening(objects, h.id);
  if (o === null) return failed();
  const f = jambFrame(objects, o);
  if (f === null) return failed();
  const fixedIsLo = h.jamb === 'hi';
  const keep = fixedIsLo === f.lowIsLeft ? 'left' : 'right';
  const s = size(f);
  return outcomeOf(resizeOpening(objects, o.id, s, keep), s);
}

export function resizeByPoint(
  objects: readonly ModelObject[],
  h: ResizeHandle,
  point: Point,
): ResizeOutcome {
  if (h.kind === 'wall') {
    const wall = findWall(objects, h.id);
    if (wall === null) return failed();
    const size = endDragLength(wall, h.end, point);
    return outcomeOf(resizeWall(objects, h.id, h.end, size), size);
  }
  return openingResize(objects, h, (f) => {
    const s = dot(sub(point, f.origin), f.d);
    return h.jamb === 'hi' ? s - f.lo : f.hi - s;
  });
}

export function resizeBySize(
  objects: readonly ModelObject[],
  h: ResizeHandle,
  size: number,
): ResizeOutcome {
  if (h.kind === 'wall') {
    if (findWall(objects, h.id) === null) return failed();
    return outcomeOf(resizeWall(objects, h.id, h.end, size), size);
  }
  return openingResize(objects, h, () => size);
}

export function sizeChipNormal(objects: readonly ModelObject[], id: string): Point | null {
  const o = findOpening(objects, id);
  if (o === null) return null;
  const f = jambFrame(objects, o);
  if (f === null) return null;
  const a = o.data.attributes;
  const side: ChipSide = a.kind === 'door' ? (a.swing === 'left' ? 'right' : 'left') : 'right';
  const d = f.d;
  return side === 'left' ? { x: -d.y, y: d.x } : { x: d.y, y: -d.x };
}

export function entryValue(entry: SelectionEntry, values: TypedValues): number | null {
  return values[entryTool(entry).fields[0].id] ?? null;
}

export function chipEntryOutcome(
  objects: readonly ModelObject[],
  entry: SelectionEntry,
  value: number | null,
): { ok: true; changed: ModelObject[] } | { ok: false; message: MessageKey } | null {
  if (entry.kind !== 'chip' || value === null) return null;
  const r = applyChip(objects, entry.id, entry.side, value);
  if (r.ok) return { ok: true, changed: r.changed };
  return { ok: false, message: CHIP_REFUSALS[r.reason] };
}
