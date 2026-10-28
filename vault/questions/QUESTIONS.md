# Questions ledger: open and escalated

Three files, one ledger (Josh 2026-10-28): `QUESTIONS.md` holds open and escalated questions (new questions are added there); `QUESTIONS-answered.md` holds answered questions the build still needs; `QUESTIONS-archive.md` holds answered questions it no longer needs (every ticket named is done and no unfinished plan or phase file cites them). Rows move only whole and unchanged, by `node vault/tools/next_ticket.mjs --sort-questions` (rule in that file). Look a Q-ID up in all three files.

Chain of command: asking agent → orchestrator → specialist (calc-auditor / security-reviewer / code-reviewer) → Josh. No citation, no answer. Business and product decisions always go to Josh. Full rules: `vault/PROCESS.md`, Stage 2.

Statuses: `open`, `answered-agent`, `escalated` (waiting on Josh), `answered-josh`, `confirmed-josh` (an agent answer Josh confirmed). Agent answers not yet confirmed when Stage 3 starts stand as written.
IDs never change or get reused. Josh's answers are also appended to the decisions file for the spec area (`vault/spec/decisions/<area>.md`; index in `vault/spec/decisions/INDEX.md`). Until Oct 18, 2026 they went to `vault/spec/decisions.md`, now split into that folder.

| ID | Phase / ticket | Asked by | Question | Status | Answered by | Answer | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q-0414 | 2 / EZD-108, 110, 117b, 118 | orchestrator (spec-check 2 round 3, phase-auditor, 2026-10-28) | Agent-decidable round 3 gaps (run 3 gaps 1 to 4). | answered-agent | orchestrator | Q-0400 supersedes AC-EZD-113-6 ("Only users with the Company switch see or change customers") for the New project wizard: listing and adding customers there is open to Create projects; the EZD-118 plan widens GET and POST of app/src/app/api/settings/customers/route.ts for that path and amends EZD-113's 403 test; AC-EZD-113-6 (EZD-113, done) is left as written and still holds for Settings. AC-EZD-108-8 adds the password-set email (Q-0096 P5). AC-EZD-117b-5 adds the offline state from S01 States (Offline banner, AC-EZD-015a-4; New project disabled; precedent AC-EZD-112-9); cached projects come with EZD-134. AC-EZD-110-5 drops the "unless turned off" clause, which EZD-140 tests (AC-EZD-140-2). | vault/questions/phase-02-spec-gaps-for-josh.md |
