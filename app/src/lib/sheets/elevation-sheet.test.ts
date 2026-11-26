// EZD-707 (AC-EZD-707-1 "A4.0 shows each run's elevation"; AC-EZD-707-2 "a wall with a window under a sloped ceiling
// draws both"; AC-EZD-707-3 "Add elevation adds a wall that has no cabinets"; R24; 09h "1/2\" = 1'-0\" elevations").
// The fixture is a 144" x 120" kitchen of four 96" walls (faces on the room, thickness outside): W1 south (0,0)-(144,0)
// with a run of a B15 and a B18 on it, W2 east (144,0)-(144,120) with a 36" x 48" window on a 36" sill at its middle
// (60" along it), under a single slope rising from 96" at the south eave to 136" at the north high edge, so W2's top
// rises 40" over its 120". At 1/2" = 1'-0" one model inch is 1/24 paper inch: the B15 prints 15/24 = 0.625" wide, the
// window 36/24 = 1.5" wide and 48/24 = 2" tall, W2's top 120/24 = 5" across and 40/24 = 1 2/3" up.
import { CURRENT_SCHEMA_VERSION, parseStoredObject, type ModelObject, type Point, type StoredObject } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { sheetJob, type SheetJobInput } from '../../workers/sheet-job';
import { addableWalls, elevationCells } from './elevation-sheet';
import { sheetDrawingArea } from './sheet-set';
import { addElevationChange, sheetDrawsModel, viewportScaleFactor } from './viewport';

const F1 = '11111111-1111-4111-8111-111111111111';
const W1 = '31111111-1111-4111-8111-111111111111';
const W2 = '32222222-2222-4222-8222-222222222222';
const W3 = '33333333-3333-4333-8333-333333333333';
const W4 = '34444444-4444-4444-8444-444444444444';
const N1 = '51111111-1111-4111-8111-111111111111';
const R1 = '61111111-1111-4111-8111-111111111111';
const RUN = '71111111-1111-4111-8111-111111111111';
const B15 = '72222222-2222-4222-8222-222222222222';
const B18 = '73333333-3333-4333-8333-333333333333';
const P = (x: number, y: number): Point => ({ x, y });

const stored = (id: string, type: string, data: unknown): StoredObject => ({
  id,
  type,
  schema_version: CURRENT_SCHEMA_VERSION,
  data,
});
const wall = (id: string, start: Point, end: Point) =>
  stored(id, 'wall', {
    geometry: { start, end },
    status: 'existing',
    level: F1,
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
  });
const box = (id: string, code: string, width: number) =>
  stored(id, 'cabinet_box', {
    status: 'new',
    level: F1,
    attributes: {
      code,
      boxType: 'base',
      width,
      depth: 24,
      height: 34.5,
      faceLayout: 'door_1',
      hingeSide: 'left',
      finishedEnds: 'none',
      catalogItemId: null,
      finish: null,
    },
  });

const FIXTURE: StoredObject[] = [
  stored(F1, 'floor', { name: 'Floor 1', order: 1 }),
  wall(W1, P(0, 0), P(144, 0)),
  wall(W2, P(144, 0), P(144, 120)),
  wall(W3, P(144, 120), P(0, 120)),
  wall(W4, P(0, 120), P(0, 0)),
  stored(N1, 'opening', {
    geometry: { center: P(144, 60), hostWallId: W2, axis: null },
    status: 'new',
    level: F1,
    attributes: {
      kind: 'window',
      width: 36,
      height: 48,
      roughOpening: { width: 38, height: 50 },
      sillHeight: 36,
      swing: null,
      hand: null,
      impactRating: 'not_rated',
      shutterType: null,
      roughOpeningMode: 'typed',
    },
  }),
  stored(R1, 'room', {
    geometry: { boundary: [P(0, 0), P(144, 0), P(144, 120), P(0, 120)] },
    status: 'existing',
    level: F1,
    attributes: {
      name: 'Kitchen',
      floorLevel: 0,
      photos: [],
      roomType: null,
      floorFinish: '',
      ceilingType: 'single_slope',
      ceiling: {
        heightsBy: 'pitch',
        wallHeights: [],
        pointHeights: [],
        pitch: 4,
        ridge: { start: P(0, 120), end: P(144, 120), height: 136 },
      },
    },
    closureOverride: null,
  }),
  stored(RUN, 'cabinet_run', {
    geometry: { hostWallId: W1, start: P(0, 0), axis: P(1, 0) },
    level: F1,
    attributes: { name: 'Back wall run', base: [B15, B18], upper: [] },
  }),
  box(B15, 'B15', 15),
  box(B18, 'B18', 18),
];

const HALF = viewportScaleFactor('1/2')!;
const input = (walls: string[] = []): SheetJobInput => ({
  objects: FIXTURE,
  level: F1,
  scale: HALF,
  area: sheetDrawingArea('24x36'),
  view: 'proposed',
  elevation: { walls },
});

type Line = { x1: number; y1: number; x2: number; y2: number; role: string };
function linesOf(markup: string, id: string): Line[] {
  const out: Line[] = [];
  for (const m of markup.matchAll(/<line ([^>]*)\/>/g)) {
    const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(m[1]!)?.[1] ?? '';
    if (attr('data-object-id') !== id) continue;
    out.push({ x1: Number(attr('x1')), y1: Number(attr('y1')), x2: Number(attr('x2')), y2: Number(attr('y2')), role: attr('data-role') });
  }
  return out;
}
const parsed = (): ModelObject[] =>
  FIXTURE.map((s) => {
    const r = parseStoredObject(s);
    if (!r.ok) throw new Error(`fixture ${s.type} ${s.id} does not parse`);
    return r.object;
  });

describe('EZD-707 elevations sheet', () => {
  it('the fixture is valid model data', () => {
    expect(parsed()).toHaveLength(FIXTURE.length);
  });

  it("AC-EZD-707-1: A4.0's elevation viewport draws the run's wall with its boxes at 1/2\"", () => {
    const svg = sheetJob(input());
    expect(svg.shown).toEqual([B15, B18, RUN, W1].sort());
    // The B15's bottom edge, 15" at 1/24" per inch.
    const b15 = linesOf(svg.markup, B15);
    expect(b15[0]!.x2 - b15[0]!.x1).toBeCloseTo(0.625, 5);
    // The wall outline is the cut pen; the boxes the beyond pen.
    expect(linesOf(svg.markup, W1).every((l) => l.role === 'cut')).toBe(true);
    expect(b15.every((l) => l.role === 'beyond')).toBe(true);
    expect(svg.markup).toContain('ELEVATION A');
    // One check dimension per elevation (EZD-705 print marks).
    expect(svg.markup.match(/data-print-mark="check-dimension-label"/g)).toHaveLength(1);
    expect(sheetJob(input([W2])).markup.match(/data-print-mark="check-dimension-label"/g)).toHaveLength(2);
  });

  it('AC-EZD-707-2 and -3: an added wall with no cabinets draws its window and its top cut under the slope', () => {
    const svg = sheetJob(input([W2]));
    expect(svg.shown).toContain(W2);
    expect(svg.shown).toContain(N1);
    expect(svg.markup).toContain('ELEVATION B');
    const top = linesOf(svg.markup, W2).find((l) => Math.abs(l.x2 - l.x1) > 1e-6 && Math.abs(l.y2 - l.y1) > 1e-6)!;
    expect(Math.abs(top.x2 - top.x1)).toBeCloseTo(5, 5);
    // Up on paper is y down: the top rises 40" from the eave end to the high end.
    expect(Math.abs(top.y2 - top.y1)).toBeCloseTo(40 / 24, 4);
    const win = linesOf(svg.markup, N1);
    expect(win).toHaveLength(4);
    expect(Math.abs(win[0]!.x2 - win[0]!.x1)).toBeCloseTo(1.5, 5);
    expect(Math.abs(win[1]!.y2 - win[1]!.y1)).toBeCloseTo(2, 5);
    // The window's sill is 36" (1.5") above the floor line.
    const floorY = linesOf(svg.markup, W2)[0]!.y1;
    expect(floorY - win[0]!.y1).toBeCloseTo(1.5, 5);
  });

  it('a removed box is not drawn in the Proposed view of a model where it is Demo', () => {
    const demo = FIXTURE.map((s) =>
      s.id === B18 ? { ...s, data: { ...(s.data as object), status: 'demo' } } : s,
    );
    const svg = sheetJob({ ...input(), objects: demo });
    expect(svg.shown).not.toContain(B18);
    expect(svg.shown).toContain(B15);
  });

  it('elevations share the viewport in a near-square grid, row by row', () => {
    const area = { x: 1, y: 2, width: 20, height: 10 };
    expect(elevationCells(area, 0)).toEqual([]);
    expect(elevationCells(area, 1)).toEqual([area]);
    expect(elevationCells(area, 3)).toEqual([
      { x: 1, y: 2, width: 10, height: 5 },
      { x: 11, y: 2, width: 10, height: 5 },
      { x: 1, y: 7, width: 10, height: 5 },
    ]);
  });

  it('AC-EZD-707-3: Add elevation offers the walls not drawn yet and adds one to the first elevation viewport', () => {
    const objects = parsed();
    expect(addableWalls(objects, F1).map((w) => w.id)).toEqual([W2, W3, W4]);
    expect(addableWalls(objects, F1, [W2]).map((w) => w.id)).toEqual([W3, W4]);
    const vps = [
      { kind: 'plan' as const, walls: undefined },
      { kind: 'elevation' as const, walls: [W2] },
    ];
    expect(addElevationChange(vps, 'A4.0', W3)).toEqual({ kind: 'update', index: 1, patch: { walls: [W2, W3] } });
    expect(addElevationChange(vps, 'A4.0', W2)).toBeNull();
    expect(addElevationChange([], 'A4.0', W3, F1)).toEqual({
      kind: 'add',
      viewport: { sheet: 'A4.0', kind: 'elevation', level: F1, view: 'proposed', scale: '1/2', walls: [W3] },
    });
    expect(sheetDrawsModel([{ kind: 'elevation' }])).toBe(true);
    expect(sheetDrawsModel([])).toBe(false);
  });
});
