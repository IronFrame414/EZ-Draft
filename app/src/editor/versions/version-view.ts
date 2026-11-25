// EZD-122 (S20 "Version row: opens the version read-only on the canvas"; S20 Decisions 4; AC-EZD-122-3, -10): the
// version open read-only on the canvas. Opening reads the version's migrated objects and points the routed store
// (EZD-5605) at a copy of them that takes no edits; the editor then shows its EZD-225 read-only state (no edit paths,
// paused rail). Back to working copy points the routed store at the model store again. Every listener of the routed
// store is told once, with every id whose value differs between the two.
// EZD-139 (Q-0220; Q-0700 05; Q-0703; AC-EZD-139-1 to -3): while a version is open, its diff against the working copy
// (version-diff.ts), read again when the working copy changes, and the Show changes switch, on by default.
import { fetchVersion, type VersionRow } from '../../lib/versions/versions';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore, type ModelState, type ModelStore } from '../model/model-store';
import type { RoutedStore } from '../model/routed-store';
import { versionDiff, type VersionDiff } from './version-diff';
import { createListeners } from '../shared/value-store';

export type VersionViewState = {
  viewing: VersionRow | null;
  // The row being read, before it shows.
  opening: string | null;
  failed: boolean;
  // EZD-139: the open version's objects and its diff against the working copy; null when none is open.
  objects: ModelState['objects'] | null;
  diff: VersionDiff | null;
  showChanges: boolean;
};

export type VersionView = {
  getState(): VersionViewState;
  subscribe(l: () => void): () => void;
  open(row: VersionRow): Promise<void>;
  back(): void;
  setShowChanges(on: boolean): void;
  dispose(): void;
};

const IDLE: VersionViewState = {
  viewing: null,
  opening: null,
  failed: false,
  objects: null,
  diff: null,
  showChanges: true,
};

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
  let unwatch: (() => void) | null = null;
  const listeners = createListeners();
  const set = (next: VersionViewState) => {
    state = next;
    listeners.notify();
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
      return listeners.add(l);
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
      // The working copy can still change (a remote edit): the diff follows it.
      unwatch?.();
      let seen = o.base.getState().objects;
      unwatch = o.base.subscribe((s) => {
        if (s.objects === seen || state.objects === null) return;
        seen = s.objects;
        set({ ...state, diff: versionDiff(state.objects, seen) });
      });
      set({
        viewing: row,
        opening: null,
        failed: false,
        objects,
        diff: versionDiff(objects, seen),
        showChanges: true,
      });
    },
    back() {
      ask++;
      unwatch?.();
      unwatch = null;
      if (state.viewing !== null) route(null);
      set(IDLE);
    },
    setShowChanges(on) {
      if (state.viewing === null || state.showChanges === on) return;
      set({ ...state, showChanges: on });
    },
    dispose() {
      disposed = true;
      unwatch?.();
      unwatch = null;
      listeners.clear();
    },
  };
}
