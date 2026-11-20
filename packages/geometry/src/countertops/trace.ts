// EZD-412 (S04b Controls "Trace cabinets | Canvas tool bar | Creates tops automatically from cabinet runs with default
// overhangs | Disabled when no cabinets"; W5 step 1; AC-EZD-412-1 "Trace over two runs makes pieces A and B";
// vault/build/assumptions.md EZD-412): the countertop pieces Trace makes from the cabinet runs of one floor. Pure.
//
// One piece per stretch of counter-height base boxes in a run (the stretches the elevation tops, cabinetRunLayout
// `countertops`; a tall box splits a run). The outline is the top as cut (EZD-411): the cabinets' plan footprint
// grown by each edge's overhang. Its four edges, in outline order, are the back, the end at the run's far end, the
// front and the end at the run's start.
//   - Back: on a wall-hosted run it stands against the wall: kind wall, the Defaults "Against wall" overhang and a
//     backsplash. On a run off every wall (an island) it is exposed at the Standard overhang.
//   - Front: exposed at the Standard overhang.
//   - Each end: against a wall when a wall stands just past it (kind wall, Against wall overhang, backsplash); butted
//     to other cabinets when cabinets stand just past it (kind wall, no overhang, no splash: a joint, not exposed);
//     otherwise exposed at the Standard overhang. A butted end that would run into another top stops at that top's
//     edge, so two tops at an L corner meet without overlap: stretches with no butted end are topped first.
// Letters go to the new pieces in model order, after the letters already in use.
// Model y points up (the plan flips it); a hosted run's front is the side away from its host wall.
import { cabinetRunLayout } from '../cabinets/elevation';
import type { CabinetRun } from '../cabinets/run';
import { pointInRing } from '../rooms/area';
import type { CountertopEdge, CountertopPieceData, ModelObject, Point } from '../schema';
import { wallFaceLines } from '../walls/wall';
import { countertopLabelAt, nextCountertopLabels } from './outline';

// 3 cm (board S04b "Quartz · 3 cm"; EZD-411 thickness in inches).
export const COUNTERTOP_DEFAULT_THICKNESS = 3 / 2.54;
// Board S04b Material "Backsplash 4" · same"; the Material tab that edits it is EZD-416.
export const COUNTERTOP_DEFAULT_BACKSPLASH = 4;
// How far past a run's end Trace looks for a wall or other cabinets.
export const COUNTERTOP_TRACE_PROBE = 1;

export type CountertopTraceDefaults = {
  // Defaults → Countertops "Default overhang: Standard" (1 1/2") and "Against wall" (0 + splash).
  standard: number;
  againstWall: number;
  backsplashHeight?: number;
  thickness?: number;
};

const lower = (s: string) => s.toLowerCase();
const add = (a: Point, b: Point, k = 1): Point => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

const onLevel = (o: ModelObject, level: string) =>
  'level' in o.data && typeof o.data.level === 'string' && lower(o.data.level) === lower(level);

// A stretch of counter-height base boxes, in its run's own frame: u along the run axis from the run start, v from
// the wall face toward the front.
type Span = {
  run: CabinetRun;
  u0: number;
  u1: number;
  depth: number;
  front: Point;
  ids: Set<string>;
};

// The run's front: the side of its axis away from the host wall's body; for a run off every wall the axis's left
// side (the side a hosted run's front takes when its wall was drawn along the axis with its thickness to the right).
function frontOf(run: CabinetRun, objects: readonly ModelObject[]): Point {
  const { start, axis, hostWallId } = run.data.geometry;
  const left = { x: -axis.y, y: axis.x };
  if (hostWallId === null) return left;
  const host = objects.find((o) => o.type === 'wall' && lower(o.id) === lower(hostWallId));
  if (host === undefined || host.type !== 'wall') return left;
  const faces = wallFaceLines(host.data);
  const centre = {
    x: (faces.left.start.x + faces.left.end.x + faces.right.start.x + faces.right.end.x) / 4,
    y: (faces.left.start.y + faces.left.end.y + faces.right.start.y + faces.right.end.y) / 4,
  };
  return dot(sub(centre, start), left) > 0 ? { x: -left.x, y: -left.y } : left;
}

function spansOf(run: CabinetRun, objects: readonly ModelObject[]): Span[] {
  const layout = cabinetRunLayout(run, objects);
  const front = frontOf(run, objects);
  const out: Span[] = [];
  for (const c of layout.countertops) {
    const slots = layout.base.filter(
      (s) => s.boxType !== 'tall' && s.x >= c.x - 1e-9 && s.x + s.width <= c.x + c.width + 1e-9,
    );
    const depth = slots.reduce((d, s) => Math.max(d, s.depth), 0);
    if (!(c.width > 0) || !(depth > 0)) continue;
    out.push({
      run,
      u0: c.x,
      u1: c.x + c.width,
      depth,
      front,
      ids: new Set(slots.map((s) => lower(s.id))),
    });
  }
  return out;
}

const at = (s: Span, u: number, v: number): Point =>
  add(add(s.run.data.geometry.start, s.run.data.geometry.axis, u), s.front, v);

// Every base cabinet's plan footprint on the floor (tall boxes too), with the id of the member it is.
export type CabinetFootprint = { id: string; runId: string; outline: Point[] };

export function cabinetFootprints(
  objects: readonly ModelObject[],
  level: string,
): CabinetFootprint[] {
  const out: CabinetFootprint[] = [];
  for (const o of objects) {
    if (o.type !== 'cabinet_run' || !onLevel(o, level)) continue;
    const layout = cabinetRunLayout(o, objects);
    const span: Span = {
      run: o,
      u0: 0,
      u1: 0,
      depth: 0,
      front: frontOf(o, objects),
      ids: new Set(),
    };
    for (const s of layout.base) {
      out.push({
        id: s.id,
        runId: o.id,
        outline: [
          at(span, s.x, 0),
          at(span, s.x + s.width, 0),
          at(span, s.x + s.width, s.depth),
          at(span, s.x, s.depth),
        ],
      });
    }
  }
  return out;
}

const wallBodies = (objects: readonly ModelObject[], level: string): Point[][] =>
  objects.flatMap((o) => {
    if (o.type !== 'wall' || !onLevel(o, level)) return [];
    const { left, right } = wallFaceLines(o.data);
    return [[left.start, left.end, right.end, right.start]];
  });

// Trace cabinets is offered only when the floor has a stretch of counter-height base cabinets to top.
export function canTraceCountertops(objects: readonly ModelObject[], level: string): boolean {
  return objects.some(
    (o) => o.type === 'cabinet_run' && onLevel(o, level) && spansOf(o, objects).length > 0,
  );
}

// How far, from point `p` along unit `dir`, until the ray leaves polygon `ring` (p inside it); null when it never
// crosses an edge.
function exitDistance(ring: readonly Point[], p: Point, dir: Point): number | null {
  let best: number | null = null;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const e = sub(b, a);
    const den = dir.x * e.y - dir.y * e.x;
    if (Math.abs(den) < 1e-12) continue;
    const ap = sub(a, p);
    const t = (ap.x * e.y - ap.y * e.x) / den;
    const s = (ap.x * dir.y - ap.y * dir.x) / den;
    if (t > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9 && (best === null || t < best)) best = t;
  }
  return best;
}

type End = { edge: CountertopEdge; u: number };

export function traceCountertops(
  objects: readonly ModelObject[],
  level: string,
  defaults: CountertopTraceDefaults,
): CountertopPieceData[] {
  const splash = defaults.backsplashHeight ?? COUNTERTOP_DEFAULT_BACKSPLASH;
  const thickness = defaults.thickness ?? COUNTERTOP_DEFAULT_THICKNESS;
  const exposed: CountertopEdge = {
    kind: 'exposed',
    overhang: defaults.standard,
    backsplashHeight: null,
    profileId: null,
  };
  const wall: CountertopEdge = {
    kind: 'wall',
    overhang: defaults.againstWall,
    backsplashHeight: splash,
    profileId: null,
  };
  const joint: CountertopEdge = {
    kind: 'wall',
    overhang: 0,
    backsplashHeight: null,
    profileId: null,
  };

  const existing = objects.flatMap((o) =>
    o.type === 'countertop_piece' && onLevel(o, level) ? [o.data] : [],
  );
  const walls = wallBodies(objects, level);
  const footprints = cabinetFootprints(objects, level);
  const tops: Point[][] = existing.map((p) => p.geometry.outline);
  const spans = objects.flatMap((o) =>
    o.type === 'cabinet_run' && onLevel(o, level) ? spansOf(o, objects) : [],
  );
  const probeAt = (s: Span, u: number, sign: -1 | 1) =>
    at(s, u + sign * COUNTERTOP_TRACE_PROBE, s.depth / 2);
  const isWallAt = (p: Point) => walls.some((w) => pointInRing(p, w));
  const isButtedAt = (s: Span, p: Point) =>
    !isWallAt(p) && footprints.some((f) => !s.ids.has(lower(f.id)) && pointInRing(p, f.outline));
  const butts = (s: Span) =>
    isButtedAt(s, probeAt(s, s.u0, -1)) || isButtedAt(s, probeAt(s, s.u1, 1));
  // Stretches with no butted end are topped first, so a return always stops at the top it meets, whatever the order
  // of the runs in the model. Letters still follow the model order.
  const order = spans
    .map((_, i) => i)
    .sort((i, j) => Number(butts(spans[i]!)) - Number(butts(spans[j]!)));
  const byIndex: (CountertopPieceData | null)[] = spans.map(() => null);

  for (const index of order) {
    const s = spans[index]!;
    const mid = s.depth / 2;
    // A stretch already under a top is left as it is, so pressing Trace again adds only the missing tops.
    if (tops.some((t) => pointInRing(at(s, (s.u0 + s.u1) / 2, mid), t))) continue;

    // `sign` is -1 at the run's start end, +1 at its far end.
    const endOf = (u: number, sign: -1 | 1): End => {
      const probe = probeAt(s, u, sign);
      if (isWallAt(probe)) return { edge: wall, u: u + sign * wall.overhang };
      if (!isButtedAt(s, probe)) return { edge: exposed, u: u + sign * exposed.overhang };
      // Stop at the edge of a top already made over the cabinets it butts.
      const p = at(s, u, mid);
      const inward = {
        x: -sign * s.run.data.geometry.axis.x,
        y: -sign * s.run.data.geometry.axis.y,
      };
      for (const t of tops) {
        if (!pointInRing(p, t)) continue;
        const d = exitDistance(t, p, inward);
        if (d !== null && d < s.u1 - s.u0) return { edge: joint, u: u - sign * d };
      }
      return { edge: joint, u };
    };

    const hosted = s.run.data.geometry.hostWallId !== null;
    const back = hosted ? wall : exposed;
    const start = endOf(s.u0, -1);
    const end = endOf(s.u1, 1);
    const vb = -back.overhang;
    const vf = s.depth + exposed.overhang;
    const outline = [at(s, start.u, vb), at(s, end.u, vb), at(s, end.u, vf), at(s, start.u, vf)];
    const piece: CountertopPieceData = {
      geometry: { outline },
      status: 'new',
      level: s.run.data.level,
      attributes: {
        label: '',
        name: s.run.data.attributes.name,
        materialItemId: null,
        thickness,
        edges: [{ ...back }, { ...end.edge }, { ...exposed }, { ...start.edge }],
      },
    };
    byIndex[index] = piece;
    tops.push(outline);
  }
  const made = byIndex.filter((p): p is CountertopPieceData => p !== null);
  const labels = nextCountertopLabels(
    existing.map((p) => p.attributes.label),
    made.length,
  );
  return made.map((p, i) => ({
    ...p,
    attributes: { ...p.attributes, label: labels[i] ?? countertopLabelAt(existing.length + i) },
  }));
}
