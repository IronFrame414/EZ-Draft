// EZD-514 Framing known and keep-clear (AC-EZD-514-1 "With Unknown there is no warning"; AC-EZD-514-2 "with entered
// lines a can on a joist warns"; S05 Validation "Keep-clear warning when a can lands on a joist or beam. Only where
// joist/beam locations are known (new construction, full demo, or user-entered). Otherwise no warning."). Expected
// values are worked by hand: a 12' x 10' room (144" x 120"); a can is 4" across (board S05Ceiling "A 4" can"), so it
// reaches 2" from its point; a joist is a 2x, 1 1/2" wide, so its band reaches 3/4" from its line (2 3/4" in all); a
// beam is 3 1/2" wide (reach 2" + 1 3/4" = 3 3/4") (vault/build/assumptions.md EZD-514).
import { describe, expect, it } from 'vitest';
import { roomObj, uid } from '../rooms/test-utils/fixtures';
import {
  roomDataSchema,
  type FramingKnown,
  type FramingLine,
  type ModelObject,
  type Point,
} from '../schema';
import { framingLineDistance, keepClearIds, keepClearWarning } from './keep-clear';

const LEVEL = '11111111-1111-4111-8111-111111111111';
const ROOM = uid(514);
const CAN = uid(507);
const BOX: Point[] = [
  { x: 0, y: 0 },
  { x: 144, y: 0 },
  { x: 144, y: 120 },
  { x: 0, y: 120 },
];
// Joists running east-west, the first drawn at y = 24, repeating 16" on center: y = 8, 24, 40, 56, 72, 88, 104.
const JOISTS: FramingLine = {
  kind: 'joist',
  start: { x: 0, y: 24 },
  end: { x: 144, y: 24 },
  spacing: 16,
};
// One beam north-south down the middle, x = 72, wall to wall.
const BEAM: FramingLine = {
  kind: 'beam',
  start: { x: 72, y: 0 },
  end: { x: 72, y: 120 },
  spacing: null,
};

function room(known: FramingKnown | null, lines: FramingLine[] = []): ModelObject {
  const r = roomObj(ROOM, BOX, 'Kitchen', LEVEL);
  if (known !== null) r.data.attributes.framing = { known, lines };
  return r;
}

function can(at: Point, status = 'new', kind = 'recessed_light'): ModelObject {
  return {
    id: CAN,
    type: 'device',
    data: { geometry: { point: at }, status, level: LEVEL, attributes: { kind } },
  } as ModelObject;
}

const warn = (r: ModelObject, c: ModelObject) => keepClearWarning(c, [r, c]);

describe('EZD-514 framing on the room', () => {
  it('stores the choice and the lines, and a room without framing still parses', () => {
    const r = room('entered', [JOISTS, BEAM]);
    expect(roomDataSchema.safeParse(r.data).success).toBe(true);
    expect(roomDataSchema.safeParse(room(null).data).success).toBe(true);
  });

  it('refuses a line with no length and a spacing of zero', () => {
    const point = room('entered', [{ ...JOISTS, end: JOISTS.start }]);
    const zero = room('entered', [{ ...JOISTS, spacing: 0 }]);
    expect(roomDataSchema.safeParse(point.data).success).toBe(false);
    expect(roomDataSchema.safeParse(zero.data).success).toBe(false);
  });
});

describe('EZD-514 keep-clear warning', () => {
  it('AC-EZD-514-1: with Unknown there is no warning, even with a can on a drawn joist', () => {
    expect(warn(room('unknown', [JOISTS]), can({ x: 60, y: 40 }))).toBeNull();
    expect(warn(room(null), can({ x: 60, y: 40 }))).toBeNull();
  });

  it('AC-EZD-514-2: with entered lines a can on a joist warns', () => {
    // y = 40 is the third joist (24 + 16).
    expect(warn(room('entered', [JOISTS]), can({ x: 60, y: 40 }))).toEqual({
      roomId: ROOM,
      line: 0,
      kind: 'joist',
    });
  });

  it('a can between joists is clear; one overlapping a joist band warns; exactly touching is clear', () => {
    const r = room('entered', [JOISTS]);
    // Halfway between y = 40 and y = 56: 8" off each.
    expect(warn(r, can({ x: 60, y: 48 }))).toBeNull();
    // 2 1/2" off the y = 40 joist, under the 2 3/4" reach.
    expect(warn(r, can({ x: 60, y: 42.5 }))?.kind).toBe('joist');
    // 2 3/4" off: the can's edge meets the joist's face.
    expect(warn(r, can({ x: 60, y: 42.75 }))).toBeNull();
    // Below the first drawn line too: y = 8 is a repeat the other way.
    expect(warn(r, can({ x: 60, y: 9 }))?.kind).toBe('joist');
  });

  it('a beam line warns at its own width and names the nearest line', () => {
    const r = room('entered', [JOISTS, BEAM]);
    // 3" off the beam's line, under the 3 3/4" reach; 12" from the nearest joist (y = 72).
    expect(warn(r, can({ x: 75, y: 60 }))).toEqual({ roomId: ROOM, line: 1, kind: 'beam' });
    // 4" off the beam, 4" off the y = 56 joist: clear.
    expect(warn(r, can({ x: 76, y: 60 }))).toBeNull();
  });

  it('a single line with no spacing ends at its end point', () => {
    const half: FramingLine = { ...BEAM, end: { x: 72, y: 60 } };
    const r = room('entered', [half]);
    // 2" past the end, under the 3 3/4" reach.
    expect(warn(r, can({ x: 72, y: 62 }))?.kind).toBe('beam');
    // 4" past the end: clear.
    expect(warn(r, can({ x: 72, y: 64 }))).toBeNull();
    expect(framingLineDistance({ x: 72, y: 64 }, half)).toBeCloseTo(4, 9);
  });

  it('New construction and Full demo turn the checks on as Enter locations does', () => {
    expect(warn(room('new_construction', [JOISTS]), can({ x: 60, y: 40 }))?.kind).toBe('joist');
    expect(warn(room('full_demo', [JOISTS]), can({ x: 60, y: 40 }))?.kind).toBe('joist');
  });

  it('checks only recessed lights that stay, and only in a room', () => {
    const r = room('entered', [JOISTS]);
    expect(warn(r, can({ x: 60, y: 40 }, 'demo'))).toBeNull();
    expect(warn(r, can({ x: 60, y: 40 }, 'new', 'ceiling_fan'))).toBeNull();
    expect(warn(r, can({ x: 200, y: 40 }))).toBeNull();
    expect(keepClearIds([r, can({ x: 60, y: 40 })])).toEqual([CAN]);
  });
});
