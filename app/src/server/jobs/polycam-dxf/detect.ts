// EZD-302 (08 Imports "Polycam Space scan: Walls, openings, rooms detected by layer → Import review", "About 0.5"
// tolerance"; S02 Data shown "type, label, status, confidence %"; Validation "Confidence below the high-confidence
// cutoff goes to To check"): turns a layered DXF floor plan into detected walls, openings and rooms, each with a
// confidence from 0 to 100. Pure: no database, no Storage. Model inches, x east, y north (03 rule 5).
//
// Walls: collinear wall-layer lines are merged into runs (across a gap no wider than the tolerance, or one that a
// door or window spans), parallel runs 1 to 12 in apart are paired into the two faces of one wall, and the face
// nearer the drawing's middle is the inside face (EZD-202 Wall line: start to end is the inside finished face,
// thickness on the right). A wall end is joined when it reaches the corner point it shares with another wall
// (within the tolerance) or touches another wall. Confidence: 95 for a paired wall, 60 for a single line, 25 less
// for each unjoined end. Openings: a door is a door-layer arc (hinge at the centre, width the radius); a window is
// a group of parallel window-layer lines. Confidence 90 (door with its leaf, window of two or more lines), 75
// otherwise, 20 less without a host wall. Rooms: room-layer polylines; 90 closed, 60 open. These numbers are
// EZD-302's own (vault/build/assumptions.md EZD-302); the high-confidence cutoff is a company setting (EZD-308).
import type { DxfArc, DxfDrawing, DxfLine, Pt } from './read-dxf';

export type LayerRole = 'walls' | 'doors' | 'windows' | 'rooms';
export type LayerMap = Record<LayerRole, string[]>;
export type Side = 'north' | 'east' | 'south' | 'west';

export type DetectedWall = {
  id: string;
  type: 'wall';
  number: number;
  side: Side;
  confidence: number;
  geometry: { start: Pt; end: Pt };
  thickness: number | null;
  thicknessSide: 'right';
  joinedEnds: 0 | 1 | 2;
  layer: string;
};

export type DetectedOpening = {
  id: string;
  type: 'opening';
  kind: 'door' | 'window';
  number: number;
  confidence: number;
  hostWallId: string | null;
  // Distance along the host wall from its start to the opening's nearer edge; null without a host.
  offset: number | null;
  width: number;
  center: Pt;
  hinge: Pt | null;
  layer: string;
};

export type DetectedRoom = {
  id: string;
  type: 'room';
  number: number;
  confidence: number;
  boundary: Pt[];
  closed: boolean;
  areaSqIn: number;
  layer: string;
};

export type DetectedItem = DetectedWall | DetectedOpening | DetectedRoom;

export type Detection = {
  walls: DetectedWall[];
  openings: DetectedOpening[];
  rooms: DetectedRoom[];
  layers: LayerMap;
};

// 08 Imports "About 0.5" tolerance"; S02 mockup 1/2". The company Defaults tolerance replaces it once built.
export const DEFAULT_TOLERANCE_IN = 0.5;
export const MIN_WALL_THICKNESS_IN = 1;
export const MAX_WALL_THICKNESS_IN = 12;

const PARALLEL_SIN = 0.01; // about 0.6°

const KEYWORDS: Record<LayerRole, RegExp> = {
  walls: /wall/i,
  doors: /door/i,
  windows: /window/i,
  rooms: /room|space|floor/i,
};

// Polycam's real layer names are not known yet (fixtures/README.md); a layer takes the role its name contains.
export function layerMapFromNames(layers: readonly string[]): LayerMap {
  const map: LayerMap = { walls: [], doors: [], windows: [], rooms: [] };
  for (const name of layers) {
    for (const role of ['walls', 'doors', 'windows', 'rooms'] as const) {
      if (KEYWORDS[role].test(name)) {
        map[role].push(name);
        break;
      }
    }
  }
  return map;
}

// ---------- vector helpers ----------
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
const len = (a: Pt) => Math.hypot(a.x, a.y);
const dist = (a: Pt, b: Pt) => len(sub(a, b));
const unit = (a: Pt): Pt => mul(a, 1 / len(a));

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, mul(ab, t)));
}

function lineIntersection(p: Pt, d: Pt, q: Pt, e: Pt): Pt | null {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(q, p), e) / den;
  return add(p, mul(d, t));
}

// A direction with x > 0, or x = 0 and y > 0, so collinear lines share one.
function canonical(d: Pt): Pt {
  const u = unit(d);
  return u.x < -1e-12 || (Math.abs(u.x) <= 1e-12 && u.y < 0) ? mul(u, -1) : u;
}

// ---------- runs ----------
type Run = { dir: Pt; normal: Pt; offset: number; t0: number; t1: number; layer: string };

const runPoint = (r: Run, t: number): Pt => add(mul(r.dir, t), mul(r.normal, r.offset));
const runStart = (r: Run) => runPoint(r, r.t0);
const runEnd = (r: Run) => runPoint(r, r.t1);
const runLength = (r: Run) => r.t1 - r.t0;

type Span = { a: Pt; b: Pt };

function spanCoversGap(span: Span, run: Run, g0: number, g1: number, tol: number): boolean {
  const d = sub(span.b, span.a);
  if (len(d) === 0 || Math.abs(cross(unit(d), run.dir)) > PARALLEL_SIN) return false;
  const mid = mul(add(span.a, span.b), 0.5);
  if (Math.abs(dot(mid, run.normal) - run.offset) > MAX_WALL_THICKNESS_IN + tol) return false;
  const s0 = Math.min(dot(span.a, run.dir), dot(span.b, run.dir));
  const s1 = Math.max(dot(span.a, run.dir), dot(span.b, run.dir));
  return s0 <= g0 + tol && s1 >= g1 - tol;
}

function buildRuns(lines: DxfLine[], spans: Span[], tol: number): Run[] {
  type Piece = { dir: Pt; normal: Pt; offset: number; t0: number; t1: number; layer: string };
  const pieces: Piece[] = [];
  for (const l of lines) {
    const d = sub(l.b, l.a);
    if (len(d) <= tol) continue;
    const dir = canonical(d);
    const normal = { x: -dir.y, y: dir.x };
    const ta = dot(l.a, dir);
    const tb = dot(l.b, dir);
    pieces.push({
      dir,
      normal,
      offset: dot(l.a, normal),
      t0: Math.min(ta, tb),
      t1: Math.max(ta, tb),
      layer: l.layer,
    });
  }
  // Collinear classes: same direction within PARALLEL_SIN and offset within the tolerance.
  const classes: Piece[][] = [];
  for (const p of pieces) {
    const home = classes.find(
      (c) =>
        Math.abs(cross(c[0].dir, p.dir)) <= PARALLEL_SIN && Math.abs(c[0].offset - p.offset) <= tol,
    );
    if (home) home.push(p);
    else classes.push([p]);
  }
  const runs: Run[] = [];
  for (const c of classes) {
    const { dir, normal } = c[0];
    const offset = c.reduce((s, p) => s + p.offset, 0) / c.length;
    const sorted = [...c].sort((p, q) => p.t0 - q.t0);
    let cur: Run = {
      dir,
      normal,
      offset,
      t0: sorted[0].t0,
      t1: sorted[0].t1,
      layer: sorted[0].layer,
    };
    for (const p of sorted.slice(1)) {
      const gap = p.t0 - cur.t1;
      if (gap <= tol || spans.some((s) => spanCoversGap(s, cur, cur.t1, p.t0, tol))) {
        cur.t1 = Math.max(cur.t1, p.t1);
      } else {
        runs.push(cur);
        cur = { dir, normal, offset, t0: p.t0, t1: p.t1, layer: p.layer };
      }
    }
    runs.push(cur);
  }
  return runs;
}

// ---------- openings ----------
type RawOpening = {
  kind: 'door' | 'window';
  span: Span;
  hinge: Pt | null;
  strong: boolean;
  layer: string;
};

function arcEnd(arc: DxfArc, deg: number): Pt {
  const r = (deg * Math.PI) / 180;
  return add(arc.center, { x: arc.radius * Math.cos(r), y: arc.radius * Math.sin(r) });
}

function findDoors(arcs: DxfArc[], lines: DxfLine[], tol: number): RawOpening[] {
  return arcs.map((arc) => {
    const e1 = arcEnd(arc, arc.startDeg);
    const e2 = arcEnd(arc, arc.endDeg);
    const leafTo = (end: Pt) =>
      lines.some(
        (l) =>
          (dist(l.a, arc.center) <= tol && dist(l.b, end) <= tol) ||
          (dist(l.b, arc.center) <= tol && dist(l.a, end) <= tol),
      );
    // The leaf is drawn open; the closed position is the arc's other end.
    const leafAtE2 = leafTo(e2);
    const leafAtE1 = !leafAtE2 && leafTo(e1);
    const closed = leafAtE2 ? e1 : leafAtE1 ? e2 : e2;
    return {
      kind: 'door' as const,
      span: { a: arc.center, b: closed },
      hinge: arc.center,
      strong: leafAtE1 || leafAtE2,
      layer: arc.layer,
    };
  });
}

function findWindows(lines: DxfLine[], tol: number): RawOpening[] {
  const groups: DxfLine[][] = [];
  for (const l of lines) {
    const d = sub(l.b, l.a);
    if (len(d) <= tol) continue;
    const u = unit(d);
    const home = groups.find((g) => {
      const g0 = g[0];
      const gd = unit(sub(g0.b, g0.a));
      if (Math.abs(cross(gd, u)) > PARALLEL_SIN) return false;
      const n = { x: -gd.y, y: gd.x };
      if (Math.abs(dot(sub(l.a, g0.a), n)) > MAX_WALL_THICKNESS_IN + tol) return false;
      const s = [dot(g0.a, gd), dot(g0.b, gd)].sort((p, q) => p - q);
      const t = [dot(l.a, gd), dot(l.b, gd)].sort((p, q) => p - q);
      return Math.abs(s[0] - t[0]) <= tol && Math.abs(s[1] - t[1]) <= tol;
    });
    if (home) home.push(l);
    else groups.push([l]);
  }
  return groups.map((g) => ({
    kind: 'window' as const,
    span: { a: g[0].a, b: g[0].b },
    hinge: null,
    strong: g.length >= 2,
    layer: g[0].layer,
  }));
}

// ---------- walls ----------
type WallFaces = { inside: Run; outside: Run | null; thickness: number | null };

function pairRuns(runs: Run[]): WallFaces[] {
  type Cand = { i: number; j: number; d: number };
  const cands: Cand[] = [];
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i];
      const b = runs[j];
      if (Math.abs(cross(a.dir, b.dir)) > PARALLEL_SIN) continue;
      const sameWay = dot(a.dir, b.dir) > 0;
      const bOffset = sameWay ? b.offset : -b.offset;
      const d = Math.abs(a.offset - bOffset);
      if (d < MIN_WALL_THICKNESS_IN || d > MAX_WALL_THICKNESS_IN) continue;
      const overlap = Math.min(a.t1, b.t1) - Math.max(a.t0, b.t0);
      if (overlap < 0.5 * Math.min(runLength(a), runLength(b))) continue;
      cands.push({ i, j, d });
    }
  }
  cands.sort((p, q) => p.d - q.d);
  const used = new Set<number>();
  const out: WallFaces[] = [];
  for (const c of cands) {
    if (used.has(c.i) || used.has(c.j)) continue;
    used.add(c.i);
    used.add(c.j);
    out.push({ inside: runs[c.i], outside: runs[c.j], thickness: c.d });
  }
  // A short unpaired run with both ends on the two faces of one wall is a jamb or an end cap, not a wall.
  const onRun = (p: Pt, r: Run, tol: number) => distToSegment(p, runStart(r), runEnd(r)) <= tol;
  runs.forEach((r, k) => {
    if (used.has(k)) return;
    const s = runStart(r);
    const e = runEnd(r);
    const cap = out.some(
      (w) =>
        w.outside !== null &&
        ((onRun(s, w.inside, 0.05) && onRun(e, w.outside, 0.05)) ||
          (onRun(e, w.inside, 0.05) && onRun(s, w.outside, 0.05))),
    );
    if (!cap) out.push({ inside: r, outside: null, thickness: null });
  });
  return out;
}

function sideOf(outward: Pt): Side {
  if (Math.abs(outward.x) >= Math.abs(outward.y)) return outward.x >= 0 ? 'east' : 'west';
  return outward.y >= 0 ? 'north' : 'south';
}

function polygonArea(points: Pt[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) s += cross(points[i], points[(i + 1) % points.length]);
  return Math.abs(s) / 2;
}

function centroidOf(points: Pt[]): Pt {
  const s = points.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
  return mul(s, 1 / points.length);
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export type DetectOptions = { toleranceIn?: number; layerMap?: LayerMap };

export function detectPolycamDxf(drawing: DxfDrawing, options: DetectOptions = {}): Detection {
  const tol = options.toleranceIn ?? DEFAULT_TOLERANCE_IN;
  const layers = options.layerMap ?? layerMapFromNames(drawing.layers);
  const on = (role: LayerRole) => (layer: string) => layers[role].includes(layer);

  const polyEdges = (role: LayerRole): DxfLine[] =>
    drawing.polylines
      .filter((p) => on(role)(p.layer))
      .flatMap((p) => {
        const edges: DxfLine[] = [];
        const n = p.points.length;
        for (let i = 0; i < n - 1; i++)
          edges.push({ layer: p.layer, a: p.points[i], b: p.points[i + 1] });
        if (p.closed && n > 2) edges.push({ layer: p.layer, a: p.points[n - 1], b: p.points[0] });
        return edges;
      });

  const wallLines = [...drawing.lines.filter((l) => on('walls')(l.layer)), ...polyEdges('walls')];
  const doorLines = drawing.lines.filter((l) => on('doors')(l.layer));
  const windowLines = [
    ...drawing.lines.filter((l) => on('windows')(l.layer)),
    ...polyEdges('windows'),
  ];

  const rawOpenings = [
    ...findDoors(
      drawing.arcs.filter((a) => on('doors')(a.layer)),
      doorLines,
      tol,
    ),
    ...findWindows(windowLines, tol),
  ];

  // Rooms first: their middle tells the inside face from the outside one.
  const roomPolys = drawing.polylines.filter((p) => on('rooms')(p.layer));
  const roomPoints = roomPolys.map((p) => {
    const pts =
      p.points.length > 2 && dist(p.points[0], p.points[p.points.length - 1]) <= tol
        ? p.points.slice(0, -1)
        : p.points;
    return { poly: p, pts, closed: p.closed || pts.length !== p.points.length };
  });

  const runs = buildRuns(
    wallLines,
    rawOpenings.map((o) => o.span),
    tol,
  );
  const faces = pairRuns(runs);
  const middle =
    roomPoints.length > 0
      ? centroidOf(roomPoints.flatMap((r) => r.pts))
      : centroidOf(runs.flatMap((r) => [runStart(r), runEnd(r)]));

  type Draft = {
    start: Pt;
    end: Pt;
    thickness: number | null;
    outward: Pt;
    layer: string;
    outside: Run | null;
  };
  const drafts: Draft[] = faces.map((f) => {
    let inside = f.inside;
    let outside = f.outside;
    if (outside) {
      const dIn = Math.abs(dot(middle, inside.normal) - inside.offset);
      const dOut = Math.abs(dot(middle, outside.normal) - outside.offset);
      if (dOut < dIn) [inside, outside] = [outside, inside];
    }
    let start = runStart(inside);
    let end = runEnd(inside);
    const dir = unit(sub(end, start));
    const right = { x: dir.y, y: -dir.x };
    const away = outside
      ? sub(mul(add(runStart(outside), runEnd(outside)), 0.5), start)
      : sub(start, middle);
    if (dot(away, right) < 0) [start, end] = [end, start];
    const d2 = unit(sub(end, start));
    return {
      start,
      end,
      thickness: f.thickness,
      outward: { x: d2.y, y: -d2.x },
      layer: inside.layer,
      outside,
    };
  });

  // Longest first, so numbers follow size; ties by position for a stable order.
  const order = drafts
    .map((d, i) => ({ d, i }))
    .sort(
      (p, q) =>
        dist(q.d.start, q.d.end) - dist(p.d.start, p.d.end) ||
        p.d.start.y - q.d.start.y ||
        p.d.start.x - q.d.start.x,
    );

  const joined = (k: number, p: Pt): boolean => {
    const me = drafts[k];
    const myDir = unit(sub(me.end, me.start));
    return drafts.some((o, j) => {
      if (j === k) return false;
      if (distToSegment(p, o.start, o.end) <= tol) return true;
      if (o.outside && distToSegment(p, runStart(o.outside), runEnd(o.outside)) <= tol) return true;
      const oDir = unit(sub(o.end, o.start));
      if (Math.abs(cross(myDir, oDir)) <= PARALLEL_SIN) return false;
      const corner = lineIntersection(me.start, myDir, o.start, oDir);
      return (
        corner !== null &&
        dist(p, corner) <= tol &&
        distToSegment(corner, o.start, o.end) <= (o.thickness ?? 0) + MAX_WALL_THICKNESS_IN
      );
    });
  };

  const walls: DetectedWall[] = order.map(({ d, i }, n) => {
    const ends = (joined(i, d.start) ? 1 : 0) + (joined(i, d.end) ? 1 : 0);
    const base = d.thickness === null ? 60 : 95;
    return {
      id: `wall-${n + 1}`,
      type: 'wall',
      number: n + 1,
      side: sideOf(d.outward),
      confidence: clamp(base - 25 * (2 - ends)),
      geometry: { start: d.start, end: d.end },
      thickness: d.thickness,
      thicknessSide: 'right',
      joinedEnds: ends as 0 | 1 | 2,
      layer: d.layer,
    };
  });

  const counters = { door: 0, window: 0 };
  const openings: DetectedOpening[] = rawOpenings.map((o, k) => {
    const width = dist(o.span.a, o.span.b);
    const mid = mul(add(o.span.a, o.span.b), 0.5);
    const u = width > 0 ? unit(sub(o.span.b, o.span.a)) : { x: 1, y: 0 };
    let host: { wall: DetectedWall; along: number; perp: number } | null = null;
    for (const w of walls) {
      const wd = sub(w.geometry.end, w.geometry.start);
      const wl = len(wd);
      const wu = unit(wd);
      if (Math.abs(cross(wu, u)) > PARALLEL_SIN) continue;
      const perp = Math.abs(cross(wu, sub(mid, w.geometry.start)));
      if (perp > (w.thickness ?? 0) + tol) continue;
      const pa = dot(sub(o.span.a, w.geometry.start), wu);
      const pb = dot(sub(o.span.b, w.geometry.start), wu);
      const lo = Math.min(pa, pb);
      const hi = Math.max(pa, pb);
      if (lo < -tol || hi > wl + tol) continue;
      if (!host || perp < host.perp) host = { wall: w, along: lo, perp };
    }
    counters[o.kind] += 1;
    const center = host
      ? add(
          host.wall.geometry.start,
          mul(unit(sub(host.wall.geometry.end, host.wall.geometry.start)), host.along + width / 2),
        )
      : mid;
    return {
      id: `opening-${k + 1}`,
      type: 'opening',
      kind: o.kind,
      number: counters[o.kind],
      confidence: clamp((o.strong ? 90 : 75) - (host ? 0 : 20)),
      hostWallId: host ? host.wall.id : null,
      offset: host ? host.along : null,
      width,
      center,
      hinge: o.hinge,
      layer: o.layer,
    };
  });

  const rooms: DetectedRoom[] = roomPoints
    .filter((r) => r.pts.length >= 3)
    .map((r, k) => ({
      id: `room-${k + 1}`,
      type: 'room',
      number: k + 1,
      confidence: r.closed ? 90 : 60,
      boundary: r.pts,
      closed: r.closed,
      areaSqIn: polygonArea(r.pts),
      layer: r.poly.layer,
    }));

  return { walls, openings, rooms, layers };
}
