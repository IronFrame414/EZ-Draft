// EZD-5605 (vault/plans/EZD-5605.md D-Adjust life, D-Scratch edits, D-Remote during Adjust, D-Selectable; Q-0637
// change row; Q-0638 gap 14; Q-0639; Q-0640 row 120; Q-0641 row 56-4; AC-EZD-5605-3, -6, -8): Adjust. The preview
// is applied to a scratch copy of the drawing, which the canvas and the editing controllers use through the routed
// store until Accept, Reject, the panel's × or a stale preview ends it. Each hand edit there becomes the open
// preview's new change set; nothing in the scratch copy is ever saved, and the model's undo stack is not touched.
// A model change to an object the preview does not touch is copied into the scratch; one it touches stales the
// preview (EZD-5604b), which ends Adjust. No React.
import { objectNumber } from '@ezdraft/geometry';
import { createModelStore, type ModelStore } from '../model/model-store';
import { applyEditTo, makeEdit, type Change, type Objects } from '../model/patches';
import type { RoutedStore } from '../model/routed-store';
import type { SelectionController } from '../selection/selection-controller';
import type { DrawingController } from '../tools/drawing-controller';
import { touchedIds, type OkPreview } from './apply-reply';
import type { PreviewStore } from './preview-store';
import { isTypingTarget } from '../typed-entry/typed-entry';

export type AdjustUi = { readonly adjusting: boolean };

export type AdjustDeps = {
  model: ModelStore;
  routed: RoutedStore;
  previews: PreviewStore;
  selection: Pick<SelectionController, 'clear' | 'getUi' | 'subscribe' | 'select'>;
  drawing: Pick<DrawingController, 'selectTool'> | null;
};

export type AdjustController = {
  getUi(): AdjustUi;
  subscribe(listener: () => void): () => void;
  start(): boolean;
  end(): void;
  selectable(id: string): boolean;
  dispose(): void;
};

// D-Tools off (Q-0640 row 120; Q-0641 row 56-4; AC-EZD-5605-8): the keys Adjust takes away: the drawing tools' letters
// (W, R, D, N, M, F, S), Measure (Shift+L), and Copy and Paste (Ctrl or Cmd + C, V). Esc, Enter, Delete, Undo, Redo,
// Select all and typing in a field still work.
export function adjustKeyBlocked(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}): boolean {
  if (isTypingTarget(e.target) || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) return !e.shiftKey && (k === 'c' || k === 'v');
  if (e.shiftKey) return k === 'l';
  return 'wrdnmfs'.includes(k) && k.length === 1;
}

const IDLE: AdjustUi = Object.freeze({ adjusting: false });
const ADJUSTING: AdjustUi = Object.freeze({ adjusting: true });

// D-Scratch edits: the preview the scratch copy now stands for, against the model. A candidate whose value is the
// same reference in both is left out (an edit undone, or a remote value copied in).
export function previewFromScratch(o: {
  model: Objects;
  scratch: Objects;
  candidates: ReadonlySet<string>;
  original: OkPreview;
}): OkPreview {
  const changes: Change[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  const updated: string[] = [];
  const provisional: Record<string, number> = {};
  for (const id of o.candidates) {
    const m = o.model.get(id) ?? null;
    const s = o.scratch.get(id) ?? null;
    if (m === s) continue;
    changes.push({ id, value: s });
    if (m === null) {
      added.push(id);
      const n = o.original.provisional[id] ?? (s === null ? null : objectNumber(s));
      if (n !== null) provisional[id] = n;
    } else if (s === null) removed.push(id);
    else updated.push(id);
  }
  return {
    ok: true,
    changes,
    added,
    removed,
    updated,
    touched: touchedIds(o.model, changes),
    provisional,
  };
}

export function createAdjustController(deps: AdjustDeps): AdjustController {
  const { model, routed, previews, selection, drawing } = deps;
  let ui: AdjustUi = IDLE;
  let disposed = false;
  let current: OkPreview | null = null;
  let pickable = new Set<string>();
  let stops: Array<() => void> = [];
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const l of [...listeners]) l();
  };

  const setCurrent = (p: OkPreview) => {
    current = p;
    pickable = new Set([...p.added, ...p.updated].map((id) => id.toLowerCase()));
  };

  // The ids that can differ between the model and the scratch copy, told to the routed store's listeners.
  let changed: ReadonlySet<string> = new Set();

  function end(): void {
    if (!ui.adjusting) return;
    for (const stop of stops) stop();
    stops = [];
    current = null;
    pickable = new Set();
    ui = IDLE;
    selection.clear();
    routed.route(null, { ...model.getState(), lastChangedIds: [...changed] });
    notify();
  }

  function start(): boolean {
    if (disposed || ui.adjusting) return false;
    const state = previews.getState();
    const p = state.preview;
    if (p === null || state.stale) return false;
    const m = model.getState();
    const scratch = createModelStore({
      objects: applyEditTo(m.objects, makeEdit(m.objects, p.changes), 'forward'),
      numberHighs: m.numberHighs,
    });
    const original = p;
    const candidates = new Set(p.changes.map((c) => c.id));
    changed = candidates;
    setCurrent(p);
    drawing?.selectTool(null);
    selection.clear();
    ui = ADJUSTING;

    // Accept, Reject, ×, a stale preview or a new one: Adjust ends.
    stops.push(
      previews.subscribe(() => {
        const s = previews.getState();
        if (s.preview !== current || s.stale) end();
      }),
    );
    stops.push(
      scratch.subscribe((next, prev) => {
        if (!ui.adjusting || next.objects === prev.objects) return;
        for (const id of next.lastChangedIds) candidates.add(id);
        const made = previewFromScratch({
          model: model.getState().objects,
          scratch: next.objects,
          candidates,
          original,
        });
        setCurrent(made);
        previews.replace(made);
      }),
    );
    // D-Selectable (Q-0641 row 56-4): a pick, box, group, Select more or Select all keeps only preview objects.
    stops.push(
      selection.subscribe(() => {
        const ids = selection.getUi().ids;
        const kept = ids.filter((id) => pickable.has(id.toLowerCase()));
        if (kept.length < ids.length) selection.select(kept);
      }),
    );
    // D-Remote during Adjust: untouched objects follow the model into the scratch copy.
    stops.push(
      model.subscribe((next, prev) => {
        if (!ui.adjusting || current === null || next.objects === prev.objects) return;
        const touched = new Set(current.touched.map((id) => id.toLowerCase()));
        const copy: Change[] = [];
        for (const [id, value] of next.objects) {
          if (prev.objects.get(id) !== value && !touched.has(id.toLowerCase())) {
            copy.push({ id, value });
          }
        }
        for (const id of prev.objects.keys()) {
          if (!next.objects.has(id) && !touched.has(id.toLowerCase()))
            copy.push({ id, value: null });
        }
        if (copy.length > 0) scratch.applyRemote(copy);
      }),
    );
    // Window capture runs before the editor's own key listeners, which never see a blocked key.
    if (typeof window !== 'undefined') {
      const onKey = (e: KeyboardEvent) => {
        if (adjustKeyBlocked(e)) e.stopImmediatePropagation();
      };
      window.addEventListener('keydown', onKey, { capture: true });
      stops.push(() => window.removeEventListener('keydown', onKey, { capture: true }));
    }
    routed.route(scratch, { ...scratch.getState(), lastChangedIds: [...candidates] });
    notify();
    return true;
  }

  return {
    getUi: () => ui,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    end,
    selectable: (id) => !ui.adjusting || pickable.has(id.toLowerCase()),
    dispose() {
      if (disposed) return;
      end();
      disposed = true;
      listeners.clear();
    },
  };
}
