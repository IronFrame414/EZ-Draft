# Questions ledger: open and escalated

Three files, one ledger (Josh 2026-10-28): `QUESTIONS.md` holds open and escalated questions (new questions are added there); `QUESTIONS-answered.md` holds answered questions the build still needs; `QUESTIONS-archive.md` holds answered questions it no longer needs (every ticket named is done and no unfinished plan or phase file cites them). Rows move only whole and unchanged, by `node vault/tools/next_ticket.mjs --sort-questions` (rule in that file). Look a Q-ID up in all three files.

Chain of command: asking agent → orchestrator → specialist (calc-auditor / security-reviewer / code-reviewer) → Josh. No citation, no answer. Business and product decisions always go to Josh. Full rules: `vault/PROCESS.md`, Stage 2.

Statuses: `open`, `answered-agent`, `escalated` (waiting on Josh), `answered-josh`, `confirmed-josh` (an agent answer Josh confirmed). Agent answers not yet confirmed when Stage 3 starts stand as written.
IDs never change or get reused. Josh's answers are also appended to the decisions file for the spec area (`vault/spec/decisions/<area>.md`; index in `vault/spec/decisions/INDEX.md`). Until Oct 18, 2026 they went to `vault/spec/decisions.md`, now split into that folder.

| ID | Phase / ticket | Asked by | Question | Status | Answered by | Answer | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q-0443 | 1 / EZD-267 | orchestrator (2026-10-30) | EZD-267 gate is red only on EZD-254 T2 (scripts/ledger/phase-gate.test.mjs), which also fails on develop: EZD-253 is done and depends on EZD-254, so the copy's --check refuses when T2 reopens EZD-254. Every phase-1 build gate will hit it until fixed. Fix (test-author, commit 9e81edb1 on t/EZD-267): in the copy only, drop the reopened ticket from depends_on of done tickets; no expected value changes, all 3 tests pass. code-reviewer rules it is an input change, not a structural repair, and outside EZD-267's plan (rule 4). Options: (a) add a fix ticket for T2 (test-author + mode-2 review), merge it first, then resume EZD-267 (drop 9e81edb1); (b) allow 9e81edb1 inside EZD-267 as an accepted deviation (recommended: smallest, restores the test's intent, closes the class by deriving dependents from the copy). Also note the one-line PROCESS.md rule: merge gates run before the row is set done, which is how EZD-253 slipped through. | escalated |  |  |  |
