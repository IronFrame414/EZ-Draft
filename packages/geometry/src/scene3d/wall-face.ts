// EZD-1001a (phase-10.md EZD-1001a "walls with openings made by extruding the wall face with holes, following the
// EZD-030 spike"; 11 Performance rule 6; vault/spikes/EZD-030.md Decision): a wall's 2D face with its openings, and
// where that face sits in the model. Pure; the lazy 3D scene extrudes the face through the wall's thickness.
//
// Face frame: x along the wall from its start (0..length), y up from the floor (0..height). Inches.
// A door (an opening on the floor) is a notch in the outline and a raised opening is a hole (EZD-030: a hole that
// touches the outer contour triangulates badly). When straight extrusion of one outline cannot express the face
// (openings that overlap, reach a wall end or the wall top; Q-0630 lets a door be taller than its wall), the face
// is split into solid rectangles instead (the 2D route EZD-030 names before CSG), still extruded, with no CSG.
import type { OpeningData } from '../schema/opening';
import type { Point } from '../schema/common';
import type { WallData } from '../schema/wall';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { wallFaceOffsets } from '../walls/wall';

export type FaceOpening = { offset: number; width: number; sill: number; height: number };
export type FacePoint = readonly [number, number];
export type FaceRect = { x0: number; y0: number; x1: number; y1: number };
export type WallFace =
  | { kind: 'outline'; outer: FacePoint[]; holes: FacePoint[][] }
  | { kind: 'rects'; rects: FaceRect[] };

const TOL = COMPARISON_TOLERANCE_IN;

// Each opening clipped to the face; an opening left with no width or height cuts nothing.
function clipped(length: number, height: number, openings: readonly FaceOpening[]): FaceRect[] {
  const out: FaceRect[] = [];
  for (const o of openings) {
    const x0 = Math.max(0, o.offset);
    const x1 = Math.min(length, o.offset + o.width);
    const y0 = Math.max(0, o.sill);
    const y1 = Math.min(height, o.sill + o.height);
    if (x1 - x0 > TOL && y1 - y0 > TOL) out.push({ x0, y0, x1, y1 });
  }
  return out.sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0);
}

// Two openings closer than the tolerance (or overlapping) in both directions.
const touching = (a: FaceRect, b: FaceRect) =>
  a.x0 < b.x1 + TOL && b.x0 < a.x1 + TOL && a.y0 < b.y1 + TOL && b.y0 < a.y1 + TOL;

function outlineExpresses(length: number, height: number, rects: readonly FaceRect[]): boolean {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    if (r.x0 <= TOL || r.x1 >= length - TOL || r.y1 >= height - TOL) return false;
    // A raised opening whose bottom is within the tolerance of the floor would be a hole on the outline.
    if (r.y0 > 0 && r.y0 <= TOL) return false;
    for (let j = i + 1; j < rects.length; j++) if (touching(r, rects[j]!)) return false;
  }
  return true;
}

// The solid part of the face as rectangles: vertical strips between opening edges, each strip's solid spans.
function solidRects(length: number, height: number, rects: readonly FaceRect[]): FaceRect[] {
  const xs = [...new Set([0, length, ...rects.flatMap((r) => [r.x0, r.x1])])].sort((a, b) => a - b);
  const out: FaceRect[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i]!;
    const b = xs[i + 1]!;
    if (b - a <= 0) continue;
    const cuts = rects
      .filter((r) => r.x0 <= a && r.x1 >= b)
      .map((r) => [r.y0, r.y1] as const)
      .sort((p, q) => p[0] - q[0]);
    let y = 0;
    for (const [c0, c1] of cuts) {
      if (c0 > y) out.push({ x0: a, y0: y, x1: b, y1: c0 });
      y = Math.max(y, c1);
    }
    if (y < height) out.push({ x0: a, y0: y, x1: b, y1: height });
  }
  return out;
}

export function wallFace(input: {
  length: number;
  height: number;
  openings: readonly FaceOpening[];
}): WallFace {
  const { length, height } = input;
  const rects = clipped(length, height, input.openings);
  if (!outlineExpresses(length, height, rects)) {
    return { kind: 'rects', rects: solidRects(length, height, rects) };
  }
  const outer: FacePoint[] = [[0, 0]];
  for (const r of rects.filter((q) => q.y0 === 0)) {
    outer.push([r.x0, 0], [r.x0, r.y1], [r.x1, r.y1], [r.x1, 0]);
  }
  outer.push([length, 0], [length, height], [0, height]);
  const holes = rects
    .filter((r) => r.y0 > 0)
    .map((r): FacePoint[] => [
      [r.x0, r.y0],
      [r.x1, r.y0],
      [r.x1, r.y1],
      [r.x0, r.y1],
    ]);
  return { kind: 'outline', outer, holes };
}

// Where a wall's face sits in the model (x east, y north, z up, inches): face x runs along `along` from `origin`,
// face y is up, and the face is extruded `thickness` along `through`. `origin` is the start of the wall's left face
// (walking start to end) and `through` points to the right face, so (along, up, through) is right-handed.
export type WallSolid = {
  origin: Point;
  along: Point;
  through: Point;
  thickness: number;
  length: number;
  height: number;
  face: WallFace;
};

export function wallSolid(
  wall: { data: WallData },
  openings: readonly { data: OpeningData }[],
): WallSolid | null {
  const { start, end } = wall.data.geometry;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= TOL) return null;
  const along = { x: dx / length, y: dy / length };
  const left = { x: -along.y, y: along.x };
  const { oL } = wallFaceOffsets(wall);
  const height = wall.data.attributes.height;
  const face = wallFace({
    length,
    height,
    openings: openings.map((o) => {
      const a = o.data.attributes;
      const c = o.data.geometry.center;
      const at = (c.x - start.x) * along.x + (c.y - start.y) * along.y;
      return { offset: at - a.width / 2, width: a.width, sill: a.sillHeight, height: a.height };
    }),
  });
  return {
    origin: { x: start.x + left.x * oL, y: start.y + left.y * oL },
    along,
    through: { x: -left.x, y: -left.y },
    thickness: wall.data.attributes.thickness,
    length,
    height,
    face,
  };
}
