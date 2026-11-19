// EZD-502 (S05 Layout "Canvas: RCP drawing"; S05 Controls "Both: RCP over a greyed floor plan"; S05 Data shown "ridge
// line and direction"; board S05Ceiling "RIDGE 13' 0""; AC-EZD-502-1): the reflected ceiling plan drawn from the open
// floor's drawing list. Reflected: the RCP keeps the floor plan's orientation, so a point draws at the same place on
// both (vault/build/assumptions.md EZD-502). The RCP keeps the walls and rooms (and their labels) and adds each
// room's ridge line; door swings, windows, fixtures, cabinets, pins and dimensions are floor items. Both draws the
// whole floor plan in one grey under the RCP. Loaded lazily on the first switch to Ceiling or Both (11 rule 7).
import {
  DRAWING_FONTS,
  formatLength,
  measureTextPt,
  type DrawingItem,
  type DrawingList,
  type Point,
} from '@ezdraft/geometry';
import type { Objects } from '../model/patches';
import { buildPlanBatches, PLAN_DIMENSION_TEXT_PT, type PlanBatch } from '../plan/batches';
import { tokenRgb } from '../plan/color';
import { UNDERLAY_RENDER_ORDER } from '../plan/scene';
import type { PlanSurface } from './surface';

/** The greyed floor plan's one colour (no spec value; vault/build/assumptions.md EZD-502). */
export const GREYED_FLOOR_TOKEN = '--ez-border';
/** The ridge line's dash pattern in model inches: long dash, gap, short dash, gap (board S05Ceiling). */
export const RIDGE_DASH_IN: readonly number[] = [12, 4, 2, 4];

const RCP_TYPES: ReadonlySet<string> = new Set(['wall', 'room']);

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

/** The RCP drawing list: the floor list's wall and room items (dimensions left out) and each shown room's ridge. */
export function rcpList(floor: DrawingList | null, objects: Objects): DrawingList | null {
  if (floor === null) return null;
  const typeOf = new Map<string, string>();
  for (const [id, v] of objects) typeOf.set(id.toLowerCase(), v.type);
  const items: DrawingItem[] = [];
  const rooms = new Set<string>();
  for (const item of floor.items) {
    const type = typeOf.get(item.objectId.toLowerCase());
    if (type === undefined || !RCP_TYPES.has(type) || item.layer === 'dimensions') continue;
    items.push(item);
    if (type === 'room') rooms.add(item.objectId.toLowerCase());
  }
  for (const [id, v] of objects) {
    if (v.type !== 'room' || !rooms.has(id.toLowerCase())) continue;
    const ridge = ridgeOf(v.data);
    if (ridge !== null) items.push(...ridgeItems(id, ridge));
  }
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
): SurfaceView {
  const list = rcpList(floor, objects);
  const rcp = buildPlanBatches(list);
  return { list, batches: surface === 'both' ? [...greyedBatches(floor), ...rcp] : rcp };
}
