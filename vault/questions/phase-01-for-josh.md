# Phase 1 · for Josh (questions unit, 2026-10-29, thirteenth run)

Two decisions wait on you: Q-0427 (EZD-248 cannot start until its branch is rebased) and Q-0428 (what closes EZD-259's loop). Q-0426 is answered (a, round 9) and left this file.

## 1. Decisions needed

**Q-0428 · EZD-259 (blocked).** The 5-gate loop that tests the scratch database passed its Docker tests 5 of 5 times, none skipped. Runs 2 and 4 still printed GATE FAIL, each on one other test only: EZD-181 T3, the known flake in EZD-251, which also failed in runs that did not overlap. The ticket text says "the scratch tests pass every run"; the plan also wrote "GATE PASS every run".
Options:
1. (Recommended) Close on the ticket text: EZD-259 closes on its own green gate with the loop logs as evidence, and the new EZD-251 evidence goes to that ticket. Reason: the scratch database is proven 5 of 5, and the other flake already has its fix ticket (rule 17). Cost: the loop proves the scratch database, not a fully green full gate; no re-run.
2. Keep "GATE PASS every run": EZD-259 waits for EZD-251 (behind EZD-172), then the loop runs again. Cost: blocked for an unknown time, about 35 more minutes of gates, a rebase.
3. As 2, but EZD-251 moves ahead of EZD-172 now, since it failed in runs that did not overlap. Cost: a change to EZD-251's row and dependency; its plan rests on the overlap premise.

**Q-0427 · EZD-248 (blocked).** EZD-248's branch no longer merges into develop: develop gained EZD-173/245/246 changes in two skills, `scripts/run.mjs`, `vault/tools/next_ticket.mjs` and two question files. The builder cannot edit skills, vault/ or scripts, so the rebase is a hand-merge, not part of the 7-finding round.
Options:
1. (Recommended) The orchestrator does the rebase in fix mode (or gives you a patch to apply), then the 7-finding round runs on the rebased branch. Question-file conflicts take develop's version and the 4 repaired rows are re-checked with `next_ticket --check`. Cost: one extra unit before the round.
2. You resolve the conflicts yourself. Cost: your time; the same round follows.
Any new same-class bypass edge found in the round goes to EZD-263, not a fifth round.

## 2. Agent answers to confirm

Not yet confirmed (confirm or override): Q-0415 (EZD-246), Q-0416 (EZD-257), Q-0417 (EZD-250), Q-0419 (EZD-199). Older ones: earlier runs of this file (git log).

## 3. Proposed wording

None new this run.

## 4. Rule candidates

All still `candidate` (unattended run; none decided). Recommendation, one line each:
- L-022 (EZD-166, builder): catch only the errors the plan names, add no fallback the plan does not list. **Ratify**: a catch-all hides real faults.
- L-023 (EZD-190): a plan adding a `private` function lists its `PRIVATE_EXECUTE` entry and tests it only as a role that has execute. **Ratify**.
- L-024 (EZD-190): catalog tests check a minimum list, never `toEqual` on a dated snapshot. **Ratify**: three migrations already broke one.
- L-025 (EZD-244): a backfill covers the open tickets at build time, derived by a command. **Ratify**.
- L-026 (EZD-244): grep the tests for hash or line-count pins on any file the plan edits. **Ratify**.
- L-027 (EZD-244): when removing a pattern, grep every skill and process file for it. **Ratify**.
- L-028 (EZD-246, EZD-240): exact-text and "after each step" plan rows become their own numbered checks. **Ratify**.
- L-029 (EZD-248): a guard plan names the threat class, the fail-closed rule, the shells in scope and whether it is the real control. **Ratify**: the ticket blocked on this.
- L-030 (EZD-248, EZD-251): comments or rule text about code behavior cite the file, line and branch. **Ratify**.
- L-031 (EZD-257): a distinct-hash fixture test names what makes each fixture's commits unique. **Ratify**.
- L-032 (EZD-250): verify commands run on the pinned Node; test folders given as quoted globs. **Ratify**.
- L-033 (EZD-173): a plan changing a shared test helper names the stale options, callers and comments, and says later develop files get the same repair. **Ratify**.
