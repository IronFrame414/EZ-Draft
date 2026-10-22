---
name: build-ticket
description: Unit `build <T>` - Stage 3 for one ticket (re-validate, worktree, tests, test review, build, gate, reviews, merge to develop, push), then end the session. Usage /build-ticket EZD-xxx.
---

You are the orchestrator for one unit: build ticket $ARGUMENTS (PROCESS.md section 8; project additions in `vault/PROCESS-EZDRAFT.md`). You write no app code and no tests. Your checkout stays on `develop`. When the ticket is `done` or `blocked`, write the handoff and end the session; do not start another ticket.

**Load only:** of `vault/plans/$ARGUMENTS.md` its header and sections 5, 7, 8, 9, once (`node vault/tools/outline.mjs vault/plans/$ARGUMENTS.md --section header --section 5 --section 7 --section 8 --section 9`; the whole plan only if it has no numbered sections), the ticket's row in `vault/tickets/STATUS.md`, its `tickets.json` entry (`depends_on`, `acs`), and `.claude/skills/build-ticket/dispatch.md` (the dispatch template, once). Read spec or decision files only when a step below needs them; never search for them.

**Research reports.** After any dispatch that returned a `REPORT:` line, run `node vault/tools/research.mjs adopt`; it moves each pending report to `vault/research/R-NNN.md` and prints the IDs to cite (PROCESS.md section 13).

**Plan sections per role** (optimize plan C3, Josh 2026-10-20; numbers from `vault/plans/TEMPLATE.md`). Every dispatch adds one line under `Plan:`, `Sections: <list>`, from this table; the agent prints them with `node vault/tools/outline.mjs <plan> --section <n>` (a plan without numbered sections prints whole).

**Reading map** (Q-0218). Fill each dispatch's `Spec files:` and `Decisions:` lines and its `Sections:` line by pasting the output of `node vault/tools/next_ticket.mjs --reads $ARGUMENTS <role>` (role as in the table below, for example `builder` or `code-reviewer mode 2`); it reads `tickets.json` (`spec_files`, `decisions`, `mockups`, with `(anchor)` naming the part of a file the ticket needs) and this table. Do not search the spec or the decisions folder. A reading list that looks wrong or incomplete is fixed in `tickets.json` by the orchestrator (fix mode), not worked around.

| Role | Sections |
| --- | --- |
| test-author | header, 3, 4 |
| builder | header, 1, 3, 4, 6 |
| code-reviewer mode 2 | header, 3, 4 |
| code-reviewer mode 3 | header, 1, 3, 4, 6 |
| security-reviewer | header, 1, 3, 7 |
| ui-verifier | header, 5 |
| calc-auditor | header, 4 |
| planner (re-validation) | header, 2, 3, 4, 9 |

0. **Pre-flight.** `node scripts/unit-steps.mjs preflight $ARGUMENTS`. Exit 3 → stop and report its line (it checks develop is clean, `next_ticket.mjs --check`, the ticket's status and dependencies, and the budget hold).
1. **Re-validate the plan** if any dependency's STATUS notes record a plan deviation: dispatch `planner` in re-validation mode (dispatch.md) with the deviating dependencies. A changed test value or behavior comes back as a QP question: give it a Q-ID in `QUESTIONS.md`, run it up the chain (section 7); if it needs Josh, STATUS → `blocked` with the Q-ID, handoff, end. Skip when no dependency deviated.
2. **Worktree.** `node scripts/unit-steps.mjs worktree $ARGUMENTS`. It creates `.claude/worktrees/$ARGUMENTS` on `t/$ARGUMENTS` (STATUS → `in-progress`) or reports `RESUME tests=yes|no wip=N`: tests written → skip step 4; wip commits → the build started, continue at step 6.
3. **Pick models** from the plan's Complexity (PROCESS.md section 4 table): low → Haiku 5.5 / Haiku 5.5; medium → Sonnet 5.5 / Sonnet 5.5; high → Opus 5.5 / Opus 5.5 for test-author and builder; code-reviewer Opus 5.5 always; security-reviewer Opus 5.5, or Fable 5.1 on a high ticket (Josh, 2026-10-20: Opus by default, Fable 5.1 for test-author and builder only as the step-9 retry after an Opus FAIL; code-reviewer never Fable). If the environment variable `EZD_FABLE_ALLOWED` is `0`, or a Fable dispatch ends on a limit error, use Opus 5.5 where Fable is named and note the fallback. Record every model choice and its reason in STATUS Notes.
4. **Tests.** Dispatch `test-author` (dispatch.md) with the worktree path. It writes failing tests to the plan's interface contract and commits `test($ARGUMENTS): …`. On harness tickets (EZD-006, EZD-008, EZD-016a, EZD-016b, EZD-019, EZD-021) it also builds the harness itself.
5. **Test review.** Skip on a `low` ticket (the tests are reviewed with the code in step 8). Otherwise dispatch `code-reviewer` in mode 2 with the plan path and worktree path. FAIL → findings back to `test-author`, review again. Three failed test reviews → `blocked` with a one-line reason and a question; handoff; end.
6. **Build.** Dispatch `builder` at the round-1 tier. It commits `wip($ARGUMENTS): …` as it goes.
   - A **question** from the builder: Q-ID in `QUESTIONS.md`, up the chain; if it needs Josh → `blocked`, handoff, end.
   - A **structural test mismatch**: send it to `test-author` for a structure-only repair (`test($ARGUMENTS): structural repair - …`), then `code-reviewer` confirms the diff changed no assertion, expected value, input or test count. FAIL → it becomes a question. PASS → back to the builder.
   - **`needs-josh-confirm` wording**: keep the list for STATUS Notes. It does not block.
7. **Gate.** Run `node scripts/gate.mjs .claude/worktrees/$ARGUMENTS` yourself, once. Keep the summary (touched paths, `SECURITY FLAG:` lines, failing tests). Red → back to step 6 as the next round.
8. **Review.** STATUS → `review`. Dispatch in parallel, each with the plan path, worktree path and the gate summary (reviewers do not run the gate; full logs are in the worktree's `gate.log`):
   - `code-reviewer` mode 3, always. On a medium or high ticket resume the step-5 reviewer (same agent) instead of a fresh one; on a low ticket it reviews the tests here too.
   - `ui-verifier` when the plan has a visual checklist (one viewport, the states on the checklist).
   - `security-reviewer` when the plan says `security-review: yes` **or** the gate printed any `SECURITY FLAG:` line.
   - `calc-auditor` when the plan's Reviewers line says so.
9. **FAIL** → STATUS → `in-progress`. Classify the open findings: *minor* (naming, style, one-file fix, no behavior or requirement) → resume the same builder with the findings, once per ticket; *behavior, requirement or test failure* → a fresh builder one tier up (Haiku → Sonnet → Opus → Fable; Fable is reached only here; at the ceiling, resume the same agent; code-reviewer stays Opus). Only the reviewers whose findings are open review again. After the 3rd failed round → `blocked` with a one-line reason and a question; leave the worktree; handoff; end.
10. **PASS** → `node scripts/unit-steps.mjs merge $ARGUMENTS`. It squashes `t/$ARGUMENTS`, commits `feat($ARGUMENTS): <title>`, runs the develop gate for the phase, removes the worktree and branch, and sets STATUS `done` with hash and test count. `MERGE RED` (exit 1) → develop is restored; treat it as a review FAIL (step 9). On `MERGE OK`: write STATUS Notes: models used, plan deviations (from the builder's and reviewers' reports), `needs-josh-confirm` wording. Append one line to `vault/DONE.md` (date · ticket · title · user-visible result · commit). Record any lesson (PROCESS.md section 13; search the role file first). Special cases: after EZD-000, append `See @docs/architecture.md` to `CLAUDE.md` and copy `docs/architecture.md` to `vault/architecture.md`; after a spike (EZD-027 to EZD-031), write `vault/spikes/$ARGUMENTS.md` from the template with its `Verdict:` line.
11. **Handoff and push.** Overwrite `vault/handoff/CURRENT.md` (template; 30 lines max), then `node scripts/unit-steps.mjs finish $ARGUMENTS done|blocked` (ledger check, report, commits `vault/`, pushes develop). End the session with a report of 20 lines or fewer: status first, then commit, models used, deviations, open questions.
