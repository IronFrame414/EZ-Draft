// EZD-406 selection of the cabinet run screen, moved here from cabinet-view.ts by EZD-513 (11 Budgets "editor before its
// lazy parts 500 KB"): the editor entry's selection store needs only this, so the cabinet view's edits stay with the
// lazy cabinet screen. Pure: no React, no DOM.
import { idKey, sameId } from '../shared/ids';

export type CabinetSelection = {
  readonly ids: readonly string[];
  readonly hoveredId: string | null;
};

export const NO_CABINET_SELECTION: CabinetSelection = { ids: [], hoveredId: null };

export type CabinetSelectionInput =
  | { type: 'click'; id: string | null; shift?: boolean }
  | { type: 'set'; ids: readonly string[] }
  | { type: 'hover'; id: string | null }
  | { type: 'escape' };

// A click on a box selects that box alone; Shift+click adds it to the selection or takes it out (S04 "Shift+click
// box | Adds to selection for bulk edit", EZD-405); a click off every box or Esc clears; hover marks one box. `set`
// is the selection an edit leaves (the copies after Duplicate, nothing after Delete).
export function cabinetSelect(s: CabinetSelection, i: CabinetSelectionInput): CabinetSelection {
  switch (i.type) {
    case 'click':
      if (i.id === null) return i.shift === true ? s : { ...s, ids: [] };
      if (i.shift === true) {
        const key = idKey(i.id);
        const has = s.ids.some((x) => idKey(x) === key);
        return { ...s, ids: has ? s.ids.filter((x) => idKey(x) !== key) : [...s.ids, i.id] };
      }
      return { ...s, ids: [i.id] };
    case 'set':
      return { ...s, ids: [...i.ids] };
    case 'hover':
      return s.hoveredId === i.id ? s : { ...s, hoveredId: i.id };
    case 'escape':
      return s.ids.length === 0 ? s : { ...s, ids: [] };
  }
}

export const isCabinetSelected = (s: CabinetSelection, id: string): boolean =>
  s.ids.some((x) => sameId(x, id));
