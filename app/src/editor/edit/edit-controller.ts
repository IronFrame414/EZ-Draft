// EZD-217 Build step 6 (vault/plans/EZD-217.md section 3 K1-K4; Decided "Undo store", "Level", "Highs",
// "Paste point", "Duplicate", "Clipboard", "Selection after", "Tool active", "Permission", "Keys", "EditUi"; S03
// Controls; Q-0630 rows 19-21, 36; Q-0640 row 117; Q-0647 (a)): Delete, Copy, Paste, Duplicate, Undo and Redo on
// the open floor, outside React. Every command is one `applyEdit` (one undo step); the clipboard is in memory only.
import type { Point } from '@ezdraft/geometry';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import type { PlanCanvasHandle } from '../plan/controller';
import type { SelectionController } from '../selection/selection-controller';
import type { DrawingController, ToolKeyEvent } from '../tools/drawing-controller';
import { newObjectId } from '../tools/model-changes';
import { isTypingTarget } from '../typed-entry/typed-entry';
import { copyItems, deleteChanges, pasteChanges, type ClipItem } from './edit-changes';

export type EditUi = {
  readonly canEdit: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly hasSelection: boolean;
  readonly hasClip: boolean;
};

export type EditDeps = {
  store: ModelStore;
  selection: Pick<SelectionController, 'getUi' | 'subscribe' | 'select' | 'clear' | 'selectTool'>;
  drawing: Pick<DrawingController, 'getUi'> | null;
  handle: Pick<PlanCanvasHandle, 'getCursor' | 'screenToModel' | 'getViewCenter'>;
  canEdit: boolean;
  newId?: () => string;
};

export type EditController = {
  getUi(): EditUi;
  subscribe(listener: () => void): () => void;
  keyDown(e: ToolKeyEvent): boolean;
  undo(): void;
  redo(): void;
  deleteSelection(): void;
  copy(): void;
  paste(where: 'cursor' | 'center'): void;
  duplicate(where: 'cursor' | 'center'): void;
  dispose(): void;
};

const NO_UI: EditUi = Object.freeze({
  canEdit: false,
  canUndo: false,
  canRedo: false,
  hasSelection: false,
  hasClip: false,
});

const sameUi = (a: EditUi, b: EditUi) =>
  a.canEdit === b.canEdit &&
  a.canUndo === b.canUndo &&
  a.canRedo === b.canRedo &&
  a.hasSelection === b.hasSelection &&
  a.hasClip === b.hasClip;

export function createEditController(deps: EditDeps): EditController {
  const { store, selection, drawing, handle, canEdit } = deps;
  const newId = deps.newId ?? newObjectId;

  let disposed = false;
  let clip: readonly ClipItem[] = [];
  let depth = 0;
  const listeners = new Set<() => void>();

  const compute = (): EditUi => {
    if (disposed || !canEdit) return NO_UI;
    const { past, future } = store.getState();
    return {
      canEdit: true,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      hasSelection: selection.getUi().ids.length > 0,
      hasClip: clip.length > 0,
    };
  };

  let ui = compute();

  // A command folds its notifications into one recompute at its end.
  const refresh = () => {
    if (disposed || depth > 0) return;
    const next = compute();
    if (sameUi(next, ui)) return;
    ui = next;
    for (const l of [...listeners]) l();
  };

  const unsubscribeStore = canEdit ? store.subscribe(refresh) : () => {};
  const unsubscribeSelection = canEdit ? selection.subscribe(refresh) : () => {};

  const run = (command: () => void) => {
    if (disposed || !canEdit) return;
    depth += 1;
    try {
      command();
    } finally {
      depth -= 1;
    }
    refresh();
  };

  // Q-0647 (a): an active tool or gap pick ends before Undo, Redo, Paste and Duplicate.
  const endTool = () => {
    if (drawing === null) return;
    const d = drawing.getUi();
    if (d.tool !== null || d.pick !== null) selection.selectTool();
  };

  // P208 D17: after Undo or Redo the selection keeps only the ids still in the model.
  const keepPresent = () => {
    const ids = selection.getUi().ids;
    const objects = store.getState().objects;
    if (ids.every((id) => objects.has(id))) return;
    const present = new Set<string>();
    for (const id of objects.keys()) present.add(id.toLowerCase());
    const kept = ids.filter((id) => present.has(id.toLowerCase()));
    if (kept.length < ids.length) selection.select(kept);
  };

  const viewPoint = (where: 'cursor' | 'center' | 'view'): Point | null => {
    if (where === 'cursor') {
      const cursor = handle.getCursor();
      if (cursor !== null) return handle.screenToModel(cursor);
    }
    return handle.getViewCenter();
  };

  const pasteItems = (items: readonly ClipItem[], at: Point | null) => {
    if (items.length === 0 || at === null) return;
    const { objects, numberHighs } = store.getState();
    const level = openFloorId(objects);
    if (level === null) return;
    const r = pasteChanges(objects, level, items, at, newId, numberHighs);
    if (r.changes.length === 0) return;
    store.applyEdit(r.changes);
    selection.select(r.ids);
  };

  function undo(): void {
    run(() => {
      endTool();
      store.undo();
      keepPresent();
    });
  }

  function redo(): void {
    run(() => {
      endTool();
      store.redo();
      keepPresent();
    });
  }

  function deleteSelection(): void {
    run(() => {
      const objects = store.getState().objects;
      const level = openFloorId(objects);
      if (level === null) return;
      const changes = deleteChanges(objects, level, selection.getUi().ids, newId);
      if (changes.length === 0) return;
      store.applyEdit(changes);
      selection.clear();
    });
  }

  function copy(): void {
    run(() => {
      const objects = store.getState().objects;
      const level = openFloorId(objects);
      if (level === null) return;
      const items = copyItems(objects, level, selection.getUi().ids);
      if (items.length > 0) clip = items;
    });
  }

  function paste(where: 'cursor' | 'center'): void {
    run(() => {
      endTool();
      pasteItems(clip, viewPoint(where));
    });
  }

  // Decided "Paste point": Duplicate always lands at the view centre.
  function duplicate(): void {
    run(() => {
      endTool();
      const objects = store.getState().objects;
      const level = openFloorId(objects);
      if (level === null) return;
      pasteItems(copyItems(objects, level, selection.getUi().ids), viewPoint('view'));
    });
  }

  function keyDown(e: ToolKeyEvent): boolean {
    if (disposed || !canEdit || e.defaultPrevented || isTypingTarget(e.target)) return false;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z') {
        if (e.shiftKey) redo();
        else undo();
        return true;
      }
      if (k === 'c' && !e.shiftKey) {
        copy();
        return true;
      }
      if (k === 'v' && !e.shiftKey) {
        paste('cursor');
        return true;
      }
      return false;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      deleteSelection();
      return true;
    }
    return false;
  }

  return {
    getUi: () => (disposed ? NO_UI : ui),
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    keyDown,
    undo,
    redo,
    deleteSelection,
    copy,
    paste,
    duplicate,
    dispose() {
      if (disposed) return;
      disposed = true;
      clip = [];
      unsubscribeStore();
      unsubscribeSelection();
      listeners.clear();
    },
  };
}
