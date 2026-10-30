# Questions ledger: open and escalated

Three files, one ledger (Josh 2026-10-28): `QUESTIONS.md` holds open and escalated questions (new questions are added there); `QUESTIONS-answered.md` holds answered questions the build still needs; `QUESTIONS-archive.md` holds answered questions it no longer needs (every ticket named is done and no unfinished plan or phase file cites them). Rows move only whole and unchanged, by `node vault/tools/next_ticket.mjs --sort-questions` (rule in that file). Look a Q-ID up in all three files.

Chain of command: asking agent → orchestrator → specialist (calc-auditor / security-reviewer / code-reviewer) → Josh. No citation, no answer. Business and product decisions always go to Josh. Full rules: `vault/PROCESS.md`, Stage 2.

Statuses: `open`, `answered-agent`, `escalated` (waiting on Josh), `answered-josh`, `confirmed-josh` (an agent answer Josh confirmed). Agent answers not yet confirmed when Stage 3 starts stand as written.
IDs never change or get reused. Josh's answers are also appended to the decisions file for the spec area (`vault/spec/decisions/<area>.md`; index in `vault/spec/decisions/INDEX.md`). Until Oct 18, 2026 they went to `vault/spec/decisions.md`, now split into that folder.

| ID | Phase / ticket | Asked by | Question | Status | Answered by | Answer | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q-0458 | 1 / EZD-277 (plan QP-1) | planner (2026-10-30) | `.claude/hooks/guard-bash.mjs` matches the Claude sign-in file with a case-sensitive pattern (`/\.credentials\.json\|\.claude\/\.cred/`), so `cat ~/.claude/.Credentials.json` passes it on this disk (found while planning; rule 17); options: (a) add the `i` flag in this ticket with one more test (recommended, rule 18), (b) a separate fix ticket. | open |  |  |  |
| Q-0459 | 1 / EZD-277 (plan QP-2) | planner (2026-10-30) | the `Read(...)` deny rules in `.claude/settings.json` (`.env` files, `scripts/launcher.config.json`, `~/.claude/.credentials.json`) are matched by Claude Code itself, and whether it ignores letter case is unverified (not tested here, because a test would read a secret file; rule 8); options: (a) a retriever-web check of Claude Code's matching, then a fix ticket or a question to Josh if it is case-sensitive, (b) a backstop in `guard-reads.mjs` that denies a Read of those paths by `pathKey`, as a new fix ticket, (c) accept and record it in KNOWN-LIMITS. | open |  |  |  |
