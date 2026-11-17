// EZD-223 (S03 Sketch; AC-EZD-223-1, -2): rough strokes built from an ideal shape plus a fixed hand wobble clean up
// to that ideal shape. Each expected shape is the ideal the stroke was drawn from; the stated tolerance is the wobble
// size (1" on a 48" x 36" rectangle, 1" on a 24" circle, and so on).
import { describe, expect, test } from 'vitest';
import type { Point } from '../schema/common';
import { cleanStroke } from './clean';
import { sketchPoints } from './shape';

// A fixed, repeatable wobble in [-1, 1].
const WOBBLE = [0.6, -0.4, 0.9, -0.8, 0.2, -0.5, 1, -0.3, 0.1, -0.9, 0.7, -0.6, 0.4, -1, 0.8, -0.2];
const wobble = (i: number) => WOBBLE[i % WOBBLE.length]!;

// Points along a polyline, `step` inches apart, each pushed off the path by up to `amp` inches.
function rough(path: readonly Point[], step: number, amp: number): Point[] {
  const out: Point[] = [];
  let k = 0;
  for (let s = 1; s < path.length; s++) {
    const a = path[s - 1]!;
    const b = path[s]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(len / step));
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const w = wobble(k++) * amp;
      out.push({ x: a.x + (b.x - a.x) * t + nx * w, y: a.y + (b.y - a.y) * t + ny * w });
    }
  }
  const end = path[path.length - 1]!;
  out.push({ x: end.x + wobble(k) * amp * 0.5, y: end.y - wobble(k + 1) * amp * 0.5 });
  return out;
}

function roughCircle(
  c: Point,
  r: number,
  amp: number,
  from = 0,
  sweep = 2 * Math.PI,
  n = 64,
): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + (sweep * i) / n;
    const rr = r + wobble(i) * amp;
    out.push({ x: c.x + rr * Math.cos(a), y: c.y + rr * Math.sin(a) });
  }
  return out;
}

const within = (got: Point, want: Point, tol: number) => {
  expect(Math.abs(got.x - want.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(got.y - want.y)).toBeLessThanOrEqual(tol);
};

describe('EZD-223 sketch stroke clean-up', () => {
  test('AC-EZD-223-1 a rough 48" x 36" rectangle stroke becomes that rectangle', () => {
    const ideal = [
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 36 },
      { x: 0, y: 36 },
      { x: 0, y: 0 },
    ];
    // The stroke starts part way along the bottom edge and overshoots its start a little, as a hand does.
    const stroke = rough([{ x: 20, y: 0 }, ...ideal.slice(1), { x: 22, y: 0.5 }], 2, 1);
    const shape = cleanStroke(stroke);
    expect(shape.kind).toBe('rectangle');
    if (shape.kind !== 'rectangle') return;
    const want = [
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 36 },
      { x: 0, y: 36 },
    ];
    for (const w of want) {
      const got = shape.corners.reduce((best, p) =>
        Math.hypot(p.x - w.x, p.y - w.y) < Math.hypot(best.x - w.x, best.y - w.y) ? p : best,
      );
      within(got, w, 1);
    }
    // A true rectangle: every corner is a right angle.
    for (let i = 0; i < 4; i++) {
      const a = shape.corners[i]!;
      const b = shape.corners[(i + 1) % 4]!;
      const c = shape.corners[(i + 2) % 4]!;
      const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
      expect(Math.abs(dot)).toBeLessThan(1e-6);
    }
  });

  test('AC-EZD-223-1 a rough rectangle drawn at 30 degrees keeps its turn', () => {
    const t = Math.PI / 6;
    const rot = (p: Point): Point => ({
      x: p.x * Math.cos(t) - p.y * Math.sin(t),
      y: p.x * Math.sin(t) + p.y * Math.cos(t),
    });
    const ideal = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 30 },
      { x: 0, y: 30 },
      { x: 0, y: 0 },
    ].map(rot);
    const shape = cleanStroke(rough(ideal, 2, 0.8));
    expect(shape.kind).toBe('rectangle');
    if (shape.kind !== 'rectangle') return;
    const [a, b] = shape.corners;
    const edge = Math.atan2(b.y - a.y, b.x - a.x);
    const fold = (((edge - t) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
    expect(Math.min(fold, Math.PI / 2 - fold)).toBeLessThan((2 * Math.PI) / 180);
  });

  test('AC-EZD-223-2 a rough circle of radius 12" becomes that circle', () => {
    const shape = cleanStroke(roughCircle({ x: 100, y: 50 }, 12, 0.6));
    expect(shape.kind).toBe('circle');
    if (shape.kind !== 'circle') return;
    within(shape.center, { x: 100, y: 50 }, 1);
    expect(Math.abs(shape.radius - 12)).toBeLessThanOrEqual(1);
  });

  test('AC-EZD-223-2 a rough line becomes a straight line between its ends', () => {
    const shape = cleanStroke(rough([{ x: 0, y: 0 }, { x: 96, y: 24 }], 3, 1));
    expect(shape.kind).toBe('line');
    if (shape.kind !== 'line') return;
    within(shape.from, { x: 0, y: 0 }, 1);
    within(shape.to, { x: 96, y: 24 }, 1);
  });

  test('S03 Sketch a rough quarter arc of radius 36" becomes that arc', () => {
    const shape = cleanStroke(roughCircle({ x: 0, y: 0 }, 36, 1, 0, Math.PI / 2, 40));
    expect(shape.kind).toBe('arc');
    if (shape.kind !== 'arc') return;
    within(shape.center, { x: 0, y: 0 }, 2);
    expect(Math.abs(shape.radius - 36)).toBeLessThanOrEqual(2);
    expect(Math.abs(shape.sweep - Math.PI / 2)).toBeLessThan((5 * Math.PI) / 180);
  });

  test('S03 Sketch a zigzag scribble is not forced into a shape', () => {
    const zig: Point[] = [];
    for (let i = 0; i <= 12; i++) zig.push({ x: i * 6, y: i % 2 === 0 ? 0 : 10 });
    expect(cleanStroke(zig).kind).toBe('raw');
  });

  test('S03 Sketch a closed triangle is not forced into a rectangle or circle', () => {
    const tri = rough(
      [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 30, y: 50 },
        { x: 0, y: 0 },
      ],
      2,
      0.5,
    );
    expect(cleanStroke(tri).kind).toBe('raw');
  });

  test('S03 Sketch a single point stays raw', () => {
    expect(cleanStroke([{ x: 1, y: 1 }]).kind).toBe('raw');
    expect(
      cleanStroke([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]).kind,
    ).toBe('raw');
  });

  test('sketchPoints closes a rectangle and runs a circle all the way round', () => {
    const rect = sketchPoints({
      kind: 'rectangle',
      corners: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 0, y: 1 },
      ],
    });
    expect(rect).toHaveLength(5);
    expect(rect[4]).toEqual({ x: 0, y: 0 });
    const ring = sketchPoints({ kind: 'circle', center: { x: 0, y: 0 }, radius: 2 }, 4);
    expect(ring).toHaveLength(5);
    within(ring[0]!, { x: 2, y: 0 }, 1e-9);
    within(ring[1]!, { x: 0, y: 2 }, 1e-9);
    within(ring[4]!, { x: 2, y: 0 }, 1e-9);
  });
});
