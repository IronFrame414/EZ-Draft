# Phase 1 · for Josh (questions unit, 2026-10-29, fourteenth run)

Four decisions wait on you: Q-0427, Q-0428, Q-0429 and Q-0431. Q-0430 was answered by the security-reviewer (section 2); it needs one new ticket row that only you can add.

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

**Q-0429 · EZD-172 (blocked).** The last parallel-lanes check (A1) passed on lane 2 and lane 0, but lane 1 failed on EZD-181 T3 only, the known flake (fix is EZD-251, which waits for EZD-172: a cycle). Evidence: vault/handoff/EZD-172-a1-evidence.txt.
Options:
1. (Recommended) Merge EZD-172 now on its plan's own text that A1 can fail on T3 until EZD-251 lands; EZD-251 then runs its own check. Reason: breaks the cycle; the failure is outside EZD-172's code. Cost: EZD-172 merges without one fully green A1.
2. Move EZD-251 ahead of EZD-172. Cost: its check needs EZD-172 merged, so it cannot finish first.
3. Run A1 again hoping T3 passes. Cost: a rerun until green, which rule 16 forbids.
Also found: EZD-173's test K7 takes its expected Q-IDs from QUESTIONS.md rows only, but the numbering uses all three files, so it fails when QUESTIONS.md has no open rows. It needs its own fix ticket (rule 17); the ledger tools cannot add one, so please add a row (see the end of this section).

**Q-0431 · EZD-265 (questions).** The ticket text says a stuck repair unit "still stops the launcher". Since EZD-250 a failed repair never stops it: it notifies "repair failed … The launcher keeps waiting and re-checks", and the same wait is never repaired twice.
Options:
1. (Recommended) Keep EZD-250's behavior; EZD-265 only tests that a repair is never set aside. Reason: you approved the wait in EZD-250 and the ticket then changes nothing there. The AC wording changes to drop "repair". Cost: none.
2. A repair unit that ends without progress stops the launcher. Cost: reverses EZD-250 and its test S6; a stuck repair halts all other work.

**Rows only you can add (ledger tools cannot):**
- New phase 1 fix ticket from Q-0430: the gate fails a ticket diff that changes a file the builder's write rules deny and no grant lists (closes shell writes, `cp`, `>`, `sed -i`, for every tool and link). Touches scripts/gate.mjs and likely a grant patch from you.
- New fix ticket: EZD-173 K7 expected Q-IDs must use all three question files.

## 2. Agent answers to confirm

Not yet confirmed (confirm or override): **Q-0430 (EZD-260): (b), a separate fix ticket for shell writes, not a KNOWN-LIMITS entry; source: security-reviewer, CLAUDE.md rules 17, 18, KNOWN-LIMITS.md:19, Q-0421**; Q-0415 (EZD-246), Q-0416 (EZD-257), Q-0417 (EZD-250), Q-0419 (EZD-199). Older ones: earlier runs of this file (git log).

## 3. Proposed wording

None new this run (EZD-260, 261, 262 are ready; none has new wording).

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
- L-034 (EZD-246, EZD-254): a plan's test table gives the exact test count and titles, a fixture's returned shape is listed in full, and exact-text blocks end with "nothing else". **Ratify**: reviewers found added work beyond the plan twice.
