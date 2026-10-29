# Handoff · 2026-10-28 · build EZD-249 (stopped, nothing built)

- EZD-249: not built. No worktree, no branch, no dispatch. STATUS stays `ready`.
- Why: plan s9 says 1b and C1-C8 build on EZD-248's .githooks/pre-commit, checkStaged, core.hooksPath and fixture R. EZD-248 is blocked (Q-0421) and .githooks is not on develop. The row listed only EZD-000, so preflight passed.
- Fix made (ledger repair): EZD-249 now depends on EZD-000, EZD-248 in vault/tickets/phases/phase-01.md and vault/tickets/tickets.json. `next_ticket.mjs --check` LEDGER OK; `--next-unit` now returns EZD-251, not EZD-249.
- On resume (after EZD-248 merges): run build step 1 first, planner re-validation. EZD-246 moved dispatch.md sections (plan cites stale lines) and EZD-248's final shape may change with Q-0421.
- Step 0 grant for EZD-249 is live in .claude/hooks/guard-paths.mjs (lines 121, 124); remove after merge.
- Needs Josh: Q-0421 (EZD-248 options a/b/c; recommended c). Earlier open: Q-0420 (EZD-247), Q-0419/EZD-199 blocked, EZD-173 needs Josh's patch.
- Models: none dispatched. Advisor consulted once (agreed: do not build; fix the dependency).

Next unit (node vault/tools/next_ticket.mjs --next-unit): build EZD-251
