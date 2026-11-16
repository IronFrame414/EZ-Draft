// EZD-6001 U1-U7 (vault/plans/EZD-6001.md section 4; Decided D-List, D-Open, D-Store, D-Add, D-Rename, D-Delete;
// AC-EZD-6001-1, -2, -3). Expected values come from the plan's rows: floors by order then id, the chosen floor
// else the lowest, objects named by raw `data.level` in any case, a new floor's order one past the highest.
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { Objects } from '../model/patches';
import { openFloorId, planDrawingList } from '../plan/batches';
import {
  addFloorChange,
  createFloorView,
  deleteFloorChanges,
  listFloors,
  nextFloorOrder,
  objectsOnFloor,
  renameFloorChange,
  resolveOpenFloor,
} from './floors';

const F1 = '00000000-0000-4000-8000-0000000000f1';
const F2 = '00000000-0000-4000-8000-0000000000f2';
const F3 = '00000000-0000-4000-8000-0000000000f0';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const floor = (name: string, order: number): ObjectValue => ({
  type: 'floor',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: { name, order },
});

function wall(level: string, x = 0): ObjectValue {
  const made = createWallData({ start: { x, y: 0 }, end: { x: x + 120, y: 0 }, level });
  if (!made.ok) throw new Error('wall fixture');
  return {
    type: 'wall',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: made.data as unknown as Record<string, unknown>,
  };
}

const map = (entries: Array<[string, ObjectValue]>): Objects => new Map(entries);

describe('EZD-6001 floors', () => {
  const objs = map([
    [F2, floor('Up', 2)],
    [F1, floor('Main', 1)],
    [F3, floor('Tie', 2)],
    [id(1), wall(F1)],
  ]);

  it('EZD-6001 U1 listFloors orders by order then id and leaves other objects out', () => {
    expect(listFloors(objs)).toEqual([
      { id: F1, name: 'Main', order: 1 },
      { id: F3, name: 'Tie', order: 2 },
      { id: F2, name: 'Up', order: 2 },
    ]);
  });

  it('EZD-6001 U2 resolveOpenFloor keeps a chosen floor, else the lowest, else null', () => {
    expect(resolveOpenFloor(objs, F2)).toBe(F2);
    expect(resolveOpenFloor(objs, F2.toUpperCase())).toBe(F2);
    expect(resolveOpenFloor(objs, 'gone')).toBe(F1);
    expect(resolveOpenFloor(objs, null)).toBe(F1);
    expect(resolveOpenFloor(new Map(), null)).toBeNull();
  });

  it('EZD-6001 U3 objectsOnFloor lists every object naming the floor, any case, parsed or not', () => {
    const room = { type: 'room', schemaVersion: CURRENT_SCHEMA_VERSION, data: { level: F2 } };
    const opening = {
      type: 'opening',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { level: F2.toUpperCase() },
    };
    const unknown = { type: 'mystery', schemaVersion: CURRENT_SCHEMA_VERSION, data: { level: F2 } };
    const o = map([
      [F1, floor('Main', 1)],
      [F2, floor('Up', 2)],
      [id(14), wall(F2)],
      [id(12), opening],
      [id(13), room],
      [id(11), wall(F1)],
      [id(10), unknown],
    ]);
    expect(objectsOnFloor(o, F2)).toEqual([id(10), id(12), id(13), id(14)]);
  });

  it('EZD-6001 U4 add takes the next order; rename trims and refuses empty, same or non-floor ids', () => {
    const o = map([
      [F1, floor('Main', 1)],
      [F2, floor('Up', 3)],
      [id(1), wall(F1)],
    ]);
    expect(nextFloorOrder(o)).toBe(4);
    expect(nextFloorOrder(new Map())).toBe(1);
    expect(addFloorChange(o, 'n1', 'Floor 4')).toEqual({
      id: 'n1',
      value: {
        type: 'floor',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: { name: 'Floor 4', order: 4 },
      },
    });
    expect(renameFloorChange(o, F2, '  Basement ')).toEqual({
      id: F2,
      value: {
        type: 'floor',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: { name: 'Basement', order: 3 },
      },
    });
    expect(renameFloorChange(o, F2, '   ')).toBeNull();
    expect(renameFloorChange(o, F2, 'Up')).toBeNull();
    expect(renameFloorChange(o, id(1), 'Basement')).toBeNull();
  });

  it('EZD-6001 U5 deleteFloorChanges deletes the objects then the floor; never the only floor', () => {
    const o = map([
      [F1, floor('Main', 1)],
      [F2, floor('Up', 2)],
      [id(2), wall(F2, 200)],
      [id(1), wall(F2)],
      [id(3), wall(F1)],
    ]);
    expect(deleteFloorChanges(o, F2)).toEqual([
      { id: id(1), value: null },
      { id: id(2), value: null },
      { id: F2, value: null },
    ]);
    expect(deleteFloorChanges(map([[F1, floor('Main', 1)]]), F1)).toBeNull();
    expect(deleteFloorChanges(o, 'unknown')).toBeNull();
  });

  it('EZD-6001 U6 the floor view starts on no choice and tells once per change', () => {
    const view = createFloorView();
    expect(view.getState()).toEqual({ chosenId: null });
    let calls = 0;
    view.subscribe(() => calls++);
    view.setOpenFloor(F2);
    view.setOpenFloor(F2);
    expect(view.getState().chosenId).toBe(F2);
    expect(calls).toBe(1);
  });

  it('EZD-6001 U7 the drawing list and open floor follow the chosen floor', () => {
    const o = map([
      [F1, floor('Main', 1)],
      [F2, floor('Up', 2)],
      [id(1), wall(F1)],
      [id(2), wall(F2)],
    ]);
    const ids = (chosen: string | null) =>
      new Set(planDrawingList(o, {}, null, chosen)!.items.map((i) => i.objectId));
    expect(ids(F2)).toEqual(new Set([id(2)]));
    expect(ids(null)).toEqual(new Set([id(1)]));
    expect(openFloorId(o, F2)).toBe(F2);
  });
});
