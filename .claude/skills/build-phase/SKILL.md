---
name: build-phase
description: Stage 3 for one phase - build every ready ticket through plan re-check, tests, test review, build, gate, review, merge to develop and push. Usage /build-phase <phase number>.
---

Run Stage 3 of `vault/PROCESS.md` for phase $ARGUMENTS. You are the orchestrator. To run unattended, Josh starts it with a goal (see SETUP.md step 8) rather than this command, and the goal tells you to follow this skill.

Your checkout stays on `develop` the whole time. Loop until no ticket in the phase is `ready` with all dependencies `done`:

1. **Pick.** Make sure the main checkout is on `develop` and clean (`git status`; `git switch develop` if needed). Run `node vault/tools/next_ticket.mjs --ready`; its first line is the ticket. `<ID> IN FLIGHT` means a ticket is `in-progress` or `review` from an earlier session: resume that one (step 3). Exit 2 means nothing is ready (stop the loop); exit 4 means the architecture checkpoint is not met (stop and report).
2. **Re-validate the plan** if any ticket in its `depends_on` has a plan deviation recorded in its STATUS notes. Dispatch `planner` in re-validation mode with the ticket ID and the deviating dependencies. A changed test value or behavior comes back as a QP question: log it (Q-ID, QUESTIONS.md) and run it up the chain; if it needs Josh, STATUS → `blocked` and move on. Skip this step if no dependency deviated.
3. **Worktree.** If `.claude/worktrees/<ID>` or branch `t/<ID>` already exists, resume: keep it, read `git -C .claude/worktrees/<ID> log --oneline develop..HEAD` to see how far it got (a `test(<ID>)` commit means tests are written; `wip(<ID>)` commits mean the build started) and continue from the matching step below. Otherwise `git worktree add .claude/worktrees/<ID> -b t/<ID> develop`. STATUS → `in-progress`.
4. **Tests.** Dispatch `test-author` with the ticket ID, the plan path and the absolute worktree path. It writes failing tests to the plan's interface contract and commits `test(<ID>): …`. On harness tickets (EZD-006, EZD-008, EZD-016a, EZD-016b, EZD-019, EZD-021) the test-author also builds the harness itself (test configs, `test-utils/`, `test-harness/`, fixtures, stubs).
5. **Test review.** Dispatch `code-reviewer` in mode 2 (tests against the plan) with the plan path and worktree path. FAIL → findings back to `test-author`, then review again. PASS → continue. After 3 failed test reviews: STATUS → `blocked` with a one-line reason, add a question, move on.
6. **Build.** Round 1: dispatch `builder` (Sonnet) with the ticket ID, plan path and worktree path. It commits `wip(<ID>): …` as it goes. From round 2 (any earlier gate or review FAIL on this ticket): dispatch `builder-senior` (Opus) instead, with all findings in one message.
   - A **question** from the builder: add it to QUESTIONS.md and run it up the chain (Stage 2 rules); if it needs Josh, STATUS → `blocked`, note it in STATUS and move to the next ticket.
   - A **structural test mismatch** from the builder: send it to `test-author` for a structure-only repair (`test(<ID>): structural repair - …`), then dispatch `code-reviewer` to confirm that commit's diff changed no assertion, expected value, input or test count. FAIL → it becomes a question. PASS → back to the builder.
   - **`needs-josh-confirm` wording** from the builder: keep the list for STATUS notes (step 9). It does not block.
7. **Gate.** Run `node scripts/gate.mjs .claude/worktrees/<ID>` yourself, once. Red → back to step 6 (next round). Keep the output, including the touched paths and any `SECURITY FLAG:` lines.
8. **Review.** STATUS → `review`. Dispatch in parallel, each with the gate output (reviewers do not run builds):
   - `code-reviewer` in mode 3 (finished ticket), always;
   - `ui-verifier` when the plan has a visual checklist;
   - `security-reviewer` when the plan says `security-review: yes` **or** the gate printed any `SECURITY FLAG:` line;
   - `calc-auditor` when the plan's Reviewers needed says so.
   Any FAIL → STATUS → `in-progress`, all findings back to the builder in one message (step 6, `builder-senior`), then steps 7–8 again. After the 3rd failed round: STATUS → `blocked` with a one-line reason, add a question, leave the worktree in place, move on.
9. **Merge.** All PASS → in the main checkout: `git merge --squash t/<ID>` then `git commit -m "feat(<ID>): <title>"`; run `node scripts/gate.mjs . --phase <N>` on develop (phase tests plus the smoke set, Q-0006); `git worktree remove .claude/worktrees/<ID>`; `git branch -D t/<ID>`. STATUS → `done` with the short hash and the test count; in Notes record any deviation from the plan (from the builder's and code-reviewer's reports) and any `needs-josh-confirm` wording. Then `node vault/tools/next_ticket.mjs --check`.
   - EZD-000 only: also append `See @docs/architecture.md` to CLAUDE.md's Conventions section and copy `docs/architecture.md` to `vault/architecture.md` yourself (the builder cannot touch CLAUDE.md or vault/).
   - Spikes EZD-027 to EZD-031: the builder reports the result; you write `vault/spikes/<ID>.md` from `vault/spikes/TEMPLATE.md` with its `Verdict:` line.
10. **Handoff and push.** Update `vault/handoff/CURRENT.md`, commit `vault/`, then `git push origin develop`. Push after every ticket: CI doesn't run on pushes and hosting skips `develop` (Vercel Ignored Build Step), and the push protects the work.

Stop when the loop ends. Report done, blocked (with reasons) and remaining. Next command: `/phase-gate $ARGUMENTS` if nothing is left but blocked tickets Josh must unblock.
