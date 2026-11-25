// EZD-515 fan clearance and hosted flags (AC-EZD-515-1 "A fan closer than the clearance warns"; S05 Validation
// "Ceiling fan blade clearance to walls and beams: warning when closer than the clearance in company settings under
// Defaults", "Hosted ceiling item left off any ceiling surface: red flag"). The clearance is the owner's Defaults value
// (S05 Decision 4), so the tests set it as fixture input. Expected gaps are worked by hand: a 12' x 10' room
// (144" x 120") whose walls' inner faces are the room outline, a fan's blade circle radius half its span (52" default,
// board S05Ceiling "F Fan 52""), and the gap is centre-to-face distance less the radius (vault/build/assumptions.md
// EZD-515).
import { describe, expect, it } from 'vitest';
import { chain, roomObj, uid } from '../rooms/test-utils/fixtures';
import type { BeamData, ModelObject, Point } from '../schema';
import {
  fanClearanceWarnings,
  hostedCeilingPoint,
  isOffCeiling,
  offCeilingIds,
} from './fan-clearance';

const LEVEL = '11111111-1111-4111-8111-111111111111';
const ROOM = uid(500);
const FAN = uid(515);
const BEAM = uid(505);
const BOX: Point[] = [
  { x: 0, y: 0 },
  { x: 144, y: 0 },
  { x: 144, y: 120 },
  { x: 0, y: 120 },
];
// Walked counter-clockwise with thickness on the right, so each wall's left face lies on the room outline.
const walls = () => chain(1, BOX, 'right', LEVEL);
const room = () => roomObj(ROOM, BOX, 'Bedroom', LEVEL);

function fan(at: Point, extra: Record<string, unknown> = {}, status = 'new'): ModelObject {
  return {
    id: FAN,
    type: 'device',
    data: {
      geometry: { point: at },
      status,
      level: LEVEL,
      attributes: { kind: 'ceiling_fan', ...extra },
    },
  } as ModelObject;
}

// One beam by count, so it runs north-south down the middle: centre line x = 72, 6" wide (x 69 to 75).
function beamSet(status: BeamData['status'] = 'new'): ModelObject {
  return {
    id: BEAM,
    type: 'beam',
    data: {
      geometry: { roomId: ROOM, shift: { x: 0, y: 0 } },
      status,
      level: LEVEL,
      attributes: {
        placement: 'on_flat',
        heightAff: 96,
        match: 'custom',
        matchRoomId: null,
        width: 6,
        height: 8,
        layout: { by: 'count', count: 1 },
        length: null,
        direction: 'across_ridge',
        endDetail: 'square',
      },
    },
  };
}

describe('EZD-515 fan blade clearance (S05 Validation)', () => {
  it('AC-EZD-515-1 a fan closer than the clearance to a wall warns', () => {
    // Centre 40" from the south wall face, radius 26": the blade tip is 14" off the wall, under 18".
    const f = fan({ x: 60, y: 40 });
    const all = [...walls(), room(), f];
    expect(fanClearanceWarnings(f, all, 18)).toEqual([
      { against: 'wall', objectId: uid(1), gap: 14 },
    ]);
  });

  it('a gap exactly at the clearance does not warn; a larger gap does not either', () => {
    const at = fan({ x: 60, y: 44 }); // 44 - 26 = 18
    expect(fanClearanceWarnings(at, [...walls(), room(), at], 18)).toEqual([]);
    const middle = fan({ x: 72, y: 60 }); // 60 - 26 = 34
    expect(fanClearanceWarnings(middle, [...walls(), room(), middle], 18)).toEqual([]);
  });

  it('the fan’s own blade span sets the radius', () => {
    // A 36" fan at the same spot: 40 - 18 = 22, clear of 18"; a 60" fan: 40 - 30 = 10.
    const small = fan({ x: 60, y: 40 }, { bladeSpan: 36 });
    expect(fanClearanceWarnings(small, [...walls(), room(), small], 18)).toEqual([]);
    const big = fan({ x: 60, y: 40 }, { bladeSpan: 60 });
    expect(fanClearanceWarnings(big, [...walls(), room(), big], 18)).toEqual([
      { against: 'wall', objectId: uid(1), gap: 10 },
    ]);
  });

  it('AC-EZD-515-1 a fan closer than the clearance to a beam warns', () => {
    // Centre x 105: the beam's east edge (x 75) is 30" away, so the tip is 4" off it, under 6". The nearest wall
    // (east, x 144) is 39" away: 13" clear.
    const f = fan({ x: 105, y: 60 });
    expect(fanClearanceWarnings(f, [...walls(), room(), beamSet(), f], 6)).toEqual([
      { against: 'beam', objectId: BEAM, gap: 4 },
    ]);
  });

  it('a blade reaching over a beam reads a gap of 0', () => {
    const f = fan({ x: 90, y: 60 }); // 15" from the beam edge, radius 26"
    expect(fanClearanceWarnings(f, [...walls(), room(), beamSet(), f], 6)).toEqual([
      { against: 'beam', objectId: BEAM, gap: 0 },
    ]);
  });

  it('no clearance set (Not set) means no check', () => {
    const f = fan({ x: 60, y: 10 });
    expect(fanClearanceWarnings(f, [...walls(), room(), beamSet(), f], null)).toEqual([]);
  });

  it('demo walls, demo beams and a demo fan take no part', () => {
    const demoWalls = walls().map((w) => ({ ...w, data: { ...w.data, status: 'demo' as const } }));
    const f = fan({ x: 105, y: 60 });
    expect(fanClearanceWarnings(f, [...demoWalls, room(), beamSet('demo'), f], 18)).toEqual([]);
    const gone = fan({ x: 60, y: 40 }, {}, 'demo');
    expect(fanClearanceWarnings(gone, [...walls(), room(), gone], 18)).toEqual([]);
  });

  it('a light is not checked', () => {
    const light = {
      ...fan({ x: 60, y: 10 }),
      data: { ...(fan({ x: 60, y: 10 }).data as object), attributes: { kind: 'recessed_light' } },
    } as ModelObject;
    expect(fanClearanceWarnings(light, [...walls(), room(), light], 18)).toEqual([]);
  });
});

describe('EZD-515 hosted ceiling item off any ceiling (S05 Validation)', () => {
  const detector = (at: Point): ModelObject =>
    ({
      id: uid(600),
      type: 'device',
      data: {
        geometry: { point: at },
        status: 'new',
        level: LEVEL,
        attributes: { kind: 'smoke_detector' },
      },
    }) as ModelObject;
  const rect = (type: 'access' | 'hvac', kind: string, at: Point): ModelObject =>
    ({
      id: uid(601),
      type,
      data: {
        geometry: { center: at, axis: { x: 1, y: 0 } },
        status: 'new',
        level: LEVEL,
        attributes: { kind, width: 24, depth: 24 },
      },
    }) as ModelObject;

  it('an item outside every room outline is off the ceiling', () => {
    const out = detector({ x: 200, y: 60 });
    expect(isOffCeiling(out, [room(), out])).toBe(true);
    const hatch = rect('access', 'attic_hatch', { x: -30, y: 60 });
    expect(isOffCeiling(hatch, [room(), hatch])).toBe(true);
    const register = rect('hvac', 'supply', { x: 72, y: 200 });
    expect(isOffCeiling(register, [room(), register])).toBe(true);
  });

  it('an item inside a room, or on its outline, is on the ceiling', () => {
    const inside = detector({ x: 72, y: 60 });
    expect(isOffCeiling(inside, [room(), inside])).toBe(false);
    const edge = detector({ x: 0, y: 60 });
    expect(isOffCeiling(edge, [room(), edge])).toBe(false);
  });

  it('a room on another floor does not hold the item', () => {
    const other = roomObj(ROOM, BOX, 'Bedroom', '22222222-2222-4222-8222-222222222222');
    const d = detector({ x: 72, y: 60 });
    expect(isOffCeiling(d, [other, d])).toBe(true);
  });

  it('equipment and wall devices are not hosted ceiling items', () => {
    const condenser = rect('hvac', 'condenser', { x: 300, y: 60 });
    expect(hostedCeilingPoint(condenser)).toBeNull();
    expect(isOffCeiling(condenser, [room(), condenser])).toBe(false);
    const all = [room(), condenser, detector({ x: 300, y: 0 })];
    expect(offCeilingIds(all)).toEqual([uid(600)]);
  });
});
