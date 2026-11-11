# Phase 4 release checklist (session 17, 2026-11-11, Josh: "make all corrections at the same time so it will pass with the next attempt")

gate-phase 4 stays on `.git/set-aside.json` until every line below is checked. Then remove it, and the launcher runs the gate.

## Why it was stuck (each cause, its fix, its state)
1. **Fix mode was open.** The gate-phase quick check refuses while `vault/handoff/LAUNCHER_FIX.md` exists, and it was open overnight for the planning-method tickets. Fix: closed in 9de24c0a, develop recorded. EZD-385 is parked: its tests are committed in its worktree (a3539049), and fix mode reopens for it after phase 4. **Done.**
2. **The phase gate read the wrong build gate.** `phase-04.md` is spec phase 4 (cabinets), but ledger phase 4 is "Plan canvas and first walls". The 11-10 gate attempt flagged the mismatch and held. Fix: `phase-04.md` now starts with a pointer to Slice 4's Josh test script in PHASES.md (9de24c0a). **Done.**
3. **Open phase 4 fix tickets.** The gate will not open the PR while one is open.
   - EZD-380 (W1 ECONNRESET under load) has its fix and passed every proof gate (14 of 14 green). It never reached 10 counting gates, because no other lane was busy when its gates ended.
   - EZD-372 (pan long-task flake, tooling track) has its fix built and reviewed (PASS 2026-11-11).
   - Fix: both prove at once, EZD-380 on lane 2 and EZD-372 on lane 3, so each is the other's load, with LANES.json build_lanes 1 while they run. Record: test-results/d380b/runs.txt and test-results/d372b/runs.txt. The script starts once EZD-235's build is done, and it resets build_lanes to 2 at the end.
   - Then: EZD-380 code-reviewer (running), then merge both with `node scripts/unit-steps.mjs merge` (start right after an overwatch commit), DONE lines and record-develop.
   - **In progress.**
4. **A defect nobody filed.** pan.test P2 on iPad counted 6 where 8 were expected, under load (seen in EZD-372's series). It can turn the full gate red at random. Fix: filed as EZD-388 (phase 4, 3f581dca). The launcher plans and builds it under the new method; phase 4 comes first. **In progress.**
5. **Develop's CI is red** on EZD-208b B5 and B9 (a React commit counted under CI load). The phase PR needs the CI `gate` check green. Fix: EZD-381 (phase 5, ready), the same fix pattern that cleared EZD-207b B2 on CI (EZD-379). The launcher builds it on lane 1 after EZD-224b and EZD-388. Its proof gates count while the two series run. **Waiting for a build lane.**
6. **Two no-progress strikes on gate-phase 4 itself** (11-10 19:25, both "changed nothing" because of causes 1 to 3). Not a three-strike hold; set-aside only.

## Release steps, in order
- [ ] EZD-380 and EZD-372 merged (cause 3).
- [ ] EZD-388 done (cause 4).
- [ ] EZD-381 done, and the next develop CI run is green: `gh run list --branch develop --workflow CI --limit 1` (cause 5).
- [ ] Rehearsal: a full gate on a develop worktree on a free lane (`EZD_LANE=3 node scripts/gate.mjs <develop worktree> --full`) is green. The phase gate must not run a fourth time on a known red.
- [ ] Quick checks pass: a vault-copy `next_ticket.mjs --check`; record-develop clean; no LAUNCHER_FIX.md; every phase 4 product ticket done or blocked; no `vault/handoff/assessments/gate-phase-4.md` with open causes.
- [ ] Remove `gate-phase 4` from `.git/set-aside.json`.
- Expect a large phase PR. The diff from origin/main to develop now also carries phases 5, 6 and 7 work merged early (for example the EZD-224 storage policies), so the security review and phase audit are big. That is by design (EZD-278).

## Update 18:40 UTC
- EZD-380: series c passed, 10 counting gates out of 13, every one green (test-results/d380c/runs.txt). The merge is in progress (fresh gate on lane 2, then unit-steps merge).
- EZD-388: done (merged 64734653).
- EZD-372: series c stopped at run 1. The pan test N5 ("throttle slows the page") failed, which is EZD-388's area, and this worktree did not have EZD-388 yet. The develop merge then clashed in scripts/perf (EZD-388 changed the same files). A builder (Opus high, Q-0310) is resolving the clash. Then the series runs again on lane 3.
- **New cause 7: the launcher can never build EZD-381.** Its plan's step 5 is an orchestrator step on the `.claude/worktrees/EZD-212a` path, which counts as a guarded path, so next_ticket.mjs holds the ticket for Josh. It is built interactively now: worktree .claude/worktrees/EZD-381, test-author steps 1 to 3, then the test review, D-Runs (10 consecutive gates where B9 runs; no load needed), merge, and step 5 (resume EZD-212a).
- LANES.json build_lanes is 1 while interactive gates use lanes 2 and 3. Set it back to 2 when they are done.
- EZD-224b (phase 6) is blocked on a merge clash with EZD-235's controller changes. That is not a phase 4 blocker; it is resolved after phase 4.
