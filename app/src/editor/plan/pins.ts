// EZD-220 (03f:16 Existing-condition pins; Q-0704 05-screens "Pins draw in the Existing view only"; Q-0705 boards
// waived; vault/build/assumptions.md EZD-220): the plan mark of an existing-condition pin and its pick outline. The
// mark is a map pin: a round head above the point with a short stem down to it, on the Existing layer. It is drawn
// here, after the geometry drawing list, as the plumbing locations are. Pure.
import type { DrawingItem, PinData, Point } from '@ezdraft/geometry';

export type PinObject = { id: string; type: 'pin'; data: PinData };

// Head radius and stem length in model inches (vault/build/assumptions.md EZD-220).
export const PIN_HEAD_RADIUS_IN = 6;
export const PIN_STEM_IN = 4;

// The head's centre: straight above the point, by the stem and the radius.
export function pinHeadCenter(p: Point): Point {
  return { x: p.x, y: p.y + PIN_STEM_IN + PIN_HEAD_RADIUS_IN };
}

export function pinItems(pin: PinObject): DrawingItem[] {
  const p = pin.data.geometry.point;
  const center = pinHeadCenter(p);
  const base = { layer: 'existing' as const, objectId: pin.id };
  return [
    {
      ...base,
      kind: 'arc',
      role: 'beyond',
      center,
      radius: PIN_HEAD_RADIUS_IN,
      startAngle: 0,
      endAngle: 360,
    },
    { ...base, kind: 'line', role: 'beyond', from: { x: p.x, y: p.y + PIN_STEM_IN }, to: p },
  ];
}

// The pick outline: the box around the head and stem, counter-clockwise from the bottom left.
export function pinPickRing(p: Point): [Point, Point, Point, Point] {
  const r = PIN_HEAD_RADIUS_IN;
  const top = p.y + PIN_STEM_IN + 2 * r;
  return [
    { x: p.x - r, y: p.y },
    { x: p.x + r, y: p.y },
    { x: p.x + r, y: top },
    { x: p.x - r, y: top },
  ];
}
