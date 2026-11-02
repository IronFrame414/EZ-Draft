# Stage 2 log (overnight, unattended)

Started 2026-11-01. Plan: ~/Projects/ezdraft-audit/REMEDIATION-PLAN.md Stage 2, with AUDIT-ADDENDUM.md sections 5, 8, 9 and 10. Fix mode: vault/handoff/LAUNCHER_FIX.md. Josh's standing approvals (chat, 2026-11-01): fix mode for Stage 2; one commit per item on develop after a green gate, then push; deletions the plan lists, tagged first; CLAUDE.md and PROCESS.md edited as D3 and D9 say; three guard-bash exceptions (starting `claude` for the sandbox spike, `node scripts/run.mjs --dry-run`, `rm -rf` on the listed cleanup folders) until item 2.8; a stuck item (guard or classifier refusal, a question for Josh, or two failed attempts) is skipped with its reason and the next independent item starts; vault/handoff/STOP stays; one session per group, never two at once.

Each session appends: item, commit hash or SKIPPED with the reason, and anything Josh must confirm.

## Order

| Session | Items |
| --- | --- |
| 1 | H7 (this session) |
| 2 | guard-bash exceptions; Group A: 2.1 to 2.5 (2.4 as changed by AUDIT-ADDENDUM section 8: one build at a time until H1 and EZD-172 are done; keep EZD-172 and EZD-174) |
| 3 | Group B: 2.6 to 2.9 (sandbox) |
| 4 | Group C part 1: 2.10, 2.11 (records database, import round trip) |
| 5 | Group C part 2: 2.12 to 2.14 (launcher as the only writer, readers, git-ignore) |
| 6 | Group C part 3: 2.15 to 2.18 (removals, ticket closures, PROCESS.md, session cost logging) |
| 7 | Group D: 2.19 (unit and db test projects); Group E: 2.20 to 2.23, plus L9, L8, L10 (AUDIT-ADDENDUM section 5) |

Not overnight (need Josh): 2.24 (his own folder), removing STOP, EZD-172 and EZD-174 builds (they run through the launcher), the phase 1 gate and punch list.

## Entries

- H7: done, b07dee8f (gate PASS on the Mac run CI-style; GitHub CI run 41376564624 on fix/h7-ci PASS; develop push started run 41378084333). Josh to confirm: nothing (approved and applied by him).
- Note: this session could not start the planned fresh sessions (the app allows a start only on a turn Josh typed), so Stage 2 continues in this one session.
- Guard-bash exceptions: done, a78c5b41. Also closes a gap: an env-prefixed `claude` (e.g. `FOO=1 claude`) was not denied before. Josh to confirm: the three settings.json deny entries moved to the hook.
- 2.1 non-goals: done, 191e40a9 (0 of 568 ticket titles match a remaining non-goal; positive control found the billing, IFC and AR tickets). The product overview's scope table is already overridden by the Q-0220 row in decisions/02-product-overview.md, so no new decision row.
- 2.2 duplicate sentence: done, b60437ae (count 1).
- 2.3 rules 17 and 18, debt list, plan caps, freeze: done, ff63dbaa and c103fb74. New file `vault/debt.md` (L11, L12 as D-001, D-002). Josh to confirm: the rule 17 and 18 wording in CLAUDE.md.
- 2.4 one launcher at a time: done, d4be9db6 (`<log_dir>/launcher.lock`; the launcher already ran one unit at a time, but nothing stopped a second launcher beside the service). EZD-172 and EZD-174 stay open.
- 2.5 lesson: done, 7259c07f (L-041, marked ratified on Josh's acceptance of the audit recommendations).
- Gate for all of the above: PASS on 11b8337c, pushed. One earlier gate run on the guard change alone failed only in the backup restore drills (EZD-025, EZD-1704); they passed alone (4 of 4) and in the next full gate. That is the open defect EZD-259 (scratch database start under a full gate), a flaky test, not accepted: it stays a ticket at the front of the queue after resume.
- 2.6 sandbox spike: done with a caveat, see `vault/spikes/sandbox/NOTES.md`. All write and secret probes were refused for a process started inside a worktree, but the sandbox covers shell commands only, a unit is one process started in the project folder, and the gate needs the Docker socket (a hole).
- 2.7, 2.8, 2.9: SKIPPED, needs Josh. The spike changed what D4 (a) can deliver; the choice is the question at the end of NOTES.md. 2.8 as written would remove the only containment for Read, Edit and Write, and EZD-279, 280, 282 stay open until the answer.
