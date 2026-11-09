// EZD-120b U1, U2 (vault/plans/EZD-120b.md section 4; AC-EZD-120b-2, -3). Expected values: Decided "Patch",
// "Undo, redo", "Changed ids". v(n) is the plan's unit value.
import { CURRENT_SCHEMA_VERSION, NO_NUMBERS, type Point } from '@ezdraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { wallEditChanges } from '../tools';
import {
  F1,
  baseObjects,
  idSeq,
  roomValue,
  uid,
  wallsOf,
  withWalls,
} from '../tools/test-utils/fixtures';
import { v } from '../../../test-harness/outbox/sync-support';
import { applyEditTo, makeEdit, type Objects } from './patches';
import { createModelStore } from './model-store';

const mapOf = (ids: string[]) => new Map(ids.map((id, i) => [id, v(i + 1)]));

describe('EZD-120b model store', () => {
  it('U1 edits, undoes and redoes with the same Edit moving between past and future', () => {
    const store = createModelStore({ objects: mapOf(['A', 'B', 'C']) });
    const oldA = store.getState().objects.get('A');

    store.applyEdit([{ id: 'A', value: v(10) }]);
    const edit = store.getState().past.at(-1);
    expect(edit).toBeDefined();
    expect(store.getState().objects.get('A')).toEqual(v(10));

    store.undo();
    expect(store.getState().future.at(-1)).toBe(edit);
    expect(store.getState().objects.get('A')).toEqual(oldA);

    store.redo();
    expect(store.getState().past.at(-1)).toBe(edit);
    expect(store.getState().objects.get('A')).toEqual(v(10));

    store.applyEdit([{ id: 'D', value: v(4) }]);
    expect(store.getState().objects.has('D')).toBe(true);
    expect(store.getState().future).toHaveLength(0);
    store.undo();
    expect(store.getState().objects.has('D')).toBe(false);

    const oldB = store.getState().objects.get('B');
    store.applyEdit([{ id: 'B', value: null }]);
    expect(store.getState().objects.has('B')).toBe(false);
    store.undo();
    expect(store.getState().objects.get('B')).toEqual(oldB);
  });

  it('U1 makeEdit sets before and after, and applyEditTo applies both directions', () => {
    const objects = mapOf(['A', 'B']);
    const edit = makeEdit(objects, [
      { id: 'A', value: v(10) },
      { id: 'B', value: null },
      { id: 'D', value: v(4) },
    ]);
    const byId = new Map(edit.patches.map((p) => [p.id, p]));
    expect(edit.patches.map((p) => p.id)).toEqual(['A', 'B', 'D']);
    expect(byId.get('A')).toEqual({ id: 'A', before: v(1), after: v(10) });
    expect(byId.get('B')).toEqual({ id: 'B', before: v(2), after: null });
    expect(byId.get('D')).toEqual({ id: 'D', before: null, after: v(4) });
    const forward = applyEditTo(objects, edit, 'forward');
    expect(forward.get('A')).toEqual(v(10));
    expect(forward.has('B')).toBe(false);
    expect(forward.get('D')).toEqual(v(4));
    const back = applyEditTo(forward, edit, 'back');
    expect([...back.entries()]).toEqual([...objects.entries()].map(([k, x]) => [k, x]));
  });

  it('U2 reports changed ids in patch order, calls onCommit once, keeps other values and refuses a repeated id', () => {
    const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const objects = mapOf(ids);
    const originals = new Map(objects);
    const onCommit = vi.fn();
    const store = createModelStore({ objects, onCommit });

    const changes = [
      { id: 'B', value: v(20) },
      { id: 'C', value: v(30) },
    ];
    const returned = store.applyEdit(changes);
    expect(returned).toEqual(['B', 'C']);
    expect(store.getState().lastChangedIds).toEqual(['B', 'C']);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(changes);
    const after = store.getState().objects;
    expect(after).not.toBe(objects);
    for (const id of ids.filter((i) => i !== 'B' && i !== 'C')) {
      expect(after.get(id)).toBe(originals.get(id));
    }
    expect(after.get('B')).toEqual(v(20));

    const before = store.getState();
    expect(() =>
      store.applyEdit([
        { id: 'B', value: v(21) },
        { id: 'B', value: v(22) },
      ]),
    ).toThrow('duplicate_object_id');
    expect(store.getState().objects).toBe(before.objects);
    expect(store.getState().past).toHaveLength(before.past.length);
    expect(onCommit).toHaveBeenCalledTimes(1);

    expect(store.applyEdit([])).toEqual([]);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(store.getState().past).toHaveLength(before.past.length);
  });
});

// EZD-294 S1-S5 (vault/plans/EZD-294.md section 4; Decided "Store highs", "Apply saved numbers"; Q-0625 (a)
// "never reused"; Q-0629 (b); AC-EZD-294-1).
const p = (x: number, y: number): Point => ({ x, y });

function numberedWall(objects: Map<string, ObjectValue>, id: string, n: number): void {
  const v = objects.get(id)!;
  const attrs = (v.data as { attributes: Record<string, unknown> }).attributes;
  objects.set(id, { ...v, data: { ...v.data, attributes: { ...attrs, number: n } } });
}

function fourNumbered(): Map<string, ObjectValue> {
  const objects = withWalls(baseObjects(), 1, [p(0, 0), p(144, 0), p(144, 120), p(0, 120)], true);
  [1, 2, 3, 4].forEach((k) => numberedWall(objects, uid(k), k));
  return objects;
}

function newWallChanges(objects: Objects, highs: typeof NO_NUMBERS, id: number) {
  const scratch = withWalls(new Map(), id, [p(500, 0), p(644, 0)], false);
  const wall = wallsOf(scratch)[0]!;
  return wallEditChanges(objects, F1, [wall], idSeq(id + 10), highs);
}

const numberOfChange = (changes: ReturnType<typeof newWallChanges>, id: string): unknown =>
  (changes.find((c) => c.id === id)?.value?.data.attributes as Record<string, unknown>).number;

describe('EZD-294 model store numbers', () => {
  it("EZD-294 S1 the store starts from the load's highs and its objects", () => {
    const objects = new Map<string, ObjectValue>([
      [
        uid(1),
        {
          type: 'wall',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: { attributes: { number: 3 } },
        },
      ],
      [
        uid(2),
        {
          type: 'opening',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: { attributes: { kind: 'door', number: 5 } },
        },
      ],
    ]);
    const withHighs = createModelStore({
      objects,
      numberHighs: { wall: 7, door: 2, window: 0 },
    });
    expect(withHighs.getState().numberHighs).toEqual({ wall: 7, door: 5, window: 0 });
    const without = createModelStore({ objects });
    expect(without.getState().numberHighs).toEqual({ wall: 3, door: 5, window: 0 });
  });

  it("EZD-294 S2 a deleted wall's number is not reused", () => {
    const store = createModelStore({ objects: fourNumbered() });
    store.applyEdit([{ id: uid(4), value: null }]);
    expect(store.getState().numberHighs.wall).toBe(4);
    const ch = newWallChanges(store.getState().objects, store.getState().numberHighs, 20);
    expect(numberOfChange(ch, uid(20))).toBe(5);
  });

  it('EZD-294 S3 undo and redo never lower the highs', () => {
    const store = createModelStore({ objects: fourNumbered() });
    const ch = newWallChanges(store.getState().objects, store.getState().numberHighs, 20);
    store.applyEdit(ch.filter((c) => c.id === uid(20)));
    expect(store.getState().numberHighs.wall).toBe(5);
    store.undo();
    expect(store.getState().numberHighs.wall).toBe(5);
    store.redo();
    expect(store.getState().numberHighs.wall).toBe(5);
    store.undo();
    expect(store.getState().numberHighs.wall).toBe(5);
    const next = newWallChanges(store.getState().objects, store.getState().numberHighs, 21);
    expect(numberOfChange(next, uid(21))).toBe(6);
  });

  it('EZD-294 S4 applySavedNumbers puts the server number in the open model', () => {
    const objects = baseObjects();
    const walls = withWalls(objects, 1, [p(0, 0), p(144, 0)], false);
    numberedWall(walls, uid(1), 5);
    walls.set(uid(2), roomValue([p(0, 0), p(144, 0), p(144, 120)], 'Room 1', null));
    const onCommit = vi.fn();
    const store = createModelStore({ objects: walls, numberHighs: NO_NUMBERS, onCommit });
    const saved = [
      { id: uid(1).toUpperCase(), number: 6 },
      { id: uid(2) },
      { id: uid(9), number: 3 },
    ];
    expect(store.applySavedNumbers(saved)).toEqual([uid(1)]);
    const state = store.getState();
    const attrs = state.objects.get(uid(1))!.data.attributes as Record<string, unknown>;
    expect(attrs.number).toBe(6);
    expect(state.numberHighs.wall).toBe(6);
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(0);
    expect(onCommit).not.toHaveBeenCalled();
    expect(store.applySavedNumbers(saved)).toEqual([]);
  });

  it('EZD-294 S5 Keep theirs raises the highs', () => {
    const numbered = (n: number): ObjectValue => ({
      type: 'wall',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { attributes: { number: n } },
    });
    const store = createModelStore({ objects: new Map([[uid(2), numbered(4)]]) });
    expect(store.getState().numberHighs.wall).toBe(4);
    store.applyRemote([{ id: uid(1), value: numbered(7) }]);
    expect(store.getState().numberHighs.wall).toBe(7);
    expect(store.getState().past).toHaveLength(0);
    expect(store.getState().future).toHaveLength(0);
    store.applyRemote([{ id: uid(1), value: null }]);
    expect(store.getState().numberHighs.wall).toBe(7);
    expect(store.getState().past).toHaveLength(0);
    expect(store.getState().future).toHaveLength(0);
  });
});

// EZD-299b T5 (vault/plans/EZD-299b.md section 4; AC-EZD-299-2; Decided D-Remote): a change that came from the
// server goes into the objects without an edit, a queue entry or an undo step.
describe('EZD-299b model store applyRemote', () => {
  it('EZD-299b T5 applies remote changes with no undo step and no onCommit, and refuses a repeated id', () => {
    const onCommit = vi.fn();
    const store = createModelStore({ objects: new Map([['A', v(1)]]), onCommit });
    store.applyEdit([{ id: 'A', value: v(2) }]);
    onCommit.mockClear();
    expect(store.getState().past).toHaveLength(1);

    const returned = store.applyRemote([
      { id: 'A', value: v(9) },
      { id: 'B', value: null },
    ]);
    expect(returned).toEqual(['A', 'B']);
    expect(store.getState().objects.get('A')).toEqual(v(9));
    expect(store.getState().lastChangedIds).toEqual(['A', 'B']);
    expect(store.getState().past).toHaveLength(1);
    expect(store.getState().future).toHaveLength(0);
    expect(onCommit).toHaveBeenCalledTimes(0);

    const state = store.getState();
    expect(store.applyRemote([])).toEqual([]);
    expect(store.getState()).toBe(state);

    expect(() =>
      store.applyRemote([
        { id: 'A', value: v(3) },
        { id: 'A', value: v(4) },
      ]),
    ).toThrow('duplicate_object_id');
    expect(onCommit).toHaveBeenCalledTimes(0);
  });
});
