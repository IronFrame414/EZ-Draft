# Questions ledger: open and escalated

Three files, one ledger (Josh 2026-10-28): `QUESTIONS.md` holds open and escalated questions (new questions are added there); `QUESTIONS-answered.md` holds answered questions the build still needs; `QUESTIONS-archive.md` holds answered questions it no longer needs (every ticket named is done and no unfinished plan or phase file cites them). Rows move only whole and unchanged, by `node vault/tools/next_ticket.mjs --sort-questions` (rule in that file). Look a Q-ID up in all three files.

Chain of command: asking agent → orchestrator → specialist (calc-auditor / security-reviewer / code-reviewer) → Josh. No citation, no answer. Business and product decisions always go to Josh. Full rules: `vault/PROCESS.md`, Stage 2.

Statuses: `open`, `answered-agent`, `escalated` (waiting on Josh), `answered-josh`, `confirmed-josh` (an agent answer Josh confirmed). Agent answers not yet confirmed when Stage 3 starts stand as written.
IDs never change or get reused. Josh's answers are also appended to the decisions file for the spec area (`vault/spec/decisions/<area>.md`; index in `vault/spec/decisions/INDEX.md`). Until Oct 18, 2026 they went to `vault/spec/decisions.md`, now split into that folder.

| ID | Phase / ticket | Asked by | Question | Status | Answered by | Answer | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q-0426 | 1 / EZD-172 | orchestrator (2026-10-29) | EZD-172 passed gate, A1, code-reviewer and security-reviewer in round 8, but its merge ran RED on develop: (1) L20 fails because scripts/process/ledger-lock.test.mjs (EZD-173, merged to develop after the plan) spawns gate.mjs without EZD_LANE/SUPABASE_WORKDIR scrubbing; (2) EZD-173 K7 in the same file fails (expected Set{'Q--Infinity'}, actual Q-0426/Q-0427), cause not yet established, may be unrelated to EZD-172. Plan says round 8 is the last. Options: (a) one more round inside scope: test-author adds the env scrub to ledger-lock.test.mjs (test file of EZD-173), K7 investigated first as its own fix ticket if unrelated; (b) merge L20 as a separate fix ticket by loosening nothing: new fix ticket for ledger-lock.test.mjs, EZD-172 waits for it. Recommend (a). | open |  |  |  |
