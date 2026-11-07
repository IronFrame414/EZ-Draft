// EZD-360 (vault/plans/EZD-360.md; Q-0630): the one order of phases. Phase 56, the AI assistant phase, comes right after
// phase 5 (Josh 2026-11-07: "just name the ai phase 56 and build after 5"). Compare with these; never return a rank as a phase.
// In vault/tools/ because the ledger test copies carry all of vault/.
const RANKS = new Map([[56, 5.5]]);

/** The place of phase `p` in the build order: its own number, except phase 56. */
export function phaseRank(p) {
  return RANKS.get(p) ?? p;
}

/** Negative when phase `a` comes first. */
export function comparePhases(a, b) {
  return phaseRank(a) - phaseRank(b);
}
