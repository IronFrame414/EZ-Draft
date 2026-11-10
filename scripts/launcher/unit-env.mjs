// EZD-364 (vault/plans/EZD-364.md D-Limit): environment limits every launcher unit runs with (scripts/run.mjs runUnit).
// - CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS 0: a -p session stopped background subagents 10 minutes after its last turn,
//   which killed the EZD-017 and EZD-018 builders on 2026-10-22; 0 waits for them.
// - BASH_MAX_TIMEOUT_MS 2 hours: Claude Code 2.1.321 stops a run_in_background command at the larger of its timeout and
//   this value (default 10 minutes), which stopped gate-phase 4's full gate mid e2e on 2026-11-09 and left its app server
//   holding the port. Foreground calls keep the 2-minute default (BASH_DEFAULT_TIMEOUT_MS is not set).
export const UNIT_ENV_LIMITS = Object.freeze({
  CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0',
  BASH_MAX_TIMEOUT_MS: '7200000',
});
