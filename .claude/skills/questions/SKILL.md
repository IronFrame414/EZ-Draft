---
name: questions
description: Stage 2 for one phase - run every open question through the chain of command, then batch the rest for Josh. Usage /questions <phase number>.
disable-model-invocation: true
---

Run Stage 2 of `vault/PROCESS.md` for phase $ARGUMENTS. You are the orchestrator.

1. Collect every `open` row in `vault/questions/QUESTIONS.md` for this phase.
2. For each, climb the chain until someone answers **with a citation**:
   - Level 2 (you): answer from other tickets' plans, phase context, dependencies. Cite the file.
   - Level 3: route NEC / FBC / calculation questions to `calc-auditor`; permissions, roles, money visibility, data access to `security-reviewer`; technical conventions and architecture to `code-reviewer`. Accept only answers with a citation.
   - Business or product decisions (scope, pricing, what a screen shows, user-facing wording, cost) skip straight to Josh.
   Record answers as `answered-agent` with the source. Everything else becomes `escalated`.
3. Write `vault/questions/phase-$ARGUMENTS-for-josh.md` (two-digit phase): for each escalated question - ID, ticket, the context in two sentences, the options, your recommended answer first with the reason. After them, a short table of the agent-answered questions so Josh can override any.
4. If Josh is present, ask the escalated questions with AskUserQuestion (up to 4 per call, recommended option first and labeled "(Recommended)"). Record each answer as `answered-josh` in QUESTIONS.md and append it to `vault/spec/decisions.md` under the heading `**Build answers (Josh)**` as `- Q-nnnn (EZD-xxx): <answer> (Josh, <date>)`. Apply any overrides Josh gives on agent answers the same way.
5. Update the affected plans (dispatch `planner` for a revised plan where an answer changes it). Then set to `ready` every ticket in the phase that is `planned` or `questions` and has no unanswered question. Tickets still waiting on an answer stay `questions`.
6. Write the handoff, commit `vault/` on `develop`: `docs(vault): questions phase $ARGUMENTS`.
7. Report: answered by agents, answered by Josh, still waiting. If none are waiting, next command: `/build-phase $ARGUMENTS`.
