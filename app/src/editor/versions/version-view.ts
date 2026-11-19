// EZD-122 (S20 "Version row: opens the version read-only on the canvas"; S20 Decisions 4; AC-EZD-122-3, -10): the
// version open read-only on the canvas. Opening reads the version's migrated objects and points the routed store
// (EZD-5605) at a copy of them that takes no edits; the editor then shows its EZD-225 read-only state (no edit paths,
// paused rail). Back to working copy points the routed store at the model store again. Every listener of the routed
// store is told once, with every id whose value differs between the two.
import { fetchVersion, type VersionRow } from '../../lib/versions/versions';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore, type ModelState, type ModelStore } from '../model/model-store';
import type { RoutedStore } from '../model/routed-store';

export type VersionViewState = {
  viewing: VersionRow | null;
  // The row being read, before it shows.
  opening: string | null;
  failed: boolean;
};

export type VersionView = {
  getState(): VersionViewState;
  subscribe(l: () => void): () => void;
  open(row: VersionRow): Promise<void>;
  back(): void;
  dispose(): void;
};

const IDLE: VersionViewState = { viewing: null, opening: null, failed: false };

// A model store that takes no edits: every edit path answers no changed ids.
export function readOnlyStore(objects: Map<string, ObjectValue>, base: ModelState): ModelStore {
  const inner = createModelStore({ objects, numberHighs: base.numberHighs });
  return {
    ...inner,
    setState: () => {},
    applyEdit: () => [],
    undo: () => [],
    redo: () => [],
    applySavedNumbers: () => [],
    applyRemote: () => [],
  };
}

// The ids whose value differs between two object maps.
export function changedIds(a: ModelState['objects'], b: ModelState['objects']): string[] {
  const out: string[] = [];
  for (const [id, v] of a) if (b.get(id) !== v) out.push(id);
  for (const id of b.keys()) if (!a.has(id)) out.push(id);
  return out;
}

export function createVersionView(o: {
  projectId: string;
  routed: RoutedStore;
  base: ModelStore;
  // Ends a half-drawn tool and clears the selection before the canvas changes.
  reset: () => void;
  fetchImpl?: typeof fetch;
}): VersionView {
  let state = IDLE;
  let disposed = false;
  let ask = 0;
  const listeners = new Set<() => void>();
  const set = (next: VersionViewState) => {
    state = next;
    for (const l of [...listeners]) l();
  };
  const route = (target: ModelStore | null) => {
    const from = o.routed.getState().objects;
    const to = (target ?? o.base).getState();
    o.reset();
    o.routed.route(target, { ...to, lastChangedIds: changedIds(from, to.objects) });
  };
  return {
    getState: () => state,
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    async open(row) {
      const mine = ++ask;
      set({ ...state, opening: row.id, failed: false });
      const r = await fetchVersion(o.projectId, row.id, o.fetchImpl);
      if (disposed || mine !== ask) return;
      if (!r.ok) {
        set({ ...state, opening: null, failed: true });
        return;
      }
      const objects = new Map<string, ObjectValue>();
      for (const obj of r.body.objects)
        objects.set(obj.id, { type: obj.type, schemaVersion: obj.schemaVersion, data: obj.data });
      route(readOnlyStore(objects, o.base.getState()));
      set({ viewing: row, opening: null, failed: false });
    },
    back() {
      ask++;
      if (state.viewing !== null) route(null);
      set(IDLE);
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}
