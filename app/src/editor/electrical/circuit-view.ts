// EZD-604 (S06 Controls "Circuit row | Click selects the circuit: highlights its devices and home run on canvas",
// "Show chips: ... Home runs ... | Toggle display of each layer on canvas."; board S06Electrical; vault/build/
// assumptions.md EZD-604): the circuit chosen in the left panel and the Home runs chip, which the plan reads to draw
// home runs (every circuit's with the chip on, else the chosen circuit's only) and the Circuit tool reads to know where
// a clicked device goes. Lasts while the page is open; never saved. Tiny and dependency free, like height-notes-shown,
// so the editor's first download carries it without the electrical chunk.
export type CircuitViewState = { circuit: string | null; homeRuns: boolean };

let state: CircuitViewState = { circuit: null, homeRuns: false };
const listeners = new Set<() => void>();

export const circuitView = {
  get: (): CircuitViewState => state,
  set(patch: Partial<CircuitViewState>): void {
    const next = { ...state, ...patch };
    if (next.circuit === state.circuit && next.homeRuns === state.homeRuns) return;
    state = next;
    for (const l of [...listeners]) l();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
