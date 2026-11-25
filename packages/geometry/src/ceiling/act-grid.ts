// EZD-511 (S05 Controls "Acoustical grid ... Grid auto-balances borders."; S05 Validation "ACT balanced borders: edge
// tiles at least half a tile (12" on a 2x2 module; 12" or 24" on 2x4 per direction). Balancing picks the start point
// that meets this; warn if the user overrides it. Minimum border is a company setting under Defaults."; S05 Decision 3;
// 09g "ACT borders balanced: edge tiles at least half a tile"; AC-EZD-511-1; vault/build/assumptions.md EZD-511
// "Balancing per direction"): an ACT grid laid out on its room. Pure; model inches, y up.
//
// The grid's frame: `u` is the room's longest boundary edge (ridgeDirection; an ACT ceiling is flat, so it has no
// ridge) and `v` square to it. The mains run along `u` (with long wall) or along `v` (across). Along a main the tiles
// are 24"; across the mains they are 24" on 2x2 and 48" on 2x4. Each direction is balanced on its own over the
// room's extent in that direction (a room that is not a rectangle uses its bounding box in the grid's frame).
//
// Balancing one direction of length L with tile m and minimum border min, in whole 1/16" (n = floor(L / m),
// r = L - n m): r = 0 gives whole tiles to both walls; r / 2 >= min gives two borders of r / 2; otherwise one whole
// tile is given up and the two borders are (r + m) / 2. A direction shorter than one tile is one cut piece (L).
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import type { ActGridData, ActModule, Point, RoomData } from '../schema';
import { ridgeDirection } from './beam-layout';
import { dot } from '../vec';

const tol = COMPARISON_TOLERANCE_IN;
const SIXTEENTHS = 16;

/** The Defaults "ACT minimum border" choices, as a share of the tile (vault/build/assumptions.md EZD-116 Q-0712). */
export const ACT_MIN_BORDER_CHOICES = ['1/4', '1/3', '1/2'] as const;
export type ActMinBorder = (typeof ACT_MIN_BORDER_CHOICES)[number];
export const DEFAULT_ACT_MIN_BORDER: ActMinBorder = '1/2';
const SHARE: Record<ActMinBorder, number> = { '1/4': 1 / 4, '1/3': 1 / 3, '1/2': 1 / 2 };

/** The setting's share of a tile; anything not a choice reads as the default, half a tile. */
export function actMinBorderShare(setting: unknown): number {
  return typeof setting === 'string' && setting in SHARE
    ? SHARE[setting as ActMinBorder]
    : SHARE[DEFAULT_ACT_MIN_BORDER];
}

/** The tile size along a main and across the mains, in inches. */
export function actTileSizes(module: ActModule): { alongMain: number; acrossMains: number } {
  return { alongMain: 24, acrossMains: module === '2x4' ? 48 : 24 };
}

/** One direction balanced: the border at each wall and the whole tiles between them; first + whole m + last = L. */
export type ActBalance = { first: number; last: number; whole: number };

/** Balances one direction of length `length` with tile `tile` and minimum border `min` (all inches). */
export function balanceActDirection(length: number, tile: number, min: number): ActBalance {
  const L = Math.round(length * SIXTEENTHS);
  const m = Math.round(tile * SIXTEENTHS);
  const lo = Math.round(min * SIXTEENTHS);
  const n = Math.floor(L / m);
  const r = L - n * m;
  const out = (first: number, last: number, whole: number): ActBalance => ({
    first: first / SIXTEENTHS,
    last: last / SIXTEENTHS,
    whole,
  });
  // Shorter than one tile, or exactly one: one piece wall to wall.
  if (n === 0 || (n === 1 && r === 0)) return out(L, L, 0);
  if (r === 0) return out(m, m, n - 2);
  if (r >= 2 * lo) {
    const a = Math.floor(r / 2);
    return out(a, r - a, n);
  }
  const a = Math.floor((r + m) / 2);
  return out(a, r + m - a, n - 1);
}

/** One direction of a laid-out grid: lines square to `dir` at `lines` (distances along `dir` from the origin). */
export type ActAxis = {
  dir: Point;
  tile: number;
  min: number;
  /** The room's extent along `dir`. */
  from: number;
  to: number;
  /** The grid lines, ascending, strictly inside the extent. */
  lines: number[];
  /** The cut pieces at the low and high wall; a whole tile when the grid meets the wall on a line. */
  borders: [number, number];
  /** The balanced borders of this direction (what Balance gives back). */
  balanced: ActBalance;
};

export type ActGridLayout = {
  /** Along a main: `dir` is the main's direction, the lines are the cross tees. */
  alongMain: ActAxis;
  /** Across the mains: the lines are the mains. */
  acrossMains: ActAxis;
  /** A grid line crossing: the balanced start, or the stored one while not balanced. */
  start: Point;
};

const perp = (u: Point): Point => ({ x: -u.y, y: u.x });

/** The main runners' direction and the direction square to it. */
export function actFrame(grid: ActGridData, room: RoomData): { main: Point; across: Point } {
  const u = ridgeDirection(room);
  return grid.attributes.direction === 'with_long_wall'
    ? { main: u, across: perp(u) }
    : { main: perp(u), across: u };
}

function extent(boundary: readonly Point[], dir: Point): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of boundary) {
    const d = dot(p, dir);
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return [lo, hi];
}

function axis(
  dir: Point,
  tile: number,
  minShare: number,
  [from, to]: [number, number],
  start: number | null,
): { axis: ActAxis; startAt: number } {
  const min = tile * minShare;
  const balanced = balanceActDirection(to - from, tile, min);
  const s = start ?? from + balanced.first;
  const lines: number[] = [];
  const k0 = Math.ceil((from + tol - s) / tile);
  for (let k = k0; s + k * tile < to - tol; k++) lines.push(s + k * tile);
  const borders: [number, number] =
    lines.length === 0
      ? [to - from, to - from]
      : [lines[0]! - from, to - lines[lines.length - 1]!];
  return {
    axis: { dir, tile, min, from, to, lines, borders, balanced },
    startAt: lines[0] ?? s,
  };
}

/**
 * The grid laid out on its room. `minShare` is the Defaults minimum border as a share of the tile
 * (actMinBorderShare). A balanced grid takes its start from the room; otherwise the stored start is used.
 */
export function actGridLayout(grid: ActGridData, room: RoomData, minShare: number): ActGridLayout {
  const { main, across } = actFrame(grid, room);
  const sizes = actTileSizes(grid.attributes.module);
  const boundary = room.geometry.boundary;
  const stored = grid.attributes.balanced ? null : grid.geometry.start;
  const a = axis(
    main,
    sizes.alongMain,
    minShare,
    extent(boundary, main),
    stored === null ? null : dot(stored, main),
  );
  const b = axis(
    across,
    sizes.acrossMains,
    minShare,
    extent(boundary, across),
    stored === null ? null : dot(stored, across),
  );
  const start = {
    x: main.x * a.startAt + across.x * b.startAt,
    y: main.y * a.startAt + across.y * b.startAt,
  };
  return { alongMain: a.axis, acrossMains: b.axis, start };
}

/** The balanced start point of a grid on its room (stored when a grid is placed or Balance is pressed). */
export function balancedActStart(grid: ActGridData, room: RoomData, minShare: number): Point {
  return actGridLayout({ ...grid, attributes: { ...grid.attributes, balanced: true } }, room, minShare)
    .start;
}

/** The smaller border in each direction: along a main, then across the mains (the legend's "{a} and {b}"). */
export function actBorderSizes(layout: ActGridLayout): [number, number] {
  return [Math.min(...layout.alongMain.borders), Math.min(...layout.acrossMains.borders)];
}

export type ActBorderWarning = { direction: 'along_main' | 'across_mains'; border: number; min: number };

/**
 * The override warning (S05 Validation "warn if the user overrides it"): a border under the minimum, in a direction
 * whose balanced borders meet it. A direction too short for any border to meet the minimum never warns. A balanced
 * grid never warns.
 */
export function actBorderWarnings(grid: ActGridData, layout: ActGridLayout): ActBorderWarning[] {
  if (grid.attributes.balanced) return [];
  const out: ActBorderWarning[] = [];
  const check = (a: ActAxis, direction: ActBorderWarning['direction']) => {
    const reachable = Math.min(a.balanced.first, a.balanced.last) >= a.min - tol;
    const border = Math.min(...a.borders);
    if (reachable && border < a.min - tol) out.push({ direction, border, min: a.min });
  };
  check(layout.alongMain, 'along_main');
  check(layout.acrossMains, 'across_mains');
  return out;
}

/** The point at distances `a` along the main and `b` across the mains. */
function at(layout: ActGridLayout, a: number, b: number): Point {
  const m = layout.alongMain.dir;
  const c = layout.acrossMains.dir;
  return { x: m.x * a + c.x * b, y: m.y * a + c.y * b };
}

/** The grid lines as straight segments across the room's extent (callers clip them to the room). */
export function actGridSegments(layout: ActGridLayout): [Point, Point][] {
  const A = layout.alongMain;
  const B = layout.acrossMains;
  const out: [Point, Point][] = [];
  for (const s of A.lines) out.push([at(layout, s, B.from), at(layout, s, B.to)]);
  for (const s of B.lines) out.push([at(layout, A.from, s), at(layout, A.to, s)]);
  return out;
}

/** The pieces (whole tiles and cut borders) between the walls in one direction, as [low, high] distances. */
function cells(a: ActAxis): [number, number][] {
  const edges = [a.from, ...a.lines, a.to];
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < edges.length; i++) out.push([edges[i]!, edges[i + 1]!]);
  return out;
}

/** A tile: its centre and its corners (a whole tile is tile-sized; a border piece is cut). */
export type ActTile = { center: Point; corners: [Point, Point, Point, Point]; whole: boolean };

function tileOf(layout: ActGridLayout, [a0, a1]: [number, number], [b0, b1]: [number, number]): ActTile {
  const whole =
    Math.abs(a1 - a0 - layout.alongMain.tile) <= tol &&
    Math.abs(b1 - b0 - layout.acrossMains.tile) <= tol;
  return {
    center: at(layout, (a0 + a1) / 2, (b0 + b1) / 2),
    corners: [at(layout, a0, b0), at(layout, a1, b0), at(layout, a1, b1), at(layout, a0, b1)],
    whole,
  };
}

/**
 * The whole tile nearest `p` (S05 "in ACT areas, troffers snap into tiles"; "In ACT, snaps into a tile"): the tile
 * under the point when it is whole, else the nearest whole one. Null when the grid has no whole tile.
 */
export function actTileAt(layout: ActGridLayout, p: Point): ActTile | null {
  const pa = dot(p, layout.alongMain.dir);
  const pb = dot(p, layout.acrossMains.dir);
  let best: ActTile | null = null;
  let bestD = Infinity;
  for (const ca of cells(layout.alongMain))
    for (const cb of cells(layout.acrossMains)) {
      const t = tileOf(layout, ca, cb);
      if (!t.whole) continue;
      const da = pa < ca[0] ? ca[0] - pa : pa > ca[1] ? pa - ca[1] : 0;
      const db = pb < cb[0] ? cb[0] - pb : pb > cb[1] ? pb - cb[1] : 0;
      const d = Math.hypot(da, db);
      if (d < bestD - tol) {
        bestD = d;
        best = t;
      }
    }
  return best;
}
