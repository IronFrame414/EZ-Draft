---
name: plan-phase
description: Stage 1 for one phase - plan every ticket and log questions. Usage /plan-phase <phase number>.
disable-model-invocation: true
---

Run Stage 1 of `vault/PROCESS.md` for phase $ARGUMENTS. You are the orchestrator.

1. Read `vault/PROCESS.md`, `vault/handoff/CURRENT.md`, and `vault/tickets/phases/phase-$ARGUMENTS.md` (pad to two digits). Run `node vault/tools/next_ticket.mjs --check` and `node vault/tools/next_ticket.mjs`. Confirm every earlier phase's tickets are `done` or `blocked`; if not, stop and say which. For phase 2 or later, stop if the tool reports the ARCHITECTURE CHECKPOINT (EZD-000 or a spike note missing).
2. For each ticket in the phase, in ticket order, whose STATUS is `todo`: dispatch the `planner` subagent with the ticket ID and phase. Up to 3 planners may run at once for tickets that do not depend on each other. After each returns: give each QP question the next free Q-ID (you are the only one who assigns IDs), add it to `vault/questions/QUESTIONS.md` as `open` (asked by planner, ticket ID), replace the QP number in the plan with the Q-ID, and set STATUS to `planned` (no open questions) or `questions`. If the planner proposes a split, apply it as `vault/PROCESS.md` describes (phase file, tickets.json, STATUS.md in one commit), then plan each part.
3. When all tickets have plans, dispatch `code-reviewer` once with all of the phase's plan paths for the cross-ticket plan review. Apply its findings: fix plans by re-dispatching the planner for that ticket, or add questions.
4. Run `node vault/tools/next_ticket.mjs --check` and fix any problem. Write `vault/handoff/CURRENT.md` (format `TEMPLATE.md`) and commit `vault/` on `develop`: `docs(vault): plan phase $ARGUMENTS`.
5. Report: tickets planned, tickets with questions, number of open questions. Next command: `/questions $ARGUMENTS`.

Write no app code and no tests in this stage.
