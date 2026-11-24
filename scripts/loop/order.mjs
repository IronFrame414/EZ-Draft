// Build order of the loop's candidates (EZD-1940, audit 2026-11-23 W1). Keys, in order:
//   1. security fix tickets first (advisories.mjs TRACK),
//   2. the config.json `priority` list (listed tickets in list order, then the rest),
//   3. retried first: a ticket that failed once and was requeued goes before a fresh ticket,
//   4. phase rank (phase 56 is built as 5.5), 5. build_position, 6. id.
// A retried ticket no longer waits at the back of the queue, so `priority` is not needed to bring a retry forward.
import { TRACK as SECURITY_TRACK } from './advisories.mjs';

// Phase 56 (AI assistant) is built right after phase 5 and before phase 6 (vault/tickets/PHASES.md, Q-0630).
export const phaseRank = (p) => (Number(p) === 56 ? 5.5 : Number(p));

// Sorts a copy of `list` into build order. retries: state.json `retries` ({ id: count }); priority: config `priority`.
export function buildOrder(list, { retries = {}, priority = [] } = {}) {
  const retried = (t) => (retries?.[t.id] ? 0 : 1);
  const rank = (t) => { const i = (priority || []).indexOf(t.id); return i < 0 ? 1e9 : i; };
  const sec = (t) => (t.track === SECURITY_TRACK ? 0 : 1);
  return [...list].sort((a, b) => (sec(a) - sec(b)) || (rank(a) - rank(b)) || (retried(a) - retried(b))
    || (phaseRank(a.phase) - phaseRank(b.phase)) || ((a.build_position ?? 1e9) - (b.build_position ?? 1e9))
    || a.id.localeCompare(b.id));
}
