# Lessons · orchestrator

Entries follow the format in PROCESS.md section 13. Keep under about 30; the wrap unit consolidates.

## L-003  areas: tooling, scripts, process  seen: 2  status: ratified
Ticket EZD-000b, 2026-10-19
Mistake: two repo-script tests went red in later runs: one hard-coded the next Q-IDs from a copy of the live ledger, one built hook inputs under the real repo root, which inside a ticket worktree changed the hook's answer.
Cause: the tests depended on live repo state (ledger size, checkout location) instead of fixed inputs.
Rule: a repo-script test derives expected values from its own fixture or copy (e.g. next ID = highest in the copy + 1) and feeds path-sensitive tools a fixed fake root, never the checkout it runs in.
Check: the test passes both in the main checkout and in a `.claude/worktrees/EZD-000b` worktree, and after one row is added to the copied ledger (Q-0136). Seen again EZD-001 (Q-0141): the copied ledger carried a live escalation and an in-flight ticket; the fixture now neutralizes both.

## L-005  areas: tooling, process  seen: 1  status: ratified
Ticket EZD-000i, 2026-10-19
Mistake: the builder dispatch said no command may name the sign-in file, stricter than the plan, whose step 11 runs `test -f` on it (allowed by Q-0135 (a)); the builder skipped that check and it became a deviation.
Cause: the orchestrator added a safety note to the dispatch from the plan's Risks section without checking it against the plan's steps and allow lists.
Rule: a dispatch adds no restriction the plan does not state; a caution from the plan's Risks section is quoted with its plan exceptions.
Check: before dispatch, each extra note in the dispatch cites the plan line it comes from.

## 2026-10-23 · EZD-027 · a recurring e2e flake costs gate runs
Symptom: e2e/jobs.spec.ts (EZD-009) failed 3 of 4 full gate runs (missing 'queued' event) and passed alone 3 of 3; the merge's develop gate failed once the same way.
Cause: the test races the first job status event under four parallel workers.
Rule: run the failing spec alone before blaming the branch, retry the gate, and record the flake in STATUS Notes; a repair to the EZD-009 test goes to the test-author as its own ticket, not into the unit at hand.
Check: STATUS Notes name the spec and the failure counts.

- EZD-148 (2026-10-25): when a security finding sends a text-checker rule back to the planner, have the security-reviewer attack the patched plan (read-only) before the test-author implements it; on EZD-148 two plan checks found two more bypasses at plan-text cost instead of two failed implementation rounds.

- EZD-147 (2026-10-25): when STATUS Notes hold two resume instructions ("resume at step 7" written after an earlier "resume order"), follow the plan header's Session line and the steps it lists: the later note skipped plan-gap steps 4a (rebase) and 4b (test-author round), which the worktree log showed were still undone.

- EZD-156 (2026-10-25): a fix-mode commit (124fdd2) edited `.claude/skills/build-ticket/dispatch.md` without re-running `scripts/process/retrievers.test.mjs`, which pins its head by hash, so develop stayed red until the next gate (Q-0335). Rule: after a fix-mode edit to a skill, agent file or process file, run `node --test scripts/process/` (and any test that names the file, `grep -rl <file> scripts/`) before committing; when a ticket gate is red only on a test outside the ticket, run it on plain develop first and fix it there, never as a builder round.
