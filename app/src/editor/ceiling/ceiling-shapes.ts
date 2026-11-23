// EZD-513 (S05 Controls "Soffit, tray, coffer | Ceiling rail | Draws a soffit, tray, coffer or crown; edges get
// dimensions. | Edit model.", "Height and material tag | Ceiling rail | Click an area to place a tag (e.g. "CLG 8' 0" ·
// ACT 2x2"). Tag reads from the ceiling data. | Edit model. Tag text is generated, not free text."; board S05Ceiling
// tags "CLG 8' 0" · ACT 2x2", "CLG 8' to 13' · drywall"; Q-0704 "soffit dropHeight is measured down from the room's
// ceiling height, which EZD-513's tag reads"; AC-EZD-513-1, -2; vault/build/assumptions.md EZD-513): placing a soffit,
// tray, coffer or crown and a tag (each one change, one undo step, checked against its schema), the tag's text worked
// out from the ceiling data under it, and the RCP items: each outline with a dimension on every edge, and each tag.
// Pure: no React, no DOM. Loaded with the Ceiling view's lazy module (rcp.ts), never in the editor's first download.
import {
  CURRENT_SCHEMA_VERSION,
  DRAWING_FONTS,
  PLAN_DISPLAY_DENOMINATOR,
  formatLength,
  measureTextPt,
  outlineAreaSqIn,
  parseStoredObject,
  pointInRing,
  type CeilingShapeKind,
  type DrawingItem,
  type DrawingLayer,
  type ModelObject,
  type ObjectStatus,
  type Point,
} from '@ezdraft/geometry';
import { levelModelObjects } from '../inspector/inspector-edits';
import type { Change, Objects } from '../model/patches';
import { PLAN_DIMENSION_TEXT_PT } from '../plan/batches';
import { PT_TO_MODEL_IN } from '../plan/glyph-atlas';
import { roomAt } from '../tools/beam-edits';
import { ceilingSummary } from './room-ceiling';

/** What the Soffit, tray, coffer tool draws: a soffit (the `soffit` type) or a `ceiling_shape` kind. */
export type ShapeKind = 'soffit' | CeilingShapeKind;
export const SHAPE_KINDS: readonly ShapeKind[] = ['soffit', 'tray', 'coffer', 'crown'];

/**
 * Starting sizes in inches (vault/build/assumptions.md EZD-513): a soffit's drop (the EZD-229 12"), a tray's rise, a
 * coffer's recess and a crown's size.
 */
export const DEFAULT_SHAPE_DEPTH_IN: Readonly<Record<ShapeKind, number>> = {
  soffit: 12,
  tray: 12,
  coffer: 6,
  crown: 4,
};

/** The edge dimension's offset outside the outline, in model inches. */
export const EDGE_DIMENSION_OFFSET_IN = 6;
/** The material a ceiling reads until the ACT grid (EZD-511) adds "ACT 2x2" (board S05Ceiling "drywall"). */
export const DEFAULT_CEILING_MATERIAL = 'drywall';
/** The tag's box padding around its text, in model inches. */
export const TAG_PAD_IN = 3;

function stored(
  id: string,
  type: 'soffit' | 'ceiling_shape' | 'ceiling_tag',
  data: unknown,
): Change | null {
  const r = parseStoredObject({ id, type, schema_version: CURRENT_SCHEMA_VERSION, data });
  if (!r.ok) return null;
  return {
    id,
    value: {
      type,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: r.object.data as unknown as Record<string, unknown>,
    },
  };
}

/**
 * One new soffit, tray, coffer or crown on the room under the first corner; null when that corner is in no room or
 * the outline or size is refused. A soffit's size is its drop; the others' is their `depth`.
 */
export function placeCeilingShape(
  objects: Objects,
  level: string,
  kind: ShapeKind,
  boundary: readonly Point[],
  depth: number,
  status: ObjectStatus,
  newId: () => string,
): Change | null {
  const first = boundary[0];
  if (first === undefined) return null;
  const room = roomAt(objects, level, first);
  if (room === null) return null;
  const points = boundary.map((p) => ({ x: p.x, y: p.y }));
  if (kind === 'soffit')
    return stored(newId(), 'soffit', {
      geometry: { boundary: points },
      status,
      level: room.data.level,
      attributes: { dropHeight: depth },
    });
  return stored(newId(), 'ceiling_shape', {
    geometry: { roomId: room.id, boundary: points },
    status,
    level: room.data.level,
    attributes: { kind, depth },
  });
}

/** One new tag at `at` on the room there; null when `at` is in no room. Its text is never stored. */
export function placeCeilingTag(
  objects: Objects,
  level: string,
  at: Point,
  status: ObjectStatus,
  newId: () => string,
): Change | null {
  const room = roomAt(objects, level, at);
  if (room === null) return null;
  return stored(newId(), 'ceiling_tag', {
    geometry: { point: { x: at.x, y: at.y } },
    status,
    level: room.data.level,
    attributes: {},
  });
}

// ---------------------------------------------------------------- tag text

/** A whole number of feet reads as feet alone in a range ("8' to 13'", board S05Ceiling); else the full length. */
function rangeEnd(inches: number): string {
  const text = formatLength(inches, 16);
  return text.endsWith(` 0"`) ? text.slice(0, -3) : text;
}

/**
 * The area of the ceiling under `at` that sets its height: the smallest soffit, tray or coffer holding it, else none
 * (the room's own ceiling). Crown is trim, not an area.
 */
function areaAt(all: readonly ModelObject[], at: Point): { offset: number } | null {
  let best: { offset: number; area: number } | null = null;
  for (const o of all) {
    let offset: number;
    let boundary: readonly Point[];
    if (o.type === 'soffit') {
      offset = -o.data.attributes.dropHeight;
      boundary = o.data.geometry.boundary;
    } else if (o.type === 'ceiling_shape' && o.data.attributes.kind !== 'crown') {
      offset = o.data.attributes.depth;
      boundary = o.data.geometry.boundary;
    } else continue;
    if (!pointInRing(at, boundary)) continue;
    const area = outlineAreaSqIn(boundary);
    if (best === null || area < best.area) best = { offset, area };
  }
  return best;
}

/**
 * A tag's text from the ceiling data under `at` (S05 "Tag reads from the ceiling data"): `CLG <height> · <material>`.
 * The height is the room's ceiling height (the ceiling summary's walls height), less a soffit's drop or plus a tray's
 * rise or a coffer's recess when the point is in one; a sloped room with a ridge reads low to high ("CLG 8' to 13'").
 * Null when `at` is in no room.
 */
export function tagText(objects: Objects, level: string, at: Point): string | null {
  const room = roomAt(objects, level, at);
  if (room === null) return null;
  const summary = ceilingSummary(objects, room.id);
  if (summary === null) return null;
  const area = areaAt(levelModelObjects(objects, level), at);
  let height: string;
  if (area !== null) height = formatLength(Math.max(0, summary.wallsIn + area.offset), 16);
  else if (summary.ridgeIn !== null && summary.ridgeIn > summary.wallsIn)
    height = `${rangeEnd(summary.wallsIn)} to ${rangeEnd(summary.ridgeIn)}`;
  else height = formatLength(summary.wallsIn, 16);
  // EZD-511 (vault/build/assumptions.md EZD-511/EZD-513 row; board S05Ceiling "CLG 8' 0" · ACT 2x2"): the room's own
  // ceiling reads "ACT 2x2" or "ACT 2x4" while it has a grid; a soffit, tray or coffer in it stays drywall.
  let material = DEFAULT_CEILING_MATERIAL;
  if (area === null)
    for (const o of levelModelObjects(objects, level))
      if (o.type === 'act_grid' && o.data.geometry.roomId.toLowerCase() === room.id.toLowerCase())
        material = `ACT ${o.data.attributes.module}`;
  return `CLG ${height} · ${material}`;
}

// ---------------------------------------------------------------- drawing

const STATUS_LAYER: Readonly<Record<string, DrawingLayer>> = {
  existing: 'existing',
  demo: 'demo',
  new: 'new',
};

function signedArea(ring: readonly Point[]): number {
  let a2 = 0;
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    a2 += p.x * q.y - q.x * p.y;
  });
  return a2 / 2;
}

function lengthText(
  at: Point,
  text: string,
  rotationDeg: number,
  layer: DrawingLayer,
  objectId: string,
): DrawingItem {
  return {
    kind: 'text',
    layer,
    objectId,
    text,
    font: 'dm-mono-400',
    sizePt: PLAN_DIMENSION_TEXT_PT,
    widthPt: measureTextPt(DRAWING_FONTS['dm-mono-400'], text, PLAN_DIMENSION_TEXT_PT),
    at,
    rotationDeg,
    align: 'center',
  };
}

/**
 * A dimension on every edge of a closed outline (S05 "edges get dimensions"): a dimension line EDGE_DIMENSION_OFFSET_IN
 * outside the edge with the edge's length at its middle, at the plan's dimension rounding, on the dimensions layer.
 */
export function edgeDimensionItems(boundary: readonly Point[], objectId: string): DrawingItem[] {
  const items: DrawingItem[] = [];
  const ccw = signedArea(boundary) >= 0;
  boundary.forEach((p, i) => {
    const q = boundary[(i + 1) % boundary.length]!;
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    if (length === 0) return;
    const ux = (q.x - p.x) / length;
    const uy = (q.y - p.y) / length;
    // Outside: right of the edge on a counter-clockwise outline, left on a clockwise one.
    const n = ccw ? { x: uy, y: -ux } : { x: -uy, y: ux };
    const off = (a: Point): Point => ({
      x: a.x + n.x * EDGE_DIMENSION_OFFSET_IN,
      y: a.y + n.y * EDGE_DIMENSION_OFFSET_IN,
    });
    const from = off(p);
    const to = off(q);
    items.push({ kind: 'line', role: 'dimension', layer: 'dimensions', objectId, from, to });
    let rotationDeg = (Math.atan2(uy, ux) * 180) / Math.PI;
    if (rotationDeg <= -90) rotationDeg += 180;
    else if (rotationDeg > 90) rotationDeg -= 180;
    items.push(
      lengthText(
        { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
        formatLength(length, PLAN_DISPLAY_DENOMINATOR),
        rotationDeg,
        'dimensions',
        objectId,
      ),
    );
  });
  return items;
}

/** The crown's dash pattern in model inches (vault/build/assumptions.md EZD-513). */
export const CROWN_DASH_IN: readonly number[] = [6, 2];

function dashed(a: Point, b: Point, pattern: readonly number[]): [Point, Point][] {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const out: [Point, Point][] = [];
  if (length === 0) return out;
  const at = (d: number): Point => ({
    x: a.x + ((b.x - a.x) * d) / length,
    y: a.y + ((b.y - a.y) * d) / length,
  });
  let d = 0;
  for (let i = 0; d < length; i = (i + 1) % pattern.length) {
    const step = pattern[i]!;
    if (i % 2 === 0) out.push([at(d), at(Math.min(d + step, length))]);
    d += step;
  }
  return out;
}

function outlineItems(
  boundary: readonly Point[],
  layer: DrawingLayer,
  objectId: string,
  pattern: readonly number[] | null,
): DrawingItem[] {
  const items: DrawingItem[] = [];
  boundary.forEach((p, i) => {
    const q = boundary[(i + 1) % boundary.length]!;
    const parts: [Point, Point][] = pattern === null ? [[p, q]] : dashed(p, q, pattern);
    for (const [from, to] of parts)
      items.push({ kind: 'line', role: 'beyond', layer, objectId, from, to });
  });
  return items;
}

/**
 * The soffits, trays, coffers and crown of the level: each outline in its status colour (crown dashed) with its edge
 * dimensions. A tray, coffer or crown shows only while its room is shown (`rooms`, lower-cased ids).
 */
export function ceilingShapeItems(
  objects: Objects,
  level: string,
  rooms: ReadonlySet<string>,
): DrawingItem[] {
  let has = false;
  for (const [, v] of objects) if (v.type === 'soffit' || v.type === 'ceiling_shape') has = true;
  if (!has) return [];
  const items: DrawingItem[] = [];
  for (const o of levelModelObjects(objects, level)) {
    if (o.type === 'soffit') {
      const b = o.data.geometry.boundary;
      items.push(...outlineItems(b, STATUS_LAYER[o.data.status] ?? 'new', o.id, null));
      items.push(...edgeDimensionItems(b, o.id));
    } else if (o.type === 'ceiling_shape') {
      if (!rooms.has(o.data.geometry.roomId.toLowerCase())) continue;
      const b = o.data.geometry.boundary;
      const pattern = o.data.attributes.kind === 'crown' ? CROWN_DASH_IN : null;
      items.push(...outlineItems(b, STATUS_LAYER[o.data.status] ?? 'new', o.id, pattern));
      items.push(...edgeDimensionItems(b, o.id));
    }
  }
  return items;
}

/** The tags of the level: each one's generated text in a box (board S05Ceiling tag pill). */
export function ceilingTagItems(objects: Objects, level: string): DrawingItem[] {
  let has = false;
  for (const [, v] of objects) if (v.type === 'ceiling_tag') has = true;
  if (!has) return [];
  const items: DrawingItem[] = [];
  for (const o of levelModelObjects(objects, level)) {
    if (o.type !== 'ceiling_tag') continue;
    const at = o.data.geometry.point;
    const text = tagText(objects, level, at);
    if (text === null) continue;
    const layer = STATUS_LAYER[o.data.status] ?? 'new';
    const label = lengthText(at, text, 0, layer, o.id);
    if (label.kind !== 'text') continue;
    items.push(label);
    const hw = (label.widthPt * PT_TO_MODEL_IN) / 2 + TAG_PAD_IN;
    const hh = (PLAN_DIMENSION_TEXT_PT * PT_TO_MODEL_IN) / 2 + TAG_PAD_IN;
    const box: Point[] = [
      { x: at.x - hw, y: at.y - hh },
      { x: at.x + hw, y: at.y - hh },
      { x: at.x + hw, y: at.y + hh },
      { x: at.x - hw, y: at.y + hh },
    ];
    box.forEach((p, i) =>
      items.push({
        kind: 'line',
        role: 'dimension',
        layer,
        objectId: o.id,
        from: p,
        to: box[(i + 1) % 4]!,
      }),
    );
  }
  return items;
}

/** The id the half-drawn outline's lines carry; no stored object has it. */
export const SHAPE_DRAFT_ID = 'ceiling-shape-draft';

/** A half-drawn outline: an open line through its corners. */
export function shapeDraftItems(points: readonly Point[]): DrawingItem[] {
  const items: DrawingItem[] = [];
  for (let i = 0; i + 1 < points.length; i++)
    items.push({
      kind: 'line',
      role: 'beyond',
      layer: 'new',
      objectId: SHAPE_DRAFT_ID,
      from: points[i]!,
      to: points[i + 1]!,
    });
  return items;
}
