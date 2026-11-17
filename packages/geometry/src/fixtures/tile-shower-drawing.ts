// EZD-226 Build (AC-EZD-226-1; S03 Fixtures; Q-0704; Q-0705 boards wait; vault/build/assumptions.md EZD-226): the
// plan drawing of one tile shower, in its status layer: the footprint outline, the curb's inner edge, the bench
// outline, each niche as a box NICHE_DEPTH_IN behind its side face (hidden, since it is inside the wall), each glass
// piece as a line on its side with a door's leaf and swing arc, and the drain as a circle (center) or a grate strip
// LINEAR_DRAIN_WIDTH_IN wide inside its side (linear). Pure.
import type { DrawingItem, LineWeightRole } from '../drawing/types';
import type { Point } from '../schema';
import {
  CENTER_DRAIN_MARK_IN,
  LINEAR_DRAIN_WIDTH_IN,
  NICHE_DEPTH_IN,
  showerBenchAt,
  showerCurbAt,
  showerDrainAt,
  showerGlassAt,
  showerNichesAt,
  showerSide,
  type TileShowerObject,
} from './tile-shower';

const shift = (p: Point, n: Point, k: number): Point => ({ x: p.x + n.x * k, y: p.y + n.y * k });
const degrees = (v: Point) => (Math.atan2(v.y, v.x) * 180) / Math.PI;

export function tileShowerItems(o: TileShowerObject): DrawingItem[] {
  const base = { layer: o.data.status, objectId: o.id } as const;
  const items: DrawingItem[] = [];
  const line = (from: Point, to: Point, role: LineWeightRole = 'beyond') =>
    items.push({ ...base, kind: 'line', role, from, to });
  const ring = (pts: readonly Point[], role: LineWeightRole = 'beyond') => {
    for (let i = 0; i < pts.length; i++) line(pts[i]!, pts[(i + 1) % pts.length]!, role);
  };
  const fp = o.data.geometry.footprint;

  ring(fp);
  const curb = showerCurbAt(o.data);
  if (curb !== null) line(curb.from, curb.to);
  const bench = showerBenchAt(o.data);
  if (bench !== null) ring(bench);

  for (const n of showerNichesAt(o.data)) {
    const out = showerSide(fp, n.side).inward;
    const k = -NICHE_DEPTH_IN;
    ring([n.from, n.to, shift(n.to, out, k), shift(n.from, out, k)], 'hidden');
  }

  for (const g of showerGlassAt(o.data)) {
    line(g.from, g.to);
    if (g.type !== 'door') continue;
    const len = Math.hypot(g.to.x - g.from.x, g.to.y - g.from.y);
    const leafDir = g.swing === 'in' ? g.inward : { x: -g.inward.x, y: -g.inward.y };
    const leafEnd = shift(g.from, leafDir, len);
    line(g.from, leafEnd);
    const u = { x: (g.to.x - g.from.x) / len, y: (g.to.y - g.from.y) / len };
    let start = degrees(u.x * leafDir.y - u.y * leafDir.x > 0 ? u : leafDir);
    if (start < 0) start += 360;
    if (start >= 360) start -= 360;
    items.push({
      ...base,
      kind: 'arc',
      role: 'beyond',
      center: g.from,
      radius: len,
      startAngle: start,
      endAngle: start + 90,
    });
  }

  const drain = showerDrainAt(o.data);
  if (drain.type === 'center') {
    items.push({
      ...base,
      kind: 'arc',
      role: 'beyond',
      center: drain.at,
      radius: CENTER_DRAIN_MARK_IN / 2,
      startAngle: 0,
      endAngle: 360,
    });
  } else {
    const n = showerSide(fp, drain.side).inward;
    ring([
      drain.from,
      drain.to,
      shift(drain.to, n, LINEAR_DRAIN_WIDTH_IN),
      shift(drain.from, n, LINEAR_DRAIN_WIDTH_IN),
    ]);
  }
  return items;
}
