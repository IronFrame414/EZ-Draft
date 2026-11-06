// EZD-203 · T1 to T6 (vault/plans/EZD-203.md sections 3, 4; AC-EZD-203-3, -4, -5): default wall, create limits,
// measures, finished faces and thickness side. Expected values: Q-0558 and 09j Default wall (4 1/2" = drywall 1/2"
// + stud 3 1/2" + drywall 1/2"), Q-0568 / Q-0570 / 03g (200 ft inclusive, 1/64" comparison), 09j Typed length to
// outside size rows 1-2 and Q-0559 (12' x 10' outside 12' 9" x 10' 9"), 09j Thickness side rows 1-4, Room area
// row 9 (57.75") and Q-0569 (b); plan Decided "Face offsets", "Thickness side" (y up, left normal (-d.y, d.x)).
import { describe, expect, it } from 'vitest';
import { wallDataSchema, type WallData } from '../schema';
import {
  createWallData,
  DEFAULT_WALL_HEIGHT_IN,
  DEFAULT_WALL_LAYERS,
  thicknessSideFor,
  wallFaceLines,
  wallLength,
  wallThickness,
  type WallLine,
} from './wall';
import { ID, LEVEL_1, partition, roomWalls, wallObj } from './test-utils/fixtures';

const DEFAULT_LAYERS = [
  { material: 'drywall', thickness: 0.5 },
  { material: 'stud', thickness: 3.5 },
  { material: 'drywall', thickness: 0.5 },
];

const expectLine = (line: WallLine, sx: number, sy: number, ex: number, ey: number) => {
  expect(line.start.x).toBeCloseTo(sx, 9);
  expect(line.start.y).toBeCloseTo(sy, 9);
  expect(line.end.x).toBeCloseTo(ex, 9);
  expect(line.end.y).toBeCloseTo(ey, 9);
};

const outsideSize = (width: number, depth: number) => {
  const [w1, w2, w3, w4] = roomWalls(width, depth).map((w) => wallFaceLines(w.data).right);
  return { width: w2.start.x - w4.start.x, depth: w3.start.y - w1.start.y };
};

describe('EZD-203 walls core: wall', () => {
  it('EZD-203 T1 default wall: createWallData gives the 4 1/2" drywall-stud-drywall wall, 96" high, side right', () => {
    const r = createWallData({ start: { x: 0, y: 0 }, end: { x: 144, y: 0 }, level: LEVEL_1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual({
      geometry: { start: { x: 0, y: 0 }, end: { x: 144, y: 0 } },
      status: 'existing',
      level: LEVEL_1,
      attributes: {
        thickness: 4.5,
        thicknessSide: 'right',
        height: 96,
        topCutToCeiling: false,
        bearing: false,
        layers: DEFAULT_LAYERS,
      },
    });
    expect(DEFAULT_WALL_HEIGHT_IN).toBe(96);
    expect(DEFAULT_WALL_LAYERS).toEqual(DEFAULT_LAYERS);
    const materials = (r.data.attributes as { layers: { material: string }[] }).layers.map(
      (l) => l.material,
    );
    expect(materials).not.toContain('tile_backer');
    expect(wallDataSchema.safeParse(r.data).success).toBe(true);
    (r.data.attributes as { layers: { thickness: number }[] }).layers[0].thickness = 9;
    expect(DEFAULT_WALL_LAYERS[0].thickness).toBe(0.5);
  });

  it('EZD-203 T2 create limits: 200 ft inclusive at 1/64", zero length at 1/64", non-finite points refused', () => {
    const start = { x: 0, y: 0 };
    const create = (s: { x: number; y: number }, end: { x: number; y: number }) =>
      createWallData({ start: s, end, level: LEVEL_1 });
    const reasonOf = (r: ReturnType<typeof createWallData>) => (r.ok ? 'ok' : r.reason);
    expect(reasonOf(create(start, { x: 2400, y: 0 }))).toBe('ok');
    expect(reasonOf(create(start, { x: 2400.015625, y: 0 }))).toBe('ok');
    expect(reasonOf(create(start, { x: 2400.0625, y: 0 }))).toBe('too_long');
    expect(reasonOf(create(start, { x: 0, y: 0 }))).toBe('zero_length');
    expect(reasonOf(create(start, { x: 0.015625, y: 0 }))).toBe('zero_length');
    expect(reasonOf(create(start, { x: 0.03125, y: 0 }))).toBe('ok');
    expect(reasonOf(create({ x: Number.NaN, y: 0 }, { x: 144, y: 0 }))).toBe('invalid_point');
    expect(reasonOf(create(start, { x: Number.POSITIVE_INFINITY, y: 0 }))).toBe('invalid_point');
  });

  it('EZD-203 T3 measures: wall thickness is the sum of its layers; wall length is Euclidean', () => {
    expect(wallThickness(DEFAULT_WALL_LAYERS)).toBeCloseTo(4.5, 9);
    expect(
      wallThickness([
        { material: 'tile_backer', thickness: 0.5 },
        { material: 'stud', thickness: 3.5 },
        { material: 'drywall', thickness: 0.5 },
      ]),
    ).toBeCloseTo(4.5, 9);
    expect(wallThickness([])).toBe(0);
    expect(wallLength({ start: { x: 0, y: 0 }, end: { x: 36, y: 48 } })).toBeCloseTo(60, 9);
  });

  it("EZD-203 T4 outside size: a 12' x 10' room drawn inside measures 12' 9\" x 10' 9\" outside", () => {
    const room = roomWalls(144, 120);
    const faces = room.map((w) => wallFaceLines(w.data));
    expectLine(faces[0].right, 0, -4.5, 144, -4.5);
    expectLine(faces[1].right, 148.5, 0, 148.5, 120);
    expectLine(faces[2].right, 144, 124.5, 0, 124.5);
    expectLine(faces[3].right, -4.5, 120, -4.5, 0);
    room.forEach((w, i) => {
      const g = w.data.geometry;
      expectLine(faces[i].left, g.start.x, g.start.y, g.end.x, g.end.y);
    });
    const outside = outsideSize(144, 120);
    expect(outside.width).toBeCloseTo(153, 9);
    expect(outside.depth).toBeCloseTo(129, 9);
    const g = room.map((w) => w.data.geometry);
    expect(g[1].start.x - g[3].start.x).toBeCloseTo(144, 9);
    expect(g[2].start.y - g[0].start.y).toBeCloseTo(120, 9);
  });

  it("EZD-203 T5 outside size 2: a 5' x 8' room measures 5' 9\" x 8' 9\" outside", () => {
    const outside = outsideSize(60, 96);
    expect(outside.width).toBeCloseTo(69, 9);
    expect(outside.depth).toBeCloseTo(105, 9);
  });

  it('EZD-203 T6 thickness side: lone wall right, closed room by winding, partition centered', () => {
    // (a) a lone wall west to east: thickness to the south
    const lone = wallFaceLines(wallObj(ID.W1, { x: 0, y: 0 }, { x: 144, y: 0 }).data);
    expectLine(lone.right, 0, -4.5, 144, -4.5);

    // (b) closed chains: counter-clockwise room right; clockwise chain left
    const roomLines: WallLine[] = roomWalls(144, 120).map((w) => w.data.geometry);
    expect(thicknessSideFor({ kind: 'closed', chain: roomLines })).toBe('right');
    const pts = [
      { x: 0, y: 0 },
      { x: 144, y: 0 },
      { x: 144, y: -120 },
      { x: 0, y: -120 },
    ];
    const clockwise: WallLine[] = pts.map((p, i) => ({ start: p, end: pts[(i + 1) % 4] }));
    const side = thicknessSideFor({ kind: 'closed', chain: clockwise });
    expect(side).toBe('left');
    const first = wallFaceLines(
      wallObj(ID.W1, { x: 0, y: 0 }, { x: 144, y: 0 }, { thicknessSide: side }).data,
    );
    expectLine(first.left, 0, 4.5, 144, 4.5);
    expectLine(first.right, 0, 0, 144, 0);

    // (c) a partition centered on its line
    expect(thicknessSideFor({ kind: 'partition' })).toBe('center');
    const p: WallData = partition(60).data;
    const pf = wallFaceLines(p);
    expectLine(pf.left, 57.75, 0, 57.75, 120);
    expectLine(pf.right, 62.25, 0, 62.25, 120);

    // (d) open, and closed chains with no area
    expect(thicknessSideFor({ kind: 'open' })).toBe('right');
    expect(
      thicknessSideFor({
        kind: 'closed',
        chain: [
          { start: { x: 0, y: 0 }, end: { x: 144, y: 0 } },
          { start: { x: 144, y: 0 }, end: { x: 0, y: 0 } },
        ],
      }),
    ).toBe('right');
    expect(
      thicknessSideFor({
        kind: 'closed',
        chain: [
          { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
          { start: { x: 10, y: 0 }, end: { x: 20, y: 0 } },
          { start: { x: 20, y: 0 }, end: { x: 0, y: 0 } },
        ],
      }),
    ).toBe('right');
  });
});
