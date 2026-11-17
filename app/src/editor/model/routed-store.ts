// EZD-5605 (vault/plans/EZD-5605.md D-Routed store, D-Who gets which store; Q-0638 gap 14; AC-EZD-5605-6): the
// store the canvas and the editing controllers use. It passes everything to the open model store, or, while an
// Assistant preview is being adjusted, to the preview's scratch copy, so drawing, handles, Delete and Undo act on
// the preview there. Switching tells every listener once, with the state the caller gives (its `lastChangedIds` are
// the ids whose value differs between the two).
// 11 Budgets: kept small, it is in the editor route.
import type { ModelState, ModelStore } from './model-store';

export type RoutedStore = ModelStore & {
  route(target: ModelStore | null, state: ModelState): void;
};

type Listener = (state: ModelState, prev: ModelState) => void;

export function createRoutedStore(base: ModelStore): RoutedStore {
  let current = base;
  let snapshot = base.getState();
  const listeners = new Set<Listener>();
  const tell = (state: ModelState) => {
    const prev = snapshot;
    snapshot = state;
    for (const l of [...listeners]) l(state, prev);
  };
  let off = base.subscribe(tell);
  const own = {
    getState: () => snapshot,
    subscribe(l: Listener) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    route(target: ModelStore | null, state: ModelState) {
      off();
      current = target ?? base;
      off = current.subscribe(tell);
      tell(state);
    },
  };
  // Every other member (the edits, undo, redo, setState) is the current target's.
  return new Proxy(own, {
    get: (o, k) => (k in o ? o[k as keyof typeof o] : current[k as keyof ModelStore]),
  }) as unknown as RoutedStore;
}
