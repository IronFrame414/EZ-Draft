// EZD-1904 (editor consolidation plan R10, vault/plans/editor-consolidation-2026-11-23.md; AC-EZD-1904-1): the one home
// of the plan-space vector helpers. Every geometry file imports these instead of defining its own copy. Pure.
import type { Point } from './schema/common';

/** a + b·k (k defaults to 1, so add(a, b) is the plain sum). */
export const add = (a: Point, b: Point, k = 1): Point => ({ x: a.x + b.x * k, y: a.y + b.y * k });

/** a − b. */
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

/** Dot product a·b. */
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;

/** 2-D cross product (z of a × b): positive when b turns counter-clockwise from a. */
export const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;

/** Distance between two points. */
export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** v held inside [lo, hi]. */
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
