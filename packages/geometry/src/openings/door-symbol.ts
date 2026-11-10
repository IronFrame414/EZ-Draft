// EZD-211a Build step 2 (vault/plans/EZD-211a.md section 1, Decided "doorSymbolInFrame", "doorSymbol"; P204b
// Decided "Door symbol", "Flagged opening", "Frame"): the one door-arc rule, shared by the drawing list and the
// opening tool. Model inches; angles in degrees, counter-clockwise from +x.
import type { DoorHand, DoorSwing, Point } from '../schema';
import { pointsEqual } from '../tolerance';
import type { WallObject } from '../walls/wall';
import { isVerticalLine, leftEndIsLow, type OpeningObject } from './opening';

// d = unit direction, n = left normal, faces at n*oL (left) and n*oR (right).
export type DoorFrame = {
  start: Point;
  d: Point;
  n: Point;
  oL: number;
  oR: number;
  vertical: boolean;
};

export type DoorSymbol = {
  hinge: Point;
  leafEnd: Point;
  swingNormal: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
};

const add = (p: Point, v: Point, k: number): Point => ({ x: p.x + v.x * k, y: p.y + v.y * k });
const degrees = (v: Point): number => (Math.atan2(v.y, v.x) * 180) / Math.PI;

export function doorSymbolInFrame(
  f: DoorFrame,
  sc: number,
  width: number,
  hand: DoorHand,
  swing: DoorSwing,
): DoorSymbol {
  const hingeLow = (hand === 'left') === leftEndIsLow(f.d, f.vertical);
  const sh = hingeLow ? sc - width / 2 : sc + width / 2;
  const face = swing === 'left' ? f.oL : f.oR;
  const k = swing === 'left' ? 1 : -1;
  const hinge = add(add(f.start, f.d, sh), f.n, face);
  const swingNormal = { x: k * f.n.x, y: k * f.n.y };
  const leafEnd = add(hinge, swingNormal, width);
  const u = hingeLow ? f.d : { x: -f.d.x, y: -f.d.y };
  const v = swingNormal;
  let startAngle = degrees(u.x * v.y - u.y * v.x > 0 ? u : v);
  if (startAngle < 0) startAngle += 360;
  if (startAngle >= 360) startAngle -= 360;
  return { hinge, leafEnd, swingNormal, radius: width, startAngle, endAngle: startAngle + 90 };
}

export function doorSymbol(o: OpeningObject, host: WallObject | null): DoorSymbol | null {
  const a = o.data.attributes;
  if (a.kind === 'window' || a.swing === null || a.hand === null) return null;
  const g = o.data.geometry;
  const w = a.width;
  if (g.hostWallId === null) {
    const d = g.axis ?? { x: 1, y: 0 };
    const f: DoorFrame = {
      start: g.center,
      d,
      n: { x: -d.y, y: d.x },
      oL: 0,
      oR: 0,
      vertical: isVerticalLine({ start: add(g.center, d, -w / 2), end: add(g.center, d, w / 2) }),
    };
    return doorSymbolInFrame(f, 0, w, a.hand, a.swing);
  }
  if (host === null || host.id.toLowerCase() !== g.hostWallId.toLowerCase()) return null;
  const { start, end } = host.data.geometry;
  if (pointsEqual(start, end)) return null;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const d = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  const t = host.data.attributes.thickness;
  const faces =
    host.data.attributes.thicknessSide === 'right'
      ? { oL: 0, oR: -t }
      : host.data.attributes.thicknessSide === 'left'
        ? { oL: t, oR: 0 }
        : { oL: t / 2, oR: -t / 2 };
  const f: DoorFrame = {
    start,
    d,
    n: { x: -d.y, y: d.x },
    ...faces,
    vertical: isVerticalLine(host.data.geometry),
  };
  const sc = (g.center.x - start.x) * d.x + (g.center.y - start.y) * d.y;
  return doorSymbolInFrame(f, sc, w, a.hand, a.swing);
}
