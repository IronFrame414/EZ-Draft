// EZD-505 beam sets (AC-EZD-505-1 "A level beam above the ridge shows a warning"). Expected values: S05 Room ceiling
// summary "walls 8' 0" · ridge 13' 0" · 9.4/12" (plate 96", ridge 156"); board S05Ceiling "FAMILY ROOM · 320 SF"
// (a 20' x 16' room), "5 beams", "6" x 8"", "4' 0" o.c.", "Across ridge", ridge east-west; S05 Validation "Level
// beams in a vault must sit below the ridge and at or above the wall plate"; S05 "Length: Default is wall to wall
// span"; S05 "Count: spacing is computed". The end-gap rule (half a spacing or more, set centred) is the recorded
// EZD-505 assumption.
import { describe, expect, it } from 'vitest';
import { chain, roomObj, uid } from '../rooms/test-utils/fixtures';
import type { BeamData, ModelObject, Point, RoomData } from '../schema';
import { parseStoredObject } from '../schema';
import {
  adjoiningRoom,
  beamLayout,
  beamOutlines,
  beamSetPickShape,
  beamSetWarnings,
  beamWarnings,
  moveBeamSet,
  newBeamSet,
  roomPlateHeight,
} from './beams';

const LEVEL = '11111111-1111-4111-8111-111111111111';
const ROOM = uid(100);
const NEXT = uid(101);

// 20' x 16' = 320 sf; ridge east-west across the middle at 13' 0".
const FAMILY: Point[] = [
  { x: 0, y: 0 },
  { x: 240, y: 0 },
  { x: 240, y: 192 },
  { x: 0, y: 192 },
];

function vaultedRoom(): { id: string; type: 'room'; data: RoomData } {
  const r = roomObj(ROOM, FAMILY, 'Family room', LEVEL);
  r.data.attributes.ceilingType = 'vaulted';
  r.data.attributes.ceiling = {
    heightsBy: 'pitch',
    wallHeights: [],
    pointHeights: [],
    pitch: 9.4,
    ridge: { start: { x: 0, y: 96 }, end: { x: 240, y: 96 }, height: 156 },
  };
  return r as { id: string; type: 'room'; data: RoomData };
}

function beam(attrs: Partial<BeamData['attributes']> = {}, shift: Point = { x: 0, y: 0 }): BeamData {
  return {
    geometry: { roomId: ROOM, shift },
    status: 'new',
    level: LEVEL,
    attributes: {
      placement: 'level_in_vault',
      heightAff: 108,
      match: 'custom',
      matchRoomId: null,
      width: 6,
      height: 8,
      layout: { by: 'spacing', spacing: 48 },
      length: null,
      direction: 'across_ridge',
      endDetail: 'square',
      ...attrs,
    },
  };
}

const near = (a: Point, b: Point) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

const RIDGE = { ridge: 156, plate: 96 };

describe('EZD-505 beam warnings (S05 Validation)', () => {
  it('AC-EZD-505-1 a level beam above the ridge shows a warning', () => {
    // Height AFF 13' 6" is above the 13' 0" ridge.
    expect(beamWarnings(beam({ heightAff: 162 }), RIDGE)).toEqual(['above_ridge']);
  });

  it('the board example sits between plate and ridge: no warning', () => {
    // Board: beams 9' 0", 6" x 8", walls 8' 0", ridge 13' 0".
    expect(beamWarnings(beam({ heightAff: 108 }), RIDGE)).toEqual([]);
  });

  it('the beam top must be at or under the ridge', () => {
    // 12' 4" + 8" = 13' 0": touches the ridge, fine; 12' 6" + 8" = 13' 2": above it.
    expect(beamWarnings(beam({ heightAff: 148 }), RIDGE)).toEqual([]);
    expect(beamWarnings(beam({ heightAff: 150 }), RIDGE)).toEqual(['above_ridge']);
  });

  it('the beam bottom must be at or above the wall plate', () => {
    expect(beamWarnings(beam({ heightAff: 96 }), RIDGE)).toEqual([]);
    expect(beamWarnings(beam({ heightAff: 90 }), RIDGE)).toEqual(['below_plate']);
  });

  it('only level beams in a vault are checked; unknown heights skip their check', () => {
    expect(beamWarnings(beam({ heightAff: 162, placement: 'follow_slope' }), RIDGE)).toEqual([]);
    expect(beamWarnings(beam({ heightAff: 162, placement: 'on_flat' }), RIDGE)).toEqual([]);
    expect(beamWarnings(beam({ heightAff: 162 }), { ridge: null, plate: 96 })).toEqual([]);
    expect(beamWarnings(beam({ heightAff: 90 }), { ridge: 156, plate: null })).toEqual([]);
  });

  it('reads the ridge from the room and the plate from the walls around it', () => {
    const objects: ModelObject[] = [vaultedRoom(), ...chain(1, FAMILY, 'right', LEVEL)];
    expect(beamSetWarnings(beam({ heightAff: 162 }), objects)).toEqual(['above_ridge']);
    expect(beamSetWarnings(beam({ heightAff: 90 }), objects)).toEqual(['below_plate']);
    expect(beamSetWarnings(beam({ heightAff: 108 }), objects)).toEqual([]);
  });
});

describe('EZD-505 room heights', () => {
  it('the plate is the walls around the room (8\' 0" default)', () => {
    expect(roomPlateHeight(vaultedRoom(), chain(1, FAMILY, 'right', LEVEL))).toBe(96);
  });

  it('a ceiling set per wall gives its lowest wall height', () => {
    const r = vaultedRoom();
    r.data.attributes.ceiling = {
      heightsBy: 'wall',
      wallHeights: [
        { wall: uid(1), height: 102 },
        { wall: uid(2), height: 98 },
      ],
      pointHeights: [],
      pitch: null,
      ridge: null,
    };
    expect(roomPlateHeight(r, [])).toBe(98);
  });

  it('no walls and no heights: unknown', () => {
    expect(roomPlateHeight(vaultedRoom(), [])).toBeNull();
  });

  it('the adjoining room is across one wall', () => {
    const laundry = roomObj(
      NEXT,
      [
        { x: 245.5, y: 0 },
        { x: 360, y: 0 },
        { x: 360, y: 96 },
        { x: 245.5, y: 96 },
      ],
      'Laundry',
      LEVEL,
    );
    const far = roomObj(
      uid(102),
      [
        { x: 400, y: 0 },
        { x: 500, y: 0 },
        { x: 500, y: 96 },
        { x: 400, y: 96 },
      ],
      'Far',
      LEVEL,
    );
    expect(adjoiningRoom(vaultedRoom(), [vaultedRoom(), far, laundry])?.id).toBe(NEXT);
    expect(adjoiningRoom(vaultedRoom(), [vaultedRoom(), far])).toBeNull();
  });
});

describe('EZD-505 beam layout', () => {
  it('across the ridge at 4\' 0" o.c.: 5 beams, wall to wall (board)', () => {
    const l = beamLayout(beam(), vaultedRoom().data);
    expect(l.count).toBe(5);
    expect(l.spacing).toBe(48);
    expect(l.span).toBe(240);
    [24, 72, 120, 168, 216].forEach((x, i) => {
      near(l.beams[i]!.from, { x, y: 0 });
      near(l.beams[i]!.to, { x, y: 192 });
    });
  });

  it('by count: spacing is the span shared out (4 beams in 20\' at 5\' 0")', () => {
    const l = beamLayout(beam({ layout: { by: 'count', count: 4 } }), vaultedRoom().data);
    expect(l.count).toBe(4);
    expect(l.spacing).toBe(60);
    expect(l.beams.map((b) => Math.round(b.from.x))).toEqual([30, 90, 150, 210]);
  });

  it('a spacing that does not divide the span keeps the set centred', () => {
    // 240 / 42 = 5 whole spacings: 5 beams over 168", 36" at each end.
    const l = beamLayout(beam({ layout: { by: 'spacing', spacing: 42 } }), vaultedRoom().data);
    expect(l.beams.map((b) => b.from.x)).toEqual([36, 78, 120, 162, 204].map((x) => expect.closeTo(x, 9)));
  });

  it('with the ridge: beams run east-west and are spaced across 16\'', () => {
    const l = beamLayout(beam({ direction: 'with_ridge' }), vaultedRoom().data);
    expect(l.count).toBe(4);
    [24, 72, 120, 168].forEach((y, i) => {
      near(l.beams[i]!.from, { x: 0, y });
      near(l.beams[i]!.to, { x: 240, y });
    });
  });

  it('a typed length is centred on the span', () => {
    const l = beamLayout(beam({ length: 120 }), vaultedRoom().data);
    near(l.beams[0]!.from, { x: 24, y: 36 });
    near(l.beams[0]!.to, { x: 24, y: 156 });
  });

  it('a room with no ridge takes its longest edge as the ridge direction', () => {
    const r = vaultedRoom();
    r.data.attributes.ceiling = null;
    const l = beamLayout(beam(), r.data);
    expect(l.count).toBe(5);
    near(l.beams[0]!.from, { x: 24, y: 0 });
  });

  it('outlines are the beam width wide', () => {
    const [first] = beamOutlines(beam(), vaultedRoom().data);
    expect(first!.map((p) => Math.round(p.x))).toEqual([21, 21, 27, 27]);
  });
});

describe('EZD-505 beam sets move as a set', () => {
  it('a move shifts every beam by the move across the span', () => {
    const moved = moveBeamSet(beam(), { x: 12, y: 30 });
    expect(moved.geometry.shift).toEqual({ x: 12, y: 30 });
    const l = beamLayout(moved, vaultedRoom().data);
    expect(l.beams.map((b) => Math.round(b.from.x))).toEqual([36, 84, 132, 180, 228]);
    // Wall to wall beams keep their ends on the walls.
    near(l.beams[0]!.from, { x: 36, y: 0 });
  });

  it('a beam moved out of the room is not drawn', () => {
    const l = beamLayout(moveBeamSet(beam(), { x: 30, y: 0 }), vaultedRoom().data);
    expect(l.beams).toHaveLength(4);
  });

  it('picks by the box around all its beams', () => {
    const shape = beamSetPickShape(beam(), vaultedRoom().data);
    expect(shape?.kind).toBe('quad');
    // 21" to 219" across, 0 to 192" along.
    expect(shape?.area).toBeCloseTo(198 * 192, 6);
  });
});

describe('EZD-505 a new beam set', () => {
  it('in a vault: level beams, matched to the adjoining room, board size and spacing; it parses', () => {
    const laundry = roomObj(
      NEXT,
      [
        { x: 245.5, y: 0 },
        { x: 360, y: 0 },
        { x: 360, y: 96 },
        { x: 245.5, y: 96 },
      ],
      'Laundry',
      LEVEL,
    );
    const objects: ModelObject[] = [
      vaultedRoom(),
      laundry,
      ...chain(1, FAMILY, 'right', LEVEL),
      ...chain(10, laundry.data.geometry.boundary, 'right', LEVEL),
    ];
    const data = newBeamSet(vaultedRoom(), objects, 'new');
    expect(data.attributes).toMatchObject({
      placement: 'level_in_vault',
      match: 'adjoining',
      matchRoomId: NEXT,
      heightAff: 96,
      width: 6,
      height: 8,
      layout: { by: 'spacing', spacing: 48 },
      length: null,
      direction: 'across_ridge',
      endDetail: 'square',
    });
    const parsed = parseStoredObject({ id: uid(200), type: 'beam', schema_version: 7, data });
    expect(parsed.ok).toBe(true);
  });

  it('with no adjoining room: custom, at the plate', () => {
    const objects: ModelObject[] = [vaultedRoom(), ...chain(1, FAMILY, 'right', LEVEL)];
    const data = newBeamSet(vaultedRoom(), objects, 'new');
    expect(data.attributes.match).toBe('custom');
    expect(data.attributes.matchRoomId).toBeNull();
    expect(data.attributes.heightAff).toBe(96);
  });
});
