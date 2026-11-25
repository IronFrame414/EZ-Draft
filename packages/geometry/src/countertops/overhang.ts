// EZD-414 (S04b Controls "Click edge | Selects that edge; inspector highlights the side", "Overhang chip on edge | Click
// to type a value", "Overhang inputs Front / Left / Right / Back | Type value per side | ... label shows "seating" when
// seating overhang", "Preset chip Flush 0 / Standard 1 1/2 / Bar 10 / Seating 12 / Wall + splash | ... Edge becomes
// wall edge, no profile"; S04b Validation "Seating typical 6"–12", regular 1"–2"" (Round 23); S15d Countertops default
// overhangs; AC-EZD-414-1; vault/build/assumptions.md EZD-414): setting one edge's overhang and kind. Pure.
//
// The outline is the top as cut, overhangs included (EZD-411), so a new overhang moves the edge: it slides outward
// by (new − old) square to itself and its two corners slide along the lines of the neighbouring edges (a rectangle
// stays a rectangle). Board island: cabinets 73 1/2 × 24 at 1 1/2" all round is 76 1/2 × 27; the back at 12" makes
// it 76 1/2 × 37 1/2.
import type { CountertopEdge, CountertopEdgeKind, CountertopPieceData, Point } from '../schema';
import { pointInRing } from '../rooms/area';
import { cutoutFitsPiece } from './cutout';
import { isValidCountertopOutline } from './outline';
import { countertopEdgeLengthIn } from './piece';
import { cross, sub } from '../vec';

export const COUNTERTOP_OVERHANG_PRESETS = ['flush', 'standard', 'bar', 'seating', 'wall'] as const;
export type CountertopOverhangPreset = (typeof COUNTERTOP_OVERHANG_PRESETS)[number];

// The preset values: the per-project Defaults → Countertops overhangs; the spec's numbers while one is not read
// (S04b chips "Flush 0", "Standard 1 1/2", "Bar 10", "Seating 12", "Wall + splash" = 0 with backsplash).
export type CountertopPresetValues = {
  standard: number;
  bar: number;
  seating: number;
  againstWall: number;
  // The splash height a Wall + splash edge takes.
  backsplash: number;
};

export const COUNTERTOP_PRESET_FALLBACK: Readonly<CountertopPresetValues> = {
  standard: 1.5,
  bar: 10,
  seating: 12,
  againstWall: 0,
  backsplash: 4,
};

// Round 23 "Seating typical 6"–12"": a typed overhang this deep or deeper is a seating overhang.
export const COUNTERTOP_SEATING_FROM = 6;

// What an edge becomes: kind, overhang and splash (the profile is kept, or cleared on a wall edge).
export type CountertopEdgeSetting = Pick<CountertopEdge, 'kind' | 'overhang' | 'backsplashHeight'>;

export function countertopPresetEdge(
  preset: CountertopOverhangPreset,
  v: CountertopPresetValues,
): CountertopEdgeSetting {
  switch (preset) {
    case 'flush':
      return { kind: 'flush', overhang: 0, backsplashHeight: null };
    case 'standard':
      return { kind: 'exposed', overhang: v.standard, backsplashHeight: null };
    case 'bar':
      return { kind: 'seating', overhang: v.bar, backsplashHeight: null };
    case 'seating':
      return { kind: 'seating', overhang: v.seating, backsplashHeight: null };
    case 'wall':
      return { kind: 'wall', overhang: v.againstWall, backsplashHeight: v.backsplash };
  }
}

// A typed overhang: a wall edge typed 0 stays a wall edge with its splash; otherwise 0 is a flush edge, 6" or more a
// seating edge, anything between an exposed edge.
export function countertopTypedEdge(current: CountertopEdge, overhang: number): CountertopEdgeSetting {
  if (current.kind === 'wall' && overhang === 0)
    return { kind: 'wall', overhang: 0, backsplashHeight: current.backsplashHeight };
  const kind: CountertopEdgeKind =
    overhang === 0 ? 'flush' : overhang >= COUNTERTOP_SEATING_FROM ? 'seating' : 'exposed';
  return { kind, overhang, backsplashHeight: null };
}

// The preset an edge matches, for the chip shown pressed; null when none does.
export function countertopEdgePreset(
  edge: CountertopEdge,
  v: CountertopPresetValues,
): CountertopOverhangPreset | null {
  if (edge.seamId !== undefined) return null;
  for (const p of COUNTERTOP_OVERHANG_PRESETS) {
    const s = countertopPresetEdge(p, v);
    if (s.kind !== edge.kind || s.overhang !== edge.overhang) continue;
    if (p === 'wall' && edge.backsplashHeight === null) continue;
    return p;
  }
  return null;
}

function signedArea(o: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < o.length; i++) {
    const p = o[i]!;
    const q = o[(i + 1) % o.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

// Where the line through p along d meets the line through q along e; null when they are parallel.
function meet(p: Point, d: Point, q: Point, e: Point): Point | null {
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / den;
  return { x: p.x + d.x * t, y: p.y + d.y * t };
}

// The piece with edge `index` set; null when the edge is a seam (the schema keeps a seam a joint), the index is not
// an edge, or the moved edge would leave an outline that is not valid or a cutout off the top. As a dragged corner
// (moveCountertopVertex), an edge whose move would slide a corner of a seam is refused: the top across the seam would
// not move with it.
export function setCountertopEdge(
  piece: CountertopPieceData,
  index: number,
  setting: CountertopEdgeSetting,
): CountertopPieceData | null {
  const { outline } = piece.geometry;
  const { edges } = piece.attributes;
  const n = outline.length;
  if (!Number.isInteger(index) || index < 0 || index >= n) return null;
  const old = edges[index]!;
  if (old.seamId !== undefined) return null;
  if (!(setting.overhang >= 0) || !Number.isFinite(setting.overhang)) return null;
  const edge: CountertopEdge = {
    kind: setting.kind,
    overhang: setting.overhang,
    backsplashHeight: setting.kind === 'wall' ? setting.backsplashHeight : null,
    profileId: setting.kind === 'wall' ? null : old.profileId,
  };
  const nextEdges = edges.map((e, i) => (i === index ? edge : e));
  const delta = setting.overhang - old.overhang;
  let nextOutline = outline;
  if (delta !== 0) {
    const before = edges[(index - 1 + n) % n]!;
    const after = edges[(index + 1) % n]!;
    if (before.seamId !== undefined || after.seamId !== undefined) return null;
    const len = countertopEdgeLengthIn(outline, index);
    if (!(len > 0)) return null;
    const a = outline[index]!;
    const b = outline[(index + 1) % n]!;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    // Outward: right of the edge on a counter-clockwise outline, left on a clockwise one.
    const s = signedArea(outline) > 0 ? 1 : -1;
    const out = { x: dir.y * s, y: -dir.x * s };
    const a2 = { x: a.x + out.x * delta, y: a.y + out.y * delta };
    const b2 = { x: b.x + out.x * delta, y: b.y + out.y * delta };
    const prev = outline[(index - 1 + n) % n]!;
    const next = outline[(index + 2) % n]!;
    const pa = meet(prev, { x: a.x - prev.x, y: a.y - prev.y }, a2, dir) ?? a2;
    const pb = meet(next, { x: b.x - next.x, y: b.y - next.y }, b2, dir) ?? b2;
    nextOutline = outline.map((p, i) => (i === index ? pa : i === (index + 1) % n ? pb : p));
    if (!isValidCountertopOutline(nextOutline)) return null;
    if (!(piece.attributes.cutouts ?? []).every((c) => cutoutFitsPiece(nextOutline, c))) return null;
  }
  return {
    ...piece,
    geometry: { ...piece.geometry, outline: nextOutline },
    attributes: { ...piece.attributes, edges: nextEdges },
  };
}

// The inspector's Overhang by side diagram (board "Front / Left / Right / Back" around "Cabinets 73 1/2 × 24"). A
// four-sided top takes Trace's edge order: side 1 the back, side 3 the front, and of sides 2 and 4 the one on the
// left when the diagram stands the front at the top (as the board). Null for a top of another shape.
export type CountertopSides = {
  front: number;
  back: number;
  left: number;
  right: number;
  // The cabinets under the top: its extent along the back less the side overhangs, and across less front and back.
  cabinets: { width: number; depth: number };
};

export function countertopSides(piece: CountertopPieceData): CountertopSides | null {
  const o = piece.geometry.outline;
  const e = piece.attributes.edges;
  if (o.length !== 4 || e.length !== 4) return null;
  const mid = (i: number) => {
    const a = o[i]!;
    const b = o[(i + 1) % 4]!;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const back = 0;
  const front = 2;
  const up = { x: mid(front).x - mid(back).x, y: mid(front).y - mid(back).y };
  // Left of "up" (model y up, as the plan shows it).
  const leftDir = { x: -up.y, y: up.x };
  const along = (i: number) => (mid(i).x - mid(back).x) * leftDir.x + (mid(i).y - mid(back).y) * leftDir.y;
  const left = along(1) >= along(3) ? 1 : 3;
  const right = left === 1 ? 3 : 1;
  const len = countertopEdgeLengthIn(o, back);
  if (!(len > 0)) return null;
  const ux = (o[1]!.x - o[0]!.x) / len;
  const uy = (o[1]!.y - o[0]!.y) / len;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of o) {
    const u = p.x * ux + p.y * uy;
    const v = -p.x * uy + p.y * ux;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  return {
    front,
    back,
    left,
    right,
    cabinets: {
      width: maxU - minU - e[left]!.overhang - e[right]!.overhang,
      depth: maxV - minV - e[front]!.overhang - e[back]!.overhang,
    },
  };
}

// Two tops overlap when a side of one crosses a side of the other, or a corner of one stands inside the other off its
// sides. Tops that only touch (an L's two tops along their joint) do not overlap. A moved edge that would run one top
// into another is refused by the editor.
export function countertopOutlinesOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  const EPS = 1e-6;
  const turn = (p: Point, q: Point, r: Point) => cross(sub(q, p), sub(r, p));
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!;
    const q = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j++) {
      const r = b[j]!;
      const s = b[(j + 1) % b.length]!;
      if (turn(p, q, r) * turn(p, q, s) < -EPS && turn(r, s, p) * turn(r, s, q) < -EPS) return true;
    }
  }
  const strictlyInside = (pt: Point, ring: readonly Point[]) => {
    for (let i = 0; i < ring.length; i++) {
      const u = ring[i]!;
      const v = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(v.x - u.x, v.y - u.y);
      if (len > 0 && Math.abs(turn(u, v, pt)) / len < 1e-6) {
        const t = ((pt.x - u.x) * (v.x - u.x) + (pt.y - u.y) * (v.y - u.y)) / (len * len);
        if (t >= -1e-9 && t <= 1 + 1e-9) return false;
      }
    }
    return pointInRing(pt, ring);
  };
  return a.some((p) => strictlyInside(p, b)) || b.some((p) => strictlyInside(p, a));
}
