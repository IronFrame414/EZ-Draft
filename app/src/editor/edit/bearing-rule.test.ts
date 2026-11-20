// EZD-215 (AC-EZD-215-1, -2). Expected values: 09q Bearing warning rows 1-4 (row 4 as Q-0708 reads it: undo restores
// the wall and removes its note in one step); Q-0704 (every change path, one per wall per action, the note's line is
// the wall's line, the wall's level); RC-015 test text. A real model store; Delete, Set status, the inspector and
// Paste through their own controllers; a placed door through the opening tool's change (`openingChange`).
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { commitInspectorEdits } from '../inspector/inspector-input';
import { createModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import { deleteFloorChanges } from '../floors/floors';
import { statusChanges } from './arrange-changes';
import { withBearingNotes } from './bearing-rule';
import { createEditController } from './edit-controller';
import { DOOR, F1, F2, ROOM, dataOf, idSeq, p, uid, withOpenings } from './test-utils/fixtures';

const bearing = (objects: Objects, ...walls: number[]): Map<string, ObjectValue> => {
  const next = new Map(objects);
  for (const n of walls) {
    const v = next.get(uid(n))!;
    const a = v.data.attributes as Record<string, unknown>;
    next.set(uid(n), { ...v, data: { ...v.data, attributes: { ...a, bearing: true } } });
  }
  return next;
};

const asNew = (v: ObjectValue): ObjectValue => ({ ...v, data: { ...v.data, status: 'new' } });

type NoteAttrs = { wallId: string; action: string; engineerName: string; letterOnFile: boolean };
const notes = (objects: Objects) =>
  [...objects].flatMap(([id, v]) =>
    v.type === 'engineer_note'
      ? [{ id, attrs: v.data.attributes as NoteAttrs, data: v.data as Record<string, unknown> }]
      : [],
  );

function controller(objects: Objects, selected: string[]) {
  let ids = [...selected];
  const listeners = new Set<() => void>();
  const selection = {
    getUi: () => ({ ids, selectMore: false }),
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    select: vi.fn((next: readonly string[]) => {
      ids = [...next];
    }),
    clear: vi.fn(() => {
      ids = [];
    }),
    selectTool: vi.fn(),
  };
  const store = createModelStore({ objects, newId: idSeq(900) });
  const edit = createEditController({
    store,
    selection,
    drawing: null,
    handle: {
      getCursor: () => null,
      screenToModel: (s) => s,
      getViewCenter: () => p(400, 400),
    },
    canEdit: true,
    newId: idSeq(100),
  });
  return { store, edit };
}

describe('EZD-215 bearing wall rule on every change path', () => {
  it('AC-1, 09q rows 1 and 4: Delete key deletes a bearing wall and adds one note in the same undo step', () => {
    const { store, edit } = controller(bearing(ROOM, 1), [uid(1)]);
    const line = dataOf(ROOM.get(uid(1))).geometry;
    const pastBefore = store.getState().past.length;
    edit.deleteSelection();
    const o = store.getState().objects;
    expect(o.has(uid(1))).toBe(false);
    const n = notes(o);
    expect(n).toHaveLength(1);
    expect(n[0]!.id).toBe(uid(900));
    expect(n[0]!.attrs).toEqual({
      wallId: uid(1),
      action: 'delete',
      engineerName: '',
      approvedText: '',
      fileId: null,
      letterOnFile: false,
    });
    expect(n[0]!.data.geometry).toEqual({ start: line.start, end: line.end });
    expect(n[0]!.data.level).toBe(F1);
    expect(n[0]!.data.status).toBe('existing');
    expect(store.getState().past.length).toBe(pastBefore + 1);

    edit.undo();
    expect(store.getState().objects.has(uid(1))).toBe(true);
    expect(notes(store.getState().objects)).toEqual([]);
    edit.redo();
    expect(store.getState().objects.has(uid(1))).toBe(false);
    expect(notes(store.getState().objects).map((x) => x.id)).toEqual([uid(900)]);
  });

  it('09q row 2: a non-bearing wall deletes with no note', () => {
    const { store, edit } = controller(ROOM, [uid(1)]);
    edit.deleteSelection();
    expect(store.getState().objects.has(uid(1))).toBe(false);
    expect(notes(store.getState().objects)).toEqual([]);
  });

  it('09q row 3: set to Demo (multi-select Set status), then deleted, gives 2 notes', () => {
    const { store, edit } = controller(bearing(ROOM, 1), [uid(1), uid(2)]);
    expect(edit.run((ctx) => statusChanges(ctx, 'demo'))).toBeNull();
    expect(notes(store.getState().objects).map((x) => [x.attrs.wallId, x.attrs.action])).toEqual([
      [uid(1), 'demo'],
    ]);
    edit.deleteSelection();
    expect(
      notes(store.getState().objects)
        .map((x) => x.attrs.action)
        .sort(),
    ).toEqual(['delete', 'demo']);
  });

  it('AC-2 two bearing walls deleted at once: one note each', () => {
    const { store, edit } = controller(bearing(ROOM, 1, 2), [uid(1), uid(2)]);
    edit.deleteSelection();
    expect(
      notes(store.getState().objects)
        .map((x) => x.attrs.wallId)
        .sort(),
    ).toEqual([uid(1), uid(2)].sort());
  });

  it('AC-2 a new door placed on a bearing wall adds an opening note; on a non-bearing wall none', () => {
    const door = asNew(DOOR);
    const s1 = createModelStore({ objects: bearing(ROOM, 1), newId: idSeq(900) });
    s1.applyEdit([{ id: uid(50), value: door }]);
    expect(notes(s1.getState().objects).map((x) => [x.attrs.wallId, x.attrs.action])).toEqual([
      [uid(1), 'opening'],
    ]);
    const s2 = createModelStore({ objects: ROOM, newId: idSeq(900) });
    s2.applyEdit([{ id: uid(50), value: door }]);
    expect(notes(s2.getState().objects)).toEqual([]);
  });

  it('AC-2 widening a new door on a bearing wall in the inspector adds one note; narrowing adds none', () => {
    const objects = bearing(withOpenings(ROOM, 'door'), 1);
    objects.set(uid(50), asNew(objects.get(uid(50))!));
    const store = createModelStore({ objects, newId: idSeq(900) });
    const width = (dataOf(objects.get(uid(50))).attributes as { width: number }).width;
    const commit = (inches: number) =>
      commitInspectorEdits({ store, ids: [uid(50)], newId: idSeq(800) }, [
        { field: 'openingWidth', inches },
      ]);
    expect(commit(width - 4)).toEqual({ ok: true, changed: 1 });
    expect(notes(store.getState().objects)).toEqual([]);
    expect(commit(width + 6)).toEqual({ ok: true, changed: 1 });
    expect(notes(store.getState().objects).map((x) => x.attrs.action)).toEqual(['opening']);
  });

  it('AC-2 Paste of a bearing wall with its new door adds the note for the pasted wall', () => {
    const objects = bearing(withOpenings(ROOM, 'door'), 1);
    objects.set(uid(50), asNew(objects.get(uid(50))!));
    const { store, edit } = controller(objects, [uid(1), uid(50)]);
    edit.copy();
    edit.paste('center');
    const o = store.getState().objects;
    const n = notes(o);
    expect(n).toHaveLength(1);
    expect(n[0]!.attrs.action).toBe('opening');
    expect(n[0]!.attrs.wallId).not.toBe(uid(1));
    expect(o.get(n[0]!.attrs.wallId)?.type).toBe('wall');
  });

  it('a change that already carries its note gets no second one; a remote change gets none', () => {
    const objects = bearing(ROOM, 1);
    const once = withBearingNotes(objects, [{ id: uid(1), value: null }], idSeq(900));
    expect(once).toHaveLength(2);
    expect(withBearingNotes(objects, once, idSeq(950))).toEqual(once);
    const store = createModelStore({ objects, newId: idSeq(900) });
    store.applyRemote([{ id: uid(1), value: null }]);
    expect(notes(store.getState().objects)).toEqual([]);
  });

  it('a note is not deleted, copied or given a status by the edit commands', () => {
    const { store, edit } = controller(bearing(ROOM, 1), [uid(1)]);
    edit.deleteSelection();
    const noteId = notes(store.getState().objects)[0]!.id;
    const c = controller(store.getState().objects, [noteId]);
    c.edit.deleteSelection();
    expect(c.edit.run((ctx) => statusChanges(ctx, 'demo'))).toBeNull();
    c.edit.copy();
    expect(c.edit.getUi().hasClip).toBe(false);
    expect(c.store.getState().objects.get(noteId)).toEqual(store.getState().objects.get(noteId));
    expect(c.store.getState().past).toHaveLength(0);
  });

  it('a floor deleted with its bearing wall raises no note (the floor delete takes everything on it)', () => {
    const objects = bearing(ROOM, 1).set(F2, {
      type: 'floor',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { name: 'Floor 2', order: 2 },
    });
    const changes = deleteFloorChanges(objects, F1)!;
    expect(changes.some((c) => c.id === uid(1) && c.value === null)).toBe(true);
    expect(withBearingNotes(objects, changes, idSeq(900))).toEqual(changes);
    const store = createModelStore({ objects, newId: idSeq(900) });
    store.applyEdit(changes);
    expect(notes(store.getState().objects)).toEqual([]);
    expect(store.getState().objects.has(F1)).toBe(false);
  });
});
