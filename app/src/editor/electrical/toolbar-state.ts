// EZD-602 (S06 Controls Device toolbar; vault/build/assumptions.md EZD-602): the floating device toolbar's state: the
// item that is armed (null: none, so plan clicks select), the kind each item places next (absent: its first kind) and
// the GFCI/AFCI a receptacle is placed with, kept while the page is open. Kept tiny and free of the item lists, so the
// editor entry holds it while the toolbar itself loads with electrical mode (11 Budgets; toolbar-items.ts).

import { createListeners } from '../shared/value-store';

/** The GFCI/AFCI a receptacle is placed with; null is none (circuitProtectionSchema). */
export type ToolbarProtection = 'gfci' | 'afci' | 'dual' | null;

export type ElectricalToolbarState = {
  armed: string | null;
  kinds: Readonly<Partial<Record<string, string>>>;
  protection: ToolbarProtection;
};

export type ElectricalToolbar = {
  get(): ElectricalToolbarState;
  subscribe(listener: () => void): () => void;
  /** Arms the item; pressing the armed item again disarms it. Null disarms. */
  press(item: string | null): void;
  set(patch: Partial<ElectricalToolbarState>): void;
};

export function createElectricalToolbar(): ElectricalToolbar {
  let state: ElectricalToolbarState = { armed: null, kinds: {}, protection: null };
  const listeners = createListeners();
  const set = (patch: Partial<ElectricalToolbarState>) => {
    state = { ...state, ...patch };
    listeners.notify();
  };
  return {
    get: () => state,
    subscribe: listeners.add,
    press: (item) => {
      const armed = item === state.armed ? null : item;
      if (armed !== state.armed) set({ armed });
    },
    set,
  };
}
