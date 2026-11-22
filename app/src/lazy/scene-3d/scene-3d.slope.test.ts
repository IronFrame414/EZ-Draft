// EZD-504 (S05 States "Ceiling slope changed: walls under a slope get their top edge cut to match in plan, elevations
// and 3D"): the 3D walls under a sloped ceiling. Expected boxes are worked by hand: a 120" x 96" room of default walls
// (4.5" thick on the right walking start to end, 96" high) drawn clockwise from the origin, so each wall's thickness
// lies inside the room. A single slope with its high edge along the north wall at 128" rises 32" over the 96" run,
// 4:12 (4" per 12").
import {
  CURRENT_SCHEMA_VERSION,
  createWallData,
  newRoomAttributes,
  type Point,
} from '@ezdraft/geometry';
import { Box3, type Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../../editor/model/model-store';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createScene3d } from './scene';

const FLOOR = '10000000-0000-4000-8000-000000000001';
const A = '20000000-0000-4000-8000-00000000000a';
const B = '20000000-0000-4000-8000-00000000000b';
const C = '20000000-0000-4000-8000-00000000000c';
const D = '20000000-0000-4000-8000-00000000000d';
const ROOM = '40000000-0000-4000-8000-000000000001';

const v = (type: string, data: unknown): ObjectValue => ({
  type,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: data as Record<string, unknown>,
});

function wallValue(start: Point, end: Point) {
  const made = createWallData({ start, end, level: FLOOR, thicknessSide: 'right' });
  if (!made.ok) throw new Error('wall');
  return v('wall', made.data);
}

function roomValue(type: string, ridgeHeight: number | null) {
  return v('room', {
    geometry: {
      boundary: [
        { x: 0, y: 0 },
        { x: 0, y: 96 },
        { x: 120, y: 96 },
        { x: 120, y: 0 },
      ],
    },
    status: 'existing',
    level: FLOOR,
    attributes: {
      ...newRoomAttributes('Living'),
      ceilingType: type,
      ceiling:
        ridgeHeight === null
          ? null
          : {
              heightsBy: 'pitch',
              wallHeights: [],
              pointHeights: [],
              pitch: 4,
              ridge: { start: { x: 0, y: 96 }, end: { x: 120, y: 96 }, height: ridgeHeight },
            },
    },
    closureOverride: null,
  });
}

function fixture(room: ObjectValue): Map<string, ObjectValue> {
  return new Map<string, ObjectValue>([
    [FLOOR, v('floor', { name: 'Floor 1', order: 1 })],
    // West (drawn north), north (east), east (south), south (west).
    [A, wallValue({ x: 0, y: 0 }, { x: 0, y: 96 })],
    [B, wallValue({ x: 0, y: 96 }, { x: 120, y: 96 })],
    [C, wallValue({ x: 120, y: 96 }, { x: 120, y: 0 })],
    [D, wallValue({ x: 120, y: 0 }, { x: 0, y: 0 })],
    [ROOM, room],
  ]);
}

const boxOf = (mesh: unknown) =>
  new Box3().setFromBufferAttribute((mesh as Mesh).geometry.getAttribute('position') as never);
const corners = (b: Box3) =>
  [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((n) => Math.round(n * 1e6) / 1e6 + 0);
// The wall's top height at a plan point along its line: the highest z among its vertices there.
const topAt = (mesh: unknown, at: (x: number, y: number) => boolean) => {
  const p = (mesh as Mesh).geometry.getAttribute('position');
  let z = -Infinity;
  for (let i = 0; i < p.count; i++) if (at(p.getX(i), p.getY(i))) z = Math.max(z, p.getZ(i));
  return Math.round(z * 1e6) / 1e6;
};

describe('EZD-504 3D walls under a slope', () => {
  it('walls under a 4:12 slope are cut to the ceiling: 96" at the eave, 128" at the high edge', () => {
    const scene = createScene3d({ store: createModelStore({ objects: fixture(roomValue('single_slope', 128)) }) });
    // East wall, walking south: the right hand points west, so x 115.5..120; its top runs 128" (north) to 96".
    expect(corners(boxOf(scene.meshOf(C)))).toEqual([115.5, 0, 0, 120, 96, 128]);
    expect(topAt(scene.meshOf(C), (_x, y) => Math.abs(y - 96) < 1e-6)).toBe(128);
    expect(topAt(scene.meshOf(C), (_x, y) => Math.abs(y) < 1e-6)).toBe(96);
    // North wall along the high edge is 128" high; south wall along the eave keeps 96".
    expect(corners(boxOf(scene.meshOf(B)))[5]).toBe(128);
    expect(corners(boxOf(scene.meshOf(D)))[5]).toBe(96);
    scene.dispose();
  });

  it('a flat ceiling leaves the walls at their own height', () => {
    const scene = createScene3d({ store: createModelStore({ objects: fixture(roomValue('flat', null)) }) });
    for (const id of [A, B, C, D]) expect(corners(boxOf(scene.meshOf(id)))[5]).toBe(96);
    scene.dispose();
  });

  it('changing the slope rebuilds the walls whose top changed, and only those', () => {
    const store = createModelStore({ objects: fixture(roomValue('single_slope', 128)) });
    const scene = createScene3d({ store });
    const south = scene.meshOf(D);
    // Ridge lowered to 120" (a 3:12 slope over 96"): west, north and east tops change; the south eave stays 96".
    store.applyEdit([{ id: ROOM, value: roomValue('single_slope', 120) }]);
    const rebuilt = scene.stats().lastRebuilt;
    expect(rebuilt).toEqual(expect.arrayContaining([A, B, C]));
    expect(rebuilt).not.toContain(D);
    expect(scene.meshOf(D)).toBe(south);
    expect(corners(boxOf(scene.meshOf(C)))[5]).toBe(120);
    scene.dispose();
  });
});
