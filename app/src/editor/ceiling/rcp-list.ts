// EZD-708a (S05 Purpose "produce the reflected ceiling plan (RCP) for the permit set (sheet A6.0)"; phase-07
// EZD-708a "A6.0 from the RCP"): the RCP drawing list, moved out of rcp.ts so the sheet worker and the PDF export job
// draw A6.0 from the same list the editor shows (R7) without the editor's panels and plan batches. rcp.ts re-exports
// everything here. The history of each piece is in rcp.ts's header.
// EZD-708a (Q-0780 "Supply diffusers, returns and exhaust fans on the RCP ... print on A6.0 when placed"): supply and
// return registers (hvac) are ceiling items, as the fan clearance check counts them (CEILING_HVAC_KINDS); an air
// handler or condenser stays a floor item.
import {
  actBorderWarnings,
  actGridLayout,
  actGridSegments,
  actTileAt,
  pointInRing,
  fanClearanceWarnings,
  isOffCeiling,
  keepClearWarning,
  roomFraming,
  type FramingLine,
  DRAWING_FONTS,
  beamOutlines,
  beamSetWarnings,
  type DrawingLayer,
  type ModelObject,
  formatLength,
  measureTextPt,
  type DrawingItem,
  type DrawingList,
  type Point,
  type SwitchZoneData,
} from '@ezdraft/geometry';
import { levelModelObjects } from '../inspector/inspector-edits';
import type { Objects } from '../model/patches';
import { PLAN_DIMENSION_TEXT_PT } from '../plan/batches';
import { PT_TO_MODEL_IN } from '../plan/glyph-atlas';
import { ceilingShapeItems, ceilingTagItems, shapeDraftItems } from './ceiling-shapes';
import { onRcp } from '../../lib/sheets/rcp-kinds';
/** The greyed floor plan's one colour (no spec value; vault/build/assumptions.md EZD-502). */
export const GREYED_FLOOR_TOKEN = '--ez-border';
/** The ridge line's dash pattern in model inches: long dash, gap, short dash, gap (board S05Ceiling). */
export const RIDGE_DASH_IN: readonly number[] = [12, 4, 2, 4];

export { RCP_DEVICE_KINDS, RCP_HVAC_KINDS } from '../../lib/sheets/rcp-kinds';

type Ridge = { start: Point; end: Point; height: number };

function ridgeOf(data: unknown): Ridge | null {
  const ceiling = (data as { attributes?: { ceiling?: { ridge?: Ridge | null } | null } })
    ?.attributes?.ceiling;
  return ceiling?.ridge ?? null;
}

/** Dash segments from `a` to `b` in RIDGE_DASH_IN's pattern; the last dash is cut at `b`. */
export function dashes(
  a: Point,
  b: Point,
  pattern: readonly number[] = RIDGE_DASH_IN,
): [Point, Point][] {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length === 0) return [];
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  const at = (d: number): Point => ({ x: a.x + ux * d, y: a.y + uy * d });
  const out: [Point, Point][] = [];
  let d = 0;
  for (let i = 0; d < length; i = (i + 1) % pattern.length) {
    const step = pattern[i]!;
    if (i % 2 === 0) out.push([at(d), at(Math.min(d + step, length))]);
    d += step;
  }
  return out;
}

function ridgeItems(roomId: string, ridge: Ridge): DrawingItem[] {
  const base = { layer: 'rooms' as const, objectId: roomId };
  const items: DrawingItem[] = dashes(ridge.start, ridge.end).map(([from, to]) => ({
    ...base,
    kind: 'line',
    role: 'hidden',
    from,
    to,
  }));
  const text = `RIDGE ${formatLength(ridge.height, 16)}`;
  let rotationDeg =
    (Math.atan2(ridge.end.y - ridge.start.y, ridge.end.x - ridge.start.x) * 180) / Math.PI;
  if (rotationDeg <= -90) rotationDeg += 180;
  else if (rotationDeg > 90) rotationDeg -= 180;
  items.push({
    ...base,
    kind: 'text',
    text,
    font: 'dm-mono-400',
    sizePt: PLAN_DIMENSION_TEXT_PT,
    widthPt: measureTextPt(DRAWING_FONTS['dm-mono-400'], text, PLAN_DIMENSION_TEXT_PT),
    at: { x: (ridge.start.x + ridge.end.x) / 2, y: (ridge.start.y + ridge.end.y) / 2 },
    rotationDeg,
    align: 'center',
  });
  return items;
}

const STATUS_LAYER: Readonly<Record<string, DrawingLayer>> = {
  existing: 'existing',
  demo: 'demo',
  new: 'new',
};

/** The beam sets on the shown rooms: each beam's outline, on the flagged layer while the set warns. */
export function beamItems(
  objects: Objects,
  level: string,
  rooms: ReadonlySet<string>,
): DrawingItem[] {
  let hasBeams = false;
  for (const [, v] of objects) if (v.type === 'beam') hasBeams = true;
  if (!hasBeams) return [];
  const all = levelModelObjects(objects, level);
  const roomById = new Map<string, Extract<ModelObject, { type: 'room' }>>();
  for (const o of all) if (o.type === 'room') roomById.set(o.id.toLowerCase(), o);
  const items: DrawingItem[] = [];
  for (const o of all) {
    if (o.type !== 'beam') continue;
    const roomKey = o.data.geometry.roomId.toLowerCase();
    const room = roomById.get(roomKey);
    if (room === undefined || !rooms.has(roomKey)) continue;
    const layer: DrawingLayer =
      beamSetWarnings(o.data, all).length > 0 ? 'flagged' : (STATUS_LAYER[o.data.status] ?? 'new');
    for (const outline of beamOutlines(o.data, room.data))
      outline.forEach((from, i) =>
        items.push({
          kind: 'line',
          role: 'beyond',
          layer,
          objectId: o.id,
          from,
          to: outline[(i + 1) % outline.length]!,
        }),
      );
  }
  return items;
}

/** EZD-510: the zone outline's dash pattern in model inches: dash, gap (board S05Ceiling "4 3"). */
export const ZONE_DASH_IN: readonly number[] = [4, 3];
/** EZD-510: zones draw in the accent, the legend chip's `--ez-cobalt` (CeilingParts.module.css .zone). */
export const ZONE_LAYER: DrawingLayer = 'new';
/** EZD-510: the dimmer mark's letters: S at the plan's text size, the subscript D smaller (the standard symbol). */
export const DIMMER_MARK_PT = PLAN_DIMENSION_TEXT_PT;
export const DIMMER_SUB_PT = 7;
/** EZD-510: the id the half-drawn zone's lines carry; no stored object has it. */
export const ZONE_DRAFT_ID = 'switch-zone-draft';

/** The area centroid of a closed outline, or the corners' mean when it has no area. */
export function zoneLabelPoint(boundary: readonly Point[]): Point {
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  boundary.forEach((p, i) => {
    const q = boundary[(i + 1) % boundary.length]!;
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  });
  if (Math.abs(a2) < 1e-9) {
    const n = boundary.length || 1;
    return {
      x: boundary.reduce((t, p) => t + p.x, 0) / n,
      y: boundary.reduce((t, p) => t + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}

function dashedPath(points: readonly Point[], closed: boolean, objectId: string): DrawingItem[] {
  const items: DrawingItem[] = [];
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++)
    for (const [from, to] of dashes(points[i]!, points[(i + 1) % points.length]!, ZONE_DASH_IN))
      items.push({ kind: 'line', role: 'hidden', layer: ZONE_LAYER, objectId, from, to });
  return items;
}

function letter(text: string, sizePt: number, at: Point, objectId: string): DrawingItem {
  return {
    kind: 'text',
    layer: ZONE_LAYER,
    objectId,
    text,
    font: 'dm-mono-400',
    sizePt,
    widthPt: measureTextPt(DRAWING_FONTS['dm-mono-400'], text, sizePt),
    at,
    rotationDeg: 0,
    align: 'center',
  };
}

/** The dimmer mark centred on `at`: S, then a smaller D to its right and below its middle (plan y is up). */
export function dimmerMark(at: Point, objectId: string): DrawingItem[] {
  const s = letter('S', DIMMER_MARK_PT, at, objectId);
  const d = letter('D', DIMMER_SUB_PT, at, objectId);
  if (s.kind !== 'text' || d.kind !== 'text') return [];
  const sW = s.widthPt * PT_TO_MODEL_IN;
  const dW = d.widthPt * PT_TO_MODEL_IN;
  const left = at.x - (sW + dW) / 2;
  s.at = { x: left + sW / 2, y: at.y };
  d.at = { x: left + sW + dW / 2, y: at.y - (DIMMER_MARK_PT * PT_TO_MODEL_IN) / 3 };
  return [s, d];
}

/** The switching zones of the shown rooms: each one's dashed outline, and the dimmer mark on a dimmer zone. */
export function zoneItems(
  objects: Objects,
  level: string,
  rooms: ReadonlySet<string>,
): DrawingItem[] {
  let hasZones = false;
  for (const [, v] of objects) if (v.type === 'switch_zone') hasZones = true;
  if (!hasZones) return [];
  const items: DrawingItem[] = [];
  for (const o of levelModelObjects(objects, level)) {
    if (o.type !== 'switch_zone' || !rooms.has(o.data.geometry.roomId.toLowerCase())) continue;
    const data: SwitchZoneData = o.data;
    items.push(...dashedPath(data.geometry.boundary, true, o.id));
    if (data.attributes.dimmer)
      items.push(...dimmerMark(zoneLabelPoint(data.geometry.boundary), o.id));
  }
  return items;
}

/** EZD-509: the auto-layout preview's object id (a ghost, never a model object, so a click never selects it). */
export const AUTO_LAYOUT_DRAFT_ID = 'auto-layout-draft';
/** EZD-509: a ghost can's radius in model inches (a 6" can). */
export const AUTO_LAYOUT_GHOST_RADIUS_IN = 3;

/** EZD-509: the cans auto-layout is showing: a dashed circle at each, not yet placed. */
export function autoLayoutDraftItems(points: readonly Point[]): DrawingItem[] {
  return points.map((center) => ({
    kind: 'arc' as const,
    role: 'hidden' as const,
    layer: ZONE_LAYER,
    objectId: AUTO_LAYOUT_DRAFT_ID,
    center,
    radius: AUTO_LAYOUT_GHOST_RADIUS_IN,
    startAngle: 0,
    endAngle: 360,
  }));
}

/** A half-drawn zone: an open dashed line through its corners. */
export function zoneDraftItems(points: readonly Point[]): DrawingItem[] {
  return points.length < 2 ? [] : dashedPath(points, false, ZONE_DRAFT_ID);
}

/**
 * EZD-514 (S05 Controls "Framing known ... Enter locations: draw joist or beam lines with direction and spacing"): each
 * shown room's framing lines, dashed on the rooms layer under the room's id (a click on one selects the ceiling). A
 * line with a spacing draws once at each repeat that crosses the room, the same length as drawn.
 */
export const FRAMING_DASH_IN: readonly number[] = [6, 4];

/** The offsets across `line`, in inches from the drawn line, at which a member of it crosses `ring`. */
export function framingRepeats(line: FramingLine, ring: readonly Point[]): number[] {
  if (line.spacing === null) return [0];
  const L = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
  const nx = -(line.end.y - line.start.y) / L;
  const ny = (line.end.x - line.start.x) / L;
  const across = ring.map((p) => (p.x - line.start.x) * nx + (p.y - line.start.y) * ny);
  const lo = Math.ceil(Math.min(...across) / line.spacing);
  const hi = Math.floor(Math.max(...across) / line.spacing);
  const out: number[] = [];
  for (let k = lo; k <= hi; k++) out.push(k * line.spacing);
  return out;
}

function framingLineItems(
  line: FramingLine,
  ring: readonly Point[],
  objectId: string,
): DrawingItem[] {
  const L = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
  const nx = -(line.end.y - line.start.y) / L;
  const ny = (line.end.x - line.start.x) / L;
  const items: DrawingItem[] = [];
  for (const d of framingRepeats(line, ring)) {
    const a = { x: line.start.x + nx * d, y: line.start.y + ny * d };
    const b = { x: line.end.x + nx * d, y: line.end.y + ny * d };
    for (const [from, to] of dashes(a, b, FRAMING_DASH_IN))
      items.push({ kind: 'line', role: 'hidden', layer: 'rooms', objectId, from, to });
  }
  return items;
}

/** The framing lines of the shown rooms. */
export function framingItems(
  objects: Objects,
  level: string,
  rooms: ReadonlySet<string>,
): DrawingItem[] {
  const items: DrawingItem[] = [];
  for (const o of levelModelObjects(objects, level)) {
    if (o.type !== 'room' || !rooms.has(o.id.toLowerCase())) continue;
    const ring = o.data.geometry.boundary;
    for (const line of roomFraming(o.data.attributes).lines)
      items.push(...framingLineItems(line, ring, o.id));
  }
  return items;
}

/**
 * EZD-515: what the RCP checks need from company settings. `fanClearance` null is Not set (no fan check). EZD-511:
 * `actMinShare` is the Defaults "ACT minimum border" as a share of the tile; absent is half a tile.
 */
export type RcpChecks = { fanClearance: number | null; actMinShare?: number };
export const NO_CHECKS: RcpChecks = { fanClearance: null };
const HALF_TILE = 0.5;

/** EZD-511: the start mark's radius and the box it picks by, in model inches. */
export const ACT_START_MARK_IN = 3;

/** The parts of segment a-b inside the ring (a room outline), in order. */
export function clipToRing(a: Point, b: Point, ring: readonly Point[]): [Point, Point][] {
  const ts = [0, 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den;
    const u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const at = (t: number): Point => ({ x: a.x + dx * t, y: a.y + dy * t });
  const out: [Point, Point][] = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    if (ts[i + 1]! - ts[i]! < 1e-9) continue;
    if (pointInRing(at((ts[i]! + ts[i + 1]!) / 2), ring)) out.push([at(ts[i]!), at(ts[i + 1]!)]);
  }
  return out;
}

type RoomObj = Extract<ModelObject, { type: 'room' }>;
type GridObj = Extract<ModelObject, { type: 'act_grid' }>;

/** EZD-511: the grids on the shown rooms, each with its room. */
function gridsOn(
  objects: Objects,
  level: string,
  rooms: ReadonlySet<string> | null,
): { grid: GridObj; room: RoomObj }[] {
  let hasGrids = false;
  for (const [, v] of objects) if (v.type === 'act_grid') hasGrids = true;
  if (!hasGrids) return [];
  const all = levelModelObjects(objects, level);
  const roomById = new Map<string, RoomObj>();
  for (const o of all) if (o.type === 'room') roomById.set(o.id.toLowerCase(), o);
  const out: { grid: GridObj; room: RoomObj }[] = [];
  for (const o of all) {
    if (o.type !== 'act_grid') continue;
    const key = o.data.geometry.roomId.toLowerCase();
    const room = roomById.get(key);
    if (room !== undefined && (rooms === null || rooms.has(key))) out.push({ grid: o, room });
  }
  return out;
}

/**
 * EZD-511 (S05 Controls "Acoustical grid"; board S05Ceiling laundry grid in thin lines; AC-EZD-511-1): each grid on a
 * shown room draws its mains and cross tees in thin lines clipped to the room, and its start point as a small circle.
 * A grid whose override leaves a border under the minimum is on the flagged layer (as the EZD-505 beam warning).
 */
export function actGridItems(
  objects: Objects,
  level: string,
  rooms: ReadonlySet<string>,
  minShare: number = HALF_TILE,
): DrawingItem[] {
  const items: DrawingItem[] = [];
  for (const { grid, room } of gridsOn(objects, level, rooms)) {
    const layout = actGridLayout(grid.data, room.data, minShare);
    const layer: DrawingLayer =
      actBorderWarnings(grid.data, layout).length > 0 ? 'flagged' : 'rooms';
    for (const [a, b] of actGridSegments(layout))
      for (const [from, to] of clipToRing(a, b, room.data.geometry.boundary))
        items.push({ kind: 'line', role: 'dimension', layer, objectId: grid.id, from, to });
    items.push({
      kind: 'arc',
      role: 'beyond',
      layer,
      objectId: grid.id,
      center: layout.start,
      radius: ACT_START_MARK_IN,
      startAngle: 0,
      endAngle: Math.PI * 2,
    });
  }
  return items;
}

/** EZD-511: the troffer's lens, inset from the tile's edges, in model inches. */
export const TROFFER_INSET_IN = 2;

/**
 * EZD-511 (S05 Recessed light "in ACT areas, troffers snap into tiles"; vault/build/assumptions.md EZD-511
 * "Troffers"): the recessed lights in a room with a grid, each drawn as the tile it sits in (outline and an inset
 * lens) in place of the can. Keyed by the light's id (lower case).
 */
export function trofferItems(
  objects: Objects,
  level: string,
  minShare: number = HALF_TILE,
): Map<string, DrawingItem[]> {
  const out = new Map<string, DrawingItem[]>();
  const grids = gridsOn(objects, level, null);
  if (grids.length === 0) return out;
  const layouts = grids.map(({ grid, room }) => ({
    ring: room.data.geometry.boundary,
    layout: actGridLayout(grid.data, room.data, minShare),
  }));
  for (const o of levelModelObjects(objects, level)) {
    if (o.type !== 'device' || o.data.attributes.kind !== 'recessed_light') continue;
    const p = o.data.geometry.point;
    const hit = layouts.find((g) => pointInRing(p, g.ring));
    if (hit === undefined) continue;
    const tile = actTileAt(hit.layout, p);
    if (tile === null) continue;
    const layer = STATUS_LAYER[o.data.status] ?? 'new';
    const c = tile.center;
    const inset = tile.corners.map((q) => {
      const d = Math.hypot(q.x - c.x, q.y - c.y);
      const k = d === 0 ? 0 : Math.max(0, d - TROFFER_INSET_IN * Math.SQRT2) / d;
      return { x: c.x + (q.x - c.x) * k, y: c.y + (q.y - c.y) * k };
    });
    const ring = (pts: readonly Point[], role: 'beyond' | 'hidden'): DrawingItem[] =>
      pts.map((from, i) => ({
        kind: 'line' as const,
        role,
        layer,
        objectId: o.id,
        from,
        to: pts[(i + 1) % pts.length]!,
      }));
    out.set(o.id.toLowerCase(), [...ring(tile.corners, 'beyond'), ...ring(inset, 'beyond')]);
  }
  return out;
}

/** EZD-515: the ids of the hosted ceiling items that are flagged: off any ceiling, or a fan closer than the clearance. */
export function flaggedCeilingIds(
  objects: Objects,
  level: string,
  checks: RcpChecks = NO_CHECKS,
): Set<string> {
  const out = new Set<string>();
  let hosted = false;
  for (const [, v] of objects)
    if (v.type === 'device' || v.type === 'access' || v.type === 'hvac') hosted = true;
  if (!hosted) return out;
  const all = levelModelObjects(objects, level);
  for (const o of all)
    // EZD-514: and a can on a known joist or beam.
    if (
      isOffCeiling(o, all) ||
      fanClearanceWarnings(o, all, checks.fanClearance).length > 0 ||
      keepClearWarning(o, all) !== null
    )
      out.add(o.id.toLowerCase());
  return out;
}

/**
 * The RCP drawing list: the floor list's wall, room, access and ceiling device items (dimensions left out), each shown
 * room's ridge, beams and switching zones (EZD-510), and the zone being drawn. EZD-515: a flagged ceiling item's items are on the flagged layer.
 */
export function rcpList(
  floor: DrawingList | null,
  objects: Objects,
  checks: RcpChecks = NO_CHECKS,
  // EZD-510: the corners of the zone being drawn.
  zoneDraft: readonly Point[] = [],
  // EZD-513: the corners of the soffit, tray, coffer or crown being drawn.
  shapeDraft: readonly Point[] = [],
  // EZD-509: the cans auto-layout is showing.
  cansDraft: readonly Point[] = [],
): DrawingList | null {
  if (floor === null) return null;
  const flagged = flaggedCeilingIds(objects, floor.level, checks);
  // EZD-511: a light in an ACT room draws as its troffer instead of the floor list's can.
  const troffers = trofferItems(objects, floor.level, checks.actMinShare ?? HALF_TILE);
  const typeOf = new Map<string, string>();
  const kept = new Set<string>();
  for (const [id, v] of objects) {
    typeOf.set(id.toLowerCase(), v.type);
    if (onRcp(v.type, v.data)) kept.add(id.toLowerCase());
  }
  const items: DrawingItem[] = [];
  const rooms = new Set<string>();
  const trofferShown = new Set<string>();
  for (const item of floor.items) {
    const key = item.objectId.toLowerCase();
    const type = typeOf.get(key);
    if (type === undefined || !kept.has(key) || item.layer === 'dimensions') continue;
    // EZD-511: only lights the floor list holds (the phase view may hide one) draw as troffers.
    if (troffers.has(key)) {
      trofferShown.add(key);
      continue;
    }
    items.push(flagged.has(key) ? { ...item, layer: 'flagged' } : item);
    if (type === 'room') rooms.add(item.objectId.toLowerCase());
  }
  for (const [id, v] of objects) {
    if (v.type !== 'room' || !rooms.has(id.toLowerCase())) continue;
    const ridge = ridgeOf(v.data);
    if (ridge !== null) items.push(...ridgeItems(id, ridge));
  }
  items.push(...beamItems(objects, floor.level, rooms));
  // EZD-514: the framing lines under the ceiling items.
  items.push(...framingItems(objects, floor.level, rooms));
  // EZD-511: the ACT grids under everything else on the ceiling, then the troffers in them.
  items.push(...actGridItems(objects, floor.level, rooms, checks.actMinShare ?? HALF_TILE));
  for (const [key, list] of troffers)
    if (trofferShown.has(key))
      items.push(
        ...(flagged.has(key) ? list.map((i) => ({ ...i, layer: 'flagged' as const })) : list),
      );
  items.push(...zoneItems(objects, floor.level, rooms), ...zoneDraftItems(zoneDraft));
  // EZD-513: added after the floor list's dimensions are left out, so the edge dimensions stay.
  items.push(...ceilingShapeItems(objects, floor.level, rooms), ...shapeDraftItems(shapeDraft));
  items.push(...ceilingTagItems(objects, floor.level));
  items.push(...autoLayoutDraftItems(cansDraft));
  return { level: floor.level, items, omitted: [] };
}
