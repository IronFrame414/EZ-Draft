// EZD-604 (S06 Controls "Circuit row | Click selects the circuit: highlights its devices and home run on canvas",
// "Show chips: ... Home runs ... | Toggle display of each layer on canvas."; board S06Electrical; vault/build/
// assumptions.md EZD-604): the circuit chosen in the left panel and the Home runs chip, which the plan reads to draw
// home runs (every circuit's with the chip on, else the chosen circuit's only) and the Circuit tool reads to know where
// a clicked device goes. Lasts while the page is open; never saved. Tiny and depending only on shared/value-store,
// like height-notes-shown, so the editor's first download carries it without the electrical chunk.
// EZD-605: and the Switch legs chip (on by default, board S06Electrical), which the plan reads to draw switch legs.
import { createValueStore } from '../shared/value-store';

export type CircuitViewState = { circuit: string | null; homeRuns: boolean; switchLegs: boolean };

const store = createValueStore<CircuitViewState>(
  { circuit: null, homeRuns: false, switchLegs: true },
  (a, b) => a.circuit === b.circuit && a.homeRuns === b.homeRuns && a.switchLegs === b.switchLegs,
);

export const circuitView = {
  get: store.get,
  set: (patch: Partial<CircuitViewState>): void => store.set({ ...store.get(), ...patch }),
  subscribe: store.subscribe,
};
