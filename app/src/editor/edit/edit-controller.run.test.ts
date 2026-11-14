// EZD-233 (S03 Context menu; AC-EZD-233-1): the edit controller's `run` applies one menu command as one edit (one
// undo step), selects what the command names, shows a refusal and changes nothing, and does nothing without Edit model.
import { describe, expect, it, vi } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore } from '../model/model-store';
import { groupChanges, mirrorChanges, statusChanges } from './arrange-changes';
import { createEditController, type EditDeps } from './edit-controller';
import { ROOM, idSeq, p, uid, dataOf, withOpenings } from './test-utils/fixtures';

const VIEW = { x: -48, y: 144, ppi: 8 / 3 };

function selectionFake(initial: string[] = []) {
  let ids = [...initial];
  let ui = { ids, selectMore: false };
  const listeners = new Set<() => void>();
  const set = (next: readonly string[]) => {
    ids = [...next];
    ui = { ids, selectMore: false };
    for (const l of [...listeners]) l();
  };
  return {
    getUi: () => ui,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    select: vi.fn((next: readonly string[]) => set(next)),
    clear: vi.fn(() => set([])),
    selectTool: vi.fn(),
    set,
  };
}

function handleFake() {
  const h = {
    cursor: null as { x: number; y: number } | null,
    center: p(300, 300) as { x: number; y: number } | null,
    getCursor: () => h.cursor,
    screenToModel: (s: { x: number; y: number }) => ({
      x: VIEW.x + s.x / VIEW.ppi,
      y: VIEW.y - s.y / VIEW.ppi,
    }),
    getViewCenter: () => h.center,
  };
  return h;
}

type Drawing = NonNullable<EditDeps['drawing']>;

function make(
  o: {
    canEdit?: boolean;
    objects?: Map<string, ObjectValue>;
    selected?: string[];
    drawing?: Drawing | null;
  } = {},
) {
  const onCommit = vi.fn();
  const store = createModelStore({ objects: o.objects ?? ROOM, onCommit });
  const selection = selectionFake(o.selected ?? [uid(1)]);
  const handle = handleFake();
  const edit = createEditController({
    store,
    selection,
    drawing: o.drawing ?? null,
    handle,
    canEdit: o.canEdit ?? true,
    newId: idSeq(100),
  });
  return { store, selection, handle, edit, onCommit };
}

describe('EZD-233 edit controller run', () => {
  it('AC-EZD-233-1 Mirror on the selected door is one edit; Undo puts its hand back', () => {
    const s = make({ objects: withOpenings(ROOM, 'door'), selected: [uid(50)] });
    expect(s.edit.run(mirrorChanges)).toBeNull();
    const hand = () =>
      (dataOf(s.store.getState().objects.get(uid(50))).attributes as { hand: string }).hand;
    expect(hand()).toBe('right');
    expect(s.onCommit).toHaveBeenCalledTimes(1);
    s.edit.undo();
    expect(hand()).toBe('left');
  });

  it('EZD-233 Group selects its members; a refusal is returned and nothing changes', () => {
    const s = make({ selected: [uid(1), uid(2)] });
    expect(s.edit.run(groupChanges)).toBeNull();
    expect(s.selection.select).toHaveBeenLastCalledWith([uid(1), uid(2)]);
    expect(s.store.getState().objects.get(uid(100))?.type).toBe('group');

    const w1 = ROOM.get(uid(1))!;
    const attrs = (w1.data as { attributes: Record<string, unknown> }).attributes;
    const bearing = new Map(ROOM).set(uid(1), {
      ...w1,
      data: { ...w1.data, attributes: { ...attrs, bearing: true } },
    });
    const b = make({ objects: bearing, selected: [uid(1)] });
    expect(b.edit.run((c) => statusChanges(c, 'demo'))).toBe('office.edit.bearing_demo');
    expect(b.onCommit).not.toHaveBeenCalled();
  });

  it('EZD-233 without Edit model nothing runs', () => {
    const s = make({ canEdit: false, objects: withOpenings(ROOM, 'door'), selected: [uid(50)] });
    expect(s.edit.run(mirrorChanges)).toBeNull();
    expect(s.onCommit).not.toHaveBeenCalled();
  });
});
