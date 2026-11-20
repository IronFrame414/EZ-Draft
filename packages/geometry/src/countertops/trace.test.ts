// EZD-412 (AC-EZD-412-1 "Trace over two runs makes pieces A and B"; S04b Trace cabinets "Creates tops automatically
// from cabinet runs with default overhangs | Disabled when no cabinets"; Defaults → Countertops Standard 1 1/2",
// Against wall 0 + splash). Expected numbers are hand counts from the room below, not from running the code.
//
// The room (model y up): back wall on y = 0 from x = 0 to 144, left wall on x = 0, right wall on x = 144, each 4 1/2"
// thick with its body outside the room. Run 1 "Back wall" stands on the back wall from the left corner: four 36" base
// boxes, 24" deep, so it runs wall to wall (144"). Run 2 "Left return" stands on the left wall from the front of run 1
// (y = 24): a 30" and a 33" base box, 24" deep (63").
//   Piece A: back against the wall (0), both ends against the side walls (0), front 24 + 1 1/2 = 25 1/2.
//            144 x 25 1/2, edges [wall, wall, exposed, wall]; 3672 sq in; exposed 144".
//   Piece B: depth 25 1/2 (x 0 to 25 1/2); its start end butts run 1 and stops at A's front (y = 25 1/2); its far
//            end is open: 24 + 63 + 1 1/2 = 88 1/2. 63 x 25 1/2 (board S04b "Left return 63 x 25 1/2"); edges
//            [wall, exposed, exposed, wall (joint)]; 1606.5 sq in; exposed 63 + 25 1/2 = 88 1/2".
import { describe, expect, it } from 'vitest';
import type { ModelObject, Point } from '../schema';
import { countertopExposedEdgeIn, countertopPieceAreaSqIn } from './piece';
import {
  canTraceCountertops,
  cabinetFootprints,
  COUNTERTOP_DEFAULT_THICKNESS,
  traceCountertops,
} from './trace';

const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DEFAULTS = { standard: 1.5, againstWall: 0 };

const wall = (n: number, start: Point, end: Point): ModelObject => ({
  id: id(n),
  type: 'wall',
  data: {
    geometry: { start, end },
    status: 'new',
    level: LEVEL,
    attributes: {
      thickness: 4.5,
      thicknessSide: 'right',
      height: 96,
      topCutToCeiling: false,
      bearing: false,
      layers: [
        { material: 'drywall', thickness: 0.5 },
        { material: 'stud', thickness: 3.5 },
        { material: 'drywall', thickness: 0.5 },
      ],
    },
  },
});

const box = (n: number, code: string, width: number, boxType = 'base'): ModelObject =>
  ({
    id: id(n),
    type: 'cabinet_box',
    data: {
      status: 'new',
      level: LEVEL,
      attributes: {
        code,
        boxType,
        width,
        depth: 24,
        height: boxType === 'tall' ? 84 : 34.5,
        faceLayout: 'drawer_door_1',
        hingeSide: 'left',
        finishedEnds: 'none',
        catalogItemId: null,
        finish: null,
      },
    },
  }) as ModelObject;

const run = (
  n: number,
  name: string,
  hostWallId: string | null,
  start: Point,
  axis: Point,
  base: string[],
): ModelObject => ({
  id: id(n),
  type: 'cabinet_run',
  data: {
    geometry: { hostWallId, start, axis },
    level: LEVEL,
    attributes: { name, base, upper: [] },
  },
});

const BACK = wall(1, { x: 0, y: 0 }, { x: 144, y: 0 });
const LEFT = wall(2, { x: 0, y: 96 }, { x: 0, y: 0 });
const RIGHT = wall(3, { x: 144, y: 0 }, { x: 144, y: 96 });
const RUN1 = run(10, 'Back wall', BACK.id, { x: 0, y: 0 }, { x: 1, y: 0 }, [
  id(11),
  id(12),
  id(13),
  id(14),
]);
const RUN2 = run(20, 'Left return', LEFT.id, { x: 0, y: 24 }, { x: 0, y: 1 }, [id(21), id(22)]);
const ROOM: ModelObject[] = [
  BACK,
  LEFT,
  RIGHT,
  RUN1,
  box(11, 'B36', 36),
  box(12, 'B36', 36),
  box(13, 'SB36', 36),
  box(14, 'B36', 36),
  RUN2,
  box(21, 'B30', 30),
  box(22, 'B33', 33),
];

const bounds = (outline: readonly Point[]) => ({
  minX: Math.min(...outline.map((p) => p.x)),
  maxX: Math.max(...outline.map((p) => p.x)),
  minY: Math.min(...outline.map((p) => p.y)),
  maxY: Math.max(...outline.map((p) => p.y)),
});

describe('EZD-412 Trace cabinets', () => {
  it('AC-EZD-412-1: trace over two runs makes pieces A and B', () => {
    const pieces = traceCountertops(ROOM, LEVEL, DEFAULTS);
    expect(pieces.map((p) => p.attributes.label)).toEqual(['A', 'B']);
    expect(pieces.map((p) => p.attributes.name)).toEqual(['Back wall', 'Left return']);
    const [a, b] = pieces as [(typeof pieces)[0], (typeof pieces)[0]];

    expect(bounds(a.geometry.outline)).toEqual({ minX: 0, maxX: 144, minY: 0, maxY: 25.5 });
    expect(a.attributes.edges.map((e) => e.kind)).toEqual(['wall', 'wall', 'exposed', 'wall']);
    expect(a.attributes.edges.map((e) => e.overhang)).toEqual([0, 0, 1.5, 0]);
    expect(countertopPieceAreaSqIn(a)).toBeCloseTo(3672, 9);
    expect(countertopExposedEdgeIn(a)).toBeCloseTo(144, 9);

    expect(bounds(b.geometry.outline)).toEqual({ minX: 0, maxX: 25.5, minY: 25.5, maxY: 88.5 });
    expect(b.attributes.edges.map((e) => e.kind)).toEqual(['wall', 'exposed', 'exposed', 'wall']);
    expect(b.attributes.edges.map((e) => e.overhang)).toEqual([0, 1.5, 1.5, 0]);
    expect(countertopPieceAreaSqIn(b)).toBeCloseTo(1606.5, 9);
    expect(countertopExposedEdgeIn(b)).toBeCloseTo(88.5, 9);
  });

  it('the return stops at the back top whatever the order of the runs in the model', () => {
    // Left return listed first: it is still 63 x 25 1/2 from A's front (y = 25 1/2), so the tops do not overlap;
    // the letters follow the model order.
    const swapped = ROOM.filter((o) => o !== RUN1 && o !== RUN2);
    const pieces = traceCountertops([RUN2, RUN1, ...swapped], LEVEL, DEFAULTS);
    expect(pieces.map((p) => [p.attributes.label, p.attributes.name])).toEqual([
      ['A', 'Left return'],
      ['B', 'Back wall'],
    ]);
    expect(bounds(pieces[0]!.geometry.outline)).toEqual({
      minX: 0,
      maxX: 25.5,
      minY: 25.5,
      maxY: 88.5,
    });
    expect(bounds(pieces[1]!.geometry.outline)).toEqual({
      minX: 0,
      maxX: 144,
      minY: 0,
      maxY: 25.5,
    });
  });

  it('wall edges carry the 4" splash; the joint between tops carries none', () => {
    const [a, b] = traceCountertops(ROOM, LEVEL, DEFAULTS);
    expect(a!.attributes.edges.map((e) => e.backsplashHeight)).toEqual([4, 4, null, 4]);
    expect(b!.attributes.edges.map((e) => e.backsplashHeight)).toEqual([4, null, null, null]);
    expect(a!.attributes.thickness).toBeCloseTo(1.1811, 4);
    expect(a!.attributes.thickness).toBe(COUNTERTOP_DEFAULT_THICKNESS);
    expect(a!.status).toBe('new');
    expect(a!.level).toBe(LEVEL);
  });

  it('a run off every wall (island) is exposed on all four sides at the Standard overhang', () => {
    // Board S04b island: cabinets 73 1/2 x 24 make a 76 1/2 x 27 top before its 12" seating back (set in EZD-414).
    const island = run(30, 'Island', null, { x: 40, y: 60 }, { x: 1, y: 0 }, [id(31), id(32)]);
    const objects = [island, box(31, 'B36', 36), box(32, 'B37.5', 37.5)];
    const [c] = traceCountertops(objects, LEVEL, DEFAULTS);
    expect(c!.attributes.label).toBe('A');
    expect(c!.attributes.edges.map((e) => e.kind)).toEqual([
      'exposed',
      'exposed',
      'exposed',
      'exposed',
    ]);
    const bb = bounds(c!.geometry.outline);
    expect(bb.maxX - bb.minX).toBeCloseTo(76.5, 9);
    expect(bb.maxY - bb.minY).toBeCloseTo(27, 9);
    expect(countertopPieceAreaSqIn(c!)).toBeCloseTo(76.5 * 27, 9);
  });

  it('a default Standard overhang read from Defaults is used', () => {
    const [a] = traceCountertops(ROOM, LEVEL, { standard: 2, againstWall: 0 });
    expect(bounds(a!.geometry.outline).maxY).toBe(26);
  });

  it('a tall box splits a run into two tops', () => {
    const r = run(40, 'Pantry wall', BACK.id, { x: 0, y: 0 }, { x: 1, y: 0 }, [
      id(41),
      id(42),
      id(43),
    ]);
    const objects = [
      BACK,
      LEFT,
      RIGHT,
      r,
      box(41, 'B36', 36),
      box(42, 'T24', 24, 'tall'),
      box(43, 'B84', 84),
    ];
    const pieces = traceCountertops(objects, LEVEL, DEFAULTS);
    expect(pieces.map((p) => p.attributes.label)).toEqual(['A', 'B']);
    // A: left wall to the pantry (36"), its end at the tall box a joint; B: pantry to the right wall (84").
    expect(bounds(pieces[0]!.geometry.outline)).toEqual({ minX: 0, maxX: 36, minY: 0, maxY: 25.5 });
    expect(bounds(pieces[1]!.geometry.outline)).toEqual({
      minX: 60,
      maxX: 144,
      minY: 0,
      maxY: 25.5,
    });
    expect(pieces[0]!.attributes.edges[1]).toEqual({
      kind: 'wall',
      overhang: 0,
      backsplashHeight: null,
      profileId: null,
    });
  });

  it('pressing Trace again adds only missing tops and continues the letters', () => {
    const [a] = traceCountertops(ROOM, LEVEL, DEFAULTS);
    const withA: ModelObject[] = [...ROOM, { id: id(90), type: 'countertop_piece', data: a! }];
    const again = traceCountertops(withA, LEVEL, DEFAULTS);
    expect(again.map((p) => [p.attributes.label, p.attributes.name])).toEqual([
      ['B', 'Left return'],
    ]);
    expect(
      traceCountertops(
        [...withA, { id: id(91), type: 'countertop_piece', data: again[0]! }],
        LEVEL,
        DEFAULTS,
      ),
    ).toEqual([]);
  });

  it('Trace is offered only with cabinets on the floor', () => {
    expect(canTraceCountertops(ROOM, LEVEL)).toBe(true);
    expect(canTraceCountertops([BACK, LEFT, RIGHT], LEVEL)).toBe(false);
    expect(
      canTraceCountertops(
        [BACK, run(50, 'Empty', BACK.id, { x: 0, y: 0 }, { x: 1, y: 0 }, [])],
        LEVEL,
      ),
    ).toBe(false);
    expect(canTraceCountertops(ROOM, 'f0000000-0000-4000-8000-000000000000')).toBe(false);
    expect(traceCountertops([BACK], LEVEL, DEFAULTS)).toEqual([]);
  });

  it('cabinet footprints are the base boxes in plan, for the dashed cabinets under the tops', () => {
    const f = cabinetFootprints(ROOM, LEVEL);
    expect(f).toHaveLength(6);
    expect(bounds(f[0]!.outline)).toEqual({ minX: 0, maxX: 36, minY: 0, maxY: 24 });
    expect(bounds(f[4]!.outline)).toEqual({ minX: 0, maxX: 24, minY: 24, maxY: 54 });
  });
});
