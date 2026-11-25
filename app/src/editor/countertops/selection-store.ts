// EZD-416 (S04b Controls "Piece row ... Selects the piece; canvas and inspector sync"; S04b Decisions "The Edges tab
// lists every edge ... clicking a row selects the edge"): the countertop selection the left panel, the screen and the
// inspector share. `edge` is the picked edge of the selected piece (its place in the outline), or null.
import { createStore, type StoreApi } from 'zustand/vanilla';

export type CountertopSelection = { pieceId: string | null; edge: number | null };

export type CountertopSelectionState = {
  selection: CountertopSelection;
  select(pieceId: string | null, edge?: number | null): void;
};

export type CountertopSelectionStore = StoreApi<CountertopSelectionState>;

export const NO_COUNTERTOP_SELECTION: CountertopSelection = Object.freeze({ pieceId: null, edge: null });

export function createCountertopSelectionStore(): CountertopSelectionStore {
  return createStore<CountertopSelectionState>()((set, get) => ({
    selection: NO_COUNTERTOP_SELECTION,
    select: (pieceId, edge = null) => {
      const now = get().selection;
      const e = pieceId === null ? null : edge;
      if (now.pieceId === pieceId && now.edge === e) return;
      set({ selection: pieceId === null ? NO_COUNTERTOP_SELECTION : { pieceId, edge: e } });
    },
  }));
}
