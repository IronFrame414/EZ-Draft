# Questions ledger: open and escalated

Three files, one ledger (Josh 2026-10-28): `QUESTIONS.md` holds open and escalated questions (new questions are added there); `QUESTIONS-answered.md` holds answered questions the build still needs; `QUESTIONS-archive.md` holds answered questions it no longer needs (every ticket named is done and no unfinished plan or phase file cites them). Rows move only whole and unchanged, by `node vault/tools/next_ticket.mjs --sort-questions` (rule in that file). Look a Q-ID up in all three files.

Chain of command: asking agent → orchestrator → specialist (calc-auditor / security-reviewer / code-reviewer) → Josh. No citation, no answer. Business and product decisions always go to Josh. Full rules: `vault/PROCESS.md`, Stage 2.

Statuses: `open`, `answered-agent`, `escalated` (waiting on Josh), `answered-josh`, `confirmed-josh` (an agent answer Josh confirmed). Agent answers not yet confirmed when Stage 3 starts stand as written.
IDs never change or get reused. Josh's answers are also appended to the decisions file for the spec area (`vault/spec/decisions/<area>.md`; index in `vault/spec/decisions/INDEX.md`). Until Oct 18, 2026 they went to `vault/spec/decisions.md`, now split into that folder.

| ID | Phase / ticket | Asked by | Question | Status | Answered by | Answer | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q-0387 | 1 / EZD-253 (plan QP-1) | planner (2026-10-28) | EZD-253 needs EZD-250 merged (its `planPaths`, its `nextUnit` lines and its grant hold) but the row lists only EZD-244; options: (a) add EZD-250 to EZD-253's `depends_on` in `tickets.json` and the phase row (recommended), (b) leave it and rely on EZD-250's lower number and priority. | open |  |  |  |
| Q-0388 | 1 / EZD-253 (plan QP-2) | planner (2026-10-28) | with one unit at a time, the row does not say whether a signed-off next phase's plan, plan-review and questions units run before the current phase's remaining builds or alternate with them; options: (a) all planning-stage units of any signed-off phase first, as within a phase today (Q-0129; recommended, tests U5-U6 use it), (b) alternate one planning unit and one build unit, (c) plan the next phase only when nothing of the current phase is ready to build. | open |  |  |  |
