// EZD-1416 (S17b Field measure; Auto-fill wall "The last wall of a closed shape fills itself when the others are
// known; Shown grey until computed"; Closure check "Shows 'Closes' or 'Off by X' when every wall is entered; Off by
// more than the company tolerance turns amber"). Pure TypeScript.
//
// Each wall runs along one axis of the outline as drawn (the template outlines and 90°-snapped free walls), so a
// room closes when, on each axis, the walls going one way add up to the walls going the other way. With every wall
// but one typed, that wall's axis gives its length (the auto-filled wall); the other axis is then the check. The gap
// is the straight-line distance of the two axis misses (Q-0569 c). Gaps of 1/64" or less close (03g; Q-0568);
// gap sizes show to 1/16" and never read 0" (Q-0570). A gap above the Measurement tolerance is amber (S15d; strictly
// above, so a gap equal to the tolerance is not). The auto-filled length is never stored: it is worked out from the
// typed walls each time, so it follows later edits (vault/build/assumptions.md EZD-1416).
import type { Pt } from './shapes';
import { wallsOf } from './shapes';

/** 03g: two lengths within 1/64" are the same. */
export const CLOSE_EPSILON_IN = 1 / 64;
/** packages/geometry length.ts MAX_WALL_LENGTH_IN (200 ft). */
const MAX_LENGTH_IN = 2400;

export type ClosureState =
  /** No closed outline yet. */
  | { kind: 'open' }
  /** A free outline with a wall off the 90° grid (placed held): no auto-fill or check. */
  | { kind: 'unchecked' }
  /** Two or more walls still to type; `fill` is the wall that will fill itself (the last one not typed). */
  | { kind: 'pending'; fill: number }
  | { kind: 'closes' }
  /** `gap` in inches, shown to 1/16" (at least 1/16"); `over` when above the tolerance (amber). */
  | { kind: 'off'; gap: number; over: boolean };

export type Closure = {
  /** Typed lengths with the auto-filled wall added (inches; null when not known). */
  lengths: (number | null)[];
  /** The index of the auto-filled wall, or null. */
  auto: number | null;
  state: ClosureState;
};

const grain = (inches: number) => Math.floor(inches * 16 + 0.5) / 16;

/** The axis a wall runs along and its sign (+1 right or down, -1 left or up), or null when it is on neither. */
function axisOf(start: Pt, end: Pt): { axis: 'x' | 'y'; sign: 1 | -1 } | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const eps = 1e-9;
  if (Math.abs(dy) <= eps && Math.abs(dx) > eps) return { axis: 'x', sign: dx > 0 ? 1 : -1 };
  if (Math.abs(dx) <= eps && Math.abs(dy) > eps) return { axis: 'y', sign: dy > 0 ? 1 : -1 };
  return null;
}

/** The gap size as shown: to 1/16", never 0" for a gap over 1/64" (Q-0570). */
export function shownGap(gap: number): number {
  return Math.max(1 / 16, grain(gap));
}

/**
 * The closure of one room outline. `typed` holds one length per wall (inches, null when not typed);
 * `tolerance` is the company Measurement tolerance in inches.
 */
export function closeRoom(
  corners: readonly Pt[],
  closed: boolean,
  typed: readonly (number | null)[],
  tolerance: number,
): Closure {
  const walls = wallsOf(corners, closed);
  const lengths = walls.map((w) => typed[w.index] ?? null);
  if (!closed || walls.length < 3) return { lengths, auto: null, state: { kind: 'open' } };
  const axes = walls.map((w) => axisOf(w.start, w.end));
  if (axes.some((a) => a === null)) return { lengths, auto: null, state: { kind: 'unchecked' } };
  const dirs = axes as { axis: 'x' | 'y'; sign: 1 | -1 }[];

  const missing = lengths.flatMap((l, i) => (l === null ? [i] : []));
  if (missing.length >= 2) {
    return { lengths, auto: null, state: { kind: 'pending', fill: missing[missing.length - 1] as number } };
  }

  const sums = (ls: readonly (number | null)[]) => {
    const s = { x: 0, y: 0 };
    ls.forEach((l, i) => {
      const d = dirs[i] as { axis: 'x' | 'y'; sign: 1 | -1 };
      s[d.axis] += d.sign * (l ?? 0);
    });
    return s;
  };

  let auto: number | null = null;
  if (missing.length === 1) {
    const k = missing[0] as number;
    const d = dirs[k] as { axis: 'x' | 'y'; sign: 1 | -1 };
    const value = grain(-sums(lengths)[d.axis] / d.sign);
    // A wall that would come out at zero or less, or over 200 ft, is not filled; the gap shows instead.
    if (value > CLOSE_EPSILON_IN && value <= MAX_LENGTH_IN) {
      lengths[k] = value;
      auto = k;
    }
  }

  const s = sums(lengths);
  const gap = Math.hypot(s.x, s.y);
  if (gap <= CLOSE_EPSILON_IN) return { lengths, auto, state: { kind: 'closes' } };
  return { lengths, auto, state: { kind: 'off', gap: shownGap(gap), over: gap > tolerance } };
}
