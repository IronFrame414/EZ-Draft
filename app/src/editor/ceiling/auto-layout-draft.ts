// EZD-509 (S05 Controls "Auto-layout cans ... Result shown for confirmation before it is committed (AI/auto results
// never applied silently)"; AC-EZD-509-3; vault/build/assumptions/EZD-509.md "Confirm step"): the cans auto-layout is
// showing, one per page. The canvas draws them as ghosts; nothing is in the model until Place. Pure: no React, no DOM.
import type { Point } from '@ezdraft/geometry';
import type { SurfaceSetting } from './surface';
import { createValueStore } from '../shared/value-store';

export type AutoLayoutDraft = {
  get(): readonly Point[];
  show(points: readonly Point[]): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
};

export function createAutoLayoutDraft(): AutoLayoutDraft {
  const store = createValueStore<readonly Point[]>([]);
  return {
    get: store.get,
    show: (points) => store.set(points),
    clear: () => {
      if (store.get().length > 0) store.set([]);
    },
    subscribe: store.subscribe,
  };
}

const byPage = new WeakMap<object, AutoLayoutDraft>();

/** The page's auto-layout preview, one per surface setting, made on first ask. */
export function autoLayoutDraftFor(surface: Pick<SurfaceSetting, 'get' | 'subscribe'>): AutoLayoutDraft {
  let draft = byPage.get(surface);
  if (draft === undefined) {
    draft = createAutoLayoutDraft();
    byPage.set(surface, draft);
  }
  return draft;
}
