---
name: questions
description: Unit `questions <N>` - Stage 2 for one phase: run every open question through the chain of command, write the file for Josh (decisions, agent answers to confirm, proposed wording), record his answers, set tickets ready. Usage /questions <phase number>.
---

Run Stage 2 of `vault/PROCESS.md` (section 7) for phase $ARGUMENTS. You are the orchestrator. No app code, no tests.

1. Collect every `open` row in `vault/questions/QUESTIONS.md` for this phase, and every QP-n still in the phase's plans (give those Q-IDs first: next free number, `open`, asked by planner, ticket ID; replace the QP number in the plan).
2. For each, climb the chain until someone answers **with a citation** (spec section, decision ID, Q-ID or file path):
   - Level 2 (you): from other plans, the phase context, a dependency. Cite the file.
   - Level 3: NEC / FBC / calculation questions → `calc-auditor`; permissions, roles, money visibility, data access → `security-reviewer`; technical conventions and architecture → `code-reviewer`. One dispatch per specialist with all of its questions (dispatch template in `.claude/skills/build-ticket/dispatch.md`). Accept only answers with a citation.
   - Business or product decisions (scope, what a screen shows, workflow, cost, money) skip straight to Josh. User-visible wording is not a question: it goes in section 3 of the file.
   Record answers as `answered-agent` with the source. Everything else becomes `escalated`.
3. Write `vault/questions/phase-NN-for-josh.md` (two-digit phase; overwrite if it exists, keeping answered items out) with three sections:
   1. **Decisions needed** - each escalated question: ID, ticket, two sentences of context, the options, your recommended answer first with the reason.
   2. **Agent answers to confirm** - every `answered-agent` row for the phase not yet `confirmed-josh`: ID, ticket, answer, source, "confirm or override".
   3. **Proposed wording** - every plan's Proposed wording, grouped by ticket, one list.
4. If Josh is at the computer, ask him the same content in chat as plain-text numbered lists, recommendation first, and take his answers by number (PROCESS.md section 1; never multiple-choice prompts). Unattended: stop after step 3; the launcher notifies him. Record each answer: `answered-josh` in QUESTIONS.md and a row in the decisions file for the spec area (`vault/spec/decisions/<area>.md`, Q-ID, date, answer); overrides of agent answers the same way; confirmed agent answers → `confirmed-josh`. Approved or edited wording → the decisions file for the area as `Wording (EZD-xxx): <text>` and the plan's Proposed wording updated to match.
5. Dispatch `planner` for any plan an answer changes. Then set to `ready` every ticket in the phase that is `planned` or `questions` and has no unanswered question; tickets still waiting stay `questions`.
6. `node vault/tools/next_ticket.mjs --check`; handoff (`vault/handoff/TEMPLATE.md`); commit `vault/` (`docs(vault): questions phase $ARGUMENTS`); end the session. Report: answered by agents, escalated to Josh, tickets ready.
