// One vault/cost/log.jsonl row per launcher run (vault/cost/README.md; optimize plan C1, vault/cost/optimize-plan-2026-10-20.md).
// duration_ms is what `claude -p` reports and can be far below the real run time; wall_ms is spawn to exit, measured by the
// launcher. meter_source is the meter that gated the run; process_rev is develop's short hash when the run started.
export function costEntry({ ts, unit, ticket, models, total, fable, outcome, parsed, startedMs, endedMs, auth, meterSource, processRev }) {
  const wall = endedMs - startedMs;
  return {
    ts, unit, ticket, models, est_usd: total, fable_est_usd: fable, outcome,
    session_id: parsed?.session_id, num_turns: parsed?.num_turns, duration_ms: parsed?.duration_ms ?? wall, auth,
    wall_ms: wall, meter_source: meterSource, process_rev: processRev,
  };
}
