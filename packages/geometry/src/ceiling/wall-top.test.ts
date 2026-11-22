// EZD-504 walls cut under slopes (AC-EZD-504-1 "the wall-top profile of a wall under a 4:12 slope matches the ceiling
// heights at both ends"; S05 States; 09e). Expected heights are worked by hand: a 16' x 12' room (192" x 144") with
// 96" walls (walls/wall.ts DEFAULT_WALL_HEIGHT_IN) whose inner faces are the room outline. A 4:12 single slope rises
// 4" per 12" of run, so over the 144" run from the south eave to the north high edge it rises 48": 96" to 144". A
// 4:12 vault with the ridge down the middle rises 24" over each 72" half: 96" to 120".
// AC-EZD-504-2 (the elevation draws it in EZD-707): EZD-707 is not built in this phase (vault/build/assumptions.md
// EZD-504 row); the last test pins the export it will read.
import { describe, expect, it } from 'vitest';
import * as geometry from '../index';
import { chain, roomObj, uid, wallObj } from '../rooms/test-utils/fixtures';
import type { CeilingType, Point, RoomCeiling } from '../schema';
import { wallTopProfile } from './wall-top';

const LEVEL = '11111111-1111-4111-8111-111111111111';
const ROOM = uid(500);
const BOX: Point[] = [
  { x: 0, y: 0 },
  { x: 192, y: 0 },
  { x: 192, y: 144 },
  { x: 0, y: 144 },
];
// Walked counter-clockwise with thickness on the right, so each wall's left face lies on the room outline:
// south (0,0)-(192,0), east (192,0)-(192,144), north (192,144)-(0,144), west (0,144)-(0,0).
const walls = () => chain(1, BOX, 'right', LEVEL);
const [SOUTH, EAST, NORTH, WEST] = [0, 1, 2, 3];

function room(
  type: CeilingType | null,
  ridge: RoomCeiling['ridge'],
  id = ROOM,
  boundary: Point[] = BOX,
): ReturnType<typeof roomObj> {
  const r = roomObj(id, boundary, 'Living', LEVEL);
  r.data.attributes.ceilingType = type;
  r.data.attributes.ceiling =
    ridge === null
      ? null
      : { heightsBy: 'pitch', wallHeights: [], pointHeights: [], pitch: 4, ridge };
  return r;
}

// Single slope, high edge along the north side at 144".
const slope = () =>
  room('single_slope', { start: { x: 0, y: 144 }, end: { x: 192, y: 144 }, height: 144 });
// Vaulted, ridge east-west through the middle (y = 72) at 120".
const vault = () =>
  room('vaulted', { start: { x: 0, y: 72 }, end: { x: 192, y: 72 }, height: 120 });

describe('EZD-504 wallTopProfile', () => {
  it('AC-EZD-504-1: a wall under a 4:12 slope runs from the eave height to the high-edge height', () => {
    const w = walls();
    const objects = [...w, slope()];
    // East wall, start at the south eave (96"), end at the north high edge (144").
    expect(wallTopProfile(w[EAST]!, objects)).toEqual([
      [0, 96],
      [144, 144],
    ]);
    // West wall runs the other way: north (144") to south (96").
    expect(wallTopProfile(w[WEST]!, objects)).toEqual([
      [0, 144],
      [144, 96],
    ]);
  });

  it('heights by point: the low side is the lowest stored point, not the walls', () => {
    // Corners read 92" on the south side and 140" on the north (the scan reading, EZD-503): 48" over 144", 4:12.
    const w = walls();
    const r = room('single_slope', { start: { x: 0, y: 144 }, end: { x: 192, y: 144 }, height: 140 });
    r.data.attributes.ceiling = {
      ...r.data.attributes.ceiling!,
      heightsBy: 'point',
      pitch: null,
      pointHeights: [
        { at: { x: 0, y: 0 }, height: 92 },
        { at: { x: 192, y: 0 }, height: 92 },
        { at: { x: 192, y: 144 }, height: 140 },
        { at: { x: 0, y: 144 }, height: 140 },
      ],
    };
    expect(wallTopProfile(w[EAST]!, [...w, r])).toEqual([
      [0, 92],
      [144, 140],
    ]);
  });

  it('walls along the low and high edges are level at those heights', () => {
    const w = walls();
    const objects = [...w, slope()];
    expect(wallTopProfile(w[SOUTH]!, objects)).toEqual([
      [0, 96],
      [192, 96],
    ]);
    expect(wallTopProfile(w[NORTH]!, objects)).toEqual([
      [0, 144],
      [192, 144],
    ]);
  });

  it('a gable wall under a 4:12 vault peaks at the ridge', () => {
    const w = walls();
    expect(wallTopProfile(w[EAST]!, [...w, vault()])).toEqual([
      [0, 96],
      [72, 120],
      [144, 96],
    ]);
  });

  it('a wall reaching past the room outline keeps the corner height past it', () => {
    // A 4.5" centre wall from 2.25" south of the room to 2.25" north of it, its west face on the east outline.
    const w = walls();
    const long = wallObj(uid(9), { x: 194.25, y: -2.25 }, { x: 194.25, y: 146.25 }, 'center', LEVEL);
    expect(wallTopProfile(long, [...w, long, slope()])).toEqual([
      [0, 96],
      [2.25, 96],
      [146.25, 144],
      [148.5, 144],
    ]);
  });

  it('flat, tray and coffered ceilings, and a slope with no ridge, cut nothing', () => {
    const w = walls();
    for (const type of ['flat', 'tray', 'coffered', null] as const)
      expect(wallTopProfile(w[EAST]!, [...w, room(type, null)])).toBeNull();
    expect(wallTopProfile(w[EAST]!, [...w, room('single_slope', null)])).toBeNull();
  });

  it('a wall not on the sloped room keeps its own height', () => {
    const w = walls();
    const away = wallObj(uid(9), { x: 400, y: 0 }, { x: 400, y: 144 }, 'right', LEVEL);
    expect(wallTopProfile(away, [...w, away, slope()])).toBeNull();
  });

  it('a wall between two sloped rooms takes the higher ceiling at each point', () => {
    // A 4.5" centre wall at x = 98.25 between room A (x 0 to 96, high edge north at 144") and room B (x 100.5 to
    // 196.5, high edge south at 144"), both 4:12 over 144": A rises south to north, B falls. They cross at 120"
    // halfway (72"), so the wall's top is 144" at both ends and 120" in the middle.
    const shared = wallObj(uid(9), { x: 98.25, y: 0 }, { x: 98.25, y: 144 }, 'center', LEVEL);
    const a = room(
      'single_slope',
      { start: { x: 0, y: 144 }, end: { x: 96, y: 144 }, height: 144 },
      uid(501),
      [
        { x: 0, y: 0 },
        { x: 96, y: 0 },
        { x: 96, y: 144 },
        { x: 0, y: 144 },
      ],
    );
    const b = room(
      'single_slope',
      { start: { x: 100.5, y: 0 }, end: { x: 196.5, y: 0 }, height: 144 },
      uid(502),
      [
        { x: 100.5, y: 0 },
        { x: 196.5, y: 0 },
        { x: 196.5, y: 144 },
        { x: 100.5, y: 144 },
      ],
    );
    expect(wallTopProfile(shared, [shared, a, b])).toEqual([
      [0, 144],
      [72, 120],
      [144, 144],
    ]);
  });

  it('AC-EZD-504-2: the profile is exported from the geometry package for the elevations (EZD-707)', () => {
    expect(geometry.wallTopProfile).toBe(wallTopProfile);
  });
});
