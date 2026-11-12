// EZD-213a - T11-T18 (vault/plans/EZD-213a.md section 4; AC-EZD-213-8, -13, -14, -20, -22, -23): inspector field
// commits as one Change[] for one applyEdit. Expected values: Q-0630 rows 12, 13, 20, "Door offset"; 09k Typed
// length, Partition 6 1/2", Door resize; 09j rows 13, 16; Q-0570; Q-0640 rows 5-2, 5-4; Q-0645 (a); P212a
// `resizeOpening`; plan Decided "Selection ids", "Which objects a field takes", "Single-object fields", "Commit".
// Every edit runs on a fresh builder call unless the row applies it. Floats use toBeCloseTo(v, 9).
// Inputs the plan's T16 row leaves open (the edit for ids [] and [uid(99)], the values of the refused edits) reuse
// values the plan gives in other rows: thickness 6.5 (T13), length 150 (T11), layer (0, drywall 0.625) (T20),
// swing 'right' (T17).
import { describe, expect, it } from 'vitest';
import {
  NO_NUMBERS,
  openingOffsets,
  reconcileRooms,
  roomAreaSqFt,
  wallLength,
  parseLength,
  type OpeningData,
  type Point,
  type WallData,
  type WallObject,
} from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore, type ModelStore } from '../model/model-store';
import type { Change, Objects } from '../model/patches';
import { openingsOn, toModelObjects } from '../tools/model-changes';
import {
  inspectorEditChanges,
  type InspectorEdit,
  type InspectorEditResult,
} from './inspector-edits';
import { F1, houseObjects, idSeq, roomObjects, uid } from './test-utils/fixtures';

const run = (objects: Objects, ids: readonly string[], edit: InspectorEdit): InspectorEditResult =>
  inspectorEditChanges({ objects, level: F1, ids, edit, newId: idSeq(900), highs: NO_NUMBERS });

const okChanges = (r: InspectorEditResult): Change[] => {
  expect(r.ok, JSON.stringify(r)).toBe(true);
  if (!r.ok) throw new Error(`refused: ${r.reason} ${r.id}`);
  return r.changes;
};

const changeOf = (changes: Change[], id: string): ObjectValue => {
  const c = changes.find((x) => x.id === id);
  expect(c, `change for ${id}`).toBeDefined();
  expect(c!.value).not.toBeNull();
  return c!.value!;
};
const wallDataOf = (v: ObjectValue): WallData => v.data as unknown as WallData;
const openingDataOf = (v: ObjectValue): OpeningData => v.data as unknown as OpeningData;

const applied = (objects: Objects, changes: Change[]): ModelStore => {
  const store = createModelStore({ objects });
  store.applyEdit(changes);
  return store;
};

const expectPoint = (got: Point, x: number, y: number, label: string) => {
  expect(got.x, `${label}.x`).toBeCloseTo(x, 9);
  expect(got.y, `${label}.y`).toBeCloseTo(y, 9);
};

const storedWall = (objects: Objects, id: string): WallData => wallDataOf(objects.get(id)!);

type RoomData = { geometry: { boundary: Point[] }; attributes: { name: string } };
const roomNamed = (objects: Objects, name: string): Point[] => {
  const found = [...objects.values()].filter(
    (v) => v.type === 'room' && (v.data as unknown as RoomData).attributes.name === name,
  );
  expect(found, `rooms named ${name}`).toHaveLength(1);
  return (found[0]!.data as unknown as RoomData).geometry.boundary;
};

describe('EZD-213a done when: inspector edits give the values, refusals and one undo step of the plan', () => {
  it('EZD-213a T11 typed Length moves the end', () => {
    const objects = roomObjects();
    const changes = okChanges(run(objects, [uid(1)], { field: 'wallLength', inches: 150 }));
    expect(changes.some((c) => c.id === uid(32))).toBe(false);
    const store = applied(objects, changes);
    const after = store.getState().objects;

    const w1 = storedWall(after, uid(1)).geometry;
    expectPoint(w1.start, 0, 0, 'uid(1) start');
    expectPoint(w1.end, 150, 0, 'uid(1) end');
    const w2 = storedWall(after, uid(2)).geometry;
    expectPoint(w2.start, 150, 0, 'uid(2) start');
    expectPoint(w2.end, 150, 120, 'uid(2) end');
    expectPoint(storedWall(after, uid(3)).geometry.start, 150, 120, 'uid(3) start');

    expect(roomAreaSqFt(roomNamed(after, 'Kitchen'))).toBe(125);

    const walls = toModelObjects(after, F1).filter((o): o is WallObject => o.type === 'wall');
    const host = walls.find((w) => w.id === uid(1))!;
    const win = openingsOn(after, F1).find((o) => o.id === uid(32))!;
    expect(win).toBeDefined();
    const off = openingOffsets(win, host, walls);
    expect(off).not.toBeNull();
    expect(off!.left).toBeCloseTo(54, 9);

    expect(store.getState().past).toHaveLength(1);
  });

  it('EZD-213a T12 Length limits', () => {
    expect(parseLength('0"', 'wall_room')).toMatchObject({ ok: false, reason: 'not_positive' });
    expect(parseLength('200\' 0 1/16"', 'wall_room')).toMatchObject({
      ok: false,
      reason: 'over_max',
    });
    expect(parseLength("200'", 'wall_room')).toEqual({ ok: true, inches: 2400 });

    const changes = okChanges(run(roomObjects(), [uid(1)], { field: 'wallLength', inches: 2400 }));
    expect(wallLength(wallDataOf(changeOf(changes, uid(1))).geometry)).toBeCloseTo(2400, 9);

    expect(run(roomObjects(), [uid(1)], { field: 'wallLength', inches: 2400.0625 })).toEqual({
      ok: false,
      reason: 'too_long',
      id: uid(1),
    });
    expect(run(roomObjects(), [uid(1)], { field: 'wallLength', inches: Number.NaN })).toEqual({
      ok: false,
      reason: 'invalid_input',
      id: uid(1),
    });
  });

  it('EZD-213a T13 partition at 6 1/2"', () => {
    const objects = houseObjects();
    const changes = okChanges(run(objects, [uid(5)], { field: 'wallThickness', inches: 6.5 }));
    expect(changes.some((c) => c.id === uid(31))).toBe(false);
    const after = applied(objects, changes).getState().objects;

    const kitchen = roomNamed(after, 'Kitchen');
    expect(Math.max(...kitchen.map((p) => p.x))).toBeCloseTo(56.75, 9);
    expect(roomAreaSqFt(kitchen)).toBe(47);

    const laundry = roomNamed(after, 'Laundry');
    const minX = Math.min(...laundry.map((p) => p.x));
    const maxX = Math.max(...laundry.map((p) => p.x));
    expect(minX).toBeCloseTo(63.25, 9);
    expect(maxX - minX).toBeCloseTo(80.75, 9);
    expect(roomAreaSqFt(laundry)).toBe(67);
  });

  it('EZD-213a T14 thickness refusals reach the inspector', () => {
    expect(run(houseObjects(), [uid(1)], { field: 'wallThickness', inches: 1 })).toEqual({
      ok: false,
      reason: 'stud_not_positive',
      id: uid(1),
    });
    for (const [inches, stud] of [
      [1.0625, 0.0625],
      [48, 47],
    ] as const) {
      const changes = okChanges(run(houseObjects(), [uid(1)], { field: 'wallThickness', inches }));
      const layers = wallDataOf(changeOf(changes, uid(1))).attributes.layers;
      expect(layers[1]!.material).toBe('stud');
      expect(layers[1]!.thickness, `stud at ${inches}`).toBeCloseTo(stud, 9);
    }
  });

  it('EZD-213a T15 one field over two walls is one undo step', () => {
    const objects = houseObjects();
    const ids = [uid(1), uid(2)];
    const changes = okChanges(run(objects, ids, { field: 'wallThickness', inches: 6.5 }));
    for (const id of ids) {
      expect(wallDataOf(changeOf(changes, id)).attributes.thickness).toBeCloseTo(6.5, 9);
    }
    const store = applied(objects, changes);
    expect(store.getState().past).toHaveLength(1);
    store.undo();
    for (const id of ids) {
      expect(storedWall(store.getState().objects, id).attributes.thickness).toBeCloseTo(4.5, 9);
    }

    const height = okChanges(
      run(store.getState().objects, ids, { field: 'wallHeight', inches: 108 }),
    );
    store.applyEdit(height);
    expect(store.getState().past).toHaveLength(1);
    for (const id of ids) {
      expect(storedWall(store.getState().objects, id).attributes.height).toBeCloseTo(108, 9);
    }
  });

  it('EZD-213a T16 selection refusals and no-ops', () => {
    for (const objects of [roomObjects(), houseObjects()]) {
      const rec = reconcileRooms(toModelObjects(objects, F1), F1, idSeq(900));
      expect(rec.create).toEqual([]);
      expect(rec.update).toEqual([]);
      expect(rec.delete).toEqual([]);
    }

    const thick = { field: 'wallThickness', inches: 6.5 } as const;
    expect(run(houseObjects(), [], thick)).toEqual({ ok: true, changes: [] });
    expect(run(houseObjects(), [uid(99)], thick)).toEqual({
      ok: false,
      reason: 'not_found',
      id: uid(99),
    });
    expect(run(houseObjects(), [uid(1), uid(2)], { field: 'wallLength', inches: 150 })).toEqual({
      ok: false,
      reason: 'not_shared',
      id: uid(1),
    });
    expect(
      run(houseObjects(), [uid(1), uid(2)], {
        field: 'wallLayer',
        index: 0,
        layer: { material: 'drywall', thickness: 0.625 },
      }),
    ).toEqual({ ok: false, reason: 'not_shared', id: uid(1) });
    expect(run(houseObjects(), [uid(1), uid(30)], thick)).toEqual({
      ok: false,
      reason: 'not_applicable',
      id: uid(30),
    });
    expect(run(houseObjects(), [uid(32)], { field: 'swing', value: 'right' })).toEqual({
      ok: false,
      reason: 'not_door',
      id: uid(32),
    });
    expect(run(houseObjects(), [uid(1)], { field: 'wallThickness', inches: 4.5 })).toEqual({
      ok: true,
      changes: [],
    });
    const twice = okChanges(run(houseObjects(), [uid(1), uid(1)], thick));
    expect(twice).toHaveLength(1);
    expect(twice[0]!.id).toBe(uid(1));
  });

  it('EZD-213a T17 door and window fields', () => {
    const door = uid(30);
    const one = (edit: InspectorEdit): OpeningData => {
      const changes = okChanges(run(houseObjects(), [door], edit));
      expect(changes).toHaveLength(1);
      expect(changes[0]!.id).toBe(door);
      return openingDataOf(changeOf(changes, door));
    };

    const narrow = one({ field: 'openingWidth', inches: 32 });
    expectPoint(narrow.geometry.center, 28, 0, 'width 32 centre');
    expect(narrow.attributes.roughOpening.width).toBeCloseTo(34, 9);
    expect(narrow.attributes.roughOpening.height).toBeCloseTo(82.5, 9);

    expect(one({ field: 'swing', value: 'right' }).attributes.swing).toBe('right');

    expect(run(houseObjects(), [door], { field: 'hand', value: 'left' })).toEqual({
      ok: true,
      changes: [],
    });

    const ro = one({ field: 'roughOpening', width: 40, height: 84 });
    expect(ro.attributes.roughOpening.width).toBeCloseTo(40, 9);
    expect(ro.attributes.roughOpening.height).toBeCloseTo(84, 9);
    expect(ro.attributes.roughOpeningMode).toBe('typed');

    expectPoint(
      one({ field: 'offsetLeft', inches: 20 }).geometry.center,
      38,
      0,
      'offset 20 centre',
    );

    expect(run(houseObjects(), [door], { field: 'offsetLeft', inches: 36 })).toEqual({
      ok: false,
      reason: 'past_corner',
      id: door,
    });

    expect(run(houseObjects(), [door], { field: 'roughOpening', width: 38, height: 82.5 })).toEqual(
      { ok: true, changes: [] },
    );

    for (const [inches, reason] of [
      [0, 'not_positive'],
      [Number.NaN, 'invalid_input'],
      [60, 'past_corner'],
    ] as const) {
      expect(run(houseObjects(), [door], { field: 'openingWidth', inches })).toEqual({
        ok: false,
        reason,
        id: door,
      });
    }
  });

  it('EZD-213a T18 bulk opening edits', () => {
    const objects = houseObjects();
    const ids = [uid(30), uid(31)];
    const changes = okChanges(run(objects, ids, { field: 'openingHeight', inches: 84 }));
    expect(changes).toHaveLength(2);
    for (const id of ids) {
      const a = openingDataOf(changeOf(changes, id)).attributes;
      expect(a.height).toBeCloseTo(84, 9);
      expect(a.roughOpening.width).toBeCloseTo(38, 9);
      expect(a.roughOpening.height).toBeCloseTo(86.5, 9);
    }
    expect(applied(objects, changes).getState().past).toHaveLength(1);

    expect(run(houseObjects(), [uid(32), uid(30)], { field: 'sillHeight', inches: 24 })).toEqual({
      ok: false,
      reason: 'not_window',
      id: uid(30),
    });

    expect(run(houseObjects(), ids, { field: 'offsetLeft', inches: 0 })).toEqual({
      ok: false,
      reason: 'not_shared',
      id: uid(30),
    });
  });
});
