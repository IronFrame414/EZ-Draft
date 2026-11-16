// EZD-5605 T13-T16 (vault/plans/EZD-5605.md section 4; D-Adjust life, D-Scratch edits, D-Remote during Adjust,
// D-Selectable; Q-0637; Q-0638 gap 14; Q-0641 row 56-4; AC-EZD-5605-3, -4, -6, -8). Real model, routed and preview
// stores; the selection and drawing are spies.
import { describe, expect, it, vi } from 'vitest';
import { createModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import { createRoutedStore } from '../model/routed-store';
import { adjustKeyBlocked, createAdjustController, previewFromScratch } from './adjust';
import { touchedIds, type OkPreview } from './apply-reply';
import { createPreviewStore } from './preview-store';
import { D, F, R, W, X, door, floor, room, wall } from './assistant-test-values.test-helpers';

function setup() {
  const model = createModelStore({
    objects: new Map([
      [F, floor()],
      [W, wall(1)],
      [R, room('Kitchen')],
      [X, wall(2)],
    ]),
  });
  const before = model.getState().objects;
  const changes = [
    { id: D, value: door(3) },
    { id: W, value: wall(1, 100) },
  ];
  const preview: OkPreview = {
    ok: true,
    changes,
    added: [D],
    removed: [],
    updated: [W],
    touched: touchedIds(before, changes),
    provisional: { [D]: 3 },
  };
  const previews = createPreviewStore({ store: model });
  previews.open({ preview, prompt: 'add a door', entryId: 1, before });
  const routed = createRoutedStore(model);
  const selection = {
    clear: vi.fn(),
    getUi: () => ({ ids: [] as string[], selectMore: false }),
    subscribe: () => () => {},
    select: vi.fn(),
  };
  const drawing = { selectTool: vi.fn() };
  const adjust = createAdjustController({ model, routed, previews, selection, drawing });
  return { model, previews, routed, selection, drawing, adjust, preview, changes };
}

describe('EZD-5605 Adjust', () => {
  it('T13 start applies the preview to a scratch copy; Reject ends it and leaves the model as it was', () => {
    const t = setup();
    const m0 = t.model.getState();
    const listener = vi.fn();
    t.adjust.subscribe(listener);

    expect(t.adjust.start()).toBe(true);
    expect(t.adjust.getUi().adjusting).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    const objects = t.routed.getState().objects;
    expect(objects.get(D)).toBe(t.changes[0]!.value);
    expect(objects.get(W)).toBe(t.changes[1]!.value);
    expect(t.routed.getState().objects).not.toBe(t.model.getState().objects);
    expect(t.selection.clear).toHaveBeenCalled();
    expect(t.drawing.selectTool).toHaveBeenCalledWith(null);
    expect(t.routed.getState().lastChangedIds).toEqual([D, W]);
    expect(t.adjust.start()).toBe(false);

    // D-Selectable: preview objects only (ids compared lower-case).
    expect(t.adjust.selectable(D)).toBe(true);
    expect(t.adjust.selectable(W.toUpperCase())).toBe(true);
    expect(t.adjust.selectable(R)).toBe(false);
    expect(t.adjust.selectable(F)).toBe(false);

    t.previews.reject();
    expect(t.adjust.getUi().adjusting).toBe(false);
    expect(t.routed.getState().objects).toBe(t.model.getState().objects);
    expect(t.routed.getState().objects).toBe(m0.objects);
    expect(t.routed.getState().lastChangedIds).toEqual([D, W]);
    const m1 = t.model.getState();
    expect(m1.objects).toBe(m0.objects);
    expect(m1.past).toBe(m0.past);
    expect(m1.future).toBe(m0.future);
    expect(t.adjust.selectable(R)).toBe(true);
  });

  it('T13 start is refused with no preview or a stale one', () => {
    const t = setup();
    t.model.applyEdit([{ id: W, value: wall(1, 120) }]);
    expect(t.previews.getState().stale).toBe(true);
    expect(t.adjust.start()).toBe(false);
    t.previews.reject();
    expect(t.adjust.start()).toBe(false);
  });

  it('T14 hand edits and Undo act on the preview; the model undo stack is not touched', () => {
    const t = setup();
    const past = t.model.getState().past.length;
    t.adjust.start();

    const moved = door(3, 60);
    t.routed.applyEdit([{ id: D, value: moved }]);
    let p = t.previews.getState().preview!;
    expect(p.changes).toEqual([
      { id: D, value: moved },
      { id: W, value: t.changes[1]!.value },
    ]);
    expect(p.added).toEqual([D]);
    expect(p.provisional).toEqual({ [D]: 3 });

    t.routed.undo();
    p = t.previews.getState().preview!;
    expect(p.changes[0]!.value).toBe(t.changes[0]!.value);

    const renamed = room('Pantry');
    t.routed.applyEdit([{ id: R, value: renamed }]);
    p = t.previews.getState().preview!;
    expect(p.updated).toEqual([W, R]);
    expect(p.touched).toContain(R);
    expect(t.previews.getState().stale).toBe(false);
    expect(t.adjust.getUi().adjusting).toBe(true);
    expect(t.model.getState().past).toHaveLength(past);
    expect(t.model.getState().objects.get(R)).toEqual(room('Kitchen'));
  });

  it('T15 a model change to an untouched object reaches the scratch copy; one to a touched object ends Adjust', () => {
    const t = setup();
    t.adjust.start();
    const x2 = wall(2, 110);
    t.model.applyRemote([{ id: X, value: x2 }]);
    expect(t.routed.getState().objects.get(X)).toBe(x2);
    expect(t.previews.getState().preview!.changes.map((c) => c.id)).toEqual([D, W]);
    expect(t.adjust.getUi().adjusting).toBe(true);

    t.model.applyRemote([{ id: W, value: wall(1, 90) }]);
    expect(t.previews.getState().stale).toBe(true);
    expect(t.adjust.getUi().adjusting).toBe(false);
    expect(t.routed.getState().objects).toBe(t.model.getState().objects);
  });

  it('T16 previewFromScratch', () => {
    const A = 'a';
    const B = 'b';
    const C = 'c';
    const E = 'e';
    const e = room('E');
    const model: Objects = new Map([
      [A, room('A')],
      [B, room('B')],
      [E, e],
    ]);
    const a2 = room('A2');
    const c = door(4);
    const scratch: Objects = new Map([
      [A, a2],
      [C, c],
      [E, e],
    ]);
    const original: OkPreview = {
      ok: true,
      changes: [],
      added: [],
      removed: [],
      updated: [],
      touched: [],
      provisional: { [C]: 4 },
    };
    const p = previewFromScratch({ model, scratch, candidates: new Set([A, B, C, E]), original });
    expect(p.changes).toEqual([
      { id: A, value: a2 },
      { id: B, value: null },
      { id: C, value: c },
    ]);
    expect(p.added).toEqual([C]);
    expect(p.removed).toEqual([B]);
    expect(p.updated).toEqual([A]);
    expect(p.provisional).toEqual({ [C]: 4 });
    expect(p.touched).toEqual([A, B, C, W]);
  });

  it('dispose ends Adjust and later calls do nothing', () => {
    const t = setup();
    t.adjust.start();
    t.adjust.dispose();
    expect(t.routed.getState().objects).toBe(t.model.getState().objects);
    expect(t.adjust.start()).toBe(false);
  });
});

describe('EZD-5605 keys during Adjust', () => {
  const k = (key: string, over: Partial<Parameters<typeof adjustKeyBlocked>[0]> = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
    ...over,
  });

  it('T18 tool letters, Shift+L and Copy and Paste are taken away; the rest pass', () => {
    for (const key of ['w', 'r', 'd', 'n', 'm', 'f', 's', 'W'])
      expect(adjustKeyBlocked(k(key))).toBe(true);
    expect(adjustKeyBlocked(k('L', { shiftKey: true }))).toBe(true);
    for (const key of ['c', 'v']) {
      expect(adjustKeyBlocked(k(key, { ctrlKey: true }))).toBe(true);
      expect(adjustKeyBlocked(k(key, { metaKey: true }))).toBe(true);
    }
    for (const e of [
      k('Escape'),
      k('Enter'),
      k('Delete'),
      k('Backspace'),
      k('z', { ctrlKey: true }),
      k('z', { metaKey: true, shiftKey: true }),
      k('a', { ctrlKey: true }),
      k('v'),
      k(' '),
      k('ArrowLeft'),
    ]) {
      expect(adjustKeyBlocked(e), e.key).toBe(false);
    }
  });

  it('T18 while adjusting a blocked key never reaches the editor listeners; after it, it does', () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    try {
      const t = setup();
      t.adjust.start();
      const editor = vi.fn();
      target.addEventListener('keydown', editor);
      const press = (key: string) => {
        const e = new Event('keydown');
        Object.assign(e, { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
        target.dispatchEvent(e);
      };
      press('w');
      expect(editor).not.toHaveBeenCalled();
      press('Delete');
      expect(editor).toHaveBeenCalledTimes(1);
      t.previews.reject();
      press('w');
      expect(editor).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
