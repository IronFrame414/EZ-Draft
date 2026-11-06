// EZD-202 G1-G2 (vault/plans/EZD-202.md section 4; AC-EZD-202-6). Expected values: 03g worked examples 1-5
// (coordinates equal at a difference of 0.015625 or less, inclusive) and examples 2, 3 for points.
import { describe, expect, test } from 'vitest';
import { COMPARISON_TOLERANCE_IN, coordsEqual, pointsEqual } from './tolerance';

describe('EZD-202 comparison tolerance', () => {
  test('G1 coords: 03g examples 1-5', () => {
    expect(COMPARISON_TOLERANCE_IN).toBe(0.015625);
    expect(coordsEqual(48.0, 48.0)).toBe(true);
    expect(coordsEqual(48.0, 48.015625)).toBe(true);
    expect(coordsEqual(48.0, 48.0157)).toBe(false);
    expect(coordsEqual(1200.0, 1200.015625)).toBe(true);
    expect(coordsEqual(1200.0, 1200.0157)).toBe(false);
  });

  test('G2 points: each coordinate by coordsEqual', () => {
    expect(pointsEqual({ x: 0, y: 0 }, { x: 0.015625, y: 0.015625 })).toBe(true);
    expect(pointsEqual({ x: 0, y: 0 }, { x: 0, y: 0.0157 })).toBe(false);
  });
});
