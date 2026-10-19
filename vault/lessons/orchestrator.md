# Lessons · orchestrator

Entries follow the format in PROCESS.md section 13. Keep under about 30; the wrap unit consolidates.

## L-003  areas: tooling, scripts, process  seen: 2  status: candidate
Ticket EZD-000b, 2026-10-19
Mistake: two repo-script tests went red in later runs: one hard-coded the next Q-IDs from a copy of the live ledger, one built hook inputs under the real repo root, which inside a ticket worktree changed the hook's answer.
Cause: the tests depended on live repo state (ledger size, checkout location) instead of fixed inputs.
Rule: a repo-script test derives expected values from its own fixture or copy (e.g. next ID = highest in the copy + 1) and feeds path-sensitive tools a fixed fake root, never the checkout it runs in.
Check: the test passes both in the main checkout and in a `.claude/worktrees/EZD-000b` worktree, and after one row is added to the copied ledger (Q-0136). Seen again EZD-001 (Q-0141): the copied ledger carried a live escalation and an in-flight ticket; the fixture now neutralizes both.

## L-005  areas: tooling, process  seen: 1  status: candidate
Ticket EZD-000i, 2026-10-19
Mistake: the builder dispatch said no command may name the sign-in file, stricter than the plan, whose step 11 runs `test -f` on it (allowed by Q-0135 (a)); the builder skipped that check and it became a deviation.
Cause: the orchestrator added a safety note to the dispatch from the plan's Risks section without checking it against the plan's steps and allow lists.
Rule: a dispatch adds no restriction the plan does not state; a caution from the plan's Risks section is quoted with its plan exceptions.
Check: before dispatch, each extra note in the dispatch cites the plan line it comes from.
