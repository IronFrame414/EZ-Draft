// EZD-238 Build step 8 (vault/plans/EZD-238.md section 1 Decided table; 09h; Q-0507; Q-0508; Q-0574; Q-0575):
// one floor of the model document as a list of drawing items in model inches, y up, for the PDF writer and DXF out.
// EZD-205a Build step 13 (vault/plans/EZD-205a.md section 1, Decided "Label"; Q-0568; Q-0570; Q-0576 (a)): one
// NAME \u00b7 N SF label per room, after the dimension items.
// EZD-204b Build step 5 (vault/plans/EZD-204b.md section 1, Decided "Door symbol", "Flagged opening", "Frame";
// Q-0642 rows 2-3; Q-0641 row 1; Q-0630 row 27): each door drawn from its own hand and swing; an opening off every
// wall drawn where it stands on the `flagged` layer.
// EZD-211a: door symbol from G/openings/door-symbol.ts.
// EZD-235 Build step 5 (vault/plans/EZD-235.md Decided "D-Label"; 11 rule 2): the room label's area can be given through `options`.
// EZD-234 Build (S03 Fixtures; mockup S03Plan REF box; Q-0705 boards wait): a fixture is its outline with both
// diagonals, a utility point a diamond UTILITY_MARK_IN across each way, both in their status layer as 'beyond'.
// EZD-227 Build (AC-EZD-227-1; vault/build/assumptions.md EZD-227): blocking is its outline behind the face on its
// side with both diagonals, 'beyond', in its status layer; on the `flagged` layer when it is on no wall.
// EZD-226 Build (AC-EZD-226-1): a tile shower draws through fixtures/tile-shower-drawing.ts, with the fixtures.
import type { DoorHand, DoorSwing, ModelDocument, ModelObject, Point } from '../schema';
import { doorSymbolInFrame } from '../openings/door-symbol';
import { isVerticalLine } from '../openings/opening';
import { coordsEqual, pointsEqual } from '../tolerance';
import { fixtureOutline, type FixtureObject, type UtilityPointObject } from '../fixtures/fixtures';
import { tileShowerItems } from '../fixtures/tile-shower-drawing';
import type { TileShowerObject } from '../fixtures/tile-shower';
import { blockingOutline, type BlockingObject } from '../fixtures/blocking';
import { wallFaceOffsets } from '../walls/wall';
import { formatRoomLabel, interiorPoint, roomAreaSqFt } from '../rooms/area';
import type { RoomObject } from '../rooms/sync';
import { hatchSegments } from './hatch';
import { DRAWING_FONTS, measureTextPt, ROOM_LABEL_LETTER_SPACING_EM } from './text';
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
  vertical: boolean;
};

const add = (p: Point, v: Point, k: number): Point => ({ x: p.x + v.x * k, y: p.y + v.y * k });
const at = (f: Frame, s: number, o: number): Point => add(add(f.start, f.d, s), f.n, o);

function unit(from: Point, to: Point): { d: Point; n: Point; length: number } {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const d = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  return { d, n: { x: -d.y, y: d.x }, length };
}

const degrees = (v: Point): number => (Math.atan2(v.y, v.x) * 180) / Math.PI;

function doorItems(
  base: { layer: DrawingItem['layer']; objectId: string },
  f: Frame,
  sc: number,
  w: number,
  hand: DoorHand,
  swing: DoorSwing,
): DrawingItem[] {
  const { hinge, leafEnd, radius, startAngle, endAngle } = doorSymbolInFrame(f, sc, w, hand, swing);
  return [
    { ...base, kind: 'line', role: 'cut', from: hinge, to: leafEnd },
    {
      ...base,
      kind: 'arc',
      role: 'hidden',
      center: hinge,
      radius,
      startAngle,
      endAngle,
    },
  ];
}

const faceOffsets = wallFaceOffsets;

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

export type DrawingListOptions = { roomAreaSqFt?: (room: RoomObject) => number };

export function buildDrawingList(
  document: ModelDocument,
  view: DrawingView,
  dimensions: readonly DimensionInput[] = [],
  options: DrawingListOptions = {},
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
    const f: Frame = {
      start,
      ...unit(start, end),
      ...faceOffsets(w),
      gaps: [],
      vertical: isVerticalLine(w.data.geometry),
    };
    frames.set(w.id.toLowerCase(), f);
    wallFrames.push([w, f]);
  }

  const placed: [OpeningObject, Frame, number][] = [];
  const flaggedOpenings: OpeningObject[] = [];
  for (const o of openings) {
    const host = o.data.geometry.hostWallId;
    if (host === null) {
      flaggedOpenings.push(o);
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
    const a = o.data.attributes;
    if (a.kind === 'door') {
      // EZD-204b door symbol: hinge end from hand, leaf side from swing.
      symbols.push(...doorItems(base, f, sc, w, a.hand!, a.swing!));
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

  const flaggedItems: DrawingItem[] = [];
  for (const o of flaggedOpenings) {
    const base = { layer: 'flagged' as const, objectId: o.id };
    const a = o.data.attributes;
    const w = a.width;
    const d = o.data.geometry.axis ?? { x: 1, y: 0 };
    const center = o.data.geometry.center;
    const from = add(center, d, -w / 2);
    const to = add(center, d, w / 2);
    const f: Frame = {
      start: center,
      d,
      n: { x: -d.y, y: d.x },
      length: w,
      oL: 0,
      oR: 0,
      gaps: [],
      vertical: isVerticalLine({ start: from, end: to }),
    };
    flaggedItems.push({ ...base, kind: 'line', role: 'cut', from, to });
    if (a.kind === 'door') flaggedItems.push(...doorItems(base, f, 0, w, a.hand!, a.swing!));
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

  const labelItems: DrawingItem[] = [];
  const labelFont = DRAWING_FONTS['instrument-sans-600'];
  for (const r of rooms) {
    const boundary = r.data.geometry.boundary;
    const text = formatRoomLabel(
      r.data.attributes.name,
      options.roomAreaSqFt?.(r) ?? roomAreaSqFt(boundary),
    );
    const sizePt = v.roomLabelPt;
    const letterSpacingPt = sizePt * ROOM_LABEL_LETTER_SPACING_EM;
    labelItems.push({
      kind: 'text',
      layer: 'rooms',
      objectId: r.id,
      text,
      font: 'instrument-sans-600',
      sizePt,
      letterSpacingPt,
      widthPt: measureTextPt(labelFont, text, sizePt) + letterSpacingPt * ([...text].length - 1),
      at: interiorPoint(boundary),
      rotationDeg: 0,
      align: 'center',
    });
  }

  const fixtureItems: DrawingItem[] = [];
  for (const o of onFloor) {
    if (o.type === 'tile_shower') {
      fixtureItems.push(...tileShowerItems(o as TileShowerObject));
      continue;
    }
    if (o.type === 'blocking') {
      const b = o as BlockingObject;
      const hostId = b.data.geometry.hostWallId;
      const host =
        hostId === null
          ? null
          : (walls.find((w) => w.id.toLowerCase() === hostId.toLowerCase()) ?? null);
      const ring = blockingOutline(b, host);
      if (ring === null) {
        reasons.set(b.id, 'host_not_found');
        continue;
      }
      const layer = hostId === null ? ('flagged' as const) : b.data.status;
      const edge = (from: Point, to: Point): DrawingItem => ({
        layer,
        objectId: b.id,
        kind: 'line',
        role: 'beyond',
        from,
        to,
      });
      for (let i = 0; i < 4; i++) fixtureItems.push(edge(ring[i]!, ring[(i + 1) % 4]!));
      fixtureItems.push(edge(ring[0], ring[2]), edge(ring[1], ring[3]));
      continue;
    }
    if (o.type !== 'fixture' && o.type !== 'utility_point') continue;
    const base = { layer: o.data.status, objectId: o.id };
    const line = (from: Point, to: Point): DrawingItem => ({
      ...base,
      kind: 'line',
      role: 'beyond',
      from,
      to,
    });
    const ring =
      o.type === 'fixture'
        ? fixtureOutline((o as FixtureObject).data)
        : utilityMark((o as UtilityPointObject).data.geometry.point);
    for (let i = 0; i < 4; i++) fixtureItems.push(line(ring[i]!, ring[(i + 1) % 4]!));
    if (o.type === 'fixture') {
      fixtureItems.push(line(ring[0], ring[2]));
      fixtureItems.push(line(ring[1], ring[3]));
    }
  }

  const omitted: OmittedObject[] = onFloor.flatMap((o) => {
    const reason = reasons.get(o.id);
    return reason === undefined ? [] : [{ id: o.id, reason }];
  });

  return {
    level: v.level,
    items: [
      ...roomFills,
      ...roomHatches,
      ...wallFills,
      ...wallLines,
      ...symbols,
      ...fixtureItems,
      ...flaggedItems,
      ...dimItems,
      ...labelItems,
    ],
    omitted: [...omitted, ...dimOmitted],
  };
}

export const UTILITY_MARK_IN = 6;

// The diamond drawn for a utility point: right, top, left, bottom corners.
export function utilityMark(p: Point): [Point, Point, Point, Point] {
  const h = UTILITY_MARK_IN / 2;
  return [
    { x: p.x + h, y: p.y },
    { x: p.x, y: p.y + h },
    { x: p.x - h, y: p.y },
    { x: p.x, y: p.y - h },
  ];
}
