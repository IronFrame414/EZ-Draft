# Handoff · 2026-10-20 · build EZD-007a

- Phase and stage: phase 0, Stage 3 (builds); see vault/PROGRESS.md
- Why the session ended: unit complete (and vault/handoff/STOP, Josh 2026-10-20: stop after EZD-007a for optimize-usage chunks C1, C2)
- Completed this session: EZD-007a done, 805167a (account gate hook, unconfirmed-password guard, invite_is_valid, local Auth config, bilingual sign-in email template, docs and runbook "Sign-in (EZD-007)"). Gate on develop phase 0 + @smoke PASS: 292 node:test, 179 app Vitest, 1 geometry.
- Process: test review PASS first round; one structural repair (T28 (h) jsonb binding, 323961c) confirmed; builder round 1; code-reviewer and security-reviewer PASS. Models all Fable 5.1 (high).
- In progress: none (worktree and branch removed)
- Blocked: none new
- Questions for Josh: none new. needs-josh-confirm: Spanish email subject and template text (Q-0030 (a)); runbook step 3 dashboard field names. New row in vault/tickets/needs-from-josh.md: cloud Sign-in setup, step 5 (Before User Created hook) before any real data.
- Decisions made: none; lesson L-016 (planner, candidate): plans revoke from public explicitly on every new function.
- Notes for the next builds: (1) EZD-007d: sign-in route must give one uniform response for allowed and refused emails (security condition); T26 part d must prove a code sign-in works for a user whose encrypted_password the guard set to null. (2) docs/architecture.md Row-level security "default privileges grant execute to nobody" is inaccurate for schema private (no pg_default_acl row); fix at the next touch; EZD-006 audit checks anon-callable functions only. (3) Minor: comment line 5 of supabase/migrations/20261020101101_create_unconfirmed_password_guard.sql is wrong (stack stores a bcrypt hash, not null); a released migration must not be edited after the first release tag, so fix only before then or leave. (4) Admin createUser bypasses the hook (builder-observed, in docs).
- Next unit: none: vault/handoff/STOP exists

## Fix mode, 2026-10-20 (Usage and Planning session)
- LAUNCHER_FIX.md open for optimize plan C1 and C2; launcher held by vault/handoff/STOP until both merge.
- C1 merged: 8aad025 (Q-0171). C2 (vault/tools/usage-by-agent.mjs) in progress in its own session.
