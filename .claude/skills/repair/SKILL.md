---
name: repair
description: Unit repair <check|waiting|ci> - the launcher's repair of a ledger failure, an agent-fixable wait or a failed phase PR CI gate (EZD-250).
---

Repair what holds the launcher, trigger $ARGUMENTS (`check`: the ledger check fails; `waiting`: a wait an agent can fix; `ci`: the phase PR's CI `gate` check failed). Only the launcher (`scripts/run.mjs`, vault/PROCESS.md section 10) starts this unit. You are the orchestrator. No app code, no tests.

1. Read `vault/handoff/REPAIR.md` (trigger, fingerprint, the launcher's reason, the ledger check output). Run `node vault/tools/next_ticket.mjs --check`. Read the `vault/tickets/STATUS.md` notes of the tickets the reason names.
2. Fix only `vault/` ledger files: STATUS rows and notes, question rows, research report fields, `vault/tickets/tickets.json`, phase file rows. Set a `blocked` ticket to `ready` or `in-progress` only when its note's cause is shown fixed on develop, and cite the commit in the note.
3. Never touch: spec section files, answers to questions, `scripts/`, `.claude/`, `vault/tools/`, `vault/handoff/LAUNCHER_FIX.md`, budget or hold files; never build or merge. A fix that needs one of them goes to `vault/handoff/repair-<UTC stamp>.patch` and is Josh's.
4. Josh's, never yours: account settings; product, scope, wording and money decisions; guard grants.
5. Dispatch no agent.
6. End with `node vault/tools/next_ticket.mjs --check` passing and the handoff (`vault/handoff/TEMPLATE.md`). Line 1 of your report is exactly one of `REPAIRED: <what changed>`, `JOSH: <what Josh must do, with the file>` or `FAILED: <why>`.
7. Kind `ci`: the run id is the `/actions/runs/<id>/` part of the link in the reason. Read `gh run view <id> --log-failed`. Never re-run the job (vault/PROCESS.md rules 16 and 20: a flaky test is fixed, not re-run).
   - A failure our code, tests or configuration causes: write one fix ticket by following `.claude/skills/gate-phase/SKILL.md` step 5: number per `vault/PROCESS-EZDRAFT.md` line 36, title `Fix: <failing step>: <first error>`, phase file row, `tickets.json`, ACs via `vault/tools/gen_acs.mjs`, STATUS.md `todo`, one commit. Report `REPAIRED: fix ticket <T> for <failing step>`.
   - A failure only GitHub or another third party can fix (runner outage, Actions quota, repository settings): report `JOSH: <what>, with the run link`.
