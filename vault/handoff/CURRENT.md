# Handoff · 2026-10-19 11:00 · plan EZD-000b

- Phase and stage: see vault/PROGRESS.md
- Why the session ended: unit complete (launcher-run agent unit)
- Completed this session: Planned EZD-000b: status questions, complexity medium.
- In progress: none
- Blocked: none new
- Questions for Josh: see vault/questions/QUESTIONS.md
- Decisions made: none
- Next unit: plan EZD-000b (launcher restarted 2026-10-19)
- **Done 2026-10-19 (bypass session, fix mode, PROCESS.md rule 19; Josh confirms or reverts):**
  - Q-0128 (a): `.claude/hooks/guard-paths.mjs` builder grant for worktrees `EZD-000[b-i]` (.claude/, CLAUDE.md, scripts/ except gate.mjs, vault/tools/, vault/research/, vault/cost/usage*.json; tests, vault/PROCESS.md, vault/spec/ denied). Tests: `scripts/hooks/guard-paths.test.mjs`. Remove the exception when EZD-000i merges.
  - Q-0126 (c) and Q-0127 (a): PROCESS-EZDRAFT.md section 5 pilot line and section 8 budget line applied.
  - Q-0129 built: `--next-unit` returns `questions <phase>` before any build when the phase has an open row or a planned/questions ticket with no escalated question; launcher turns plan QPs into open Q-IDs and sends one ntfy per new escalation; questions skill runs unattended without waiting; loop guard via `vault/handoff/.questions-last-run.json`; PROCESS.md section 7 line. Tests: `scripts/ledger/questions-flow.test.mjs`.
  - EZD-000b split (EZD-000b..EZD-000i) committed with the above.
