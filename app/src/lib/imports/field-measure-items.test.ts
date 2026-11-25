// EZD-1418 (AC-EZD-1418-1 "A sent L-shaped room becomes six existing walls and a room on the plan"; S17b Desktop side).
// Expected values worked by hand from the L outline (shapes.ts: A top, B right, C notch top, D notch side, E bottom,
// F left): A 180", B 120", C 96", D 96", E 84", F 216" close (A = C + E, F = B + D). Placed with its lowest and
// westmost corner at the origin, y north, the corners are (0,216) (180,216) (180,96) (84,96) (84,0) (0,0); the area
// is 180 x 216 - 96 x 96 = 29664 sq in. A room's walls run with the room on their left (thickness outside), so wall
// A runs (180,216) -> (0,216) and faces north.
import { describe, expect, it } from 'vitest';
import { emptyRoom, initialRooms, withShape, type FieldRoom } from '../../field-measure/rooms';
import { fieldMeasureItems, ROOM_SPACING_IN } from './field-measure-items';
import type { ReviewRoom, ReviewWall } from './review';

function lRoom(lengths: (number | null)[]): FieldRoom {
  return { ...withShape(emptyRoom('r1', 'room', 'Kitchen'), 'l'), lengths, ceiling: 96 };
}

const walls = (items: ReturnType<typeof fieldMeasureItems>) =>
  items.filter((i): i is ReviewWall => i.type === 'wall');
const rooms = (items: ReturnType<typeof fieldMeasureItems>) =>
  items.filter((i): i is ReviewRoom => i.type === 'room');

describe('EZD-1418 field measure items', () => {
  it('turns a sent L-shaped room into six walls and one room', () => {
    const items = fieldMeasureItems([initialRooms()[0]!, lRoom([180, 120, 96, 96, 84, 216])]);
    const w = walls(items);
    expect(w).toHaveLength(6);
    expect(w.map((x) => x.id)).toEqual([
      'fm-r1-A',
      'fm-r1-B',
      'fm-r1-C',
      'fm-r1-D',
      'fm-r1-E',
      'fm-r1-F',
    ]);
    expect(w.map((x) => [x.geometry.start, x.geometry.end])).toEqual([
      [{ x: 180, y: 216 }, { x: 0, y: 216 }],
      [{ x: 180, y: 96 }, { x: 180, y: 216 }],
      [{ x: 84, y: 96 }, { x: 180, y: 96 }],
      [{ x: 84, y: 0 }, { x: 84, y: 96 }],
      [{ x: 0, y: 0 }, { x: 84, y: 0 }],
      [{ x: 0, y: 216 }, { x: 0, y: 0 }],
    ]);
    expect(w.map((x) => x.side)).toEqual(['north', 'east', 'south', 'east', 'south', 'west']);
    expect(w.every((x) => x.confidence === 100 && x.thickness === null)).toBe(true);

    const r = rooms(items);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      id: 'fm-r1',
      name: 'Kitchen',
      closed: true,
      confidence: 100,
      areaSqIn: 29664,
      boundary: [
        { x: 0, y: 216 },
        { x: 180, y: 216 },
        { x: 180, y: 96 },
        { x: 84, y: 96 },
        { x: 84, y: 0 },
        { x: 0, y: 0 },
      ],
    });
  });

  it('fills the one wall left untyped as the phone does (F = B + D = 216")', () => {
    const items = fieldMeasureItems([initialRooms()[0]!, lRoom([180, 120, 96, 96, 84, null])]);
    const f = walls(items)[5]!;
    expect(f.geometry).toEqual({ start: { x: 0, y: 216 }, end: { x: 0, y: 0 } });
  });

  it('leaves out a room with two walls unknown and a Building with no shape', () => {
    expect(fieldMeasureItems([initialRooms()[0]!, lRoom([180, 120, 96, 96, null, null])])).toEqual(
      [],
    );
  });

  it('gives the Building walls only, thickness inside the outline, and lays rooms out to its east', () => {
    // Building 40' x 30' (480" x 360"); a 12' x 10' bath (144" x 120") goes 60" east of it.
    const building: FieldRoom = {
      ...withShape(initialRooms()[0]!, 'rectangle'),
      lengths: [480, 360, 480, 360],
    };
    const bath: FieldRoom = {
      ...withShape(emptyRoom('r2', 'room', 'Bath'), 'rectangle'),
      lengths: [144, 120, 144, 120],
    };
    const items = fieldMeasureItems([building, bath]);
    const w = walls(items);
    expect(w).toHaveLength(8);
    // Building wall A runs west to east along the top (thickness on its right, south, inside the outline).
    expect(w[0]!.geometry).toEqual({ start: { x: 0, y: 360 }, end: { x: 480, y: 360 } });
    expect(w[0]!.side).toBe('south');
    expect(rooms(items)).toHaveLength(1);
    const x0 = 480 + ROOM_SPACING_IN;
    expect(rooms(items)[0]!.boundary).toEqual([
      { x: x0, y: 120 },
      { x: x0 + 144, y: 120 },
      { x: x0 + 144, y: 0 },
      { x: x0, y: 0 },
    ]);
    expect(rooms(items)[0]!.areaSqIn).toBe(17280);
  });

  // A Walls outline tapped counter-clockwise on the phone (down the left side first): a 12' x 10' room, walls A left
  // 120", B bottom 144", C right 120", D top 144". Placed: (0,120) (0,0) (144,0) (144,120). The thickness is still
  // outside the room (A faces west, B south, C east, D north) and inside the Building's outline (the opposite sides).
  it('keeps the thickness side for a Walls outline drawn counter-clockwise', () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
    ];
    const free = (id: string, kind: 'building' | 'room', name: string): FieldRoom => ({
      ...emptyRoom(id, kind, name),
      shape: 'walls',
      corners,
      closed: true,
      lengths: [120, 144, 120, 144],
    });
    const asRoom = walls(fieldMeasureItems([initialRooms()[0]!, free('r3', 'room', 'Den')]));
    expect(asRoom.map((x) => x.side)).toEqual(['west', 'south', 'east', 'north']);
    expect(asRoom[0]!.geometry).toEqual({ start: { x: 0, y: 120 }, end: { x: 0, y: 0 } });
    expect(asRoom[1]!.geometry).toEqual({ start: { x: 0, y: 0 }, end: { x: 144, y: 0 } });

    const asBuilding = walls(fieldMeasureItems([free('building', 'building', 'Building')]));
    expect(asBuilding.map((x) => x.side)).toEqual(['east', 'north', 'west', 'south']);
    expect(asBuilding[0]!.geometry).toEqual({ start: { x: 0, y: 0 }, end: { x: 0, y: 120 } });
  });
});
