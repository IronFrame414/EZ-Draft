// Build order of the loop's candidates (EZD-1940, audit 2026-11-23 W1). Keys, in order:
//   1. security fix tickets first (advisories.mjs TRACK),
//   2. the config.json `priority` list (listed tickets in list order, then the rest),
//   3. retried first: a ticket that failed once and was requeued goes before a fresh ticket,
//   4. phase rank (phase 56 is built as 5.5; the final sweeps, phases 54 and 55, after phase 58), 5. build_position, 6. id.
// A retried ticket no longer waits at the back of the queue, so `priority` is not needed to bring a retry forward.
import { TRACK as SECURITY_TRACK } from './advisories.mjs';

// Phase 56 (AI assistant) is built right after phase 5 and before phase 6 (vault/tickets/PHASES.md, Q-0630).
// The final sweeps, phases 54 and 55, are built after phase 58, 54 before 55 (EZD-2023, audit 2026-11-27 X1).
export const LAST_PHASE = 58;
const SWEEP_RANK = { 54: LAST_PHASE + 0.54, 55: LAST_PHASE + 0.55 };
export const phaseRank = (p) => (Number(p) === 56 ? 5.5 : SWEEP_RANK[Number(p)] ?? Number(p));
// config.json max_phase: a ticket may start when its phase number or its rank is not above it, so moving the sweeps
// to rank 58.5 never hides them behind max_phase 58, and phase 56 (rank 5.5) builds as before.
export const withinMaxPhase = (p, max = 999) => phaseRank(p) <= Number(max) || Number(p) <= Number(max);

// Sorts a copy of `list` into build order. retries: state.json `retries` ({ id: count }); priority: config `priority`.
export function buildOrder(list, { retries = {}, priority = [] } = {}) {
  const retried = (t) => (retries?.[t.id] ? 0 : 1);
  const rank = (t) => { const i = (priority || []).indexOf(t.id); return i < 0 ? 1e9 : i; };
  const sec = (t) => (t.track === SECURITY_TRACK ? 0 : 1);
  return [...list].sort((a, b) => (sec(a) - sec(b)) || (rank(a) - rank(b)) || (retried(a) - retried(b))
    || (phaseRank(a.phase) - phaseRank(b.phase)) || ((a.build_position ?? 1e9) - (b.build_position ?? 1e9))
    || a.id.localeCompare(b.id));
}
