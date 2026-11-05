// EZD-238 Build step 8 (vault/plans/EZD-238.md section 1 Decided table; 09h; Q-0507; Q-0508; Q-0574; Q-0575):
// one floor of the model document as a list of drawing items in model inches, y up, for the PDF writer and DXF out.
import type { ModelDocument, ModelObject, Point } from '../schema';
import { coordsEqual, pointsEqual } from '../tolerance';
import { hatchSegments } from './hatch';
import { DRAWING_FONTS, measureTextPt } from './text';
import {
  dimensionInputSchema,
  drawingViewSchema,
  type DimensionInput,
  type DrawingItem,
  type DrawingList,
  type DrawingView,
  type OmittedObject,
} from './types';

type WallObject = Extract<ModelObject, { type: 'wall' }>;
type OpeningObject = Extract<ModelObject, { type: 'opening' }>;
type Reason = OmittedObject['reason'];

// A wall's frame: d = unit start->end, n = left normal, faces at n*oL (left) and n*oR (right).
type Frame = {
  start: Point;
  d: Point;
  n: Point;
  length: number;
  oL: number;
  oR: number;
  gaps: [number, number][];
};

const add = (p: Point, v: Point, k: number): Point => ({ x: p.x + v.x * k, y: p.y + v.y * k });
const at = (f: Frame, s: number, o: number): Point => add(add(f.start, f.d, s), f.n, o);

function unit(from: Point, to: Point): { d: Point; n: Point; length: number } {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const d = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  return { d, n: { x: -d.y, y: d.x }, length };
}

const degrees = (v: Point): number => (Math.atan2(v.y, v.x) * 180) / Math.PI;

function faceOffsets(wall: WallObject): { oL: number; oR: number } {
  const t = wall.data.attributes.thickness;
  switch (wall.data.attributes.thicknessSide) {
    case 'right':
      return { oL: 0, oR: -t };
    case 'left':
      return { oL: t, oR: 0 };
    case 'center':
      return { oL: t / 2, oR: -t / 2 };
  }
}

// [0, L] minus the merged gaps, dropping pieces whose ends are equal at 1/64".
function pieces(f: Frame): [number, number][] {
  const sorted = [...f.gaps].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [lo, hi] of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && lo <= last[1]) last[1] = Math.max(last[1], hi);
    else merged.push([lo, hi]);
  }
  const out: [number, number][] = [];
  let s0 = 0;
  for (const [lo, hi] of merged) {
    out.push([s0, lo]);
    s0 = hi;
  }
  out.push([s0, f.length]);
  return out.filter(([a, b]) => !coordsEqual(a, b));
}

export function buildDrawingList(
  document: ModelDocument,
  view: DrawingView,
  dimensions: readonly DimensionInput[] = [],
): DrawingList {
  const v = drawingViewSchema.parse(view);
  const dims = dimensions.map((d) => dimensionInputSchema.parse(d));
  const level = v.level.toLowerCase();

  const onFloor = document.objects.filter(
    (o) => o.type !== 'floor' && o.data.level.toLowerCase() === level,
  );
  const walls = onFloor.filter((o): o is WallObject => o.type === 'wall');
  const openings = onFloor.filter((o): o is OpeningObject => o.type === 'opening');
  const rooms = onFloor.filter((o) => o.type === 'room');
  const reasons = new Map<string, Reason>();

  const frames = new Map<string, Frame>();
  const wallFrames: [WallObject, Frame][] = [];
  for (const w of walls) {
    const { start, end } = w.data.geometry;
    if (pointsEqual(start, end)) {
      reasons.set(w.id, 'zero_length');
      continue;
    }
    const f: Frame = { start, ...unit(start, end), ...faceOffsets(w), gaps: [] };
    frames.set(w.id.toLowerCase(), f);
    wallFrames.push([w, f]);
  }

  const placed: [OpeningObject, Frame, number][] = [];
  for (const o of openings) {
    const host = o.data.geometry.hostWallId;
    if (host === null) {
      reasons.set(o.id, 'not_on_wall');
      continue;
    }
    const f = frames.get(host.toLowerCase());
    if (f === undefined) {
      reasons.set(o.id, 'host_not_found');
      continue;
    }
    const c = o.data.geometry.center;
    const sc = (c.x - f.start.x) * f.d.x + (c.y - f.start.y) * f.d.y;
    const half = o.data.attributes.width / 2;
    const lo = Math.max(0, sc - half);
    const hi = Math.min(f.length, sc + half);
    if (lo > hi || coordsEqual(lo, hi)) {
      reasons.set(o.id, 'not_on_wall');
      continue;
    }
    f.gaps.push([lo, hi]);
    placed.push([o, f, sc]);
  }

  const roomFills: DrawingItem[] = [];
  const roomHatches: DrawingItem[] = [];
  for (const r of rooms) {
    const boundary = r.data.geometry.boundary.map((p) => ({ x: p.x, y: p.y }));
    roomFills.push({ kind: 'fill', layer: 'rooms', objectId: r.id, points: boundary });
    if (v.roomHatch !== null) {
      roomHatches.push({
        kind: 'hatch',
        role: 'beyond',
        layer: 'rooms',
        objectId: r.id,
        boundary,
        segments: hatchSegments(boundary, v.roomHatch.angleDeg, v.roomHatch.spacingIn),
      });
    }
  }

  const wallFills: DrawingItem[] = [];
  const wallLines: DrawingItem[] = [];
  for (const [w, f] of wallFrames) {
    const base = { layer: w.data.status, objectId: w.id };
    const line = (from: Point, to: Point): DrawingItem => ({
      ...base,
      kind: 'line',
      role: 'cut',
      from,
      to,
    });
    for (const [s0, s1] of pieces(f)) {
      wallFills.push({
        ...base,
        kind: 'fill',
        points: [at(f, s0, f.oR), at(f, s1, f.oR), at(f, s1, f.oL), at(f, s0, f.oL)],
      });
      wallLines.push(line(at(f, s0, f.oL), at(f, s1, f.oL)));
      wallLines.push(line(at(f, s0, f.oR), at(f, s1, f.oR)));
      if (s0 > 0) wallLines.push(line(at(f, s0, f.oR), at(f, s0, f.oL)));
      if (s1 < f.length) wallLines.push(line(at(f, s1, f.oR), at(f, s1, f.oL)));
    }
  }

  const symbols: DrawingItem[] = [];
  for (const [o, f, sc] of placed) {
    const base = { layer: o.data.status, objectId: o.id };
    const w = o.data.attributes.width;
    if (o.data.attributes.kind === 'door') {
      // DEFAULT_DOOR_SWING: hinged at the start end of the opening, opening to the left face.
      const hinge = at(f, sc - w / 2, f.oL);
      let startAngle = degrees(f.d);
      if (startAngle < 0) startAngle += 360;
      if (startAngle >= 360) startAngle -= 360;
      symbols.push({ ...base, kind: 'line', role: 'cut', from: hinge, to: add(hinge, f.n, w) });
      symbols.push({
        ...base,
        kind: 'arc',
        role: 'hidden',
        center: hinge,
        radius: w,
        startAngle,
        endAngle: startAngle + 90,
      });
    } else {
      for (const off of [f.oL, f.oR, (f.oL + f.oR) / 2]) {
        symbols.push({
          ...base,
          kind: 'line',
          role: 'beyond',
          from: at(f, sc - w / 2, off),
          to: at(f, sc + w / 2, off),
        });
      }
    }
  }

  const dimItems: DrawingItem[] = [];
  const dimOmitted: OmittedObject[] = [];
  const font = DRAWING_FONTS['dm-mono-400'];
  for (const m of dims) {
    if (m.level.toLowerCase() !== level) continue;
    if (pointsEqual(m.from, m.to)) {
      dimOmitted.push({ id: m.id, reason: 'zero_length' });
      continue;
    }
    const { d, n } = unit(m.from, m.to);
    const from = add(m.from, n, m.offset);
    const to = add(m.to, n, m.offset);
    let rotationDeg = degrees(d);
    if (rotationDeg <= -90) rotationDeg += 180;
    else if (rotationDeg > 90) rotationDeg -= 180;
    dimItems.push({
      kind: 'line',
      role: 'dimension',
      layer: 'dimensions',
      objectId: m.id,
      from,
      to,
    });
    dimItems.push({
      kind: 'text',
      layer: 'dimensions',
      objectId: m.id,
      text: m.text,
      font: 'dm-mono-400',
      sizePt: v.dimensionTextPt,
      widthPt: measureTextPt(font, m.text, v.dimensionTextPt),
      at: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      rotationDeg,
      align: 'center',
    });
  }

  const omitted: OmittedObject[] = onFloor.flatMap((o) => {
    const reason = reasons.get(o.id);
    return reason === undefined ? [] : [{ id: o.id, reason }];
  });

  return {
    level: v.level,
    items: [...roomFills, ...roomHatches, ...wallFills, ...wallLines, ...symbols, ...dimItems],
    omitted: [...omitted, ...dimOmitted],
  };
}
