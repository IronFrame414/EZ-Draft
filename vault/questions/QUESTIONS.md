# Questions ledger: open and escalated

Three files, one ledger (Josh 2026-10-28): `QUESTIONS.md` holds open and escalated questions (new questions are added there); `QUESTIONS-answered.md` holds answered questions the build still needs; `QUESTIONS-archive.md` holds answered questions it no longer needs (every ticket named is done and no unfinished plan or phase file cites them). Rows move only whole and unchanged, by `node vault/tools/next_ticket.mjs --sort-questions` (rule in that file). Look a Q-ID up in all three files.

Chain of command: asking agent → orchestrator → specialist (calc-auditor / security-reviewer / code-reviewer) → Josh. No citation, no answer. Business and product decisions always go to Josh. Full rules: `vault/PROCESS.md`, Stage 2.

Statuses: `open`, `answered-agent`, `escalated` (waiting on Josh), `answered-josh`, `confirmed-josh` (an agent answer Josh confirmed). Agent answers not yet confirmed when Stage 3 starts stand as written.
IDs never change or get reused. Josh's answers are also appended to the decisions file for the spec area (`vault/spec/decisions/<area>.md`; index in `vault/spec/decisions/INDEX.md`). Until Oct 18, 2026 they went to `vault/spec/decisions.md`, now split into that folder.

| ID | Phase / ticket | Asked by | Question | Status | Answered by | Answer | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q-0373 | 1 / EZD-247 (plan QP-1) | planner (2026-10-28) | Three more lines are stale against what Vercel holds, though they break neither Done-when sentence: runbook `## Supabase cloud projects (EZD-004)` step 7 ("go into Vercel in EZD-023b's setup", while the dev values went into Production by hand on 2026-10-24, Q-0264), the architecture `### Environment variables` paragraph "Which project's values go where … Entering values in Vercel is EZD-023b's (Q-0106)" (silent on Production running on the dev project until launch), and the architecture `### Hosting` sentence "Previews use the dev database once EZD-023b enters its values." (entered 2026-10-21; pinned word for word by `hosting.test.mjs` EZD-149 T2); options: (a) widen EZD-247 to fix them too (same two files, one more test, and EZD-149's `ARCH_BULLET` constant updated; re-plan of sections 1, 3, 4 and 6), recommended under rule 17; (b) a new phase 1 fix ticket for them; (c) leave them as they are. | escalated |  |  |  |
