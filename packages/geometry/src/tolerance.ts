// EZD-202 Build step 9 (vault/plans/EZD-202.md section 3 `tolerance.ts`, Decided "pointsEqual; rounding"; 03g;
// AC-EZD-202-6): coordinates are compared at 1/64", inclusive. Stored values are never rounded.
import type { Point } from './schema';

export const COMPARISON_TOLERANCE_IN = 0.015625;

export function coordsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= COMPARISON_TOLERANCE_IN;
}

export function pointsEqual(p: Point, q: Point): boolean {
  return coordsEqual(p.x, q.x) && coordsEqual(p.y, q.y);
}
