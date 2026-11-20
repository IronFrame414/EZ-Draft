// EZD-506 Section A-A (AC-EZD-506-1 "The preview updates when Height AFF changes"). Expected values worked by hand
// from S05 Room ceiling summary "walls 8' 0" · ridge 13' 0"" (plate 96", ridge 156"), board S05Ceiling "FAMILY ROOM ·
// 320 SF" (20' x 16'), ridge east-west across the middle, "6" x 8"", "4' 0" o.c.", board section "adj. 9' 0"",
// "beams 9' 0"", "ridge 13' 0"", and the EZD-506 rows in vault/build/assumptions.md (cut square to the ridge through
// the set's middle; a level beam stops where its top meets the slope).
//
// The cut runs north-south: 192" wide, ridge at x = 96". The slope rises 60" over 96", so h(x) = 96 + 0.625 x.
// A level beam at 9' 0" (108") is 8" deep, top 116": h(x) = 116 at x = 32, so it spans 32" to 192 - 32 = 160".
import { describe, expect, it } from 'vitest';
import { roomObj, uid } from '../rooms/test-utils/fixtures';
import type { BeamData, ModelObject, Point, RoomData } from '../schema';
import { beamSection, beamSetSection } from './section';

const LEVEL = '11111111-1111-4111-8111-111111111111';
const ROOM = uid(100);
const NEXT = uid(101);
const FAMILY: Point[] = [
  { x: 0, y: 0 },
  { x: 240, y: 0 },
  { x: 240, y: 192 },
  { x: 0, y: 192 },
];
// The laundry south of the family room, across a 4" wall, with 9' 0" walls.
const LAUNDRY: Point[] = [
  { x: 0, y: 196 },
  { x: 96, y: 196 },
  { x: 96, y: 292 },
  { x: 0, y: 292 },
];

function vaulted(): { id: string; type: 'room'; data: RoomData } {
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

function beam(attrs: Partial<BeamData['attributes']> = {}): BeamData {
  return {
    geometry: { roomId: ROOM, shift: { x: 0, y: 0 } },
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

const HEIGHTS = { plate: 96, ridge: 156, adjoining: 108 };

describe('EZD-506 beamSection', () => {
  it('the vault profile: walls 8\' 0", ridge 13\' 0" in the middle', () => {
    const s = beamSection(beam(), vaulted().data, HEIGHTS);
    expect(s.width).toBe(192);
    expect(s.profile).toEqual([
      { x: 0, z: 0 },
      { x: 0, z: 96 },
      { x: 96, z: 156 },
      { x: 192, z: 96 },
      { x: 192, z: 0 },
    ]);
    expect(s.ridge).toBe(156);
    expect(s.ceiling).toBeNull();
    expect(s.adjoining).toBe(108);
    expect(s.beamHeight).toBe(108);
  });

  it('a level across-ridge beam at 9\' 0" runs from 32" to 160", 108" to 116"', () => {
    const s = beamSection(beam(), vaulted().data, HEIGHTS);
    expect(s.beams).toHaveLength(1);
    const b = s.beams[0]!;
    expect(b.map((p) => p.x)).toEqual([32, 160, 160, 32].map((v) => expect.closeTo(v, 9)));
    expect(b.map((p) => p.z)).toEqual([108, 108, 116, 116]);
  });

  it('AC-EZD-506-1: Height AFF 10\' 0" moves the beam and its label', () => {
    // Top 128": h(x) = 128 at x = 51.2, so the beam spans 51.2" to 140.8".
    const s = beamSection(beam({ heightAff: 120 }), vaulted().data, HEIGHTS);
    expect(s.beamHeight).toBe(120);
    const b = s.beams[0]!;
    expect(b.map((p) => p.z)).toEqual([120, 120, 128, 128]);
    expect(b[0]!.x).toBeCloseTo(51.2, 9);
    expect(b[1]!.x).toBeCloseTo(140.8, 9);
  });

  it('a level beam above the ridge is not drawn', () => {
    const s = beamSection(beam({ heightAff: 162 }), vaulted().data, HEIGHTS);
    expect(s.beams).toHaveLength(0);
  });

  it('with-ridge level beams show as 6" x 8" boxes at 24", 72", 120", 168"', () => {
    // 192" at 4' 0" o.c.: 4 beams, centred, end gaps 24".
    const s = beamSection(beam({ direction: 'with_ridge' }), vaulted().data, HEIGHTS);
    expect(s.beams).toHaveLength(4);
    expect(s.beams.map((b) => b[0]!.x + 3)).toEqual([24, 72, 120, 168].map((v) => expect.closeTo(v, 9)));
    for (const b of s.beams) expect(b.map((p) => p.z)).toEqual([108, 108, 116, 116]);
  });

  it('with-ridge beams that follow the slope sit tight to it: at 24" the ceiling is 111"', () => {
    const s = beamSection(
      beam({ direction: 'with_ridge', placement: 'follow_slope' }),
      vaulted().data,
      HEIGHTS,
    );
    expect(s.beamHeight).toBeNull();
    expect(s.beams[0]!.map((p) => p.z)).toEqual([103, 103, 111, 111]);
  });

  it('an across-ridge beam that follows the slope is an 8" band under it, wall to wall', () => {
    const s = beamSection(beam({ placement: 'follow_slope' }), vaulted().data, HEIGHTS);
    expect(s.beams[0]).toEqual([
      { x: 0, z: 88 },
      { x: 96, z: 148 },
      { x: 192, z: 88 },
      { x: 192, z: 96 },
      { x: 96, z: 156 },
      { x: 0, z: 96 },
    ]);
  });

  it('on a flat ceiling the beams hang 8" under it and the ceiling height is the label', () => {
    const flat = roomObj(ROOM, FAMILY, 'Family room', LEVEL).data as RoomData;
    const s = beamSection(beam({ placement: 'on_flat' }), flat, { plate: 96, ridge: null, adjoining: null });
    expect(s.ridge).toBeNull();
    expect(s.ceiling).toBe(96);
    expect(s.adjoining).toBeNull();
    // A flat room's ridge direction is its longest edge (east-west), so the cut is north-south as before.
    expect(s.profile).toEqual([
      { x: 0, z: 0 },
      { x: 0, z: 96 },
      { x: 192, z: 96 },
      { x: 192, z: 0 },
    ]);
    expect(s.beams[0]).toEqual([
      { x: 0, z: 88 },
      { x: 192, z: 88 },
      { x: 192, z: 96 },
      { x: 0, z: 96 },
    ]);
  });
});

describe('EZD-506 beamSetSection', () => {
  it('reads the adjoining room\'s finished ceiling height (9\' 0" walls)', () => {
    const room = vaulted();
    const next = roomObj(NEXT, LAUNDRY, 'Laundry', LEVEL) as { id: string; type: 'room'; data: RoomData };
    next.data.attributes.ceiling = {
      heightsBy: 'wall',
      wallHeights: [{ wall: uid(300), height: 108 }],
      pointHeights: [],
      pitch: null,
      ridge: null,
    };
    const objects = [room, next] as unknown as ModelObject[];
    const s = beamSetSection(beam(), objects)!;
    expect(s.adjoining).toBe(108);
    expect(s.ridge).toBe(156);
    // No walls drawn: the plate falls back to 8' 0".
    expect(s.plate).toBe(96);
  });

  it('is null when the room is missing', () => {
    expect(beamSetSection(beam(), [])).toBeNull();
  });
});
