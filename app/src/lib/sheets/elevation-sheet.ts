// EZD-707 (phase-07 EZD-707 "A4.0 interior elevations ... with Add elevation for any other wall"; R24; 09h "Scales per
// viewport: ... 1/2\" = 1'-0\" elevations"; AC-EZD-707-1, -3): how an elevation viewport lays out its elevations and
// which walls Add elevation offers. Shared by the sheet worker, the PDF export job and the Sheets screen. No DOM.
//
// An elevation viewport draws every elevation its floor generates (packages/geometry elevations/wall-elevation.ts)
// and then the walls added to it, each in its own cell of the viewport's area with its own scale bar and check
// dimension (vault/build/assumptions/EZD-707.md).
import { objectNumber, type ModelObject, type SheetArea } from '@ezdraft/geometry';
import { elevationSubjects } from '@ezdraft/geometry/elevations';

// The viewport's area cut into a near-square grid of `count` cells, filled row by row, left to right.
export function elevationCells(area: SheetArea, count: number): SheetArea[] {
  if (count <= 0) return [];
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const w = area.width / cols;
  const h = area.height / rows;
  return Array.from({ length: count }, (_, i) => ({
    x: area.x + (i % cols) * w,
    y: area.y + Math.floor(i / cols) * h,
    width: w,
    height: h,
  }));
}

// A wall Add elevation can add: its id and its project number ("Wall 4"), null before the first save numbers it.
export type AddableWall = { id: string; number: number | null };

// The walls of the floor that no elevation of the viewport draws yet, in model order.
export function addableWalls(
  objects: readonly ModelObject[],
  level: string,
  added: readonly string[] = [],
): AddableWall[] {
  const drawn = new Set(
    elevationSubjects(objects, level, added).flatMap((s) => (s.wallId === null ? [] : [s.wallId.toLowerCase()])),
  );
  const out: AddableWall[] = [];
  for (const o of objects) {
    if (o.type !== 'wall' || o.data.level.toLowerCase() !== level.toLowerCase()) continue;
    if (drawn.has(o.id.toLowerCase())) continue;
    out.push({ id: o.id, number: objectNumber(o) });
  }
  return out;
}
