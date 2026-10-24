# Handoff · 2026-10-19 · build EZD-000i

- Phase and stage: Phase 0, Stage 3 (build); EZD-000, EZD-000b to EZD-000i done
- Why the session ended: unit complete
- Completed this session: EZD-000i done, 883a54f (125 repo tests). New scripts/oauth-usage.mjs is the readMeters fallback: when usage.json is over 20 minutes old it asks Claude's usage endpoint at most every 15 minutes, waits max(Retry-After,120)+30 s after a 429, stops an hour and notifies on 401/403, never writes the token; run.mjs passes it to the per-pass readMeters only; guard-bash K1-K3 and five settings.json deny entries block shell commands that would print the token; .gitignore oauth-poll.json.
- Step 1: plan re-validated after EZD-000h deviations; QP-1 → Q-0137 answered-agent (a) (a dry run polls like a real pass).
- Models: test-author Sonnet 5.5 medium; builder Sonnet 5.5 medium (1 round); code-reviewer Opus 5.5 high (mode 2 PASS, mode 3 PASS, same agent); security-reviewer Opus 5.5 high PASS. Gate PASS on worktree and on develop phase 0 (125/125).
- Live probe (builder report): HTTP 200 via Keychain `Claude Code-credentials`; real fields use `utilization`, not `used_percentage`, so readings still fall back to the dollar proxy (safe, per Q-0134 (a)).
- Deviations: step 11 `test -f` skipped (my dispatch was stricter than the plan; lesson L-005); run.mjs uses await import.
- In progress: none
- Blocked: none
- Questions for Josh: Q-0138 (new, escalated: follow-up ticket to read `utilization`); Q-0136 still to confirm; Q-0137 to confirm. needs-josh-confirm wording: the two guard-bash deny reasons (plan s6).
- Proposals for Josh (orchestrator may not edit .claude/ or tests): remove the pa3Grant exception in .claude/hooks/guard-paths.mjs and its three Q-0128 tests in scripts/hooks/guard-paths.test.mjs (Q-0128 (a), now due); add the token rules to PROCESS.md s14; add the real usage-endpoint reading to PILOT.md once Q-0138 is settled. Security minors (accident guard, Q-0135): K1 splits inside quotes; K3 `test -f` match swallows space-free chains; probe prints nested key names.
- Note: guard-bash now denies any Bash command naming the sign-in file, commit messages included.
- Decisions made: Q-0137 answered-agent. Lesson added: L-005 (orchestrator, candidate).
- Next unit: build EZD-001
