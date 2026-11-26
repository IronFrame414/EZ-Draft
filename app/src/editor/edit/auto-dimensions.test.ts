// EZD-216 (AC-EZD-216-4 "Auto room dimensions and the auto overall dimension are placed automatically. They can be
// moved, and they update after a wall move with the user's offset kept"; AC-EZD-216-8 "An auto room dimension takes
// its room's status. The overall dimension is Existing"; Q-0686 case 1 (a) "nothing is written on open; the next wall
// edit on that floor adds them", case 2 (a) "a wall-face dimension is deleted in the same edit as its wall"; Q-0685
// (a) "Delete skips auto dimensions"). Through the model store, as every edit runs.
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  parseStoredObject,
  type DimensionData,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import { createModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import { dimensionChange, wallChange } from '../tools/model-changes';
import { baseObjects, F1, idSeq, roomValue, uid, withWalls } from '../tools/test-utils/fixtures';
import { deleteChanges } from './edit-changes';
import { withAutoDimensions } from './auto-dimensions';

const pt = (x: number, y: number): Point => ({ x, y });
const BOUNDARY = [pt(0, 0), pt(150, 0), pt(150, 120), pt(0, 120)];

function drawing(roomStatus: 'existing' | 'new' = 'existing') {
  const m = withWalls(baseObjects(), 1, BOUNDARY, true);
  const room = roomValue(BOUNDARY, 'Kitchen', null);
  m.set(uid(30), { ...room, data: { ...room.data, status: roomStatus } });
  return m;
}

function wallOf(objects: Objects, id: string): WallObject {
  const v = objects.get(id)!;
  const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
  if (!r.ok || r.object.type !== 'wall') throw new Error('wall');
  return r.object;
}

const dims = (objects: Objects) =>
  [...objects]
    .filter(([, v]) => v.type === 'dimension')
    .map(([id, v]) => ({ id, data: v.data as unknown as DimensionData }));

const autoOf = (objects: Objects, kind: 'room' | 'overall', axis: 'x' | 'y') =>
  dims(objects).find(
    (d) =>
      d.data.attributes.auto === kind &&
      d.data.geometry.kind === 'auto' &&
      d.data.geometry.axis === axis,
  );

// The south wall moved 12" south: the edit the Move tool makes.
function moveSouth(objects: Objects, by: number) {
  const w = wallOf(objects, uid(1));
  const g = w.data.geometry;
  return wallChange({
    ...w,
    data: {
      ...w.data,
      geometry: { ...g, start: pt(g.start.x, g.start.y - by), end: pt(g.end.x, g.end.y - by) },
    },
  });
}

describe('EZD-216 auto dimensions on every edit', () => {
  it('Q-0686 case 1 (a): opening writes nothing; the first wall edit adds the room pair and the overall pair', () => {
    const store = createModelStore({ objects: drawing('new'), newId: idSeq(900) });
    expect(dims(store.getState().objects)).toEqual([]);
    store.applyEdit([moveSouth(store.getState().objects, 12)]);
    const o = store.getState().objects;
    expect(dims(o)).toHaveLength(4);
    // AC-8: the room's dimensions take its status; the overall pair is Existing.
    expect(autoOf(o, 'room', 'x')?.data.status).toBe('new');
    expect(autoOf(o, 'room', 'y')?.data.status).toBe('new');
    expect(autoOf(o, 'room', 'x')?.data.attributes.room).toBe(uid(30));
    expect(autoOf(o, 'overall', 'x')?.data.status).toBe('existing');
    expect(autoOf(o, 'overall', 'y')?.data.level).toBe(F1);
    // One undo step: the wall and its auto dimensions go back together.
    store.undo();
    expect(dims(store.getState().objects)).toEqual([]);
  });

  it('AC-4: a moved auto dimension keeps its offset after the next wall move, under the same id', () => {
    const store = createModelStore({ objects: drawing(), newId: idSeq(900) });
    store.applyEdit([moveSouth(store.getState().objects, 12)]);
    const overall = autoOf(store.getState().objects, 'overall', 'x')!;
    store.applyEdit([
      dimensionChange({
        id: overall.id,
        type: 'dimension',
        data: { ...overall.data, attributes: { ...overall.data.attributes, offset: 50 } },
      }),
    ]);
    store.applyEdit([moveSouth(store.getState().objects, 6)]);
    const after = autoOf(store.getState().objects, 'overall', 'x')!;
    expect(after.id).toBe(overall.id);
    expect(after.data.attributes.offset).toBe(50);
    expect(dims(store.getState().objects)).toHaveLength(4);
  });

  it('a wall status alone is not a measured change: nothing is added', () => {
    const objects = drawing();
    const w = wallOf(objects, uid(2));
    const changes = [wallChange({ ...w, data: { ...w.data, status: 'demo' } })];
    expect(withAutoDimensions(objects, changes, idSeq(900))).toBe(changes);
  });

  it('Q-0686 case 2 (a): a wall-face dimension goes in the same edit as its wall', () => {
    const objects = drawing();
    objects.set(uid(40), {
      type: 'dimension',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: {
        geometry: { kind: 'wall_face', wallId: uid(1), face: 'left' },
        status: 'existing',
        level: F1,
        attributes: { kind: 'linear', offset: 12, override: null, auto: null, room: null },
      },
    });
    const store = createModelStore({ objects, newId: idSeq(900) });
    store.applyEdit(deleteChanges(store.getState().objects, F1, [uid(1)], idSeq(800)));
    expect(store.getState().objects.has(uid(40))).toBe(false);
    expect(store.getState().objects.has(uid(1))).toBe(false);
  });

  it('Q-0685 (a): Delete removes a placed dimension and skips an auto dimension', () => {
    const store = createModelStore({ objects: drawing(), newId: idSeq(900) });
    store.applyEdit([moveSouth(store.getState().objects, 12)]);
    const o = store.getState().objects;
    const auto = autoOf(o, 'room', 'x')!;
    const placed = {
      geometry: { kind: 'points', from: pt(0, 0), to: pt(150, 0) },
      status: 'existing',
      level: F1,
      attributes: { kind: 'linear', offset: -24, override: null, auto: null, room: null },
    } as const;
    store.applyEdit([dimensionChange({ id: uid(41), type: 'dimension', data: placed })]);
    const changes = deleteChanges(store.getState().objects, F1, [auto.id, uid(41)], idSeq(800));
    expect(changes.find((c) => c.id === uid(41))?.value).toBeNull();
    expect(changes.some((c) => c.id === auto.id)).toBe(false);
    expect(deleteChanges(store.getState().objects, F1, [auto.id], idSeq(800))).toEqual([]);
  });
});
