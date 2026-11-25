// EZD-1001b ceilings, soffits, trays and beams for the 3D scene (AC-EZD-1001b-1 "A vaulted fixture room produces
// ceiling meshes whose ridge height equals the model's"). Expected heights are worked by hand: a 16' x 12' room
// (192" x 144") with 96" walls (walls/wall.ts DEFAULT_WALL_HEIGHT_IN) whose inner faces are the room outline, as in
// ceiling/wall-top.test.ts. A vault with the ridge east-west down the middle (y = 72) at 120" rises 24" over each 72"
// half (4:12): 96" at the north and south walls, 108" halfway (y = 36 and y = 108), 120" on the ridge.
// Beams: one beam (Count 1) across the ridge sits at x = 96 and runs y = 0 to 144 (ceiling/beam-layout.ts).
import { describe, expect, it } from 'vitest';
import * as geometry from '../index';
import { chain, roomObj, uid } from '../rooms/test-utils/fixtures';
import type { BeamData, CeilingType, ModelObject, Point, RoomCeiling } from '../schema';
import { slopedCeiling } from '../ceiling/wall-top';
import {
  beamBoxes,
  boxTriangles,
  ceilingHeightAt,
  ceilingShape3d,
  ceilingSurface,
  ceilingTop,
  liftTriangles,
  ringSides,
  roomCeiling3d,
  soffit3d,
  type Triangle2,
} from './ceiling-mesh';

const LEVEL = '11111111-1111-4111-8111-111111111111';
const ROOM = uid(600);
const BOX: Point[] = [
  { x: 0, y: 0 },
  { x: 192, y: 0 },
  { x: 192, y: 144 },
  { x: 0, y: 144 },
];
const walls = () => chain(1, BOX, 'right', LEVEL);

function room(type: CeilingType | null, ridge: RoomCeiling['ridge']) {
  const r = roomObj(ROOM, BOX, 'Family room', LEVEL);
  r.data.attributes.ceilingType = type;
  r.data.attributes.ceiling =
    ridge === null
      ? null
      : { heightsBy: 'pitch', wallHeights: [], pointHeights: [], pitch: 4, ridge };
  return r;
}
const vault = () =>
  room('vaulted', { start: { x: 0, y: 72 }, end: { x: 192, y: 72 }, height: 120 });
const slope = () =>
  room('single_slope', { start: { x: 0, y: 144 }, end: { x: 192, y: 144 }, height: 144 });

// The room's outline as two plan triangles, neither with a vertex on the ridge line.
const HALVES: Triangle2[] = [
  [BOX[0]!, BOX[1]!, BOX[2]!],
  [BOX[0]!, BOX[2]!, BOX[3]!],
];

function points(positions: number[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < positions.length; i += 3)
    out.push([positions[i]!, positions[i + 1]!, positions[i + 2]!]);
  return out;
}
const r6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
// Twice the plan area of flat x, y, z triangles, summed.
function planArea(positions: number[]): number {
  let a = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const [x0, y0, , x1, y1, , x2, y2] = positions.slice(i, i + 9) as number[];
    a += Math.abs((x1! - x0!) * (y2! - y0!) - (x2! - x0!) * (y1! - y0!)) / 2;
  }
  return a;
}

function beam(attrs: Partial<BeamData['attributes']>): BeamData {
  return {
    geometry: { roomId: ROOM, shift: { x: 0, y: 0 } },
    status: 'new',
    level: LEVEL,
    attributes: {
      placement: 'level_in_vault',
      heightAff: 100,
      match: 'custom',
      matchRoomId: null,
      width: 6,
      height: 8,
      layout: { by: 'count', count: 1 },
      length: null,
      direction: 'across_ridge',
      endDetail: 'square',
      ...attrs,
    },
  };
}

describe('EZD-1001b ceiling surface', () => {
  it('a vault is 96" at the walls, 108" halfway and 120" on the ridge', () => {
    const s = ceilingSurface(vault(), walls());
    expect(ceilingHeightAt(s, { x: 50, y: 0 })).toBe(96);
    expect(ceilingHeightAt(s, { x: 50, y: 144 })).toBe(96);
    expect(ceilingHeightAt(s, { x: 50, y: 36 })).toBe(108);
    expect(ceilingHeightAt(s, { x: 50, y: 108 })).toBe(108);
    expect(ceilingHeightAt(s, { x: 50, y: 72 })).toBe(120);
    expect(ceilingTop(s)).toBe(120);
  });

  it('is the surface the walls are cut to (wall-top.ts slopedCeiling)', () => {
    for (const r of [vault(), slope()]) {
      const s = ceilingSurface(r, walls());
      const h = slopedCeiling(r, walls())!;
      for (const p of [
        { x: 0, y: 0 },
        { x: 30, y: 20 },
        { x: 100, y: 72 },
        { x: 192, y: 130 },
      ])
        expect(ceilingHeightAt(s, p)).toBeCloseTo(h(p), 9);
    }
  });

  it('flat, tray and coffered rooms, and a vault with no ridge, are flat at the wall height', () => {
    for (const r of [
      room(null, null),
      room('flat', null),
      room('tray', null),
      room('coffered', null),
      room('vaulted', null),
    ])
      expect(ceilingSurface(r, walls())).toEqual({ kind: 'flat', low: 96 });
  });
});

describe('EZD-1001b ceiling mesh', () => {
  it('AC-EZD-1001b-1: the vaulted ceiling mesh reaches the model ridge height along the ridge line', () => {
    const s = ceilingSurface(vault(), walls());
    const pts = points(liftTriangles(s, HALVES, { kind: 'surface', offset: 0 }));
    // Highest point is the ridge, 120", and it lies on the ridge line y = 72 at both gable ends.
    expect(Math.max(...pts.map((p) => p[2]))).toBe(120);
    const onRidge = pts.filter((p) => Math.abs(p[1] - 72) < 1e-9);
    expect(onRidge.length).toBeGreaterThan(0);
    for (const p of onRidge) expect(r6(p[2])).toBe(120);
    expect(onRidge.some((p) => r6(p[0]) === 0)).toBe(true);
    expect(onRidge.some((p) => r6(p[0]) === 192)).toBe(true);
    // The eaves (north and south walls) are at the 96" plate; nothing is below it.
    for (const p of pts.filter((q) => q[1] === 0 || q[1] === 144)) expect(p[2]).toBe(96);
    expect(Math.min(...pts.map((p) => p[2]))).toBe(96);
  });

  it('every vertex lies on the ceiling and the split keeps the whole plan area', () => {
    const s = ceilingSurface(vault(), walls());
    const pos = liftTriangles(s, HALVES, { kind: 'surface', offset: 0 });
    expect(r6(planArea(pos))).toBe(192 * 144);
    // Each piece is on one side of the ridge, so its middle is on the plane too.
    for (let i = 0; i < pos.length; i += 9) {
      const p = points(pos.slice(i, i + 9));
      const mid = {
        x: (p[0]![0] + p[1]![0] + p[2]![0]) / 3,
        y: (p[0]![1] + p[1]![1] + p[2]![1]) / 3,
      };
      expect(r6((p[0]![2] + p[1]![2] + p[2]![2]) / 3)).toBe(r6(ceilingHeightAt(s, mid)));
    }
  });

  it('a flat ceiling lifts the triangles to the wall height unchanged', () => {
    const s = ceilingSurface(room('flat', null), walls());
    const pts = points(liftTriangles(s, HALVES, { kind: 'surface', offset: 0 }));
    expect(pts).toHaveLength(6);
    for (const p of pts) expect(p[2]).toBe(96);
  });

  it('roomCeiling3d holds the room outline, its tray and coffer holes (not crown) and its surface', () => {
    const tray = { x: 48, y: 36 };
    const ring = [tray, { x: 144, y: 36 }, { x: 144, y: 108 }, { x: 48, y: 108 }];
    const shape = (id: number, kind: 'tray' | 'coffer' | 'crown') =>
      ({
        id: uid(id),
        type: 'ceiling_shape',
        data: {
          geometry: { roomId: ROOM, boundary: ring },
          status: 'new',
          level: LEVEL,
          attributes: { kind, depth: 10 },
        },
      }) as unknown as ModelObject;
    const objects = [
      ...walls(),
      room('tray', null),
      shape(1, 'tray'),
      shape(2, 'crown'),
    ] as ModelObject[];
    const c = roomCeiling3d(room('tray', null), objects);
    expect(c.boundary).toEqual(BOX);
    expect(c.holes).toEqual([ring]);
    expect(c.surface).toEqual({ kind: 'flat', low: 96 });
    // The tray rises 10" above the 96" ceiling, open below; crown makes no mesh.
    const prism = ceilingShape3d(objects[5] as never, objects)!;
    expect(prism.bottom).toEqual({ kind: 'surface', offset: 0 });
    expect(prism.top).toEqual({ kind: 'surface', offset: 10 });
    expect([prism.capTop, prism.capBottom]).toEqual([true, false]);
    const sides = points(ringSides(prism.surface, prism.ring, prism.bottom, prism.top));
    expect(Math.min(...sides.map((p) => p[2]))).toBe(96);
    expect(Math.max(...sides.map((p) => p[2]))).toBe(106);
    expect(ceilingShape3d(objects[6] as never, objects)).toBeNull();
  });

  it('a soffit hangs from the ceiling to its drop below the wall height (the EZD-513 tag height)', () => {
    const soffit = {
      id: uid(3),
      type: 'soffit',
      data: {
        geometry: {
          boundary: [
            { x: 0, y: 0 },
            { x: 192, y: 0 },
            { x: 192, y: 24 },
            { x: 0, y: 24 },
          ],
        },
        status: 'new',
        level: LEVEL,
        attributes: { dropHeight: 12 },
      },
    } as unknown as Extract<ModelObject, { type: 'soffit' }>;
    const objects = [...walls(), room('flat', null), soffit] as ModelObject[];
    const p = soffit3d(soffit, objects)!;
    expect(p.bottom).toEqual({ kind: 'level', z: 84 });
    const sides = points(ringSides(p.surface, p.ring, p.bottom, p.top));
    expect(Math.min(...sides.map((q) => q[2]))).toBe(84);
    expect(Math.max(...sides.map((q) => q[2]))).toBe(96);
    // Outside every room there is no ceiling to hang from.
    expect(soffit3d(soffit, walls() as ModelObject[])).toBeNull();
  });
});

describe('EZD-1001b beams', () => {
  const zs = (boxes: ReturnType<typeof beamBoxes>) => boxes.flat().map((c) => r6(c[2]));
  const ys = (boxes: ReturnType<typeof beamBoxes>) => boxes.flat().map((c) => r6(c[1]));

  it('a level beam sits at Height AFF and stops where its top meets the vault', () => {
    // Bottom 100", top 108": the vault is 108" at y = 36 and y = 108.
    const boxes = beamBoxes(beam({}), vault(), walls());
    expect(boxes).toHaveLength(1);
    expect(new Set(zs(boxes))).toEqual(new Set([100, 108]));
    expect(Math.min(...ys(boxes))).toBe(36);
    expect(Math.max(...ys(boxes))).toBe(108);
    // 6" wide about x = 96.
    expect(new Set(boxes[0]!.map((c) => r6(c[0])))).toEqual(new Set([93, 99]));
  });

  it('level beams with the ridge are not cut back (as the section preview draws them)', () => {
    // Count 2 across the 144" span: beams at y = 36 and y = 108, where the vault is 108"; their tops are 112".
    const boxes = beamBoxes(
      beam({ heightAff: 104, direction: 'with_ridge', layout: { by: 'count', count: 2 } }),
      vault(),
      walls(),
    );
    expect(boxes).toHaveLength(2);
    expect(new Set(zs(boxes))).toEqual(new Set([104, 112]));
    expect(new Set(ys(boxes))).toEqual(new Set([33, 39, 105, 111]));
  });

  it('a level beam whose top is above the ridge is left out', () => {
    expect(beamBoxes(beam({ heightAff: 116 }), vault(), walls())).toEqual([]);
  });

  it('a beam following the slope bends at the ridge: two pieces hanging 8" under the ceiling', () => {
    const boxes = beamBoxes(beam({ placement: 'follow_slope' }), vault(), walls());
    expect(boxes).toHaveLength(2);
    // At the walls the top is 96" and the bottom 88"; at the ridge 120" and 112".
    for (const c of boxes.flat()) {
      const y = r6(c[1]);
      const top = y === 72 ? 120 : 96;
      expect([top, top - 8]).toContain(r6(c[2]));
    }
    expect(Math.max(...zs(boxes))).toBe(120);
  });

  it('a beam on a flat ceiling hangs its height under it', () => {
    const boxes = beamBoxes(beam({ placement: 'on_flat' }), room('flat', null), walls());
    expect(boxes).toHaveLength(1);
    expect(new Set(zs(boxes))).toEqual(new Set([88, 96]));
    expect([Math.min(...ys(boxes)), Math.max(...ys(boxes))]).toEqual([0, 144]);
  });

  it('boxTriangles makes 12 triangles per box', () => {
    const boxes = beamBoxes(beam({ placement: 'on_flat' }), room('flat', null), walls());
    expect(boxTriangles(boxes)).toHaveLength(12 * 9);
  });

  it('is exported from the package', () => {
    expect(geometry.ceilingSurface).toBe(ceilingSurface);
    expect(geometry.beamBoxes).toBe(beamBoxes);
  });
});
