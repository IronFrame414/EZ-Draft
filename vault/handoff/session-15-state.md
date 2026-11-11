# Session 15 orchestrator state (2026-11-10, about 00:00 UTC 11-11)

Done:
- EZD-365 beca1e89, EZD-369 20acdd99 merged; fix mode closed a8bf92fb; audit session 16 finished (vault/research/audit-2026-11/REPORT.md, PLANNING-REDESIGN.md).
- Josh answers recorded: Q-0692 (show a message when plan text fails), Q-0693 (yes to audit Part 3 items 2-6 and account switching; "implement that plan").
- Phase 4 fix tickets filed: EZD-373 (plan text on CI; building), 374 (CI perf), 375 (angled wall 1/2"), 376 (user message, Q-0692), 379 (207b B2 hover under load), 380 (money-pages W1 ECONNRESET under load).
- EZD-372 blocked: waits on 374, 379, 380, then D-Runs again (pan rows passed 11/11 under load).
- EZD-377 (limit loop) merged 06d354ff, recorded, pushed. Launcher restarts when EZD-373's build ends.
- Fix mode OPEN again: vault/handoff/LAUNCHER_FIX.md (EZD-377, EZD-378).

In progress:
- EZD-378 (account switching): plan on develop f2f6dbd6; worktree .claude/worktrees/EZD-378 (t/EZD-378); tests 58331c6c, test review PASS (note: readAccountState treats any read error, EISDIR included, as empty). Next: the orchestrator builds the non-test files in fix mode (the builder role is blocked by guard-paths), then the regression run, gate (detached nohup, free lane 1-3), code and security reviews, merge.
- EZD-378 merge rule: merge the code with scripts/launcher-accounts.json absent, so units keep running as today; add the accounts file only after Josh signs in once in each folder (plan section 9). Then the live check: guard hooks load under an account folder.

Next after EZD-378 (audit Part 3 order): stop the line (overwatch reads develop CI), full gate after every 2nd merge, honest repairs and hand-off, then the planning method (template, plan_lint, connections check, planner maxTurns 40 to 100), pilot on phase 6.

Gotchas:
- Never run_in_terminal (Josh does not want approval prompts); gates as detached nohup with a background until-loop.
- A watch loop using pgrep -f with a pattern matches the loop's own shell; wait on a pid.
- Two phase 1 gates on different lanes collide on the scratch database ezdraft-migcheck.
- Lane 0 has no docker relay socket for the gate user; use lanes 1-3.
- Stray untracked plans in vault/plans break ledger-copy tests (overwatch step B).
- gate-phase 4 stays on .git/set-aside.json until EZD-372 to 376, 379 and 380 are done.
