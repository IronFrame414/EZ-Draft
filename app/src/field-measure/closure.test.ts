// EZD-1416 (AC-EZD-1416-1 "Typing 5 of 6 walls fills the 6th"; AC-EZD-1416-2 "a 1" error shows Off by 1" in
// amber"; S17b Auto-fill wall, Closure check). Expected values are worked by hand from the board
// (S17bFieldMeasure, L-shaped Family room): A 18' 2" = 218", B 9' 0 1/2" = 108.5", D 7' 3" = 87",
// F 16' 3 1/2" = 195.5", and C typed as 10' 4 1/2" = 124.5" (the board shows "10' 4 1/" mid-typing).
// The L runs A right, B down, C left, D down, E left, F up (shapes.ts), so:
//   across: A = C + E, so E = 218 - 124.5 = 93.5" (7' 9 1/2");
//   up and down: B + D = F, 108.5 + 87 = 195.5, so it closes.
// The tolerance is the 1/2" used while Measurement tolerance is Not set (DEFAULT_MEASUREMENT_TOLERANCE_IN).
import { describe, expect, it } from 'vitest';
import { formatLength } from '@ezdraft/geometry';
import { closeRoom, shownGap } from './closure';
import { SHAPE_OUTLINES, type Pt } from './shapes';

const L = SHAPE_OUTLINES.l;
const RECT = SHAPE_OUTLINES.rectangle;
const TOL = 0.5;
const [A, B, C, D, E, F] = [218, 108.5, 124.5, 87, 93.5, 195.5];

describe('EZD-1416 closure', () => {
  it('AC-EZD-1416-1: five of six L walls typed, the sixth (E) fills itself and the room closes', () => {
    const r = closeRoom(L, true, [A, B, C, D, null, F], TOL);
    expect(r.auto).toBe(4);
    expect(r.lengths).toEqual([A, B, C, D, 93.5, F]);
    expect(formatLength(r.lengths[4] as number, 16)).toBe(`7' 9 1/2"`);
    expect(r.state).toEqual({ kind: 'closes' });
  });

  it('any one missing wall fills: C from A and E, B from D and F', () => {
    expect(closeRoom(L, true, [A, B, null, D, E, F], TOL).lengths[2]).toBe(124.5);
    expect(closeRoom(L, true, [A, null, C, D, E, F], TOL).lengths[1]).toBe(108.5);
  });

  it('AC-EZD-1416-2: F typed 1" long (16\' 4 1/2") shows Off by 1" over the 1/2" tolerance (amber)', () => {
    const r = closeRoom(L, true, [A, B, C, D, null, 196.5], TOL);
    expect(r.lengths[4]).toBe(93.5);
    expect(r.state).toEqual({ kind: 'off', gap: 1, over: true });
    if (r.state.kind !== 'off') throw new Error('expected off');
    expect(formatLength(r.state.gap, 16)).toBe('1"');
  });

  it('all six typed with E 1" long (7\' 10 1/2") is also Off by 1", amber', () => {
    const r = closeRoom(L, true, [A, B, C, D, 94.5, F], TOL);
    expect(r.auto).toBeNull();
    expect(r.state).toEqual({ kind: 'off', gap: 1, over: true });
  });

  it('a 1/4" miss is Off by 1/4" but not amber; exactly the tolerance is not amber', () => {
    expect(closeRoom(L, true, [A, B, C, D, 93.75, F], TOL).state).toEqual({ kind: 'off', gap: 0.25, over: false });
    expect(closeRoom(L, true, [A, B, C, D, 94, F], TOL).state).toEqual({ kind: 'off', gap: 0.5, over: false });
    expect(closeRoom(L, true, [A, B, C, D, 94, F], 0.25).state).toEqual({ kind: 'off', gap: 0.5, over: true });
  });

  it('misses on both axes add as a straight line (Q-0569 c): 3" and 4" is Off by 5"', () => {
    // Rectangle 120" x 96": A right, B down, C left, D up. A 123 vs C 120 misses 3"; B 100 vs D 96 misses 4".
    expect(closeRoom(RECT, true, [123, 100, 120, 96], TOL).state).toEqual({ kind: 'off', gap: 5, over: true });
  });

  it('two or more walls left: no fill, the last untyped wall is the one that will fill', () => {
    const r = closeRoom(L, true, [A, B, null, D, null, F], TOL);
    expect(r.auto).toBeNull();
    expect(r.lengths).toEqual([A, B, null, D, null, F]);
    expect(r.state).toEqual({ kind: 'pending', fill: 4 });
  });

  it('a rectangle with three walls fills the fourth from its opposite wall', () => {
    const r = closeRoom(RECT, true, [144, 120, 144, null], TOL);
    expect(r.lengths[3]).toBe(120);
    expect(r.state).toEqual({ kind: 'closes' });
  });

  it('a wall that would come out at zero or less is not filled; the gap shows', () => {
    // C 230" is longer than A 218", so E would be -12".
    const r = closeRoom(L, true, [A, B, 230, D, null, F], TOL);
    expect(r.auto).toBeNull();
    expect(r.lengths[4]).toBeNull();
    expect(r.state).toEqual({ kind: 'off', gap: 12, over: true });
  });

  it('an open free outline has no closure; a free outline off the 90° grid is not checked', () => {
    const free: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(closeRoom(free, false, [10, 10], TOL).state).toEqual({ kind: 'open' });
    expect(closeRoom(free, true, [10, 10, null], TOL).state).toEqual({ kind: 'unchecked' });
  });

  it('a closed 90° free outline fills and checks like a template', () => {
    const free: Pt[] = [
      { x: 20, y: 20 },
      { x: 250, y: 20 },
      { x: 250, y: 150 },
      { x: 20, y: 150 },
    ];
    expect(closeRoom(free, true, [144, 120, 144, null], TOL).lengths[3]).toBe(120);
  });

  it('gap sizes show to 1/16" and never as 0" (Q-0570)', () => {
    expect(shownGap(0.02)).toBe(1 / 16);
    expect(shownGap(1)).toBe(1);
    expect(shownGap(0.3)).toBe(0.3125);
  });
});
