// EZD-238 Build step 7 (vault/plans/EZD-238.md section 1, Decided "Hatch"): parallel hatch lines clipped to a
// closed boundary, returned as pre-clipped segments.
import type { Point } from '../schema';
import { coordsEqual } from '../tolerance';
import type { Segment } from './types';

export function hatchSegments(
  boundary: readonly Point[],
  angleDeg: number,
  spacingIn: number,
): Segment[] {
  const rad = (angleDeg * Math.PI) / 180;
  const u = { x: Math.cos(rad), y: Math.sin(rad) };
  const m = { x: -Math.sin(rad), y: Math.cos(rad) };
  const along = (p: Point): number => u.x * p.x + u.y * p.y;
  const across = (p: Point): number => m.x * p.x + m.y * p.y;

  const values = boundary.map(across);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const out: Segment[] = [];
  for (let k = Math.ceil(min / spacingIn); k <= Math.floor(max / spacingIn); k++) {
    const c = k * spacingIn;
    if (coordsEqual(c, min) || coordsEqual(c, max)) continue;
    const crossings: Point[] = [];
    for (let i = 0; i < boundary.length; i++) {
      const a = boundary[i];
      const b = boundary[(i + 1) % boundary.length];
      const da = values[i] - c;
      const db = values[(i + 1) % boundary.length] - c;
      if (da >= 0 === db >= 0) continue;
      const t = da / (da - db);
      crossings.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
    crossings.sort((p, q) => along(p) - along(q));
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = crossings[i];
      const to = crossings[i + 1];
      if (coordsEqual(along(from), along(to))) continue;
      out.push({ from, to });
    }
  }
  return out;
}
