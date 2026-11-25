// EZD-603 (board S06Electrical left panel "Height notes Off / On"; vault/build/assumptions.md EZD-603): whether the
// plan draws the height notes that are turned on per device. The electrical left panel's switch sets it and the plan
// controller redraws on a change. On by default (the board); it lasts while the page is open and is never saved.
// Tiny and depending only on shared/value-store, so the editor's first download carries it without the electrical
// chunk.
import { createValueStore } from '../shared/value-store';

export const heightNotesShown = createValueStore(true);
