// EZD-502 (S05 Layout "Canvas: RCP drawing"; S05 Controls "Both: RCP over a greyed floor plan"; S05 Data shown "ridge
// line and direction"; board S05Ceiling "RIDGE 13' 0""; AC-EZD-502-1): the reflected ceiling plan drawn from the open
// floor's drawing list. Reflected: the RCP keeps the floor plan's orientation, so a point draws at the same place on
// both (vault/build/assumptions.md EZD-502). The RCP keeps the walls and rooms (and their labels) and adds each
// room's ridge line; door swings, windows, fixtures, cabinets, pins and dimensions are floor items. Both draws the
// whole floor plan in one grey under the RCP. Loaded lazily on the first switch to Ceiling or Both (11 rule 7).
// EZD-505 (S05 Controls "Beam"; S05 Validation "Level beams in a vault must sit below the ridge and at or above the
// wall plate; warn otherwise"; Q-0630 "The whole object turns error red"; AC-EZD-505-1): each beam set on a shown
// room draws its beams' outlines in its status colour, or all in error red while the set has a warning.
// EZD-507 (S05 Controls "Recessed light ... Same object as on the electrical plan (06)", "Smoke or CO detector ... Same
// object as electrical plan"; S05 Data shown "Ceiling objects: ... cans, fans, ... detectors, speakers, low voltage,
// access panels"; AC-EZD-507-1): the ceiling devices keep the floor plan's own items (one object id on both); a device
// of another kind (a wall device of the electrical plan) is a floor item.
// EZD-515 (S05 Validation "Ceiling fan blade clearance to walls and beams: warning when closer than the clearance in
// company settings under Defaults", "Hosted ceiling item left off any ceiling surface: red flag"; Q-0630 "The whole
// object turns error red"; AC-EZD-515-1): a fan closer than the clearance, and a hosted ceiling item in no room, draw
// on the flagged layer (as the EZD-505 beam warning; vault/build/assumptions.md EZD-515).
// EZD-510 (S05 Controls "Switching zones ... Draws switching zones and dimmers on the RCP (dashed accent lines)"; board
// S05Ceiling zone outline "stroke-dasharray 4 3" in the accent; AC-EZD-510-1, -2; vault/build/assumptions.md EZD-510):
// each switching zone on a shown room draws as a closed dashed outline in the accent (the legend chip's colour,
// whatever the zone's status); a dimmer zone adds the dimmer mark, an S with a subscript D, at its label point. A
// half-drawn zone draws as an open dashed line through its corners.
// EZD-513 (S05 Controls "Soffit, tray, coffer ... edges get dimensions", "Height and material tag ... Tag reads from
// the ceiling data"; AC-EZD-513-1, -2; vault/build/assumptions.md EZD-513): each soffit, tray, coffer and crown draws
// its outline with a dimension on every edge, and each tag its generated text in a box (ceiling-shapes.ts); an outline
// being drawn shows as an open line through its corners.
import {
  fanClearanceWarnings,
  isOffCeiling,
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
import { buildPlanBatches, PLAN_DIMENSION_TEXT_PT, type PlanBatch } from '../plan/batches';
import { tokenRgb } from '../plan/color';
import { PT_TO_MODEL_IN } from '../plan/glyph-atlas';
import { UNDERLAY_RENDER_ORDER } from '../plan/scene';
import type { PlanSurface, SurfaceSetting } from './surface';
import type { PlanController } from '../plan/controller';
import type { PlanPointerReceiver } from '../plan/input';
import { placeSwitchZone, roomAt } from '../tools/switch-zone';
import { switchZoneReceiver, zoneDrawingFor, type ZoneToolDeps } from '../tools/switch-zone-tool';
import { ceilingShapeItems, ceilingTagItems, shapeDraftItems } from './ceiling-shapes';
import {
  shapeDrawingFor,
  shapeReceiver as drawShapeReceiver,
  tagReceiver,
  type CeilingToolDeps,
} from './shape-tool';

// EZD-508: the left panel's fixture schedule, the legend and the ceiling status items load with the RCP drawing (one
// lazy part for Ceiling and Both).
export { FixtureSchedule } from './FixtureSchedule';
export { CeilingLegend, CeilingViewStatus, JoistsStatus } from './CeilingShown';
// EZD-503: the room ceiling summary and the ceiling type editor load with them too.
export { RoomCeiling } from './RoomCeiling';
// EZD-510: the left panel's Lighting section with Switching zones.
export { Lighting, LightingSection } from '../tools/SwitchZonePanel';
export { placeSwitchZone, roomAt } from '../tools/switch-zone';
export { switchZoneReceiver, zoneDrawingFor } from '../tools/switch-zone-tool';
// EZD-513: the Soffit, tray, coffer card and the two tools' receivers.
export { ShapeChooser } from './ShapeChooser';
export { tagReceiver } from './shape-tool';

/** The greyed floor plan's one colour (no spec value; vault/build/assumptions.md EZD-502). */
export const GREYED_FLOOR_TOKEN = '--ez-border';
/** The ridge line's dash pattern in model inches: long dash, gap, short dash, gap (board S05Ceiling). */
export const RIDGE_DASH_IN: readonly number[] = [12, 4, 2, 4];

const RCP_TYPES: ReadonlySet<string> = new Set(['wall', 'room', 'access']);
/** EZD-507: the device kinds that sit on the ceiling. */
export const RCP_DEVICE_KINDS: ReadonlySet<string> = new Set([
  'recessed_light',
  'ceiling_fan',
  'smoke_detector',
  'co_detector',
  'smoke_co_detector',
  'speaker',
  'camera',
  'wifi_ap',
]);

function onRcp(type: string, data: unknown): boolean {
  if (RCP_TYPES.has(type)) return true;
  if (type !== 'device') return false;
  const kind = (data as { attributes?: { kind?: unknown } } | null)?.attributes?.kind;
  return typeof kind === 'string' && RCP_DEVICE_KINDS.has(kind);
}

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
export function zoneItems(objects: Objects, level: string, rooms: ReadonlySet<string>): DrawingItem[] {
  let hasZones = false;
  for (const [, v] of objects) if (v.type === 'switch_zone') hasZones = true;
  if (!hasZones) return [];
  const items: DrawingItem[] = [];
  for (const o of levelModelObjects(objects, level)) {
    if (o.type !== 'switch_zone' || !rooms.has(o.data.geometry.roomId.toLowerCase())) continue;
    const data: SwitchZoneData = o.data;
    items.push(...dashedPath(data.geometry.boundary, true, o.id));
    if (data.attributes.dimmer) items.push(...dimmerMark(zoneLabelPoint(data.geometry.boundary), o.id));
  }
  return items;
}

/** A half-drawn zone: an open dashed line through its corners. */
export function zoneDraftItems(points: readonly Point[]): DrawingItem[] {
  return points.length < 2 ? [] : dashedPath(points, false, ZONE_DRAFT_ID);
}

/** EZD-515: what the RCP checks need from company settings. `fanClearance` null is Not set (no fan check). */
export type RcpChecks = { fanClearance: number | null };
const NO_CHECKS: RcpChecks = { fanClearance: null };

/** EZD-515: the ids of the hosted ceiling items that are flagged: off any ceiling, or a fan closer than the clearance. */
export function flaggedCeilingIds(
  objects: Objects,
  level: string,
  checks: RcpChecks = NO_CHECKS,
): Set<string> {
  const out = new Set<string>();
  let hosted = false;
  for (const [, v] of objects) if (v.type === 'device' || v.type === 'access' || v.type === 'hvac') hosted = true;
  if (!hosted) return out;
  const all = levelModelObjects(objects, level);
  for (const o of all)
    if (isOffCeiling(o, all) || fanClearanceWarnings(o, all, checks.fanClearance).length > 0)
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
): DrawingList | null {
  if (floor === null) return null;
  const flagged = flaggedCeilingIds(objects, floor.level, checks);
  const typeOf = new Map<string, string>();
  const kept = new Set<string>();
  for (const [id, v] of objects) {
    typeOf.set(id.toLowerCase(), v.type);
    if (onRcp(v.type, v.data)) kept.add(id.toLowerCase());
  }
  const items: DrawingItem[] = [];
  const rooms = new Set<string>();
  for (const item of floor.items) {
    const key = item.objectId.toLowerCase();
    const type = typeOf.get(key);
    if (type === undefined || !kept.has(key) || item.layer === 'dimensions') continue;
    items.push(flagged.has(key) ? { ...item, layer: 'flagged' } : item);
    if (type === 'room') rooms.add(item.objectId.toLowerCase());
  }
  for (const [id, v] of objects) {
    if (v.type !== 'room' || !rooms.has(id.toLowerCase())) continue;
    const ridge = ridgeOf(v.data);
    if (ridge !== null) items.push(...ridgeItems(id, ridge));
  }
  items.push(...beamItems(objects, floor.level, rooms));
  items.push(...zoneItems(objects, floor.level, rooms), ...zoneDraftItems(zoneDraft));
  // EZD-513: added after the floor list's dimensions are left out, so the edge dimensions stay.
  items.push(...ceilingShapeItems(objects, floor.level, rooms), ...shapeDraftItems(shapeDraft));
  items.push(...ceilingTagItems(objects, floor.level));
  return { level: floor.level, items, omitted: [] };
}

/** The floor plan's batches in one grey, ordered above the PDF underlay and under everything of the RCP. */
export function greyedBatches(floor: DrawingList | null): PlanBatch[] {
  const grey = tokenRgb(GREYED_FLOOR_TOKEN);
  return buildPlanBatches(floor).map((b) => ({
    ...b,
    key: `floor:${b.key}`,
    color: grey,
    order: UNDERLAY_RENDER_ORDER + b.order / 10,
  }));
}

export type SurfaceView = { list: DrawingList | null; batches: PlanBatch[] };

/** What the canvas draws for a ceiling surface: the RCP list (text, selection and hover read it) and the batches. */
export function rcpView(
  floor: DrawingList | null,
  objects: Objects,
  surface: Exclude<PlanSurface, 'floor'>,
  checks: RcpChecks = NO_CHECKS,
  zoneDraft: readonly Point[] = [],
  shapeDraft: readonly Point[] = [],
): SurfaceView {
  const list = rcpList(floor, objects, checks, zoneDraft, shapeDraft);
  const rcp = buildPlanBatches(list);
  return { list, batches: surface === 'both' ? [...greyedBatches(floor), ...rcp] : rcp };
}

/**
 * EZD-510 (11 Budgets): shows the RCP on the canvas and shows it again whenever the zone being drawn changes, so the
 * editor's first download holds none of this. Returns the call that stops the redraws.
 */
export function showRcp(
  plan: Pick<PlanController, 'setSurface'>,
  shown: Exclude<PlanSurface, 'floor'>,
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>,
  checks: RcpChecks,
): () => void {
  const zones = zoneDrawingFor(surface);
  // EZD-513: and again whenever the outline being drawn changes.
  const shapes = shapeDrawingFor(surface);
  const show = () =>
    plan.setSurface(shown, (floor, objects, sf) =>
      rcpView(floor, objects, sf, checks, zones.get().points, shapes.get().points),
    );
  show();
  const offZones = zones.subscribe(show);
  const offShapes = shapes.subscribe(show);
  return () => {
    offZones();
    offShapes();
  };
}

/** EZD-513 (11 Budgets): the Soffit, tray, coffer receiver over the page's outline drawing. */
export function shapeReceiver(
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>,
  deps: CeilingToolDeps,
): PlanPointerReceiver {
  return drawShapeReceiver({ ...deps, drawing: shapeDrawingFor(surface) });
}

/** EZD-510 (11 Budgets): the Switching zones receiver over the page's zone drawing, placing through this module. */
export function zoneReceiver(
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>,
  deps: Omit<ZoneToolDeps, 'drawing' | 'place'>,
): PlanPointerReceiver {
  return switchZoneReceiver({
    ...deps,
    drawing: zoneDrawingFor(surface),
    place: { roomAt, placeSwitchZone },
  });
}
