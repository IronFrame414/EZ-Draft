---
name: build-phase
description: Stage 3 for one phase - build every ready ticket through tests, build, gate, review and merge to develop. Usage /build-phase <phase number>.
---

Run Stage 3 of `vault/PROCESS.md` for phase $ARGUMENTS. You are the orchestrator. To run unattended, Josh starts it with a goal (see SETUP.md step 8) rather than this command, and the goal tells you to follow this skill.

Loop until no ticket in the phase is `ready` with all dependencies `done`:

1. Make sure the main checkout is on `develop` and clean (`git status`; `git switch develop` if needed). Run `node vault/tools/next_ticket.mjs --ready`; its first line is the ticket. Exit 2 means nothing is ready (stop the loop); exit 4 means the architecture checkpoint is not met (stop and report).
2. `git worktree add .claude/worktrees/<ID> -b t/<ID> develop`. STATUS → `in-progress`.
3. Dispatch `test-author` with the ticket ID, the plan path and the absolute worktree path. On harness tickets (EZD-006, EZD-008, EZD-016, EZD-019, EZD-021) the test-author also builds the harness itself (test configs, `test-utils/`, `test-harness/`, fixtures, stubs).
4. Dispatch `builder` with the same. If the builder reports a question: add it to QUESTIONS.md, run it up the chain (Stage 2 rules); if it needs Josh, mark the ticket `blocked`, note it in STATUS and move to the next ticket.
5. Run `node scripts/gate.mjs .claude/worktrees/<ID>` yourself, once. Red → back to the builder with the output.
6. STATUS → `review`. Dispatch `code-reviewer`, plus `calc-auditor` / `ui-verifier` / `security-reviewer` as the plan's "Reviewers needed" says. Give every reviewer the gate output; reviewers do not run builds. Run the reviewers in parallel.
7. Any FAIL → send all findings to the builder in one message, then repeat 5–6. After the 3rd failed review loop: STATUS → `blocked` with a one-line reason, add a question, leave the worktree in place, move on.
8. All PASS → in the main checkout: `git merge --squash t/<ID>` then `git commit -m "feat(<ID>): <title>"`; run `node scripts/gate.mjs . --phase <N>` on develop (phase tests plus the smoke set, Q-0006); do not push yet (pushes are batched, see step 10); `git worktree remove .claude/worktrees/<ID>`; `git branch -D t/<ID>`. STATUS → `done` with the short hash and the test count, then `node vault/tools/next_ticket.mjs --check`. For EZD-000 only: also append `See @docs/architecture.md` to CLAUDE.md's Conventions section and copy `docs/architecture.md` to `vault/architecture.md` yourself (the builder cannot touch CLAUDE.md or vault/). For spikes EZD-027 to EZD-031: the builder reports the result; you write `vault/spikes/<ID>.md` from `vault/spikes/TEMPLATE.md` with its `Verdict:` line.
9. After each ticket, update `vault/handoff/CURRENT.md` and commit `vault/`.
10. Push `develop` once, when the loop stops (`git push origin develop`). Never push after each ticket: every push can start a Vercel preview build, and usage limits apply. If the session must stop early, push once before stopping.

Stop when the loop ends. Report done, blocked (with reasons) and remaining. Next command: `/phase-gate $ARGUMENTS` if nothing is left but blocked tickets Josh must unblock.
