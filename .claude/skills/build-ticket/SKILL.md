---
name: build-ticket
description: Unit `build <T>` - Stage 3 for one ticket (re-validate, worktree, tests, test review, build, gate, reviews, merge to develop, push), then end the session. Usage /build-ticket EZD-xxx.
---

You are the orchestrator for one unit: build ticket $ARGUMENTS (PROCESS.md section 8; project additions in `vault/PROCESS-EZDRAFT.md`). You write no app code and no tests. Your checkout stays on `develop`. When the ticket is `done` or `blocked`, write the handoff and end the session; do not start another ticket.

**Load only:** of `vault/plans/$ARGUMENTS.md` its header and sections 5, 7, 8, 9, once (`node vault/tools/outline.mjs vault/plans/$ARGUMENTS.md --section header --section 5 --section 7 --section 8 --section 9`; the whole plan only if it has no numbered sections), the ticket's row in `vault/tickets/STATUS.md`, its `tickets.json` entry (`depends_on`, `spec_files`, `acs`), and `.claude/skills/build-ticket/dispatch.md` (the dispatch template, once). Read spec or decision files only when a step below needs them.

**Research reports.** After any dispatch that returned a `REPORT:` line, run `node vault/tools/research.mjs adopt`; it moves each pending report to `vault/research/R-NNN.md` and prints the IDs to cite (PROCESS.md section 13).

**Plan sections per role** (optimize plan C3, Josh 2026-10-20; numbers from `vault/plans/TEMPLATE.md`). Every dispatch adds one line under `Plan:`, `Sections: <list>`, from this table; the agent prints them with `node vault/tools/outline.mjs <plan> --section <n>` (a plan without numbered sections prints whole).

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

0. **Pre-flight.** `git status` clean on `develop`; `node vault/tools/next_ticket.mjs --check` passes; the ticket is `ready`, `in-progress` or `review` with all dependencies `done` (if not, stop and say why). If `vault/handoff/BUDGET_HOLD.md` exists and the ticket is not already `in-progress` or `review`, stop: nothing new starts under a hold.
1. **Re-validate the plan** if any dependency's STATUS notes record a plan deviation: dispatch `planner` in re-validation mode (dispatch.md) with the deviating dependencies. A changed test value or behavior comes back as a QP question: give it a Q-ID in `QUESTIONS.md`, run it up the chain (section 7); if it needs Josh, STATUS → `blocked` with the Q-ID, handoff, end. Skip when no dependency deviated.
2. **Worktree.** If `.claude/worktrees/$ARGUMENTS` or branch `t/$ARGUMENTS` exists, resume: `git -C .claude/worktrees/$ARGUMENTS log --oneline develop..HEAD` shows how far it got (`test(...)` commit = tests written; `wip(...)` commits = build started) and you continue from that step. Otherwise `git worktree add .claude/worktrees/$ARGUMENTS -b t/$ARGUMENTS develop`. STATUS → `in-progress`.
3. **Pick models** from the plan's Complexity (PROCESS.md section 4 table): low → Haiku 5.5 / Haiku 5.5; medium → Sonnet 5.5 / Sonnet 5.5; high → Fable 5.1 / Fable 5.1 for test-author and builder; reviewers Opus 5.5, or Fable 5.1 on a high ticket. If the environment variable `EZD_FABLE_ALLOWED` is `0`, or a Fable dispatch ends on a limit error, use Opus 5.5 where Fable is named and note the fallback. Record every model choice and its reason in STATUS Notes.
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
9. **FAIL** → STATUS → `in-progress`. Classify the open findings: *minor* (naming, style, one-file fix, no behavior or requirement) → resume the same builder with the findings, once per ticket; *behavior, requirement or test failure* → a fresh builder one tier up (Haiku → Sonnet → Opus → Fable; at the ceiling, resume the same agent). Only the reviewers whose findings are open review again. After the 3rd failed round → `blocked` with a one-line reason and a question; leave the worktree; handoff; end.
10. **PASS** → in the main checkout: `git merge --squash t/$ARGUMENTS`, `git commit -m "feat($ARGUMENTS): <title>"`; `node scripts/gate.mjs . --phase <N>` on `develop` (phase tests plus @smoke; red → treat as a review FAIL); `git worktree remove .claude/worktrees/$ARGUMENTS`; `git branch -D t/$ARGUMENTS`. STATUS → `done` with the short hash and test count; Notes: models used, plan deviations (from the builder's and reviewers' reports), `needs-josh-confirm` wording. Append one line to `vault/DONE.md` (date · ticket · title · user-visible result · commit). `node vault/tools/next_ticket.mjs --report`. Record any lesson (PROCESS.md section 13; search the role file first). Special cases: after EZD-000, append `See @docs/architecture.md` to `CLAUDE.md` and copy `docs/architecture.md` to `vault/architecture.md`; after a spike (EZD-027 to EZD-031), write `vault/spikes/$ARGUMENTS.md` from the template with its `Verdict:` line.
11. **Handoff and push.** `node vault/tools/next_ticket.mjs --check`; overwrite `vault/handoff/CURRENT.md` (template; 30 lines max); commit `vault/` (`docs(vault): $ARGUMENTS <done|blocked>`); `git push origin develop`. End the session with a report of 20 lines or fewer: status first, then commit, models used, deviations, open questions.
