// EZD-1998 (AC-EZD-1998-2 "a hand-written check with the same rules and tests ... the offline copy is still
// validated before use"): checkRooms answers exactly as rooms.ts roomsSchema for one table of inputs. Expected
// values come from roomsSchema itself (the rules S17b and EZD-1415/1419 set) and the limits there: canvas 300 x 180,
// lengths 0 to 12000", 60 corners, 40 rooms, names 1 to 40 characters after trimming, ids [A-Za-z0-9_-]{1,40}.
import { describe, expect, it } from 'vitest';
import { checkRoom, checkRooms } from './room-check';
import {
  emptyRoom,
  initialRooms,
  roomSchema,
  roomsSchema,
  withOutline,
  withShape,
  type FieldRoom,
} from './rooms';

const building = initialRooms()[0]!;
const rect: FieldRoom = {
  ...withShape(emptyRoom('r1', 'room', 'Kitchen'), 'rectangle'),
  lengths: [144, 120, 144, 120],
};
const walls: FieldRoom = withOutline(
  withShape(emptyRoom('r2', 'room', 'Hall'), 'walls'),
  [
    { x: 10, y: 10 },
    { x: 100, y: 10 },
    { x: 100, y: 80 },
  ],
  true,
);

const ROOMS: Array<[string, unknown]> = [
  ['a measured rectangle', rect],
  ['a closed free outline', walls],
  ['the empty Building', building],
  ['a name with spaces is trimmed', { ...rect, name: '  Kitchen  ' }],
  ['a name of only spaces', { ...rect, name: '   ' }],
  ['a name of 40 characters', { ...rect, name: 'x'.repeat(40) }],
  ['a name of 41 characters', { ...rect, name: 'x'.repeat(41) }],
  ['40 characters after trimming', { ...rect, name: ` ${'x'.repeat(40)} ` }],
  ['an unknown key', { ...rect, extra: 1 }],
  ['a missing key', Object.fromEntries(Object.entries(rect).filter(([k]) => k !== 'ceiling'))],
  ['an id with a space', { ...rect, id: 'r 1' }],
  ['an id of 41 characters', { ...rect, id: 'a'.repeat(41) }],
  ['an empty id', { ...rect, id: '' }],
  ['an unknown kind', { ...rect, kind: 'closet' }],
  ['an unknown shape', { ...rect, shape: 'circle' }],
  ['a length of 12000"', { ...rect, lengths: [12000, 120, 144, 120] }],
  ['a length over 12000"', { ...rect, lengths: [12000.5, 120, 144, 120] }],
  ['a negative length', { ...rect, lengths: [-1, 120, 144, 120] }],
  ['a NaN length', { ...rect, lengths: [Number.NaN, 120, 144, 120] }],
  ['an infinite length', { ...rect, lengths: [Number.POSITIVE_INFINITY, 120, 144, 120] }],
  ['a length as text', { ...rect, lengths: ['144', 120, 144, 120] }],
  ['a ceiling of 96"', { ...rect, ceiling: 96 }],
  ['a ceiling as text', { ...rect, ceiling: '96' }],
  ['three lengths on a rectangle', { ...rect, lengths: [144, 120, 144] }],
  ['corners on a rectangle', { ...rect, corners: [{ x: 1, y: 1 }] }],
  ['an open rectangle', { ...rect, closed: false }],
  ['a closed room with no shape', { ...building, closed: true }],
  ['closed as text', { ...rect, closed: 'true' }],
  [
    'a corner with an extra key keeps x and y',
    { ...walls, corners: walls.corners.map((c) => ({ ...c, z: 1 })) },
  ],
  [
    'a corner on the canvas edge',
    {
      ...walls,
      corners: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 180 },
      ],
    },
  ],
  [
    'a corner off the canvas',
    {
      ...walls,
      corners: [
        { x: 0, y: 0 },
        { x: 301, y: 0 },
        { x: 300, y: 180 },
      ],
    },
  ],
  [
    'a corner below zero',
    {
      ...walls,
      corners: [
        { x: -1, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 180 },
      ],
    },
  ],
  ['a corner as an array', { ...walls, corners: [[0, 0], { x: 300, y: 0 }, { x: 300, y: 180 }] }],
  [
    '61 corners',
    { ...walls, corners: Array.from({ length: 61 }, (_, i) => ({ x: i, y: 0 })), closed: false },
  ],
  ['a room as an array', [rect]],
  ['null', null],
  ['a string', 'Kitchen'],
];

const SETS: Array<[string, unknown]> = [
  ['the Building alone', [building]],
  ['the Building and two rooms', [building, rect, walls]],
  ['no rooms', []],
  ['a room first', [rect, building]],
  ['two Buildings', [building, { ...building, id: 'building2' }]],
  ['a repeated id', [building, rect, { ...walls, id: 'r1' }]],
  ['40 rooms', [building, ...Array.from({ length: 39 }, (_, i) => ({ ...rect, id: `r${i}` }))]],
  ['41 rooms', [building, ...Array.from({ length: 40 }, (_, i) => ({ ...rect, id: `r${i}` }))]],
  ['one bad room', [building, { ...rect, name: '' }]],
  ['not an array', { 0: building }],
  ['undefined', undefined],
];

const zodAnswer = (schema: typeof roomSchema | typeof roomsSchema, v: unknown) => {
  const r = schema.safeParse(v);
  return r.success ? r.data : null;
};

describe('EZD-1998 the saved-copy check without zod answers as roomsSchema', () => {
  it.each(ROOMS)('one room: %s', (_name, v) => {
    expect(checkRoom(v)).toEqual(zodAnswer(roomSchema, v));
  });

  it.each(SETS)('rooms: %s', (_name, v) => {
    expect(checkRooms(v)).toEqual(zodAnswer(roomsSchema, v));
  });

  it('the table covers both answers', () => {
    const answers = [...ROOMS.map(([, v]) => checkRoom(v)), ...SETS.map(([, v]) => checkRooms(v))];
    expect(answers.filter((a) => a === null).length).toBeGreaterThan(10);
    expect(answers.filter((a) => a !== null).length).toBeGreaterThan(5);
  });

  it('names come back trimmed and corners keep only x and y, as the schema reads them', () => {
    expect(checkRoom({ ...rect, name: '  Kitchen  ' })?.name).toBe('Kitchen');
    const withZ = { ...walls, corners: walls.corners.map((c) => ({ ...c, z: 1 })) };
    expect(checkRoom(withZ)?.corners).toEqual(walls.corners);
  });
});
