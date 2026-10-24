# Handoff · 2026-10-24 · build EZD-042

- Phase and stage: see vault/PROGRESS.md
- Why the session ended: unit complete
- Completed this session: EZD-042 done (4d7ff54). dump.mjs and push.mjs pass the production password through PGPASSWORD; inherited PG* names are dropped; no password in any supabase argument. T8 proves the real CLI on the local stack. Gate green, 1137 tests. Code-reviewer and security-reviewer PASS.
- In progress: none
- Blocked: EZD-003 (Josh: Before-launch checklist and first release)
- Questions for Josh: none new. Q-0089 and Q-0237 stay escalated.
- Decisions made: none
- Deviations: none.
- Open (minor): .github/workflows/supabase-dev.yml:41 still passes the dev database URL in --db-url (made-up data, Q-0110; no ticket yet). The migration push reading PGPASSWORD is not proven against the real CLI (agents may not run it); the release fails closed at the dry run if it does not.
- Next unit: see next_ticket.mjs --next-unit
