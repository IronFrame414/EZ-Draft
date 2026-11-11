# Session 17 orchestrator state (2026-11-11, about 09:00 UTC)

Brief: vault/handoff/session-17-brief.md. Josh's list for the morning: vault/handoff/for-josh-2026-11-11.md. Pilot numbers: vault/research/audit-2026-11/PILOT-BASELINE.md.

## Done tonight
- Session 18 (phase prep) finished. Josh signed off phases 7, 8 and 9 in its chat (SIGNOFF rows 3c3a37d9). Phase 10 is ready for his sign-off. Seven design questions are waiting for him.
- Merged in fix mode, and develop recorded after each:
  - EZD-382 (template v2, plan_lint v2, planner 100 turns, plan-checker on Opus high), 06b5044f.
  - EZD-387 (phase-rank fixture drift that turned every gate red), dec49cf4.
  - EZD-386 (look-ahead to every signed-off phase), 635317d8.
  - EZD-383 (contract check, connections check, the shared-list register vault/shared-lists.json, and the ledger refusing ready on a failing v2 plan), 34026da0.
- Splits applied. The parent ID keeps part a:
  - EZD-224 + EZD-224b (dcc76ffe).
  - EZD-235 + EZD-235b (dcc76ffe).
  - EZD-384 + EZD-384b (c0cfd07d).
- EZD-123's row gains the deletion of a removed version's thumbnail object (0a107ef3).
- Questions answered-agent:
  - Q-0716: accept the questions reruns until EZD-384b.
  - Q-0736: EZD-224b encode timeout 10,000 ms.

## In flight
- Phase 6 re-plan under the new method. Tickets stay `blocked` until review-plans 6:
  - EZD-135: v2 plan, plan-checker r1 13 and r2 9 gaps, all fixed; security PASS. Q-0665 (design) is escalated to Josh.
  - EZD-224 (part a): v2 plan, plan-checker r1 12 and r2 8 gaps, fixed; security FAIL then fixed. The re-check passed, plus the tenancy.test.ts:199 repair.
  - EZD-235 (part a): v2 plan, plan-checker r1 7 and r2 4 gaps, fixed. No database, so no security read.
  - EZD-224b: v2 plan written (untracked, open-ticket plan), plan-checker r1 running.
  - EZD-235b: v2 plan written (untracked), plan-checker r1 7 gaps fixed, r2 running.
  - EZD-214, 216, 218, 237 and 6001 wait for their dependencies, then the code-bound step (EZD-384b). Their notes say so.
- Next for phase 6, once 224b and 235b pass:
  1. Set EZD-135, 224, 235, 224b and 235b to `planned` (node scripts/ledger.mjs status <T> status=planned complexity=<c>).
  2. Remove "plan EZD-224b" and "plan EZD-235b" from .git/set-aside.json.
  3. Let the launcher run review-plans 6, then questions 6. The ledger refuses ready on any v2 plan that fails the checks.
  4. Commit the part b plans by path, or let questions 6 carry them.
- EZD-384 (part a, P1): v2 plan committed 93255600; plan-checker running. Then test-author, orchestrator build, gate on lane 2 (merge loop right after an overwatch commit), code-reviewer, merge, record-develop. Then EZD-384b (plan, then build), then EZD-385.
- EZD-380: three strikes held it (scheduling only). The orchestrator runs its D-Runs on lane 1: background loop, record test-results/d380/runs.txt, 10 counting gates needed (2 counted by 08:50Z). Then code-reviewer, then unit-steps merge, then set EZD-372 ready for a fresh D-Runs series. After that the gate-phase 4 entry comes off .git/set-aside.json. The phase 4 PR also needs CI green on develop: CI is red on EZD-207b B2 (fixed by EZD-379, merged) and EZD-208b B5/B9 (EZD-381, planned, phase 5).
- The lane 3 load loop (test-results/d372/, worktree EZD-376) is still needed for EZD-380 and then EZD-372.

## Gotchas found tonight
- Interactive gates use lane 3 only: the launcher builds on database lanes 1 and 2, and a lane-1 gate lost its database to build EZD-104 at 08:38Z.
- An interactive merge races the half-hourly overwatch commit. Merge develop, sleep 2, gate, then merge at once in one background loop, started right after an overwatch commit.
- `node scripts/ledger.mjs architecture <T>` on a plan a planner is still writing leaves the ledger check red until the next record. Record only finished plans. The launcher applies records only between its units (40 s to several minutes).
- A fork cannot write in fix mode (guard-paths, by design). The orchestrator builds fix-mode files itself.
- The overwatch missed a strike hold (tooling note). Check node -e strikeHolds() yourself.
- v2 plans run past the agent turn limits: planner 100, plan-checker 60, security-reviewer 30. Resume them with a short finishing brief.
- Write and Bash heredocs of code are blocked outside vault/. Build JSON with jq --arg, and edit with the Edit tool.

## Update about 10:10 UTC
- EZD-384 (P1 brief and size) merged bdd94b3a and develop recorded. EZD-384b's v2 plan is written (untracked) and its planner is re-validating it against develop; then the plan-checker, the build, and EZD-385.
- Phase 6: questions 6 set EZD-224, 224b, 235 and 235b ready, and EZD-135 is planned (Q-0665). review-plans 6 never ran because the phase is already building (EZD-219 done) and an old review file existed. The old review is archived (1324239a), and the code-reviewer is running review-plans 6 by hand. build EZD-224 had already started (09:14Z) and is left to finish. Builds of EZD-135, 224b, 235 and 235b are on .git/set-aside.json until the review passes. Take them off after a PASS, or after its findings are fixed.
- EZD-380: lane 3 series, 2 counting gates so far (run 2 counted; runs 1 and 3 did not). It runs only when a launcher gate is live on lane 1 or 2 (background loop; record test-results/d380/runs.txt).
