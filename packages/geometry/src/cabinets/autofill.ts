// EZD-408 (S04 Controls "Auto-fill run | Canvas header | Fills the selected wall run with real boxes in 3" increments
// plus fillers at walls and appliances; shows result for confirmation"; W4 step 1; 09f Cabinet rules "Auto-fill uses
// 3" increments plus fillers at walls and appliances"; phase-04 EZD-408 "fill from the left with the widest box of the
// active line that fits; keep placed appliances, sink bases and openings; put the remainder into fillers at the wall
// ends"; AC-EZD-408-1; vault/build/assumptions.md EZD-408): what Auto-fill puts in a run's base row. Pure: the screen
// turns the result into model changes and shows it for confirmation.
//
// The fill covers one free stretch of the host wall: the wall's extent along the run, cut by openings that reach
// below the countertop (doors, low windows) and by floor-standing appliances placed against the run's face. Sink
// bases and appliance panels already in the base row inside that stretch are kept where they stand. Each part of the
// stretch between them is filled from the left with the widest box that fits; a filler of the line's filler width is
// kept at each wall end. What is left goes into the fillers: beside a kept box exactly, and at the far wall end in
// whole increments, the part under one increment being that filler's scribe allowance (the gap the fit chip, EZD-407,
// checks against the scribe).
import type { ModelObject, Point } from '../schema';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { CABINET_COUNTERTOP_THICKNESS, cabinetRunLayout } from './elevation';
import type { CabinetRun } from './run';

// The seeded generic line (EZD-401, R23): base boxes B9 to B36, base-row boxes 24" deep and 34 1/2" high, filler F3.
export const CABINET_AUTOFILL_MIN_BOX = 9;
export const CABINET_AUTOFILL_MAX_BOX = 36;
export const CABINET_AUTOFILL_FILLER = 3;
export const CABINET_BASE_DEPTH = 24;
export const CABINET_BASE_HEIGHT = 34.5;

// Floor-standing appliances that take a place in the base row (03f Fixtures and appliances).
export const CABINET_AUTOFILL_APPLIANCES = [
  'range',
  'refrigerator',
  'dishwasher',
  'washer',
  'dryer',
  'water_heater',
] as const;

const TOL = COMPARISON_TOLERANCE_IN;
const EPS = 1e-9;
const lower = (s: string) => s.toLowerCase();
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const inchText = (n: number) => String(Math.round(n * 1000) / 1000);

export type CabinetFillLine = {
  // The Defaults auto-fill increment (S15d, `cabinet_autofill_increment`, 3").
  increment: number;
  minBox: number;
  maxBox: number;
  filler: number;
};

export const cabinetFillLine = (increment: number): CabinetFillLine => ({
  increment: increment > 0 ? increment : 3,
  minBox: CABINET_AUTOFILL_MIN_BOX,
  maxBox: CABINET_AUTOFILL_MAX_BOX,
  filler: CABINET_AUTOFILL_FILLER,
});

export type CabinetFillSlot =
  | { kind: 'keep'; id: string; width: number }
  | { kind: 'box'; code: string; width: number }
  | { kind: 'filler'; code: string; width: number; scribe: number };

// The line's box widths, widest first: whole increments from the smallest box to the largest.
export function cabinetFillBoxWidths(line: CabinetFillLine): number[] {
  const out: number[] = [];
  const lo = Math.ceil(line.minBox / line.increment - EPS);
  const hi = Math.floor(line.maxBox / line.increment + EPS);
  for (let k = hi; k >= lo; k--) out.push(k * line.increment);
  return out;
}

// From the left, the widest box that fits in what is left of `length`, until none fits.
export function cabinetFillWidths(length: number, line: CabinetFillLine): number[] {
  const widths = cabinetFillBoxWidths(line);
  const out: number[] = [];
  let left = length;
  for (;;) {
    const w = widths.find((x) => x <= left + TOL);
    if (w === undefined) break;
    out.push(w);
    left -= w;
  }
  return out;
}

const boxSlot = (width: number): CabinetFillSlot => ({
  kind: 'box',
  code: `B${inchText(width)}`,
  width,
});
const fillerSlot = (width: number, scribe = 0): CabinetFillSlot => ({
  kind: 'filler',
  code: `F${inchText(width)}`,
  width,
  scribe,
});

type End = 'wall' | 'kept';

// One part of the stretch, `length` long, between two ends.
function fillPart(length: number, left: End, right: End, line: CabinetFillLine): CabinetFillSlot[] {
  if (length <= TOL) return [];
  const reserve = (left === 'wall' ? line.filler : 0) + (right === 'wall' ? line.filler : 0);
  if (length < reserve - TOL) {
    // Too short for the wall fillers: one filler; at a wall end what is past whole increments is its scribe.
    if (right === 'wall' || left === 'wall') {
      const w = Math.floor(length / line.increment + EPS) * line.increment;
      return w > TOL ? [fillerSlot(w, length - w)] : [fillerSlot(length)];
    }
    return [fillerSlot(length)];
  }
  const boxes = cabinetFillWidths(length - reserve, line);
  const rest = length - boxes.reduce((s, w) => s + w, 0);
  const out: CabinetFillSlot[] = [];
  if (left === 'wall') out.push(fillerSlot(line.filler));
  out.push(...boxes.map(boxSlot));
  const after = left === 'wall' ? rest - line.filler : rest;
  if (right === 'wall') {
    // Whole increments widen the end filler; the part under one increment is its scribe allowance.
    const extra = Math.floor((after - line.filler) / line.increment + EPS) * line.increment;
    const w = line.filler + Math.max(0, extra);
    out.push(fillerSlot(w, Math.max(0, after - w)));
  } else if (after > TOL) {
    // Beside a kept box: the filler takes the rest exactly, so the kept box stays where it stands.
    out.push(fillerSlot(after));
  }
  return out;
}

export type CabinetKept = { id: string; x: number; width: number };

// The base row for the stretch [from, to] (inches along the run), with the kept boxes at their x.
export function cabinetFillStretch(
  from: number,
  to: number,
  kept: readonly CabinetKept[],
  line: CabinetFillLine,
): CabinetFillSlot[] {
  const out: CabinetFillSlot[] = [];
  let at = from;
  let left: End = 'wall';
  for (const k of kept) {
    out.push(...fillPart(k.x - at, left, 'kept', line));
    out.push({ kind: 'keep', id: k.id, width: k.width });
    at = k.x + k.width;
    left = 'kept';
  }
  out.push(...fillPart(to - at, left, 'wall', line));
  return out;
}

export type CabinetAutoFill = {
  // The stretch filled, in inches along the run from its current start.
  from: number;
  to: number;
  slots: CabinetFillSlot[];
  total: number;
  scribe: number;
  // Base-row members that are replaced (removed): every one not kept.
  replaced: string[];
  // The run start after the fill: the stretch's start.
  start: Point;
};

type Span = { from: number; to: number };

// Floor-standing appliances and openings that reach below the countertop, as spans along the run.
function obstacles(run: CabinetRun, objects: readonly ModelObject[], wallSide: 1 | -1): Span[] {
  const { start, axis, hostWallId } = run.data.geometry;
  if (hostWallId === null) return [];
  const host = objects.find((o) => o.type === 'wall' && lower(o.id) === lower(hostWallId));
  if (host === undefined || host.type !== 'wall') return [];
  const spans: Span[] = [];
  const counterTop = CABINET_BASE_HEIGHT + CABINET_COUNTERTOP_THICKNESS;
  // Across the run: positive is the side the boxes stand on (away from the wall).
  const normal = { x: -axis.y * wallSide, y: axis.x * wallSide };
  const reach = host.data.attributes.thickness + CABINET_BASE_DEPTH;
  for (const o of objects) {
    if (o.type === 'opening') {
      const g = o.data.geometry;
      if (g.hostWallId === null || lower(g.hostWallId) !== lower(host.id)) continue;
      if (o.data.attributes.sillHeight >= counterTop - TOL) continue;
      const at = dot(sub(g.center, start), axis);
      const w = o.data.attributes.width;
      spans.push({ from: at - w / 2, to: at + w / 2 });
    } else if (o.type === 'fixture') {
      if (lower(o.data.level) !== lower(run.data.level)) continue;
      if (!(CABINET_AUTOFILL_APPLIANCES as readonly string[]).includes(o.data.attributes.kind))
        continue;
      const rel = sub(o.data.geometry.center, start);
      const across = dot(rel, normal);
      if (across <= TOL || across > reach + TOL) continue;
      const at = dot(rel, axis);
      const w = o.data.attributes.width;
      spans.push({ from: at - w / 2, to: at + w / 2 });
    }
  }
  return spans;
}

// The wall's free stretches between obstacles, left to right.
function freeStretches(wall: Span, cuts: readonly Span[]): Span[] {
  const sorted = [...cuts].sort((a, b) => a.from - b.from);
  const out: Span[] = [];
  let at = wall.from;
  for (const c of sorted) {
    if (c.to <= at + TOL) continue;
    if (c.from >= wall.to - TOL) break;
    if (c.from > at + TOL) out.push({ from: at, to: Math.min(c.from, wall.to) });
    at = Math.max(at, c.to);
  }
  if (wall.to > at + TOL) out.push({ from: at, to: wall.to });
  return out;
}

// What Auto-fill makes of the run's base row; null for a run off every wall or with no free stretch.
export function cabinetAutoFill(
  run: CabinetRun,
  objects: readonly ModelObject[],
  increment: number,
): CabinetAutoFill | null {
  const layout = cabinetRunLayout(run, objects);
  const { wall, face } = layout;
  if (wall === null || face === null) return null;
  // The boxes stand on the face side of the wall: the left normal of the wall direction for side "left".
  const sideSign = face.side === 'left' ? 1 : -1;
  const wallSide: 1 | -1 = sideSign * face.along > 0 ? 1 : -1;
  const stretches = freeStretches(wall, obstacles(run, objects, wallSide));
  if (stretches.length === 0) return null;
  // The stretch the run stands in: most overlap with the base row, else the one at the run start, else the longest.
  const extent = { from: 0, to: layout.total };
  const overlap = (s: Span) => Math.min(s.to, extent.to) - Math.max(s.from, extent.from);
  let stretch = stretches[0]!;
  if (layout.total > TOL) {
    for (const s of stretches) if (overlap(s) > overlap(stretch) + TOL) stretch = s;
  }
  if (layout.total <= TOL || overlap(stretch) <= TOL) {
    const at = stretches.find((s) => s.from <= TOL && s.to > TOL);
    stretch =
      at ??
      stretches.reduce((best, s) => (s.to - s.from > best.to - best.from + TOL ? s : best));
  }

  const keepTypes = ['sink_base', 'appliance_panel'];
  const kept: CabinetKept[] = [];
  const replaced: string[] = [];
  for (const s of layout.base) {
    const keep =
      s.kind === 'box' &&
      s.boxType !== null &&
      keepTypes.includes(s.boxType) &&
      s.x >= stretch.from - TOL &&
      s.x + s.width <= stretch.to + TOL;
    if (keep) kept.push({ id: s.id, x: s.x, width: s.width });
    else replaced.push(s.id);
  }
  const slots = cabinetFillStretch(stretch.from, stretch.to, kept, cabinetFillLine(increment));
  const { start, axis } = run.data.geometry;
  return {
    from: stretch.from,
    to: stretch.to,
    slots,
    total: slots.reduce((t, s) => t + s.width, 0),
    scribe: slots.reduce((t, s) => t + (s.kind === 'filler' ? s.scribe : 0), 0),
    replaced,
    start: { x: start.x + axis.x * stretch.from, y: start.y + axis.y * stretch.from },
  };
}
