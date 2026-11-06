// EZD-238 · T13: hatchSegments by hand (vault/plans/EZD-238.md section 4).
import { describe, it, expect } from 'vitest';
import { hatchSegments, type Point, type Segment } from '../index';

const P = (x: number, y: number): Point => ({ x, y });
function expectSegments(got: Segment[], want: [number, number, number, number][]): void {
  expect(got).toHaveLength(want.length);
  want.forEach((w, i) => {
    expect(got[i].from.x).toBeCloseTo(w[0], 9);
    expect(got[i].from.y).toBeCloseTo(w[1], 9);
    expect(got[i].to.x).toBeCloseTo(w[2], 9);
    expect(got[i].to.y).toBeCloseTo(w[3], 9);
  });
}

describe('EZD-238 hatch', () => {
  const square = [P(0, 0), P(20, 0), P(20, 20), P(0, 20)];
  it('EZD-238 T13 hatch direct: L shape at 0 degrees, spacing 5', () => {
    const L = [P(0, 0), P(20, 0), P(20, 10), P(10, 10), P(10, 20), P(0, 20)];
    expectSegments(hatchSegments(L, 0, 5), [
      [0, 5, 20, 5],
      [0, 10, 20, 10],
      [0, 15, 10, 15],
    ]);
  });
  it('EZD-238 T13 hatch direct: square at 0 degrees, spacing 10 gives only the middle line', () => {
    expectSegments(hatchSegments(square, 0, 10), [[0, 10, 20, 10]]);
  });
  it('EZD-238 T13 hatch direct: square at 90 degrees, spacing 10 gives only the middle line', () => {
    expectSegments(hatchSegments(square, 90, 10), [[10, 0, 10, 20]]);
  });
});
