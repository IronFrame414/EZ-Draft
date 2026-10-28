# Questions ledger: open and escalated

Three files, one ledger (Josh 2026-10-28): `QUESTIONS.md` holds open and escalated questions (new questions are added there); `QUESTIONS-answered.md` holds answered questions the build still needs; `QUESTIONS-archive.md` holds answered questions it no longer needs (every ticket named is done and no unfinished plan or phase file cites them). Rows move only whole and unchanged, by `node vault/tools/next_ticket.mjs --sort-questions` (rule in that file). Look a Q-ID up in all three files.

Chain of command: asking agent → orchestrator → specialist (calc-auditor / security-reviewer / code-reviewer) → Josh. No citation, no answer. Business and product decisions always go to Josh. Full rules: `vault/PROCESS.md`, Stage 2.

Statuses: `open`, `answered-agent`, `escalated` (waiting on Josh), `answered-josh`, `confirmed-josh` (an agent answer Josh confirmed). Agent answers not yet confirmed when Stage 3 starts stand as written.
IDs never change or get reused. Josh's answers are also appended to the decisions file for the spec area (`vault/spec/decisions/<area>.md`; index in `vault/spec/decisions/INDEX.md`). Until Oct 18, 2026 they went to `vault/spec/decisions.md`, now split into that folder.

| ID | Phase / ticket | Asked by | Question | Status | Answered by | Answer | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q-0089 | later phase / storage limits (owner ticket to be named) | Josh (with Q-0074, Q-0075) | Each company gets a storage limit, and users are regularly prompted to delete older data. What is the limit, what happens when a company reaches it, and how often are users prompted? | escalated | | | Tabled by Josh (2026-10-19), not answered: research first (storage cost per GB at the providers, average storage used per project) before the limit, the at-limit behaviour and the prompt frequency are set. |
| Q-0237 | 53 / EZD-1711 | orchestrator (Q-0236, 2026-10-20) | Charging other companies for EZ Draft: which payment provider (for example Stripe), which plans and prices, and is there a free trial? Needed before phase 53 is planned, not before. | escalated |  |  | Q-0236 |
| Q-0370 | 1 / EZD-243 follow-on | planner (re-plan, 2026-10-28) | After Q-0365 (a), more lines of the docs still contradict Q-0264: runbook Vercel step 3 ("No Supabase values yet"), Supabase step 10 ("Production = prod project"), the architecture `dev` row ("phase field checks use it until launch") and possibly the `Until launch` bullet. Options: (a) a new phase 1 fix ticket for them (recommended, rule 17, keeps EZD-243 as planned); (b) widen EZD-243 again. | escalated | | | vault/plans/EZD-243.md report 2026-10-28 |
