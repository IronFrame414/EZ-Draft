// EZD-5604b (vault/plans/EZD-5604b.md): the one open Assistant preview (section 3 P1-P4; Decided "D-Store";
// Q-0637 "stale when any touched object changes", "one open preview at a time"; L-048). It watches the open model
// store and goes stale when any touched object's value changes there, by any mutation (reference compare). Nothing
// here saves or touches the undo stack. No React.
import type { ModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import type { OkPreview } from './apply-reply';

// P1
export type PreviewState = {
  readonly preview: OkPreview | null;
  readonly prompt: string;
  readonly stale: boolean;
  readonly entryId: number | null;
  readonly before: Objects | null;
};

export const EMPTY_PREVIEW_STATE: PreviewState = Object.freeze({
  preview: null,
  prompt: '',
  stale: false,
  entryId: null,
  before: null,
});

// P2
export type PreviewOpen = { preview: OkPreview; prompt: string; entryId: number; before: Objects };

// P3
export type PreviewStore = {
  getState(): PreviewState;
  subscribe(listener: () => void): () => void;
  open(o: PreviewOpen): boolean;
  replace(preview: OkPreview): void;
  reject(): void;
  dispose(): void;
};

// D-Store: each touched id as the `before` key with the same lower-case spelling, else as given.
function keysFor(touched: readonly string[], before: Objects): string[] {
  const byLower = new Map<string, string>();
  for (const k of before.keys()) byLower.set(k.toLowerCase(), k);
  return touched.map((id) => byLower.get(id.toLowerCase()) ?? id);
}

// P4
export function createPreviewStore(deps: { store: ModelStore }): PreviewStore {
  let state: PreviewState = EMPTY_PREVIEW_STATE;
  let keys: string[] = [];
  let disposed = false;
  const listeners = new Set<() => void>();

  const set = (next: PreviewState) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };

  const staleAtOpen = (before: Objects, ks: readonly string[]) => {
    const objects = deps.store.getState().objects;
    return ks.some((k) => before.get(k) !== objects.get(k));
  };

  const unsubscribe = deps.store.subscribe((next, prev) => {
    if (state.preview === null || state.stale || next.objects === prev.objects) return;
    if (keys.some((k) => next.objects.get(k) !== prev.objects.get(k))) {
      set({ ...state, stale: true });
    }
  });

  return {
    getState: () => state,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open(o) {
      if (disposed || state.preview !== null) return false;
      keys = keysFor(o.preview.touched, o.before);
      set({
        preview: o.preview,
        prompt: o.prompt,
        stale: staleAtOpen(o.before, keys),
        entryId: o.entryId,
        before: o.before,
      });
      return true;
    },
    replace(preview) {
      if (disposed || state.preview === null || state.before === null) return;
      const before = state.before;
      keys = keysFor(preview.touched, before);
      set({ ...state, preview, stale: state.stale || staleAtOpen(before, keys) });
    },
    reject() {
      if (disposed || state.preview === null) return;
      keys = [];
      set(EMPTY_PREVIEW_STATE);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      listeners.clear();
      keys = [];
    },
  };
}
