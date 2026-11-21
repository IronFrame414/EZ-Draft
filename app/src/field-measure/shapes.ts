// EZD-1415 (S17b Field measure: "Shape picker: Rectangle, L-shape, T-shape, U-shape, Walls (free outline)";
// "Walls mode: Tap to add corners; each new wall is lettered; tap the first corner to close; Angles snap to 90°
// unless held"; "shape canvas with lettered walls"). Pure TypeScript: the outlines, wall lettering and the free
// outline's corner rules. The geometry package's index is held by another ticket, so this lives with the screen
// (vault/build/assumptions.md EZD-1415).
//
// Canvas units: a 300 x 180 box, y down. Each template outline is the board's shape-tile icon
// (S17bFieldMeasure tiles, 34 x 22 icon, 2 px inset, scaled x10) and starts at the top-left corner, clockwise,
// so wall A is the top wall as on the board (A top, B right, ... F left on the L-shape).

export type Pt = { x: number; y: number };
export type TemplateShape = 'rectangle' | 'l' | 't' | 'u';
export type ShapeKind = TemplateShape | 'walls';

export const SHAPE_KINDS: readonly ShapeKind[] = ['rectangle', 'l', 't', 'u', 'walls'];

export const CANVAS_W = 300;
export const CANVAS_H = 180;

export const SHAPE_OUTLINES: Readonly<Record<TemplateShape, readonly Pt[]>> = {
  // M2 2 H32 V20 H2 Z
  rectangle: [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 180 },
    { x: 0, y: 180 },
  ],
  // M2 2 H32 V12 H16 V20 H2 Z
  l: [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 100 },
    { x: 140, y: 100 },
    { x: 140, y: 180 },
    { x: 0, y: 180 },
  ],
  // M2 2 H32 V10 H22 V20 H12 V10 H2 Z
  t: [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 80 },
    { x: 200, y: 80 },
    { x: 200, y: 180 },
    { x: 100, y: 180 },
    { x: 100, y: 80 },
    { x: 0, y: 80 },
  ],
  // M2 2 H32 V20 H24 V9 H10 V20 H2 Z
  u: [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 180 },
    { x: 220, y: 180 },
    { x: 220, y: 70 },
    { x: 80, y: 70 },
    { x: 80, y: 180 },
    { x: 0, y: 180 },
  ],
};

/** A, B, ... Z, then AA, AB, ... (a free outline may have more than 26 walls). */
export function wallLetter(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new RangeError('index must be a whole number from 0');
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export type Wall = { index: number; letter: string; start: Pt; end: Pt };

/** The lettered walls of an outline: corner i to corner i + 1, and the last back to the first when closed. */
export function wallsOf(corners: readonly Pt[], closed: boolean): Wall[] {
  const count = closed ? (corners.length >= 3 ? corners.length : 0) : Math.max(0, corners.length - 1);
  const walls: Wall[] = [];
  for (let i = 0; i < count; i += 1) {
    walls.push({
      index: i,
      letter: wallLetter(i),
      start: corners[i] as Pt,
      end: corners[(i + 1) % corners.length] as Pt,
    });
  }
  return walls;
}

/** The corners of a room's outline: a template's fixed outline, or the free corners drawn in Walls mode. */
export function cornersOf(shape: ShapeKind | null, freeCorners: readonly Pt[]): readonly Pt[] {
  if (shape === null) return [];
  if (shape === 'walls') return freeCorners;
  return SHAPE_OUTLINES[shape];
}

/** How many walls a shape has (a free outline: the walls drawn so far). */
export function wallCount(shape: ShapeKind | null, freeCorners: readonly Pt[], closed: boolean): number {
  if (shape === null) return 0;
  if (shape === 'walls') return wallsOf(freeCorners, closed).length;
  return SHAPE_OUTLINES[shape].length;
}

/**
 * 90° snap (S17b "Angles snap to 90° unless held"): the new corner keeps the larger of its two moves from the
 * previous corner and drops the smaller, so the wall is horizontal or vertical. Held: the tap point as is.
 */
export function snapCorner(prev: Pt, tap: Pt, held: boolean): Pt {
  if (held) return { x: tap.x, y: tap.y };
  const dx = tap.x - prev.x;
  const dy = tap.y - prev.y;
  return Math.abs(dx) >= Math.abs(dy) ? { x: tap.x, y: prev.y } : { x: prev.x, y: tap.y };
}

/** A tap this close to the first corner (canvas units) closes the outline. */
export const CLOSE_RADIUS = 14;

export type FreeOutline = { corners: Pt[]; closed: boolean };

/**
 * One tap in Walls mode. The first tap places the first corner. A tap on the first corner with at least three
 * corners closes the outline (the closing wall joins the last corner to the first). Any other tap adds a corner,
 * snapped to 90° from the last one unless held; a tap on the last corner, or a closed outline, changes nothing.
 * Corners stay inside the canvas.
 */
export function addCorner(outline: FreeOutline, tap: Pt, held: boolean): FreeOutline {
  if (outline.closed) return outline;
  const p = clamp(tap);
  const first = outline.corners[0];
  if (first === undefined) return { corners: [p], closed: false };
  if (outline.corners.length >= 3 && distance(p, first) <= CLOSE_RADIUS) {
    return { corners: outline.corners, closed: true };
  }
  const last = outline.corners[outline.corners.length - 1] as Pt;
  const next = clamp(snapCorner(last, p, held));
  if (distance(next, last) < 1) return outline;
  return { corners: [...outline.corners, next], closed: false };
}

function clamp(p: Pt): Pt {
  return {
    x: Math.min(CANVAS_W, Math.max(0, p.x)),
    y: Math.min(CANVAS_H, Math.max(0, p.y)),
  };
}

function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
