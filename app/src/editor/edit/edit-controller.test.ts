// EZD-217 K1-K8 (vault/plans/EZD-217.md section 3 K1-K4, section 4; Decided "Keys", "Permission", "EditUi",
// "Paste point", "Duplicate", "Selection after", "Tool active", "Clipboard"; AC-EZD-217-1 to -4, -7, -9 to -11, -13
// to -15). A real model store; the selection, the handle and the drawing controller are fakes.
import { describe, expect, it, vi } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore } from '../model/model-store';
import type { ToolKeyEvent } from '../tools/drawing-controller';
import { createEditController, type EditDeps } from './edit-controller';
import { ROOM, idSeq, p, uid, dataOf } from './test-utils/fixtures';

const VIEW = { x: -48, y: 144, ppi: 8 / 3 };

function key(k: string, over: Partial<ToolKeyEvent> = {}): ToolKeyEvent {
  return {
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: null,
    ...over,
  };
}

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

const has = (s: ReturnType<typeof make>, id: string) => s.store.getState().objects.has(id);
const walls = (s: ReturnType<typeof make>) =>
  [...s.store.getState().objects].filter(([, v]) => v.type === 'wall');
const flags = (s: ReturnType<typeof make>) => {
  const u = s.edit.getUi();
  return [u.canEdit, u.canUndo, u.canRedo, u.hasSelection, u.hasClip];
};
const mid = (v: ObjectValue) => {
  const g = dataOf(v).geometry;
  return { x: (g.start.x + g.end.x) / 2, y: (g.start.y + g.end.y) / 2 };
};
const newWall = (s: ReturnType<typeof make>, before: Set<string>) => {
  const found = walls(s).filter(([id]) => !before.has(id));
  expect(found).toHaveLength(1);
  return found[0]!;
};
const wallIds = (s: ReturnType<typeof make>) => new Set(walls(s).map(([id]) => id));

describe('EZD-217 edit controller', () => {
  it('EZD-217 K1 keys', () => {
    const ctrl = { ctrlKey: true };
    const meta = { metaKey: true };

    let s = make();
    expect(s.edit.keyDown(key('Delete'))).toBe(true);
    expect(has(s, uid(1))).toBe(false);

    s = make();
    expect(s.edit.keyDown(key('Backspace'))).toBe(true);
    expect(has(s, uid(1))).toBe(false);

    s = make();
    s.edit.deleteSelection();
    expect(s.edit.keyDown(key('z', ctrl))).toBe(true);
    expect(has(s, uid(1))).toBe(true);

    s = make();
    s.edit.deleteSelection();
    expect(s.edit.keyDown(key('z', meta))).toBe(true);
    expect(has(s, uid(1))).toBe(true);

    s = make();
    s.edit.deleteSelection();
    s.edit.undo();
    expect(s.edit.keyDown(key('Z', { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(has(s, uid(1))).toBe(false);

    s = make();
    expect(s.edit.keyDown(key('c', ctrl))).toBe(true);
    expect(s.edit.getUi().hasClip).toBe(true);

    s = make();
    s.edit.copy();
    const before = wallIds(s);
    expect(s.edit.keyDown(key('v', ctrl))).toBe(true);
    expect(walls(s)).toHaveLength(before.size + 1);

    s = make();
    const objects = s.store.getState().objects;
    expect(s.edit.keyDown(key('y', ctrl))).toBe(false);
    expect(s.edit.keyDown(key('z', { ctrlKey: true, altKey: true }))).toBe(false);
    s.edit.deleteSelection();
    const afterDelete = s.store.getState().objects;
    expect(afterDelete).not.toBe(objects);
    expect(s.edit.keyDown(key('z', { ctrlKey: true, target: { tagName: 'INPUT' } }))).toBe(false);
    expect(s.store.getState().objects).toBe(afterDelete);
    s.selection.set([uid(2)]);
    expect(s.edit.keyDown(key('Delete', { defaultPrevented: true }))).toBe(false);
    expect(s.store.getState().objects).toBe(afterDelete);
  });

  it('EZD-217 K2 without Edit model nothing changes', () => {
    const s = make({ canEdit: false });
    const objects = s.store.getState().objects;
    s.edit.undo();
    s.edit.redo();
    s.edit.deleteSelection();
    s.edit.copy();
    s.edit.paste('cursor');
    s.edit.paste('center');
    s.edit.duplicate('cursor');
    s.edit.duplicate('center');
    const keys = [
      key('Delete'),
      key('Backspace'),
      key('z', { ctrlKey: true }),
      key('z', { metaKey: true }),
      key('z', { ctrlKey: true, shiftKey: true }),
      key('c', { ctrlKey: true }),
      key('v', { ctrlKey: true }),
    ];
    for (const k of keys) expect(s.edit.keyDown(k)).toBe(false);
    expect(s.store.getState().objects).toBe(objects);
    expect(s.store.getState().past).toHaveLength(0);
    expect(flags(s)).toEqual([false, false, false, false, false]);
  });

  it('EZD-217 K3 greying', () => {
    const s = make({ selected: [] });
    const listener = vi.fn();
    s.edit.subscribe(listener);
    expect(flags(s)).toEqual([true, false, false, false, false]);
    s.selection.set([uid(1)]);
    expect(flags(s)).toEqual([true, false, false, true, false]);
    s.edit.copy();
    expect(flags(s)).toEqual([true, false, false, true, true]);
    const calls = listener.mock.calls.length;
    s.edit.copy();
    expect(listener.mock.calls.length).toBe(calls);
    s.edit.deleteSelection();
    expect(flags(s)).toEqual([true, true, false, false, true]);
    s.edit.undo();
    expect(flags(s)).toEqual([true, false, true, false, true]);
    s.edit.redo();
    expect(flags(s)).toEqual([true, true, false, false, true]);
    expect(listener).toHaveBeenCalledTimes(5);
  });

  it('EZD-217 K4 a bulk delete is one step; a new edit clears redo', () => {
    const s = make({ selected: [uid(4)] });
    s.edit.copy();
    s.selection.set([uid(1), uid(2)]);
    s.edit.deleteSelection();
    expect(s.store.getState().past).toHaveLength(1);
    const first = s.onCommit.mock.calls[0]![0].map((c: { id: string }) => c.id);
    expect(first).toContain(uid(1));
    expect(first).toContain(uid(2));
    expect(first).not.toContain(uid(3));
    expect(first).not.toContain(uid(4));

    s.edit.undo();
    expect(s.store.getState().past).toHaveLength(0);
    expect(s.store.getState().future).toHaveLength(1);
    s.selection.set([uid(3)]);
    s.edit.deleteSelection();
    expect(s.store.getState().past).toHaveLength(1);
    expect(s.store.getState().future).toHaveLength(0);
    const third = s.onCommit.mock.calls.at(-1)![0].map((c: { id: string }) => c.id);
    expect(third).toContain(uid(3));
    expect(third).not.toContain(uid(1));
    expect(third).not.toContain(uid(4));

    for (let i = 0; i < 120; i++) s.edit.paste('center');
    expect(s.store.getState().past).toHaveLength(121);
  });

  it('EZD-217 K5 paste lands at the cursor or the view centre', () => {
    const s = make();
    s.edit.copy();
    s.handle.cursor = { x: 320, y: 640 };
    let before = wallIds(s);
    s.edit.paste('cursor');
    expect(mid(newWall(s, before)[1])).toEqual(p(72, -96));

    s.handle.cursor = null;
    s.handle.center = p(246, -17.625);
    before = wallIds(s);
    s.edit.paste('cursor');
    expect(mid(newWall(s, before)[1])).toEqual(p(246, -17.625));

    s.handle.center = null;
    const objects = s.store.getState().objects;
    s.edit.paste('cursor');
    expect(s.store.getState().objects).toBe(objects);
  });

  it('EZD-217 K6 duplicate, selection after, clipboard kept', () => {
    const s = make({ selected: [uid(2)] });
    s.edit.copy();
    s.selection.set([uid(1)]);
    let before = wallIds(s);
    s.edit.duplicate('center');
    const [nid, nv] = newWall(s, before);
    expect(nid).not.toBe(uid(1));
    const g = dataOf(nv).geometry;
    expect(g.start).toEqual(p(228, 300));
    expect(g.end).toEqual(p(372, 300));
    expect(s.selection.select).toHaveBeenLastCalledWith([nid]);

    s.selection.set([uid(1), nid]);
    s.edit.undo();
    expect(s.selection.select).toHaveBeenLastCalledWith([uid(1)]);

    before = wallIds(s);
    s.edit.paste('center');
    const g2 = dataOf(newWall(s, before)[1]).geometry;
    expect(g2.start).toEqual(p(300, 240));
    expect(g2.end).toEqual(p(300, 360));

    s.edit.deleteSelection();
    expect(s.selection.clear).toHaveBeenCalled();
  });

  it('EZD-217 K7 an active tool ends first', () => {
    const states: Record<string, unknown> = {
      wall: { tool: 'wall', pick: null },
      pick: { tool: null, pick: { gapWallIds: [] } },
      none: { tool: null, pick: null },
    };
    type Cmd = 'undo' | 'redo' | 'paste' | 'duplicate' | 'delete' | 'copy';
    const run = (which: string, cmd: Cmd) => {
      const recorded: number[] = [];
      const drawing = { getUi: () => states[which] } as unknown as Drawing;
      const s = make({ drawing });
      s.selection.selectTool.mockImplementation(() => {
        recorded.push(s.store.getState().past.length);
      });
      // Set up what the command needs, then forget the set-up calls.
      s.edit.copy();
      if (cmd === 'undo' || cmd === 'redo') s.edit.deleteSelection();
      if (cmd === 'redo') s.edit.undo();
      if (cmd === 'paste' || cmd === 'duplicate' || cmd === 'delete' || cmd === 'copy') {
        s.selection.set([uid(1)]);
      }
      s.selection.selectTool.mockClear();
      recorded.length = 0;
      const past = s.store.getState().past.length;
      if (cmd === 'undo') s.edit.undo();
      if (cmd === 'redo') s.edit.redo();
      if (cmd === 'paste') s.edit.paste('center');
      if (cmd === 'duplicate') s.edit.duplicate('center');
      if (cmd === 'delete') s.edit.deleteSelection();
      if (cmd === 'copy') s.edit.copy();
      return { calls: s.selection.selectTool.mock.calls.length, recorded, past };
    };
    for (const which of ['wall', 'pick']) {
      for (const cmd of ['undo', 'redo', 'paste', 'duplicate'] as const) {
        const r = run(which, cmd);
        expect(r.calls, `${which} ${cmd}`).toBe(1);
        expect(r.recorded, `${which} ${cmd}`).toEqual([r.past]);
      }
      for (const cmd of ['delete', 'copy'] as const) {
        expect(run(which, cmd).calls, `${which} ${cmd}`).toBe(0);
      }
    }
    for (const cmd of ['undo', 'redo', 'paste', 'duplicate', 'delete', 'copy'] as const) {
      expect(run('none', cmd).calls, `none ${cmd}`).toBe(0);
    }
  });

  it('EZD-217 K8 dispose', () => {
    const s = make();
    s.edit.copy();
    const listener = vi.fn();
    s.edit.subscribe(listener);
    s.edit.dispose();
    const objects = s.store.getState().objects;
    const calls = listener.mock.calls.length;
    s.edit.undo();
    s.edit.redo();
    s.edit.deleteSelection();
    s.edit.copy();
    s.edit.paste('cursor');
    s.edit.paste('center');
    s.edit.duplicate('cursor');
    s.edit.duplicate('center');
    s.selection.set([uid(2)]);
    const keys = [
      key('Delete'),
      key('Backspace'),
      key('z', { ctrlKey: true }),
      key('z', { metaKey: true }),
      key('z', { ctrlKey: true, shiftKey: true }),
      key('c', { ctrlKey: true }),
      key('v', { ctrlKey: true }),
    ];
    for (const k of keys) expect(s.edit.keyDown(k)).toBe(false);
    expect(s.store.getState().objects).toBe(objects);
    expect(s.store.getState().past).toHaveLength(0);
    expect(listener.mock.calls.length).toBe(calls);
    expect(flags(s)).toEqual([false, false, false, false, false]);
  });
});
