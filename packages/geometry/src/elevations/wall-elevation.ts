// EZD-707 (phase-07 EZD-707 "A4.0 interior elevations, generated for every wall that hosts a cabinet, fixture or tile
// shower, with Add elevation for any other wall ... including cabinet faces, wall tops cut under slopes ... and
// grab-bar blocking"; R24 "Interior elevations are generated for every wall that hosts a cabinet, fixture or tile
// shower; any other wall is added with Add elevation"; 09h "Line weights by role: cut heavy, beyond light, hidden
// dashed"; S04 Elevation "door and drawer faces from layout, uppers, window, countertop, toe kick"; 09e / S05 States
// "walls under a slope get their top edge cut to match in plan, elevations and 3D"; AC-EZD-707-1, -2, -3): which
// walls an elevations sheet draws, their letters, and one elevation as a drawing list (model inches, x along the
// elevation left to right, y up from the floor) for the sheet SVG (drawing/sheet-svg.ts). Pure; no DOM.
//
// An elevation is one face of a wall (left or right, walking the wall start to end): a wall with runs on both faces
// gets one elevation per face, each with only that face's runs. A face with a cabinet run is drawn in the frame of
// its first run, so it reads left to right as S04's Elevation of that run; any other face reads as a person facing
// it sees it (the left face from the wall's end to its start, the right face from start to end)
// (vault/build/assumptions/EZD-707.md).
import type { ModelObject, ObjectStatus, Point } from '../schema';
import type { DrawingItem, DrawingLayer, DrawingList, LineWeightRole } from '../drawing/types';
import { DRAWING_FONTS, ROOM_LABEL_LETTER_SPACING_EM, measureTextPt } from '../drawing/text';
import { cabinetRunLayout, type CabinetRunLayout } from '../cabinets/elevation';
import type { CabinetRun } from '../cabinets/run';
import { wallTopProfile } from '../ceiling/wall-top';
import { showerNichesAt, showerSide } from '../fixtures/tile-shower';
import { wallFaceLines, type WallObject } from '../walls/wall';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { dot, sub } from '../vec';

const tol = COMPARISON_TOLERANCE_IN;
const lower = (s: string) => s.toLowerCase();

// A fixture's back or a tile shower's side this close to a wall face is against that wall (assumptions EZD-707).
export const ELEVATION_HOST_GAP_IN = 1;
// The elevation title sits this far below the floor line, in model inches (6" on paper at 1/2" = 1'-0").
export const ELEVATION_TITLE_DROP_IN = 12;

export type ElevationSide = 'left' | 'right';
// One elevation on the sheet: one face of a wall (with every run on that face), or a run that stands on no wall (an
// island; `wallId` and `side` null).
export type ElevationSubject = {
  letter: string;
  wallId: string | null;
  side: ElevationSide | null;
  runId: string | null;
};

type Wall = WallObject;
const onLevel = (o: ModelObject, level: string) =>
  typeof (o.data as { level?: unknown }).level === 'string' &&
  lower((o.data as { level: string }).level) === lower(level);

// A, B ... Z, AA, AB ... for the 0-based place.
export function elevationLetter(i: number): string {
  let letter = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  return letter;
}

// Whether segment p-q lies along that face of the wall, within the gap, and overlaps it.
function alongFace(wall: Wall, side: ElevationSide, p: Point, q: Point): boolean {
  const f = wallFaceLines(wall.data)[side];
  const len = Math.hypot(f.end.x - f.start.x, f.end.y - f.start.y);
  if (len <= tol) return false;
  const u = { x: (f.end.x - f.start.x) / len, y: (f.end.y - f.start.y) / len };
  const off = (r: Point) => Math.abs((r.x - f.start.x) * u.y - (r.y - f.start.y) * u.x);
  if (off(p) > ELEVATION_HOST_GAP_IN || off(q) > ELEVATION_HOST_GAP_IN) return false;
  const a = dot(sub(p, f.start), u);
  const b = dot(sub(q, f.start), u);
  return Math.min(len, Math.max(a, b)) - Math.max(0, Math.min(a, b)) > tol;
}

// The edges of an object that put it against a wall: a fixture's two long sides (its back is one of them), a tile
// shower's four sides.
function hostingEdges(o: ModelObject): [Point, Point][] {
  if (o.type === 'fixture') {
    const { center: c, axis: u } = o.data.geometry;
    const { width, depth } = o.data.attributes;
    const n = { x: -u.y, y: u.x };
    return [1, -1].map((k) => {
      const m = { x: c.x + (n.x * k * depth) / 2, y: c.y + (n.y * k * depth) / 2 };
      return [
        { x: m.x - (u.x * width) / 2, y: m.y - (u.y * width) / 2 },
        { x: m.x + (u.x * width) / 2, y: m.y + (u.y * width) / 2 },
      ];
    });
  }
  if (o.type === 'tile_shower') {
    const f = o.data.geometry.footprint;
    return f.map((p, i) => [p, f[(i + 1) % f.length]!]);
  }
  return [];
}

// Whether a face of a wall hosts something other than a cabinet run that gets it an elevation: a fixture or a tile
// shower against it, a wall tile layout on it, or grab-bar blocking on its side.
export function faceHostsElevation(wall: Wall, side: ElevationSide, objects: readonly ModelObject[]): boolean {
  const key = lower(wall.id);
  return objects.some((o) => {
    if (o === wall || !onLevel(o, wall.data.level)) return false;
    if (o.type === 'tile_layout') {
      const h = o.data.geometry.host;
      return h.kind === 'wall' && lower(h.wallId) === key && h.side === side;
    }
    if (o.type === 'blocking')
      return (
        o.data.geometry.hostWallId !== null &&
        lower(o.data.geometry.hostWallId) === key &&
        o.data.attributes.side === side
      );
    return hostingEdges(o).some(([p, q]) => alongFace(wall, side, p, q));
  });
}

export function wallHostsElevation(wall: Wall, objects: readonly ModelObject[]): boolean {
  return faceHostsElevation(wall, 'left', objects) || faceHostsElevation(wall, 'right', objects);
}

// The face of a bare wall that Add elevation draws: its drawn line, the side away from its thickness.
export function defaultElevationSide(wall: Wall): ElevationSide {
  return wall.data.attributes.thicknessSide === 'left' ? 'right' : 'left';
}

// The elevations of one floor in sheet order, each with its letter: the wall faces with cabinet runs (and runs on
// no wall) in the order of their first run; then the other faces that host a fixture, tile shower, wall tile or
// blocking, in model order (left before right); then the walls added with Add elevation, in the order added, each
// by its default face. A face is drawn once; an added id that is not a wall of the floor, or a wall that already
// has an elevation, is skipped.
export function elevationSubjects(
  objects: readonly ModelObject[],
  level: string,
  added: readonly string[] = [],
): ElevationSubject[] {
  const walls = objects.filter((o): o is Wall => o.type === 'wall' && onLevel(o, level));
  const wallOf = new Map(walls.map((w) => [lower(w.id), w]));
  const out: Omit<ElevationSubject, 'letter'>[] = [];
  const seen = new Set<string>();
  const drawn = new Set<string>();
  const push = (wall: Wall, side: ElevationSide) => {
    const k = `${lower(wall.id)}|${side}`;
    if (seen.has(k)) return;
    seen.add(k);
    drawn.add(lower(wall.id));
    out.push({ wallId: wall.id, side, runId: null });
  };
  for (const o of objects) {
    if (o.type !== 'cabinet_run' || !onLevel(o, level)) continue;
    const host = o.data.geometry.hostWallId;
    const wall = host === null ? undefined : wallOf.get(lower(host));
    const face = wall === undefined ? null : cabinetRunLayout(o, objects).face;
    if (wall === undefined || face === null) {
      // A run on no wall (or on a wall since deleted) is drawn on its own.
      out.push({ wallId: null, side: null, runId: o.id });
      continue;
    }
    push(wall, face.side);
  }
  for (const w of walls)
    for (const side of ['left', 'right'] as const) if (faceHostsElevation(w, side, objects)) push(w, side);
  for (const id of added) {
    const w = wallOf.get(lower(id));
    if (w === undefined || drawn.has(lower(w.id))) continue;
    push(w, defaultElevationSide(w));
  }
  return out.map((s, i) => ({ ...s, letter: elevationLetter(i) }));
}

// The elevation's x for a distance s along the wall from its start: x = offset + along * s.
type Frame = { offset: number; along: 1 | -1 };

function layerOf(status: unknown): DrawingLayer {
  return status === 'existing' || status === 'demo' || status === 'new' ? (status as ObjectStatus) : 'new';
}

export type ElevationListOptions = {
  level: string;
  // The title's printed size (labels one size up from notes, 09h).
  titlePt: number;
};

// The elevation title, as board S10Detail titles its details: "ELEVATION A". English only (S13 Decision 7).
export function elevationTitle(letter: string): string {
  return `ELEVATION ${letter}`;
}

// One elevation as a drawing list: the wall's outline (its top cut under a sloped ceiling) in the cut pen; its doors
// and windows, the cabinets of every run on this face (boxes, door and drawer faces, countertops, toe kick) and the
// tile showers against this face (extent, curb, niches, bench) in the beyond pen; this side's grab-bar blocking
// hidden (dashed) at its centre height; the title under the floor line.
export function elevationDrawingList(
  subject: ElevationSubject,
  objects: readonly ModelObject[],
  options: ElevationListOptions,
): DrawingList {
  const items: DrawingItem[] = [];
  const byId = new Map(objects.map((o) => [lower(o.id), o]));
  const statusLayer = (id: string) => layerOf((byId.get(lower(id))?.data as { status?: unknown } | undefined)?.status);
  const line = (objectId: string, layer: DrawingLayer, role: LineWeightRole, from: Point, to: Point) =>
    items.push({ kind: 'line', layer, objectId, role, from, to });
  const rect = (objectId: string, layer: DrawingLayer, role: LineWeightRole, x0: number, y0: number, x1: number, y1: number) => {
    line(objectId, layer, role, { x: x0, y: y0 }, { x: x1, y: y0 });
    line(objectId, layer, role, { x: x1, y: y0 }, { x: x1, y: y1 });
    line(objectId, layer, role, { x: x1, y: y1 }, { x: x0, y: y1 });
    line(objectId, layer, role, { x: x0, y: y1 }, { x: x0, y: y0 });
  };
  const drawRun = (runId: string, layout: CabinetRunLayout, X: (xr: number) => number) => {
    const span = (x: number, w: number) => {
      const a = X(x);
      const b = X(x + w);
      return [Math.min(a, b), Math.max(a, b)] as const;
    };
    const firstBase = layout.base[0];
    const runLayer = firstBase === undefined ? 'new' : statusLayer(firstBase.id);
    for (const s of [...layout.base, ...layout.upper]) {
      const layer = statusLayer(s.id);
      const [x0, x1] = span(s.x, s.width);
      rect(s.id, layer, 'beyond', x0, s.bottom, x1, s.top);
      for (const f of s.faces) {
        if (f.kind === 'panel' && s.kind !== 'box') continue;
        const [f0, f1] = span(f.x, f.width);
        rect(s.id, layer, 'beyond', f0, f.y, f1, f.y + f.height);
      }
    }
    for (const c of layout.countertops) {
      const [x0, x1] = span(c.x, c.width);
      rect(runId, runLayer, 'beyond', x0, c.bottom, x1, c.top);
    }
    if (layout.toeKick !== null) {
      const [x0, x1] = span(layout.toeKick.x, layout.toeKick.width);
      line(runId, runLayer, 'beyond', { x: x0, y: layout.toeKick.height }, { x: x1, y: layout.toeKick.height });
    }
  };
  const title = (objectId: string, x: number) => {
    const text = elevationTitle(subject.letter);
    const sizePt = options.titlePt;
    const letterSpacingPt = sizePt * ROOM_LABEL_LETTER_SPACING_EM;
    items.push({
      kind: 'text',
      layer: 'rooms',
      objectId,
      text,
      font: 'instrument-sans-600',
      sizePt,
      letterSpacingPt,
      widthPt:
        measureTextPt(DRAWING_FONTS['instrument-sans-600'], text, sizePt) + letterSpacingPt * ([...text].length - 1),
      at: { x, y: -ELEVATION_TITLE_DROP_IN },
      rotationDeg: 0,
      align: 'center',
    });
  };
  const runsOn = (wallId: string) =>
    objects.filter(
      (o): o is CabinetRun =>
        o.type === 'cabinet_run' &&
        onLevel(o, options.level) &&
        o.data.geometry.hostWallId !== null &&
        lower(o.data.geometry.hostWallId) === lower(wallId),
    );

  if (subject.wallId === null) {
    const run = subject.runId === null ? undefined : byId.get(lower(subject.runId));
    if (run === undefined || run.type !== 'cabinet_run') return { level: options.level, items, omitted: [] };
    const layout = cabinetRunLayout(run, objects);
    drawRun(run.id, layout, (x) => x);
    if (items.length > 0) title(run.id, layout.total / 2);
    return { level: options.level, items, omitted: [] };
  }

  const wall = byId.get(lower(subject.wallId));
  if (wall === undefined || wall.type !== 'wall') return { level: options.level, items, omitted: [] };
  const { start, end } = wall.data.geometry;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length <= tol) return { level: options.level, items, omitted: [{ id: wall.id, reason: 'zero_length' }] };
  const dir = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  const side = subject.side ?? defaultElevationSide(wall);
  const onFace = runsOn(wall.id)
    .map((run) => ({ run, layout: cabinetRunLayout(run, objects) }))
    .filter((r) => r.layout.face !== null && r.layout.face.side === side);
  const lead = onFace[0]?.layout.face ?? null;
  // No run: as a person facing the face sees it, the left face reads from the wall's end to its start.
  const frame: Frame =
    lead !== null
      ? { offset: lead.offset, along: lead.along }
      : side === 'left'
        ? { offset: length, along: -1 }
        : { offset: 0, along: 1 };
  const X = (s: number) => frame.offset + frame.along * s;
  const wallLayer = layerOf(wall.data.status);

  // The outline: the floor line, both ends and the top, cut under a sloped ceiling (09e).
  const top: readonly (readonly [number, number])[] = wallTopProfile(wall, objects) ?? [
    [0, wall.data.attributes.height],
    [length, wall.data.attributes.height],
  ];
  line(wall.id, wallLayer, 'cut', { x: X(0), y: 0 }, { x: X(length), y: 0 });
  line(wall.id, wallLayer, 'cut', { x: X(0), y: 0 }, { x: X(0), y: top[0]![1] });
  line(wall.id, wallLayer, 'cut', { x: X(length), y: 0 }, { x: X(length), y: top[top.length - 1]![1] });
  for (let i = 0; i + 1 < top.length; i++)
    line(wall.id, wallLayer, 'cut', { x: X(top[i]![0]), y: top[i]![1] }, { x: X(top[i + 1]![0]), y: top[i + 1]![1] });

  const key = lower(wall.id);
  for (const o of objects) {
    if (o.type === 'opening') {
      if (o.data.geometry.hostWallId === null || lower(o.data.geometry.hostWallId) !== key) continue;
      const s = dot(sub(o.data.geometry.center, start), dir);
      const { width, height, sillHeight } = o.data.attributes;
      const a = X(s - width / 2);
      const b = X(s + width / 2);
      rect(o.id, layerOf(o.data.status), 'beyond', Math.min(a, b), sillHeight, Math.max(a, b), sillHeight + height);
    } else if (o.type === 'blocking') {
      if (o.data.geometry.hostWallId === null || lower(o.data.geometry.hostWallId) !== key) continue;
      const s = dot(sub(o.data.geometry.center, start), dir);
      if (o.data.attributes.side !== side) continue;
      const h = o.data.attributes.heightToCenter;
      const half = o.data.attributes.length / 2;
      line(o.id, layerOf(o.data.status), 'hidden', { x: X(s - half), y: h }, { x: X(s + half), y: h });
    }
  }

  // The top height at a distance along the wall.
  const topAt = (d: number): number => {
    for (let i = 0; i + 1 < top.length; i++) {
      const [x0, y0] = top[i]!;
      const [x1, y1] = top[i + 1]!;
      if (d <= x1 || i + 2 === top.length) return x1 - x0 <= tol ? y1 : y0 + ((y1 - y0) * (d - x0)) / (x1 - x0);
    }
    return wall.data.attributes.height;
  };
  const sOf = (p: Point) => dot(sub(p, start), dir);
  const span = (a: number, b: number) => [Math.min(X(a), X(b)), Math.max(X(a), X(b))] as const;

  // Tile showers against this face (EZD-226): each footprint side on the face gives the shower's extent (a line at
  // each end, floor to wall top), the niches on that side, the curb (in section at the end where side 0 meets this
  // side, else its top edge across the extent) and the bench (against side 3, in the corner at footprint[3]).
  for (const o of objects) {
    if (o.type !== 'tile_shower' || !onLevel(o, options.level)) continue;
    const layer = layerOf(o.data.status);
    const fp = o.data.geometry.footprint;
    const { curb, niches, bench } = o.data.attributes;
    for (let i = 0; i < 4; i++) {
      const sd = showerSide(fp, i);
      if (!alongFace(wall, side, sd.start, sd.end)) continue;
      const a = sOf(sd.start);
      const b = sOf(sd.end);
      const toEnd = b >= a ? 1 : -1;
      for (const d of [a, b])
        if (d >= -tol && d <= length + tol) line(o.id, layer, 'beyond', { x: X(d), y: 0 }, { x: X(d), y: topAt(d) });
      showerNichesAt(o.data).forEach((n, k) => {
        if (n.side !== i) return;
        const [x0, x1] = span(sOf(n.from), sOf(n.to));
        const bottom = niches[k]!.bottomHeight;
        rect(o.id, layer, 'beyond', x0, bottom, x1, bottom + niches[k]!.height);
      });
      if (curb !== null) {
        if (i === 1 || i === 3) {
          const corner = i === 1 ? a : b;
          const [x0, x1] = span(corner, corner + (i === 1 ? toEnd : -toEnd) * curb.width);
          rect(o.id, layer, 'beyond', x0, 0, x1, curb.height);
        } else {
          const [x0, x1] = span(a, b);
          line(o.id, layer, 'beyond', { x: x0, y: curb.height }, { x: x1, y: curb.height });
        }
      }
      if (bench !== null && (i === 2 || i === 3)) {
        const [x0, x1] = i === 3 ? span(a, a + toEnd * bench.width) : span(b, b - toEnd * bench.depth);
        rect(o.id, layer, 'beyond', x0, 0, x1, bench.height);
      }
    }
  }

  // Each run's x is along its own axis from its start: x = face.offset + face.along * s (cabinets/elevation.ts).
  for (const { run, layout } of onFace) {
    const face = layout.face!;
    drawRun(run.id, layout, (xr) => X((xr - face.offset) * face.along));
  }

  title(wall.id, (X(0) + X(length)) / 2);
  return { level: options.level, items, omitted: [] };
}
