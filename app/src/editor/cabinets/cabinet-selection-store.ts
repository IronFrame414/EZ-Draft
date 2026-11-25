// EZD-406 (S04 Controls "Click box | Selects that box; same box highlights in both views; inspector shows it";
// S04 Layout "Inspector 336px: selected box"): the cabinet run screen's selection, shared by the drawing (over the
// canvas) and the box inspector (in the shell's inspector place). Tiny on purpose: it is created by the editor entry,
// while both views load lazily. `swapFor` is the box whose Swap box list is open (the inspector footer, or Swap box in
// the canvas context menu). EZD-403: `runId` is the run the Runs tab opened (null: the first run on the floor).
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  NO_CABINET_SELECTION,
  cabinetSelect,
  type CabinetSelection,
  type CabinetSelectionInput,
} from './cabinet-selection';

export type CabinetSelectionState = {
  selection: CabinetSelection;
  swapFor: string | null;
  runId: string | null;
  send(i: CabinetSelectionInput): void;
  openSwap(id: string | null): void;
  openRun(id: string | null): void;
};

export type CabinetSelectionStore = StoreApi<CabinetSelectionState>;

export function createCabinetSelectionStore(): CabinetSelectionStore {
  return createStore<CabinetSelectionState>()((set) => ({
    selection: NO_CABINET_SELECTION,
    swapFor: null,
    runId: null,
    send: (i) =>
      set((s) => {
        const selection = cabinetSelect(s.selection, i);
        if (selection === s.selection) return s;
        // The swap list belongs to one box; it closes when that box is no longer the one selected.
        const keep =
          s.swapFor !== null &&
          selection.ids.length === 1 &&
          selection.ids[0]!.toLowerCase() === s.swapFor.toLowerCase();
        return { selection, swapFor: keep ? s.swapFor : null };
      }),
    openSwap: (id) => set({ swapFor: id }),
    // Opening another run starts it with nothing selected.
    openRun: (id) =>
      set((s) =>
        s.runId === id ? s : { runId: id, swapFor: null, selection: NO_CABINET_SELECTION },
      ),
  }));
}
