// EZD-1001a (AC-EZD-1001a-1 "Moving one wall rebuilds only that wall's meshes (the test counts rebuilt meshes) and
// the change shows in 3D without a save"; phase-10.md "meshes cached per object id and only changed objects
// rebuilt"; Q-0776 open floor only; S07 States "Empty"). The scene reads the editor's model store with no save path
// (no onCommit), so a change it shows was never saved. Expected boxes are worked by hand: a 120" x 96" room of
// default walls (4.5" thick on the right walking start to end, 96" high: DEFAULT_WALL_LAYERS,
// DEFAULT_WALL_HEIGHT_IN) drawn clockwise from the origin, so each wall's thickness lies inside the room (the right hand walking clockwise).
import {
  CURRENT_SCHEMA_VERSION,
  createOpeningData,
  createWallData,
  newRoomAttributes,
  type Point,
} from '@ezdraft/geometry';
import { Box3, type Mesh } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createModelStore } from '../../editor/model/model-store';
import type { Objects } from '../../editor/model/patches';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createScene3d } from './scene';

const FLOOR = '10000000-0000-4000-8000-000000000001';
const FLOOR_2 = '10000000-0000-4000-8000-000000000002';
const A = '20000000-0000-4000-8000-00000000000a';
const B = '20000000-0000-4000-8000-00000000000b';
const C = '20000000-0000-4000-8000-00000000000c';
const D = '20000000-0000-4000-8000-00000000000d';
const UP = '20000000-0000-4000-8000-0000000000ee';
const DOOR = '30000000-0000-4000-8000-000000000001';
const ROOM = '40000000-0000-4000-8000-000000000001';

const v = (type: string, data: unknown): ObjectValue => ({
  type,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: data as Record<string, unknown>,
});

function wallValue(start: Point, end: Point, level = FLOOR, status: 'existing' | 'new' | 'demo' = 'existing') {
  const made = createWallData({ start, end, level, thicknessSide: 'right', status });
  if (!made.ok) throw new Error('wall');
  return v('wall', made.data);
}

function fixture(): Map<string, ObjectValue> {
  const a = wallValue({ x: 0, y: 0 }, { x: 0, y: 96 });
  const objects = new Map<string, ObjectValue>([
    [FLOOR, v('floor', { name: 'Floor 1', order: 1 })],
    [FLOOR_2, v('floor', { name: 'Floor 2', order: 2 })],
    [A, a],
    [B, wallValue({ x: 0, y: 96 }, { x: 120, y: 96 })],
    [C, wallValue({ x: 120, y: 96 }, { x: 120, y: 0 })],
    [D, wallValue({ x: 120, y: 0 }, { x: 0, y: 0 })],
    // A wall on the second floor: not the open floor, so not in the scene.
    [UP, wallValue({ x: 0, y: 0 }, { x: 60, y: 0 }, FLOOR_2)],
    [
      DOOR,
      v(
        'opening',
        createOpeningData({
          kind: 'door',
          center: { x: 0, y: 48 },
          host: { id: A, type: 'wall', data: a.data as never },
        }),
      ),
    ],
    [
      ROOM,
      v('room', {
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
        attributes: newRoomAttributes('Kitchen'),
        closureOverride: null,
      }),
    ],
  ]);
  return objects;
}

const boxOf = (mesh: unknown) => new Box3().setFromBufferAttribute((mesh as Mesh).geometry.getAttribute('position') as never);
const corners = (b: Box3) => [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((n) => Math.round(n * 1e6) / 1e6 + 0);

function moved(objects: Objects, id: string, dx: number) {
  const w = objects.get(id)!;
  const g = w.data.geometry as { start: Point; end: Point };
  return {
    id,
    value: {
      ...w,
      data: {
        ...w.data,
        geometry: {
          start: { x: g.start.x + dx, y: g.start.y },
          end: { x: g.end.x + dx, y: g.end.y },
        },
      },
    },
  };
}

describe('EZD-1001a 3D scene core', () => {
  it('builds one mesh per wall and room of the open floor', () => {
    const store = createModelStore({ objects: fixture() });
    const scene = createScene3d({ store });
    const s = scene.stats();
    expect(s.walls).toBe(4);
    expect(s.floors).toBe(1);
    expect(s.built).toBe(5);
    expect(scene.meshOf(UP)).toBeUndefined();
    expect(scene.isEmpty()).toBe(false);
    // Wall D runs west along y = 0; walking west the right hand points north: x 0..120, y 0..4.5, z 0..96.
    expect(corners(boxOf(scene.meshOf(D)))).toEqual([0, 0, 0, 120, 4.5, 96]);
    scene.dispose();
  });

  it('AC-EZD-1001a-1: moving one wall rebuilds only that wall, and the change shows without a save', () => {
    const store = createModelStore({ objects: fixture() });
    const scene = createScene3d({ store });
    const invalidate = vi.fn();
    scene.setInvalidate(invalidate);
    const before = new Map([A, B, C, D, ROOM].map((id) => [id, scene.meshOf(id)]));
    const geometries = new Map([A, B, D, ROOM].map((id) => [id, (scene.meshOf(id) as Mesh).geometry]));

    // Wall C (x = 120, drawn south) moves 12" east: one change, one wall.
    store.applyEdit([moved(store.getState().objects, C, 12)]);

    const s = scene.stats();
    expect(s.lastRebuilt).toEqual([C]);
    expect(s.built).toBe(6);
    for (const id of [A, B, D, ROOM]) {
      expect(scene.meshOf(id)).toBe(before.get(id));
      expect((scene.meshOf(id) as Mesh).geometry).toBe(geometries.get(id));
    }
    expect(scene.meshOf(C)).not.toBe(before.get(C));
    // Walking south the right hand points west, so the 4.5" lies west of the moved line x = 132: x 127.5..132.
    expect(corners(boxOf(scene.meshOf(C)))).toEqual([127.5, 0, 0, 132, 96, 96]);
    // The 3D asks the shared renderer for one frame, from the in-memory store: the store here has no save hook.
    expect(invalidate).toHaveBeenCalledTimes(1);
    scene.dispose();
  });

  it('a changed opening rebuilds only its host wall', () => {
    const store = createModelStore({ objects: fixture() });
    const scene = createScene3d({ store });
    const door = store.getState().objects.get(DOOR)!;
    const attrs = door.data.attributes as Record<string, unknown>;
    store.applyEdit([{ id: DOOR, value: { ...door, data: { ...door.data, attributes: { ...attrs, width: 30 } } } }]);
    expect(scene.stats().lastRebuilt).toEqual([A]);
    scene.dispose();
  });

  it('an undo rebuilds the wall again from the undone value', () => {
    const store = createModelStore({ objects: fixture() });
    const scene = createScene3d({ store });
    store.applyEdit([moved(store.getState().objects, C, 12)]);
    store.undo();
    expect(scene.stats().lastRebuilt).toEqual([C]);
    // Back on x = 120: x 115.5..120.
    expect(corners(boxOf(scene.meshOf(C)))).toEqual([115.5, 0, 0, 120, 96, 96]);
    scene.dispose();
  });

  it('the hosted door cuts the wall: the wall is a notched outline, not a box', () => {
    const store = createModelStore({ objects: fixture() });
    const scene = createScene3d({ store });
    // Wall A (x = 0, drawn north) has its thickness east: x 0..4.5. A plain extruded rectangle has 4 side faces
    // (8 side triangles) and two 2-triangle caps, 12 triangles; the door notch adds 4 outline points, so more.
    const a = scene.meshOf(A) as Mesh;
    expect(corners(boxOf(a))).toEqual([0, 0, 0, 4.5, 96, 96]);
    const plain = scene.meshOf(B) as Mesh;
    expect(plain.geometry.getAttribute('position').count).toBe(36);
    expect(a.geometry.getAttribute('position').count).toBeGreaterThan(36);
    scene.dispose();
  });

  it('a deleted wall leaves the scene, and with no walls or rooms the scene is empty', () => {
    const store = createModelStore({ objects: fixture() });
    const scene = createScene3d({ store });
    const listener = vi.fn();
    scene.subscribe(listener);
    store.applyEdit([{ id: A, value: null }]);
    expect(scene.meshOf(A)).toBeUndefined();
    expect(scene.stats().walls).toBe(3);
    expect(scene.isEmpty()).toBe(false);
    store.applyEdit([B, C, D, ROOM, DOOR].map((id) => ({ id, value: null })));
    expect(scene.isEmpty()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    scene.dispose();
  });

  it('follows the phase view and the open floor', () => {
    const objects = fixture();
    objects.set(B, wallValue({ x: 0, y: 96 }, { x: 120, y: 96 }, FLOOR, 'demo'));
    const store = createModelStore({ objects });
    let hideDemo = true;
    const phaseListeners = new Set<() => void>();
    const phase = {
      version: () => (hideDemo ? 1 : 2),
      shown: (status: unknown) => !(hideDemo && status === 'demo'),
      subscribe: (l: () => void) => (phaseListeners.add(l), () => phaseListeners.delete(l)),
    };
    let chosenId: string | null = null;
    const floorListeners = new Set<() => void>();
    const floors = {
      getState: () => ({ chosenId }),
      subscribe: (l: () => void) => (floorListeners.add(l), () => floorListeners.delete(l)),
    };
    const scene = createScene3d({ store, phase, floors });
    expect(scene.meshOf(B)).toBeUndefined();
    hideDemo = false;
    for (const l of phaseListeners) l();
    expect(scene.stats().lastRebuilt).toEqual([B]);
    chosenId = FLOOR_2;
    for (const l of floorListeners) l();
    expect(scene.stats().walls).toBe(1);
    expect(scene.meshOf(UP)).toBeDefined();
    scene.dispose();
  });
});
