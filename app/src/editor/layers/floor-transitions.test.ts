// EZD-229 (AC-EZD-229-3; Q-0704 09-calculations "Room floor level: any finite signed value in inches, stored to 1/16"
// with the 03g halfway rule ... There is no limit"; 09q Floor level rows 1-5). Expected values from the 09q table.
// EZD-229 (AC-EZD-229-1, -4; 09q Transitions rows 1-4; Q-0704 "Transitions are derived, never stored"; "Two levels
// are the same when they differ by 1/64" or less"). Expected values come from the 09q table.
import { describe, expect, it } from 'vitest';
import { createOpeningData, wallFaceOffsets, type ModelObject } from '@ezdraft/geometry';
import {
  F1,
  roomObj,
  uid,
  wallObj,
} from '../../../../packages/geometry/src/rooms/test-utils/fixtures';
import {
  formatSignedLength,
  parseSignedLength,
  roomTransitions,
  sameFloorLevel,
  transitionsOfRoom,
} from './floor-transitions';

const WALL = uid(1);
const DOOR = uid(2);
const A = uid(10);
const B = uid(11);

// Two 120" deep rooms either side of one centred wall on x = 120, the rooms on its faces; a door in the wall at
// y = 60 when `door` is set.
function twoRooms(
  a: { level: number; finish?: string },
  b: { level: number; finish?: string },
  door = true,
): ModelObject[] {
  const wall = wallObj(WALL, { x: 120, y: 0 }, { x: 120, y: 120 }, 'center');
  // The wall runs up the y axis, so its left normal points to -x.
  const { oL, oR } = wallFaceOffsets(wall);
  const leftFace = 120 - oL;
  const rightFace = 120 - oR;
  const ra = roomObj(
    A,
    [
      { x: 0, y: 0 },
      { x: leftFace, y: 0 },
      { x: leftFace, y: 120 },
      { x: 0, y: 120 },
    ],
    'Kitchen',
  );
  ra.data.attributes.floorLevel = a.level;
  ra.data.attributes.floorFinish = a.finish ?? '';
  const rb = roomObj(
    B,
    [
      { x: rightFace, y: 0 },
      { x: 240, y: 0 },
      { x: 240, y: 120 },
      { x: rightFace, y: 120 },
    ],
    'Hall',
  );
  rb.data.attributes.floorLevel = b.level;
  rb.data.attributes.floorFinish = b.finish ?? '';
  const out: ModelObject[] = [wall, ra, rb];
  if (door)
    out.push({
      id: DOOR,
      type: 'opening',
      data: createOpeningData({ kind: 'door', host: wall, center: { x: 120, y: 60 } }),
    });
  return out;
}

// Two rooms sharing the edge x = 120 with no wall (an open plan).
function openPlan(a: { level: number; finish: string }, b: { level: number; finish: string }) {
  const ra = roomObj(
    A,
    [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 0, y: 120 },
    ],
    'Kitchen',
  );
  ra.data.attributes.floorLevel = a.level;
  ra.data.attributes.floorFinish = a.finish;
  const rb = roomObj(
    B,
    [
      { x: 120, y: 0 },
      { x: 240, y: 0 },
      { x: 240, y: 120 },
      { x: 120, y: 120 },
    ],
    'Family',
  );
  rb.data.attributes.floorLevel = b.level;
  rb.data.attributes.floorFinish = b.finish;
  return [ra, rb] as ModelObject[];
}

describe('EZD-229 roomTransitions (09q Transitions)', () => {
  it('row 1: 0 and 3/4" through a door gives 1 transition labelled 3/4"', () => {
    const objects = twoRooms({ level: 0 }, { level: 0.75 });
    const before = structuredClone(objects);
    const t = roomTransitions(objects, F1);
    expect(t).toHaveLength(1);
    expect(t[0]!.at).toBe('opening');
    expect(t[0]!.openingId).toBe(DOOR);
    expect(t[0]!.roomIds).toEqual([A, B]);
    expect(t[0]!.levelDifference).toBe(0.75);
    expect(t[0]!.label).toBe('3/4"');
    // Drawn across the door (36" default width per DEFAULT_DOOR_SIZE is not assumed: its own width).
    const door = objects.find((o) => o.id === DOOR)!;
    const width = (door.data as { attributes: { width: number } }).attributes.width;
    expect(Math.hypot(t[0]!.to.x - t[0]!.from.x, t[0]!.to.y - t[0]!.from.y)).toBeCloseTo(width, 9);
    expect((t[0]!.from.y + t[0]!.to.y) / 2).toBeCloseTo(60, 9);
    expect(t[0]!.from.x).toBeCloseTo(120, 9);
    // Nothing is stored: the objects are unchanged and no transition object exists.
    expect(objects).toEqual(before);
    expect(objects.some((o) => (o.type as string) === 'transition')).toBe(false);
  });

  it('row 2: 1/2" and 1/2" with the same finish gives none', () => {
    expect(roomTransitions(twoRooms({ level: 0.5 }, { level: 0.5 }), F1)).toEqual([]);
  });

  it('row 3: −1/2" and 1/4" gives 1 transition of 3/4"', () => {
    const t = roomTransitions(twoRooms({ level: -0.5 }, { level: 0.25 }), F1);
    expect(t).toHaveLength(1);
    expect(t[0]!.levelDifference).toBe(0.75);
    expect(t[0]!.label).toBe('3/4"');
  });

  it('row 4: same level, tile and wood, open plan with no wall gives 1 transition along the shared edge, no label', () => {
    const t = roomTransitions(
      openPlan({ level: 0, finish: 'Tile' }, { level: 0, finish: 'Wood' }),
      F1,
    );
    expect(t).toHaveLength(1);
    expect(t[0]!.at).toBe('edge');
    expect(t[0]!.levelDifference).toBeNull();
    expect(t[0]!.label).toBeNull();
    const ys = [t[0]!.from.y, t[0]!.to.y].sort((p, q) => p - q);
    expect(t[0]!.from.x).toBeCloseTo(120, 9);
    expect(t[0]!.to.x).toBeCloseTo(120, 9);
    expect(ys[0]).toBeCloseTo(0, 9);
    expect(ys[1]).toBeCloseTo(120, 9);
  });

  it('open plan with equal levels and finishes gives none', () => {
    expect(
      roomTransitions(openPlan({ level: 0, finish: 'Tile' }, { level: 0, finish: 'Tile' }), F1),
    ).toEqual([]);
  });

  it('a different finish through a door gives a transition with no level label', () => {
    const t = roomTransitions(
      twoRooms({ level: 0, finish: 'Tile' }, { level: 0, finish: 'Carpet' }),
      F1,
    );
    expect(t).toHaveLength(1);
    expect(t[0]!.label).toBeNull();
  });

  it('a wall with no opening between two rooms of different levels gives none', () => {
    expect(roomTransitions(twoRooms({ level: 0 }, { level: 0.75 }, false), F1)).toEqual([]);
  });

  it('a wall drawn along a shared edge removes the edge transition', () => {
    const objects = [
      ...openPlan({ level: 0, finish: '' }, { level: 0.75, finish: '' }),
      wallObj(WALL, { x: 120, y: 0 }, { x: 120, y: 120 }, 'center'),
    ];
    expect(roomTransitions(objects, F1)).toEqual([]);
  });

  it('levels 1/64" apart are the same; more than 1/64" apart differ', () => {
    expect(sameFloorLevel(0, 1 / 64)).toBe(true);
    expect(sameFloorLevel(0, 1 / 16)).toBe(false);
    expect(roomTransitions(openPlan({ level: 0, finish: '' }, { level: 1 / 64, finish: '' }), F1)).toEqual(
      [],
    );
  });

  it('lists the transitions of one room only', () => {
    const t = roomTransitions(twoRooms({ level: 0 }, { level: 0.75 }), F1);
    expect(transitionsOfRoom(t, A)).toHaveLength(1);
    expect(transitionsOfRoom(t, uid(99))).toHaveLength(0);
  });
});

const stored = (text: string) => {
  const r = parseSignedLength(text);
  if (!r.ok) throw new Error(`refused ${text}`);
  return r.inches;
};

describe('EZD-229 floor level (09q Floor level)', () => {
  it('row 1: 0.7" stores 11/16" (0.6875)', () => expect(stored('0.7"')).toBe(0.6875));
  it('row 2: 0 stores 0', () => expect(stored('0')).toBe(0));
  it('row 3: −1/32" stores 0 (halfway goes up)', () => {
    expect(Object.is(stored('−1/32"'), 0)).toBe(true);
    expect(Object.is(stored('-1/32"'), 0)).toBe(true);
  });
  it('row 4: −3/32" stores −1/16"', () => {
    expect(stored('−3/32"')).toBe(-0.0625);
    expect(stored('-3/32')).toBe(-0.0625);
  });
  it('row 5: 8" stores 8" (no limit)', () => expect(stored('8"')).toBe(8));
  it('has no limit either way', () => {
    expect(stored("-10'")).toBe(-120);
    expect(stored("300'")).toBe(3600);
  });
  it('refuses text that is not a length', () => {
    expect(parseSignedLength('abc').ok).toBe(false);
    expect(parseSignedLength('-').ok).toBe(false);
    expect(parseSignedLength('').ok).toBe(false);
  });
  it('shows a signed value at 1/16"', () => {
    expect(formatSignedLength(0.75, 16)).toBe('3/4"');
    expect(formatSignedLength(-0.0625, 16)).toBe('−1/16"');
    expect(formatSignedLength(0, 16)).toBe('0"');
  });
});
