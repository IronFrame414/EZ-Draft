// EZD-1001b (AC-EZD-1001b-1 "A vaulted fixture room produces ceiling meshes whose ridge height equals the model's";
// AC-EZD-1001b-2 "changing one beam rebuilds only that beam"; phase-10.md EZD-1001b). Expected values are worked by
// hand: a 120" x 96" room of default walls (4.5" thick inside the room, 96" high) drawn clockwise from the origin, as
// in scene-3d.slope.test.ts. Its vault has the ridge east-west down the middle (y = 48) at 112": 16" over each 48"
// half (4:12), so 96" at the north and south walls and 112" along the ridge.
import {
  CURRENT_SCHEMA_VERSION,
  createWallData,
  newRoomAttributes,
  type Point,
} from '@ezdraft/geometry';
import type { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../../editor/model/model-store';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createScene3d } from './scene';
import v7 from '../../../../packages/geometry/src/schema/samples/v7.json';

const FLOOR = '10000000-0000-4000-8000-000000000001';
const A = '20000000-0000-4000-8000-00000000000a';
const B = '20000000-0000-4000-8000-00000000000b';
const C = '20000000-0000-4000-8000-00000000000c';
const D = '20000000-0000-4000-8000-00000000000d';
const ROOM = '40000000-0000-4000-8000-000000000001';
const BEAM_1 = '50000000-0000-4000-8000-000000000001';
const BEAM_2 = '50000000-0000-4000-8000-000000000002';
const TRAY = '60000000-0000-4000-8000-000000000001';
const SOFFIT = '60000000-0000-4000-8000-000000000002';

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

const BOUNDARY = [
  { x: 0, y: 0 },
  { x: 0, y: 96 },
  { x: 120, y: 96 },
  { x: 120, y: 0 },
];

function roomValue(type: 'vaulted' | 'flat', ridgeHeight = 112) {
  return v('room', {
    geometry: { boundary: BOUNDARY },
    status: 'existing',
    level: FLOOR,
    attributes: {
      ...newRoomAttributes('Family room'),
      ceilingType: type,
      ceiling:
        type === 'flat'
          ? null
          : {
              heightsBy: 'pitch',
              wallHeights: [],
              pointHeights: [],
              pitch: 4,
              ridge: { start: { x: 0, y: 48 }, end: { x: 120, y: 48 }, height: ridgeHeight },
            },
    },
    closureOverride: null,
  });
}

function beamValue(placement: string, width = 6, count = 2) {
  return v('beam', {
    geometry: { roomId: ROOM, shift: { x: 0, y: 0 } },
    status: 'new',
    level: FLOOR,
    attributes: {
      placement,
      heightAff: 100,
      match: 'custom',
      matchRoomId: null,
      width,
      height: 8,
      layout: { by: 'count', count },
      length: null,
      direction: 'across_ridge',
      endDetail: 'square',
    },
  });
}

function fixture(room: ObjectValue, extra: [string, ObjectValue][] = []): Map<string, ObjectValue> {
  return new Map<string, ObjectValue>([
    [FLOOR, v('floor', { name: 'Floor 1', order: 1 })],
    [A, wallValue({ x: 0, y: 0 }, { x: 0, y: 96 })],
    [B, wallValue({ x: 0, y: 96 }, { x: 120, y: 96 })],
    [C, wallValue({ x: 120, y: 96 }, { x: 120, y: 0 })],
    [D, wallValue({ x: 120, y: 0 }, { x: 0, y: 0 })],
    [ROOM, room],
    ...extra,
  ]);
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
function vertices(mesh: unknown): [number, number, number][] {
  const p = (mesh as Mesh).geometry.getAttribute('position');
  const out: [number, number, number][] = [];
  for (let i = 0; i < p.count; i++) out.push([r6(p.getX(i)), r6(p.getY(i)), r6(p.getZ(i))]);
  return out;
}
// The plan area of a mesh's triangles.
function planArea(mesh: unknown): number {
  const pts = vertices(mesh);
  let a = 0;
  for (let i = 0; i < pts.length; i += 3) {
    const [p, q, r] = [pts[i]!, pts[i + 1]!, pts[i + 2]!];
    a += Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1])) / 2;
  }
  return r6(a);
}

describe('EZD-1001b 3D ceilings and beams', () => {
  it('AC-EZD-1001b-1: a vaulted room makes a ceiling mesh whose ridge height equals the model ridge, 112"', () => {
    const scene = createScene3d({
      store: createModelStore({ objects: fixture(roomValue('vaulted')) }),
    });
    const ceiling = scene.ceilingOf(ROOM);
    expect(ceiling).toBeDefined();
    expect(scene.stats().ceilings).toBe(1);
    const pts = vertices(ceiling);
    expect(Math.max(...pts.map((p) => p[2]))).toBe(112);
    // Along the ridge line (y = 48) the ceiling is at the ridge height, from gable to gable.
    const ridge = pts.filter((p) => p[1] === 48);
    expect(ridge.length).toBeGreaterThan(0);
    expect(new Set(ridge.map((p) => p[2]))).toEqual(new Set([112]));
    expect(ridge.some((p) => p[0] === 0)).toBe(true);
    expect(ridge.some((p) => p[0] === 120)).toBe(true);
    // At the eaves (y = 0 and y = 96) it meets the 96" plate, nothing lower; the whole room is covered.
    expect(new Set(pts.filter((p) => p[1] === 0 || p[1] === 96).map((p) => p[2]))).toEqual(
      new Set([96]),
    );
    expect(Math.min(...pts.map((p) => p[2]))).toBe(96);
    expect(planArea(ceiling)).toBe(120 * 96);
    // The floor stays at 0 under it.
    expect(new Set(vertices(scene.meshOf(ROOM)).map((p) => p[2]))).toEqual(new Set([0]));
    scene.dispose();
  });

  it('AC-EZD-1001b-1 on the schema sample: its vaulted Family Room ceiling peaks at the ridge height stored in it', () => {
    const sample = (
      v7 as { objects: { id: string; type: string; data: Record<string, unknown> }[] }
    ).objects;
    const family = sample.find(
      (o) => o.type === 'room' && (o.data.attributes as { name: string }).name === 'Family Room',
    )!;
    const ridge = (family.data.attributes as { ceiling: { ridge: { height: number } } }).ceiling
      .ridge;
    const objects = new Map(sample.map((o) => [o.id, v(o.type, structuredClone(o.data))]));
    const chosenId = family.data.level as string;
    const floors = { getState: () => ({ chosenId }), subscribe: () => () => {} };
    const scene = createScene3d({ store: createModelStore({ objects }), floors });
    const pts = vertices(scene.ceilingOf(family.id));
    expect(Math.max(...pts.map((p) => p[2]))).toBe(ridge.height);
    scene.dispose();
  });

  it('changing the ridge height rebuilds the ceiling at the new height', () => {
    const store = createModelStore({ objects: fixture(roomValue('vaulted')) });
    const scene = createScene3d({ store });
    const before = scene.ceilingOf(ROOM);
    store.applyEdit([{ id: ROOM, value: roomValue('vaulted', 120) }]);
    expect(scene.stats().lastRebuilt).toContain(ROOM);
    expect(scene.ceilingOf(ROOM)).not.toBe(before);
    expect(Math.max(...vertices(scene.ceilingOf(ROOM)).map((p) => p[2]))).toBe(120);
    scene.dispose();
  });

  it('a flat ceiling is one level at the 96" wall height', () => {
    const scene = createScene3d({
      store: createModelStore({ objects: fixture(roomValue('flat')) }),
    });
    expect(new Set(vertices(scene.ceilingOf(ROOM)).map((p) => p[2]))).toEqual(new Set([96]));
    scene.dispose();
  });

  it('AC-EZD-1001b-2: changing one beam set rebuilds only that beam set', () => {
    const store = createModelStore({
      objects: fixture(roomValue('vaulted'), [
        [BEAM_1, beamValue('follow_slope')],
        [BEAM_2, beamValue('level_in_vault', 6, 1)],
      ]),
    });
    const scene = createScene3d({ store });
    expect(scene.stats().beams).toBe(2);
    const keep = new Map([A, B, C, D, BEAM_2].map((id) => [id, scene.meshOf(id)]));
    const ceiling = scene.ceilingOf(ROOM);
    const floor = scene.meshOf(ROOM);
    const beam1 = scene.meshOf(BEAM_1);
    const built = scene.stats().built;

    store.applyEdit([{ id: BEAM_1, value: beamValue('follow_slope', 8) }]);
    const s = scene.stats();
    expect(s.lastRebuilt).toEqual([BEAM_1]);
    expect(s.built).toBe(built + 1);
    expect(scene.meshOf(BEAM_1)).not.toBe(beam1);
    for (const [id, mesh] of keep) expect(scene.meshOf(id)).toBe(mesh);
    expect(scene.ceilingOf(ROOM)).toBe(ceiling);
    expect(scene.meshOf(ROOM)).toBe(floor);
    // The wider set is 8" across: two beams at x = 30 and x = 90 (Count 2 over 120"), each 26..34 and 86..94.
    expect(new Set(vertices(scene.meshOf(BEAM_1)).map((p) => p[0]))).toEqual(
      new Set([26, 34, 86, 94]),
    );
    scene.dispose();
  });

  it('beams follow the vault up to the ridge, or sit level at Height AFF', () => {
    const scene = createScene3d({
      store: createModelStore({
        objects: fixture(roomValue('vaulted'), [
          [BEAM_1, beamValue('follow_slope')],
          [BEAM_2, beamValue('level_in_vault', 6, 1)],
        ]),
      }),
    });
    // Following the slope: tops 96" at the walls to 112" at the ridge, 8" deep.
    const follow = vertices(scene.meshOf(BEAM_1));
    expect(Math.max(...follow.map((p) => p[2]))).toBe(112);
    expect(Math.min(...follow.map((p) => p[2]))).toBe(88);
    // Level: bottom 100", top 108"; the vault (112 - 16 x |y - 48| / 48) is 108" 12" either side of the ridge
    // (y = 36 and y = 60), where the beam stops.
    const level = vertices(scene.meshOf(BEAM_2));
    expect(new Set(level.map((p) => p[2]))).toEqual(new Set([100, 108]));
    expect([Math.min(...level.map((p) => p[1])), Math.max(...level.map((p) => p[1]))]).toEqual([
      36, 60,
    ]);
    scene.dispose();
  });

  it('a tray rises above the ceiling through a hole in it, and a soffit hangs its drop below', () => {
    const tray = [
      { x: 30, y: 24 },
      { x: 90, y: 24 },
      { x: 90, y: 72 },
      { x: 30, y: 72 },
    ];
    const store = createModelStore({
      objects: fixture(roomValue('flat'), [
        [
          TRAY,
          v('ceiling_shape', {
            geometry: { roomId: ROOM, boundary: tray },
            status: 'new',
            level: FLOOR,
            attributes: { kind: 'tray', depth: 10 },
          }),
        ],
        [
          SOFFIT,
          v('soffit', {
            geometry: {
              boundary: [
                { x: 0, y: 0 },
                { x: 120, y: 0 },
                { x: 120, y: 12 },
                { x: 0, y: 12 },
              ],
            },
            status: 'new',
            level: FLOOR,
            attributes: { dropHeight: 12 },
          }),
        ],
      ]),
    });
    const scene = createScene3d({ store });
    expect(scene.stats().ceilingParts).toBe(2);
    // The room's ceiling has the tray's 60" x 48" cut out of it.
    expect(planArea(scene.ceilingOf(ROOM))).toBe(120 * 96 - 60 * 48);
    const t = vertices(scene.meshOf(TRAY));
    expect([Math.min(...t.map((p) => p[2])), Math.max(...t.map((p) => p[2]))]).toEqual([96, 106]);
    const s = vertices(scene.meshOf(SOFFIT));
    expect([Math.min(...s.map((p) => p[2])), Math.max(...s.map((p) => p[2]))]).toEqual([84, 96]);
    // Deleting the tray closes the hole: the ceiling is rebuilt whole and the tray leaves the scene.
    store.applyEdit([{ id: TRAY, value: null }]);
    expect(scene.meshOf(TRAY)).toBeUndefined();
    expect(planArea(scene.ceilingOf(ROOM))).toBe(120 * 96);
    scene.dispose();
  });
});
