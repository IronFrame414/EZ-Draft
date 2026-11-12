# Session 15 orchestrator state (2026-11-10, about 00:00 UTC 11-11)

Done:
- EZD-365 beca1e89, EZD-369 20acdd99 merged; fix mode closed a8bf92fb; audit session 16 finished (vault/research/audit-2026-11/REPORT.md, PLANNING-REDESIGN.md).
- Josh answers recorded: Q-0692 (show a message when plan text fails), Q-0693 (yes to audit Part 3 items 2-6 and account switching; "implement that plan").
- Phase 4 fix tickets filed: EZD-373 (plan text on CI; building), 374 (CI perf), 375 (angled wall 1/2"), 376 (user message, Q-0692), 379 (207b B2 hover under load), 380 (money-pages W1 ECONNRESET under load).
- EZD-372 blocked: waits on 374, 379, 380, then D-Runs again (pan rows passed 11/11 under load).
- EZD-377 (limit loop) merged 06d354ff, recorded, pushed. Launcher restarts when EZD-373's build ends.
- Fix mode OPEN again: vault/handoff/LAUNCHER_FIX.md (EZD-377, EZD-378).

Done since:
- EZD-378 (account switching) merged 512b6574, recorded, pushed. Off until scripts/launcher-accounts.json exists (D-Off).
- EZD-379 and EZD-380 filed (load defects from EZD-372's D-Runs); EZD-373 merged 7f51349b by the launcher.

Waiting on Josh:
- One-time sign-in in ~/.claude-acct-1 and ~/.claude-acct-2 (plan EZD-378 section 9). Then the orchestrator runs the live hook check (plan section 9), commits scripts/launcher-accounts.json (D-File text), records develop and pushes; the launcher reads the file on its next restart (it needs a restart: the file is .json, not in codeFingerprint).

Next after EZD-378 (audit Part 3 order): stop the line (overwatch reads develop CI), full gate after every 2nd merge, honest repairs and hand-off, then the planning method (template, plan_lint, connections check, planner maxTurns 40 to 100), pilot on phase 6.

Gotchas:
- Never run_in_terminal (Josh does not want approval prompts); gates as detached nohup with a background until-loop.
- A watch loop using pgrep -f with a pattern matches the loop's own shell; wait on a pid.
- Two phase 1 gates on different lanes collide on the scratch database ezdraft-migcheck.
- Lane 0 has no docker relay socket for the gate user; use lanes 1-3.
- Stray untracked plans in vault/plans break ledger-copy tests (overwatch step B).
- gate-phase 4 stays on .git/set-aside.json until EZD-372 to 376, 379 and 380 are done.
