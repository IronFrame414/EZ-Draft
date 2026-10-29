# Handoff · 2026-10-29 · build EZD-251 (blocked, built and reviewed, not merged)

- EZD-251: tests (2512a95e) and a comment fix (ed255e59) are on t/EZD-251. Gate PASS twice. code-reviewer round 2 PASS, security-reviewer PASS. M1, M2, R1, R2 done (R1/R2 by test-author, M1/M2 by builder).
- Why not merged: plan s9 says the ticket cannot be done until L1 runs (10 runs of two lane gates started together). That needs EZD-172 merged. EZD-172 is blocked (needs Josh: apply vault/handoff/EZD-172-gate-r8.patch in .claude/worktrees/EZD-172, commit, resume at step 7).
- Ledger repair: EZD-251 now depends on EZD-181, EZD-172 (phase-01.md, tickets.json, STATUS). `--check` LEDGER OK. STATUS = blocked.
- Resume after EZD-172 merges: `unit-steps.mjs worktree EZD-251` (RESUME skips tests and build); orchestrator runs L1 from plan s4 (second worktree .claude/worktrees/EZD-251-b); builder's final-report Cause line (C1, C2, C3) is in the builder report: "Cause: C1 (password-sign-in T18 wrote error_alert without the lock), C2 (T2 unstubbed fetch before its report reached the store), C3 (T3 polled a fixed 5000 ms window)"; then merge.
- Finding recorded: r1 code-reviewer docs (false comment), fixed in ed255e59.
- Models: test-author, builder Haiku 5.5 high (--dispatch; plan suggested Sonnet); code-reviewer Opus 5.5 medium, security-reviewer Opus 5.5 high (--dispatch). Security reviewer run because the gate flagged 2 test paths (plan said no).
- Side effect to know: test-author's `pnpm db:up` printed "Reset local database" on the shared local stack.
- Deviations: builder did M2 at the route.ts call site (not route-failure.ts); M2 also fails T1/T2 on a shared assertion. Orchestrator set STATUS by hand (no unit-steps command for review).
- Needs Josh: EZD-172 patch (above); Q-0421 (EZD-248), Q-0420, Q-0419/EZD-199 still open.

Next unit (node vault/tools/next_ticket.mjs --next-unit): build EZD-257
