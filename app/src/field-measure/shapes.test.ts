// EZD-1415 (S17b Shape picker, Walls mode, lettered walls; AC-EZD-1415-1). Wall counts: a rectangle has four
// walls, an L six (AC-EZD-1418-1 "six existing walls"), a T and a U eight (the board's tile outlines). Lettering
// follows the board: A top, B right, C the inner step, D the inner riser, E bottom, F left on the L-shape.
import { describe, expect, it } from 'vitest';
import {
  addCorner,
  CLOSE_RADIUS,
  cornersOf,
  SHAPE_OUTLINES,
  snapCorner,
  wallCount,
  wallLetter,
  wallsOf,
  type FreeOutline,
} from './shapes';

describe('EZD-1415 shape outlines', () => {
  it('rectangle 4, L 6, T 8, U 8 walls', () => {
    expect(wallCount('rectangle', [], true)).toBe(4);
    expect(wallCount('l', [], true)).toBe(6);
    expect(wallCount('t', [], true)).toBe(8);
    expect(wallCount('u', [], true)).toBe(8);
    expect(wallCount(null, [], false)).toBe(0);
  });

  it('every template outline closes with only horizontal and vertical walls', () => {
    for (const corners of Object.values(SHAPE_OUTLINES)) {
      for (const w of wallsOf(corners, true)) {
        expect(w.start.x === w.end.x || w.start.y === w.end.y).toBe(true);
      }
    }
  });

  it('the L-shape is lettered A to F as on the board', () => {
    const walls = wallsOf(cornersOf('l', []), true);
    expect(walls.map((w) => w.letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    const [a, b, c, d, e, f] = walls;
    // A top, B right, C inner step (horizontal, below A), D inner riser, E bottom, F left.
    expect(a?.start.y).toBe(0);
    expect(a?.end.y).toBe(0);
    expect(b?.start.x).toBe(300);
    expect(c?.start.y).toBe(c?.end.y);
    expect(c?.start.y).toBeGreaterThan(0);
    expect(d?.start.x).toBe(d?.end.x);
    expect(e?.start.y).toBe(180);
    expect(f?.start.x).toBe(0);
    expect(f?.end).toEqual({ x: 0, y: 0 });
  });
});

describe('EZD-1415 wall letters', () => {
  it('A to Z then AA', () => {
    expect(wallLetter(0)).toBe('A');
    expect(wallLetter(5)).toBe('F');
    expect(wallLetter(25)).toBe('Z');
    expect(wallLetter(26)).toBe('AA');
    expect(wallLetter(27)).toBe('AB');
  });
});

describe('EZD-1415 Walls mode', () => {
  const empty: FreeOutline = { corners: [], closed: false };

  it('snaps to 90° unless held', () => {
    expect(snapCorner({ x: 10, y: 10 }, { x: 100, y: 20 }, false)).toEqual({ x: 100, y: 10 });
    expect(snapCorner({ x: 10, y: 10 }, { x: 20, y: 100 }, false)).toEqual({ x: 10, y: 100 });
    expect(snapCorner({ x: 10, y: 10 }, { x: 100, y: 20 }, true)).toEqual({ x: 100, y: 20 });
  });

  it('each tap adds a lettered wall and a tap on the first corner closes', () => {
    let o = addCorner(empty, { x: 20, y: 20 }, false);
    expect(wallsOf(o.corners, o.closed)).toHaveLength(0);
    o = addCorner(o, { x: 200, y: 25 }, false);
    expect(o.corners[1]).toEqual({ x: 200, y: 20 });
    expect(wallsOf(o.corners, o.closed).map((w) => w.letter)).toEqual(['A']);
    o = addCorner(o, { x: 195, y: 150 }, false);
    o = addCorner(o, { x: 20, y: 152 }, false);
    expect(o.corners).toEqual([
      { x: 20, y: 20 },
      { x: 200, y: 20 },
      { x: 200, y: 150 },
      { x: 20, y: 150 },
    ]);
    expect(o.closed).toBe(false);
    expect(wallsOf(o.corners, o.closed).map((w) => w.letter)).toEqual(['A', 'B', 'C']);
    o = addCorner(o, { x: 20 + CLOSE_RADIUS - 4, y: 22 }, false);
    expect(o.closed).toBe(true);
    const walls = wallsOf(o.corners, o.closed);
    expect(walls.map((w) => w.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(walls[3]?.end).toEqual({ x: 20, y: 20 });
    // A closed outline takes no more corners.
    expect(addCorner(o, { x: 100, y: 100 }, false)).toBe(o);
  });

  it('two corners cannot close; a tap near the first corner adds a wall instead', () => {
    let o = addCorner(empty, { x: 20, y: 20 }, false);
    o = addCorner(o, { x: 120, y: 20 }, false);
    o = addCorner(o, { x: 24, y: 22 }, false);
    expect(o.closed).toBe(false);
  });

  it('a tap on the last corner adds nothing; taps outside the canvas are kept inside', () => {
    let o = addCorner(empty, { x: -40, y: 400 }, false);
    expect(o.corners[0]).toEqual({ x: 0, y: 180 });
    o = addCorner(o, { x: 0, y: 180 }, false);
    expect(o.corners).toHaveLength(1);
  });
});
