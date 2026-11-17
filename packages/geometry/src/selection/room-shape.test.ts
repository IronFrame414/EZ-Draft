// EZD-218 AC-EZD-218-5 (rooms become selectable on the canvas; Q-0630 row 8; S03 Canvas "Drag on empty space"):
// a room picks by its boundary ring. Fixture: an L-shaped room (0,0) (144,0) (144,60) (60,60) (60,120) (0,120);
// expected values by hand: area 144 × 60 + 60 × 60 = 12,240 sq in; the notch is x 60..144, y 60..120.
import { describe, expect, it } from 'vitest';
import { roomObj, uid } from '../rooms/test-utils/fixtures';
import type { Point } from '../schema';
import { roomPickShape, shapeBounds, shapeDistance, shapeInRect, shapeTouchesRect } from './shapes';

const pt = (x: number, y: number): Point => ({ x, y });
const L = [pt(0, 0), pt(144, 0), pt(144, 60), pt(60, 60), pt(60, 120), pt(0, 120)];
const room = roomObj(uid(1), L, 'Kitchen');
const rect = (minX: number, minY: number, maxX: number, maxY: number) => ({
  minX,
  minY,
  maxX,
  maxY,
});

describe('EZD-218 room pick shape', () => {
  it('is the boundary ring with its area', () => {
    const s = roomPickShape(room);
    expect(s?.kind).toBe('ring');
    expect(s?.area).toBe(12240);
    expect(s === null ? null : shapeBounds(s)).toEqual(rect(0, 0, 144, 120));
  });

  it('inside is distance 0; in the notch it is the distance to the nearest edge', () => {
    const s = roomPickShape(room)!;
    expect(shapeDistance(s, pt(30, 100))).toBe(0);
    expect(shapeDistance(s, pt(100, 30))).toBe(0);
    expect(shapeDistance(s, pt(100, 100))).toBe(40);
  });

  it('box inside and touch', () => {
    const s = roomPickShape(room)!;
    expect(shapeInRect(s, rect(-1, -1, 145, 121))).toBe(true);
    expect(shapeInRect(s, rect(-1, -1, 145, 100))).toBe(false);
    expect(shapeTouchesRect(s, rect(10, 10, 20, 20))).toBe(true);
    expect(shapeTouchesRect(s, rect(50, 90, 70, 100))).toBe(true);
    expect(shapeTouchesRect(s, rect(100, 90, 110, 110))).toBe(false);
  });

  it('no shape for a room with no area', () => {
    expect(roomPickShape(roomObj(uid(2), [pt(0, 0), pt(10, 0), pt(20, 0)], 'Flat'))).toBeNull();
  });
});
