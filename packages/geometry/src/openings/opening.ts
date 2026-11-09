// EZD-204a Build step 4 (vault/plans/EZD-204a.md section 1, Decided "createOpeningData", "autoRoughOpening",
// "Flips", "isOpeningFlagged", "isVerticalLine / leftEndIsLow", "Hand meaning", "Swing meaning"; Q-0630 question 1
// row 3, rows 4, 5, 6; Q-0633 G6; Q-0641 rows 1, 3; Q-0642 rows 2, 3; 03g): new openings, flips and the left end.
import type { DoorSwing, ModelObject, OpeningData, Point } from '../schema';
import { coordsEqual } from '../tolerance';
import type { WallLine, WallObject } from '../walls/wall';

export type OpeningObject = Extract<ModelObject, { type: 'opening' }>;

type Size = { width: number; height: number };

export const DEFAULT_DOOR_SIZE: Readonly<Size> = Object.freeze({ width: 36, height: 80 });

export const DEFAULT_WINDOW_SIZE: Readonly<Size> = Object.freeze({ width: 36, height: 48 });

export const DEFAULT_WINDOW_SILL_IN = 36;

export function autoRoughOpening(kind: 'door' | 'window', size: Size): Size {
  return kind === 'door'
    ? { width: size.width + 2, height: size.height + 2.5 }
    : { width: size.width + 0.5, height: size.height + 0.5 };
}

export function createOpeningData(input: {
  kind: 'door' | 'window';
  host: WallObject;
  center: Point;
  swing?: DoorSwing;
}): OpeningData {
  const door = input.kind === 'door';
  const size = door ? DEFAULT_DOOR_SIZE : DEFAULT_WINDOW_SIZE;
  return {
    geometry: {
      center: { x: input.center.x, y: input.center.y },
      hostWallId: input.host.id,
      axis: null,
    },
    status: 'existing',
    level: input.host.data.level,
    attributes: {
      kind: input.kind,
      width: size.width,
      height: size.height,
      roughOpening: autoRoughOpening(input.kind, size),
      sillHeight: door ? 0 : DEFAULT_WINDOW_SILL_IN,
      swing: door ? (input.swing ?? 'left') : null,
      hand: door ? 'left' : null,
      impactRating: 'not_rated',
      shutterType: null,
      roughOpeningMode: 'auto',
    },
  };
}

const toggle = (side: 'left' | 'right'): 'left' | 'right' => (side === 'left' ? 'right' : 'left');

export function flipSwing(o: OpeningObject): OpeningObject | null {
  const a = o.data.attributes;
  if (a.kind === 'window' || a.swing === null) return null;
  return { ...o, data: { ...o.data, attributes: { ...a, swing: toggle(a.swing) } } };
}

export function flipHand(o: OpeningObject): OpeningObject | null {
  const a = o.data.attributes;
  if (a.kind === 'window' || a.hand === null) return null;
  return { ...o, data: { ...o.data, attributes: { ...a, hand: toggle(a.hand) } } };
}

export function isOpeningFlagged(o: OpeningObject): boolean {
  return o.data.geometry.hostWallId === null;
}

export function isVerticalLine(line: WallLine): boolean {
  return coordsEqual(line.start.x, line.end.x);
}

export function leftEndIsLow(d: Point, vertical: boolean): boolean {
  return vertical ? d.y < 0 : d.x > 0;
}
