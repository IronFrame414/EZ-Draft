// EZD-707 (AC-EZD-707-1 "A4.0 shows each run's elevation"; AC-EZD-707-2 "a wall with a window under a sloped ceiling
// draws both"; AC-EZD-707-3 "Add elevation adds a wall that has no cabinets"; R24). Expected values are worked by
// hand: the 16' x 12' room of the EZD-504 tests (192" x 144", 96" walls whose inner faces are the room outline) under
// a 4:12 single slope rising from 96" at the south eave to 144" at the north high edge, so the east wall's top runs
// 96" to 144" over its 144" length. A 36" x 48" window with a 36" sill centred on the east wall (72" along it) spans
// 54" to 90" along the wall and 36" to 84" up.
import { describe, expect, it } from 'vitest';
import type { CabinetBoxType, ModelObject, Point } from '../schema';
import { chain, roomObj, uid } from '../rooms/test-utils/fixtures';
import type { DrawingItem } from '../drawing/types';
import {
  elevationDrawingList,
  elevationLetter,
  elevationSubjects,
  elevationTitle,
  wallHostsElevation,
} from './wall-elevation';

const LEVEL = '11111111-1111-4111-8111-111111111111';
const BOX: Point[] = [
  { x: 0, y: 0 },
  { x: 192, y: 0 },
  { x: 192, y: 144 },
  { x: 0, y: 144 },
];
// South (0,0)-(192,0), east (192,0)-(192,144), north (192,144)-(0,144), west (0,144)-(0,0); left faces on the room.
const walls = () => chain(1, BOX, 'right', LEVEL);
const [SOUTH, EAST, NORTH, WEST] = [0, 1, 2, 3];
let n = 1000;
const nextId = () => uid(++n);

const slopedRoom = () => {
  const r = roomObj(uid(500), BOX, 'Kitchen', LEVEL);
  r.data.attributes.ceilingType = 'single_slope';
  r.data.attributes.ceiling = {
    heightsBy: 'pitch',
    wallHeights: [],
    pointHeights: [],
    pitch: 4,
    ridge: { start: { x: 0, y: 144 }, end: { x: 192, y: 144 }, height: 144 },
  };
  return r;
};

const window = (hostWallId: string, center: Point): ModelObject => ({
  id: nextId(),
  type: 'opening',
  data: {
    geometry: { center, hostWallId, axis: null },
    status: 'new',
    level: LEVEL,
    attributes: {
      kind: 'window',
      width: 36,
      height: 48,
      roughOpening: null,
      sillHeight: 36,
      swing: null,
      hand: null,
      impact: 'not_rated',
      shutterType: null,
      number: null,
    },
  },
}) as unknown as ModelObject;

const box = (code: string, width: number, boxType: CabinetBoxType = 'base'): ModelObject => ({
  id: nextId(),
  type: 'cabinet_box',
  data: {
    status: 'new',
    level: LEVEL,
    attributes: {
      code,
      boxType,
      width,
      depth: boxType === 'wall' ? 12 : 24,
      height: boxType === 'wall' ? 30 : 34.5,
      faceLayout: 'door_1',
      hingeSide: 'left',
      finishedEnds: 'none',
      catalogItemId: null,
      finish: null,
    },
  },
});

const run = (base: ModelObject[], hostWallId: string | null, start: Point, axis: Point): ModelObject => ({
  id: nextId(),
  type: 'cabinet_run',
  data: {
    geometry: { hostWallId, start, axis },
    level: LEVEL,
    attributes: { name: 'Run', base: base.map((b) => b.id), upper: [] },
  },
});

const fixture = (center: Point, axis: Point): ModelObject => ({
  id: nextId(),
  type: 'fixture',
  data: {
    geometry: { center, axis },
    status: 'new',
    level: LEVEL,
    attributes: { kind: 'toilet', width: 20, depth: 28 },
  },
});

const lines = (items: DrawingItem[], objectId: string) =>
  items
    .filter((i): i is Extract<DrawingItem, { kind: 'line' }> => i.kind === 'line' && i.objectId === objectId)
    .map((i) => [i.from.x, i.from.y, i.to.x, i.to.y, i.role]);

const OPTS = { level: LEVEL, titlePt: 9 };

describe('EZD-707 elevation subjects', () => {
  it('AC-EZD-707-1: each wall with a run gets an elevation, lettered in the order of the runs, and an island its own', () => {
    const w = walls();
    const southBase = [box('B15', 15), box('B18', 18)];
    const northBase = [box('B24', 24)];
    const island = [box('B30', 30)];
    const south = run(southBase, w[SOUTH]!.id, { x: 6, y: 0 }, { x: 1, y: 0 });
    const north = run(northBase, w[NORTH]!.id, { x: 150, y: 144 }, { x: -1, y: 0 });
    const free = run(island, null, { x: 60, y: 72 }, { x: 1, y: 0 });
    const second = run([box('B9', 9)], w[SOUTH]!.id, { x: 120, y: 0 }, { x: 1, y: 0 });
    const objects = [...w, south, north, free, second, ...southBase, ...northBase, ...island];
    expect(elevationSubjects(objects, LEVEL)).toEqual([
      { letter: 'A', wallId: w[SOUTH]!.id, side: 'left', runId: null },
      { letter: 'B', wallId: w[NORTH]!.id, side: 'left', runId: null },
      { letter: 'C', wallId: null, side: null, runId: free.id },
    ]);
  });

  it('a fixture against a wall, a wall tile layout and blocking each get their wall an elevation; a bare wall does not', () => {
    const w = walls();
    // A 20" x 28" toilet whose back is on the west wall's inner face (x = 0): centre 14" in.
    const toilet = fixture({ x: 14, y: 60 }, { x: 0, y: 1 });
    const objects = [...w, toilet];
    expect(wallHostsElevation(w[WEST]!, objects)).toBe(true);
    expect(wallHostsElevation(w[EAST]!, objects)).toBe(false);
    // 2" off the face is not against it (the gap is 1").
    expect(wallHostsElevation(w[WEST]!, [...w, fixture({ x: 16, y: 60 }, { x: 0, y: 1 })])).toBe(false);
    expect(elevationSubjects(objects, LEVEL)).toEqual([
      { letter: 'A', wallId: w[WEST]!.id, side: 'left', runId: null },
    ]);
    const blocking: ModelObject = {
      id: nextId(),
      type: 'blocking',
      data: {
        geometry: { center: { x: 192, y: 40 }, hostWallId: w[EAST]!.id, axis: null },
        status: 'new',
        level: LEVEL,
        attributes: { length: 36, heightToCenter: 34, side: 'left' },
      },
    };
    expect(wallHostsElevation(w[EAST]!, [...w, blocking])).toBe(true);
    // Blocking is drawn hidden at its centre height: 36" long about 40" along the wall (22" to 58"), at 34". Facing
    // the left face the 144" wall reads from its end to its start, so the line runs from 144 - 22 = 122 to 86.
    const list = elevationDrawingList(
      { letter: 'A', wallId: w[EAST]!.id, side: 'left', runId: null },
      [...w, blocking],
      OPTS,
    );
    expect(lines(list.items, blocking.id)).toEqual([[122, 34, 86, 34, 'hidden']]);
    // The other face of the wall does not show it.
    const back = elevationDrawingList(
      { letter: 'B', wallId: w[EAST]!.id, side: 'right', runId: null },
      [...w, blocking],
      OPTS,
    );
    expect(lines(back.items, blocking.id)).toEqual([]);
  });

  it('AC-EZD-707-3: an added wall with no cabinets follows the generated ones; an id twice or not a wall is skipped', () => {
    const w = walls();
    const base = [box('B24', 24)];
    const r = run(base, w[SOUTH]!.id, { x: 0, y: 0 }, { x: 1, y: 0 });
    const objects = [...w, r, ...base];
    expect(elevationSubjects(objects, LEVEL, [w[EAST]!.id, w[SOUTH]!.id, uid(9999), w[EAST]!.id])).toEqual([
      { letter: 'A', wallId: w[SOUTH]!.id, side: 'left', runId: null },
      { letter: 'B', wallId: w[EAST]!.id, side: 'left', runId: null },
    ]);
    // The added wall draws its outline: the east wall is 144" long and 96" high; its left face (the room side) reads
    // from the wall's end (x = 0) to its start (x = 144).
    const list = elevationDrawingList({ letter: 'B', wallId: w[EAST]!.id, side: 'left', runId: null }, objects, OPTS);
    expect(lines(list.items, w[EAST]!.id)).toEqual([
      [144, 0, 0, 0, 'cut'],
      [144, 0, 144, 96, 'cut'],
      [0, 0, 0, 96, 'cut'],
      [144, 96, 0, 96, 'cut'],
    ]);
  });

  it('letters run A to Z, then AA', () => {
    expect([0, 1, 25, 26, 27].map(elevationLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
  });
});

describe('EZD-707 elevation drawing list', () => {
  it('AC-EZD-707-2: a wall with a window under a sloped ceiling draws its cut top and the window', () => {
    const w = walls();
    const win = window(w[EAST]!.id, { x: 192, y: 72 });
    const objects = [...w, slopedRoom(), win];
    // Seen from the room (the left face) the wall's start, at the 96" eave, is on the right (x = 144) and its end,
    // at the 144" high edge, on the left (x = 0).
    const list = elevationDrawingList({ letter: 'A', wallId: w[EAST]!.id, side: 'left', runId: null }, objects, OPTS);
    expect(lines(list.items, w[EAST]!.id)).toEqual([
      [144, 0, 0, 0, 'cut'],
      [144, 0, 144, 96, 'cut'],
      [0, 0, 0, 144, 'cut'],
      [144, 96, 0, 144, 'cut'],
    ]);
    expect(lines(list.items, win.id)).toEqual([
      [54, 36, 90, 36, 'beyond'],
      [90, 36, 90, 84, 'beyond'],
      [90, 84, 54, 84, 'beyond'],
      [54, 84, 54, 36, 'beyond'],
    ]);
    const title = list.items.find((i) => i.kind === 'text');
    expect(title).toMatchObject({ text: 'ELEVATION A', at: { x: 72, y: -12 } });
    expect(elevationTitle('B')).toBe('ELEVATION B');
  });

  it("AC-EZD-707-1: a wall with a run is drawn in the run's frame with its boxes and door faces", () => {
    const w = walls();
    const base = [box('B15', 15), box('B18', 18)];
    // The run starts 6" along the south wall, so the wall runs from -6" to 186" in the run's x.
    const r = run(base, w[SOUTH]!.id, { x: 6, y: 0 }, { x: 1, y: 0 });
    const objects = [...w, r, ...base];
    const list = elevationDrawingList({ letter: 'A', wallId: w[SOUTH]!.id, side: 'left', runId: null }, objects, OPTS);
    expect(lines(list.items, w[SOUTH]!.id)[0]).toEqual([-6, 0, 186, 0, 'cut']);
    // B15: the box from 0 to 15, 4" toe kick to 34 1/2" (board S04), then its one door the same size.
    const b15 = lines(list.items, base[0]!.id);
    expect(b15.slice(0, 4)).toEqual([
      [0, 4, 15, 4, 'beyond'],
      [15, 4, 15, 34.5, 'beyond'],
      [15, 34.5, 0, 34.5, 'beyond'],
      [0, 34.5, 0, 4, 'beyond'],
    ]);
    expect(b15).toHaveLength(8);
    expect(lines(list.items, base[1]!.id)[0]).toEqual([15, 4, 33, 4, 'beyond']);
    // The run's 1 1/2" countertop over both boxes (34 1/2" to 36"), then the toe kick line at 4".
    expect(lines(list.items, r.id)).toEqual([
      [0, 34.5, 33, 34.5, 'beyond'],
      [33, 34.5, 33, 36, 'beyond'],
      [33, 36, 0, 36, 'beyond'],
      [0, 36, 0, 34.5, 'beyond'],
      [0, 4, 33, 4, 'beyond'],
    ]);
  });

  it('a run drawn the other way along its wall is mirrored into the lead run frame', () => {
    const w = walls();
    const a = [box('B24', 24)];
    const b = [box('B12', 12)];
    // The lead run reads left to right along the south wall from x = 0; the second runs back from x = 100.
    const lead = run(a, w[SOUTH]!.id, { x: 0, y: 0 }, { x: 1, y: 0 });
    const back = run(b, w[SOUTH]!.id, { x: 100, y: 0 }, { x: -1, y: 0 });
    const list = elevationDrawingList(
      { letter: 'A', wallId: w[SOUTH]!.id, side: 'left', runId: null },
      [...w, lead, back, ...a, ...b],
      OPTS,
    );
    // B12 stands from 100 back to 88 along the wall.
    expect(lines(list.items, b[0]!.id)[0]).toEqual([88, 4, 100, 4, 'beyond']);
  });

  it('AC-EZD-707-1: runs on opposite faces of one wall get an elevation each, with only their own boxes', () => {
    const w = walls();
    const k = [box('B24', 24)];
    const v = [box('V21', 21)];
    // The south wall's thickness (4 1/2") lies to its right, so its right face is the line y = -4.5. The kitchen run
    // starts on the wall's drawn line (the left face); the vanity run stands on the far face, 10" along.
    const kitchen = run(k, w[SOUTH]!.id, { x: 0, y: 0 }, { x: 1, y: 0 });
    const vanity = run(v, w[SOUTH]!.id, { x: 10, y: -4.5 }, { x: 1, y: 0 });
    const objects = [...w, kitchen, vanity, ...k, ...v];
    const subjects = elevationSubjects(objects, LEVEL);
    expect(subjects).toEqual([
      { letter: 'A', wallId: w[SOUTH]!.id, side: 'left', runId: null },
      { letter: 'B', wallId: w[SOUTH]!.id, side: 'right', runId: null },
    ]);
    const a = elevationDrawingList(subjects[0]!, objects, OPTS);
    expect(lines(a.items, k[0]!.id)[0]).toEqual([0, 4, 24, 4, 'beyond']);
    expect(lines(a.items, v[0]!.id)).toEqual([]);
    expect(lines(a.items, vanity.id)).toEqual([]);
    const b = elevationDrawingList(subjects[1]!, objects, OPTS);
    // In the vanity run's own frame its box stands from 0 to 21 and the wall runs from -10 to 182.
    expect(lines(b.items, v[0]!.id)[0]).toEqual([0, 4, 21, 4, 'beyond']);
    expect(lines(b.items, k[0]!.id)).toEqual([]);
    expect(lines(b.items, w[SOUTH]!.id)[0]).toEqual([-10, 0, 182, 0, 'cut']);
  });

  it('a tile shower against the wall draws its extent, its curb in section and the niche on that side', () => {
    const w = walls();
    // A 36" x 48" shower in the west wall's face (x = 0): side 3 runs (0,108) to (0,60) on the wall. The west wall
    // runs (0,144) to (0,0), so the side is 36" to 84" along it; facing its left face, x = 144 - distance: 108 to 60.
    // A 6" wide, 4" high curb inside side 0 (which meets side 3 at (0,60)): 60 to 66. A 14" x 24" niche 40" up,
    // centred on the 48" side: 17" to 31" from (0,108), so 53" to 67" along the wall: x = 91 to 77.
    const shower: ModelObject = {
      id: nextId(),
      type: 'tile_shower',
      data: {
        geometry: {
          footprint: [
            { x: 0, y: 60 },
            { x: 36, y: 60 },
            { x: 36, y: 108 },
            { x: 0, y: 108 },
          ],
        },
        status: 'new',
        level: LEVEL,
        attributes: {
          curb: { height: 4, width: 6 },
          niches: [{ width: 14, height: 24, bottomHeight: 40, side: 3 }],
          bench: null,
          glass: [],
          panSlope: 0.25,
          drain: { type: 'center', at: { x: 18, y: 24 } },
        },
      },
    };
    const objects = [...w, shower];
    const subjects = elevationSubjects(objects, LEVEL);
    expect(subjects).toEqual([{ letter: 'A', wallId: w[WEST]!.id, side: 'left', runId: null }]);
    const list = elevationDrawingList(subjects[0]!, objects, OPTS);
    expect(lines(list.items, shower.id)).toEqual([
      [108, 0, 108, 96, 'beyond'],
      [60, 0, 60, 96, 'beyond'],
      [77, 40, 91, 40, 'beyond'],
      [91, 40, 91, 64, 'beyond'],
      [91, 64, 77, 64, 'beyond'],
      [77, 64, 77, 40, 'beyond'],
      [60, 0, 66, 0, 'beyond'],
      [66, 0, 66, 4, 'beyond'],
      [66, 4, 60, 4, 'beyond'],
      [60, 4, 60, 0, 'beyond'],
    ]);
  });
});
