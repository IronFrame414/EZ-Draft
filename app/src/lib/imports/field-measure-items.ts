// EZD-1418 (S17b Desktop side "sent rooms appear in Import review as Field measure items with high confidence;
// accepting them creates existing walls and rooms"; S02 Entry points "rooms sent from the phone (17b Field measure,
// source kind field_measure)"; AC-EZD-1418-1 "A sent L-shaped room becomes six existing walls and a room on the
// plan"). Pure: the detected items of a field measure import, worked out from the rooms the phone sent.
// - A room's outline is walked wall by wall: each wall keeps the direction it has on the phone's canvas (y down there,
//   y north here, so y is flipped) and takes its typed length, or the auto-filled length (closure.ts closeRoom) for
//   the one wall left to fill. A room with a wall still unknown, or an outline not closed, gives no items.
// - Model walls run along their face with the thickness on the right (EZD-202), whichever way round the outline was
//   drawn (a Walls outline may be tapped counter-clockwise). A room's walls run with the room on
//   their left, so the thickness falls outside the room; the Building's walls run the other way, so the thickness
//   falls inside the outline measured outside (vault/build/assumptions.md EZD-1418).
// - Every item is 100 % confidence: typed on site, so high confidence at any company cutoff (S17b "with high
//   confidence"). The Building gives walls only; each other room gives its walls and one room item with its name.
// - The phone gives no room positions: the Building sits at the origin and each room to its east, in send order,
//   ROOM_SPACING_IN apart, bottoms level with the Building's (assumptions EZD-1418). The office moves them on desktop.
import { closeRoom } from '../../field-measure/closure';
import type { FieldRoom } from '../../field-measure/rooms';
import { cornersOf, wallLetter, wallsOf } from '../../field-measure/shapes';
import type { Pt, ReviewItem, ReviewRoom, ReviewWall, Side } from './review';
import { DEFAULT_MEASUREMENT_TOLERANCE_IN } from './review-conflicts';

/** The space (in) left between laid-out rooms, east of each other. */
export const ROOM_SPACING_IN = 60;

/** Field measure items are typed on site: always high confidence. */
export const FIELD_MEASURE_CONFIDENCE = 100;

type Outline = { room: FieldRoom; points: Pt[] };

/** The walked corners of a room (model inches, y north, first corner at the origin), or null when not known. */
export function walkRoom(room: FieldRoom): Pt[] | null {
  if (room.shape === null || !room.closed) return null;
  const corners = cornersOf(room.shape, room.corners);
  const walls = wallsOf(corners, true);
  if (walls.length < 3) return null;
  const { lengths } = closeRoom(corners, true, room.lengths, DEFAULT_MEASUREMENT_TOLERANCE_IN);
  if (lengths.some((l) => l === null || !(l > 0))) return null;
  const points: Pt[] = [{ x: 0, y: 0 }];
  let at: Pt = { x: 0, y: 0 };
  for (const w of walls.slice(0, -1)) {
    const dx = w.end.x - w.start.x;
    const dy = -(w.end.y - w.start.y);
    const d = Math.hypot(dx, dy);
    const l = lengths[w.index] as number;
    at = { x: at.x + (dx / d) * l, y: at.y + (dy / d) * l };
    points.push(at);
  }
  return points;
}

function sideOf(start: Pt, end: Pt): Side {
  // The wall's right-hand normal, the side its thickness is on.
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const out = { x: dy, y: -dx };
  if (Math.abs(out.x) >= Math.abs(out.y)) return out.x >= 0 ? 'east' : 'west';
  return out.y >= 0 ? 'north' : 'south';
}

function signedArea(points: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i] as Pt;
    const b = points[(i + 1) % points.length] as Pt;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

const area = (points: readonly Pt[]): number => Math.abs(signedArea(points));

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** The detected items of a field measure import, in send order: each room's walls (A, B, ...), then its room. */
export function fieldMeasureItems(rooms: readonly FieldRoom[]): ReviewItem[] {
  const outlines: Outline[] = [];
  for (const room of rooms) {
    const points = walkRoom(room);
    if (points) outlines.push({ room, points });
  }

  const items: ReviewItem[] = [];
  let wallNo = 0;
  let roomNo = 0;
  let east = 0;
  let first = true;
  for (const { room, points } of outlines) {
    const minX = Math.min(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxX = Math.max(...points.map((p) => p.x));
    const shiftX = (first ? 0 : east + ROOM_SPACING_IN) - minX;
    const placed = points.map((p) => ({ x: round(p.x + shiftX), y: round(p.y - minY) }));
    east = (first ? 0 : east + ROOM_SPACING_IN) + (maxX - minX);
    first = false;

    const building = room.kind === 'building';
    // A template outline runs clockwise; a Walls outline may be tapped either way round. Clockwise is a negative
    // signed area here (y north), and the wall directions follow it so the thickness side never depends on it.
    const clockwise = signedArea(placed) < 0;
    placed.forEach((p, i) => {
      const q = placed[(i + 1) % placed.length] as Pt;
      const [start, end] = building === clockwise ? [p, q] : [q, p];
      wallNo += 1;
      const wall: ReviewWall = {
        id: `fm-${room.id}-${wallLetter(i)}`,
        type: 'wall',
        number: wallNo,
        side: sideOf(start, end),
        confidence: FIELD_MEASURE_CONFIDENCE,
        geometry: { start: { ...start }, end: { ...end } },
        thickness: null,
      };
      items.push(wall);
    });
    if (!building) {
      roomNo += 1;
      const item: ReviewRoom = {
        id: `fm-${room.id}`,
        type: 'room',
        number: roomNo,
        confidence: FIELD_MEASURE_CONFIDENCE,
        boundary: placed.map((p) => ({ ...p })),
        closed: true,
        areaSqIn: round(area(placed)),
        name: room.name,
      };
      items.push(item);
    }
  }
  return items;
}
