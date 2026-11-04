# P3 · 2.12c · The launcher applies each unit's results; the 1-commit proof

Source: REMEDIATION-PLAN 2.12, where "Done when" is a run of one ticket making exactly 1 commit. The task brief says `--dry-run` does not count, so the proof is a harness run. Also AUDIT-REPORT 3.2, "Flow per ticket"; D1 (a), D2 (a). Builds on P1 and P2. Tests use the launcher harness `scripts/launcher/test-utils/harness.mjs` and a temp database (L-041).

## What to build (`scripts/run.mjs`)
1. Each unit gets `EZD_RESULTS_FILE=<inflight dir>/<unit id>.results.jsonl`. The unit's env never carries `EZD_RECORDS_WRITER`.
2. After the unit, `applyUnit(file, extraOps)`:
   - reads the queue and adds the launcher's own ops (the cost row; for plan and review-plans their records);
   - applies them all in one transaction;
   - renames the file `.applied`;
   - re-exports the views and runs `next_ticket.mjs --report`.
   - A file that fails is renamed `.rejected`. Josh is notified with its name, and the cost row is still applied on its own. Nothing is committed, and `closeUnit` is gone.
3. Plan unit:
   - Same rules as `recordPlan`: plan missing, no STATUS row, or an architecture failure is a problem, and the cost row is still recorded.
   - The plan's QP lines get Q-IDs from `nextQuestionId(db)` through a new `planQuestionRows(ticket, firstId)` in next_ticket.mjs. It returns the ids, the rows and the new plan text, and does not write QUESTIONS.md. The launcher writes the plan text (a reference file) and records one `question` op per row.
   - Then one `status` op (`questions` or `planned`, plus complexity) and one `handoff` op.
4. review-plans: the review file is written as before (a reference file) plus a `handoff` op.
5. Recovery: a dead unit's leftover results file is applied with its `interrupted` cost row, so a unit killed after its squash still lands `done` with the hash.
6. The no-progress tabling runs `unit-steps.mjs table` with `EZD_RECORDS_WRITER=<launcher pid>` (a direct write, P1 rule 7).
7. Grants and queued ledger edits are unchanged (2.8 and 2.15 remove them).

## Tests (new file `scripts/launcher/records-writer.test.mjs`)
| Test | Expected |
| --- | --- |
| W1 proof | harness root with the running records git-ignored, a fixture ticket EZD-900 in a temp database, stub next unit `build EZD-900`, `--once`. The fake claude's script runs the real `unit-steps.mjs` preflight, worktree, one wip commit, merge (gate stub), `ledger.mjs append vault/DONE.md`, `ledger.mjs handoff` and finish. Results: develop has exactly 1 new commit, `feat(EZD-900): Proof ticket`; the database row is `done` with that hash; DONE and CURRENT hold the unit's lines; one cost row; `git status --porcelain` is empty |
| W2 recovery | a dead in-flight record plus its results file holding a `done` status: the next launcher start applies it and adds the `interrupted` cost row; no commit |
| W3 rejected | a results file with a bad line: renamed `.rejected`, Josh notified, the cost row still recorded, no commit |
| W4 plan unit | a plan with one QP line: Q-ID recorded in the database, the plan line rewritten, the row `questions`, no commit |

## Tests that change expectation
- `scripts/launcher/plan-ledger.test.mjs` L1 and L2: the row and the architecture call through the database.
- Launcher tests that read `vault/cost/log.jsonl` read the cost row from the temp database.
