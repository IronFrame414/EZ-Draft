// EZD-1904 AC-EZD-1904-1: the shared vector helpers. Expected values worked by hand.
import { describe, expect, it } from 'vitest';
import { add, clamp, cross, dist, dot, sub } from './vec';

describe('EZD-1904 vec helpers', () => {
  it('add sums two points, or adds b scaled by k', () => {
    // (1,2) + (3,4) = (4,6)
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    // (1,2) + 2·(3,-4) = (1+6, 2-8) = (7,-6)
    expect(add({ x: 1, y: 2 }, { x: 3, y: -4 }, 2)).toEqual({ x: 7, y: -6 });
    // (10,10) + (-0.5)·(4,2) = (8,9)
    expect(add({ x: 10, y: 10 }, { x: 4, y: 2 }, -0.5)).toEqual({ x: 8, y: 9 });
  });

  it('sub subtracts b from a', () => {
    // (5,7) - (2,10) = (3,-3)
    expect(sub({ x: 5, y: 7 }, { x: 2, y: 10 })).toEqual({ x: 3, y: -3 });
  });

  it('dot multiplies matching parts and sums them', () => {
    // 1·3 + 2·4 = 11
    expect(dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
    // perpendicular: 1·0 + 0·1 = 0
    expect(dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0);
    // 2·(-3) + 5·1 = -1
    expect(dot({ x: 2, y: 5 }, { x: -3, y: 1 })).toBe(-1);
  });

  it('cross gives the z of a × b, positive for a counter-clockwise turn', () => {
    // x-axis × y-axis = 1·1 - 0·0 = 1
    expect(cross({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(1);
    // y-axis × x-axis = 0·0 - 1·1 = -1
    expect(cross({ x: 0, y: 1 }, { x: 1, y: 0 })).toBe(-1);
    // 1·4 - 2·3 = -2
    expect(cross({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(-2);
    // parallel: 2·4 - 1·8 = 0
    expect(cross({ x: 2, y: 1 }, { x: 8, y: 4 })).toBe(0);
  });

  it('dist is the straight-line distance', () => {
    // 3-4-5 triangle
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    // (1,1) to (-5,9): dx 6, dy 8, distance 10
    expect(dist({ x: 1, y: 1 }, { x: -5, y: 9 })).toBe(10);
    expect(dist({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
  });

  it('clamp holds a value inside [lo, hi]', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe('EZD-1904 vec helpers have one home', () => {
  it('no other geometry source file defines its own add, sub, dot, cross, dist or clamp', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const src = path.dirname(fileURLToPath(import.meta.url));
    const files = (fs.readdirSync(src, { recursive: true }) as string[]).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'vec.ts',
    );
    // A helper definition: `const dot = (` or `function dot(` (a local value such as `const dot = u.x * v.x` is not).
    const def = /(?:\bconst\s+(add|sub|dot|cross|dist|clamp)\s*=\s*\(|\bfunction\s+(add|sub|dot|cross|dist|clamp)\s*\()/;
    const copies = files.filter((f) => def.test(fs.readFileSync(path.join(src, f), 'utf8')));
    expect(copies).toEqual([]);
  });
});
