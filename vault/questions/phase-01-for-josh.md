# Phase 1 · for Josh (questions unit, 2026-10-29, eleventh run)

One decision waits on you: Q-0426 (EZD-172 cannot merge). Nothing else is new.

## 1. Decisions needed

**Q-0426 · EZD-172 (blocked).** EZD-172 passed its gate, the lane check, the code review and the security review in round 8, but its merge ran red on develop and was undone (develop is clean). Two causes: (1) `scripts/process/ledger-lock.test.mjs`, a test file from the finished ticket EZD-173, starts the gate without clearing the lane settings, so the new lane check (L20) fails; (2) a second test in the same file, EZD-173 K7, fails (it expected the question number `Q--Infinity` and got Q-0426 and Q-0427), cause not found yet and maybe unrelated to EZD-172. You set round 8 as the last round for EZD-172, so more work on it is your call.
Options:
1. (Recommended) Separate fix ticket for `ledger-lock.test.mjs` (scrub of the lane settings; K7 investigated first inside it and split off if its cause is elsewhere). EZD-172 keeps its closed rounds, waits for the fix ticket to merge, then resumes its merge. Reason: the file belongs to the finished EZD-173, and your round limit stays true. Cost: one more ticket and a short wait before EZD-172 lands.
2. One more round on EZD-172: the test-author adds the scrub to `ledger-lock.test.mjs`, K7 checked first. Faster, but breaks the "round 8 is the last" rule and edits another ticket's test under this ticket.
Either way the K7 failure is fixed, not parked (CLAUDE.md rule 17).

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
