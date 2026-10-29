# Phase 1 · for Josh (questions unit, 2026-10-29, fifteenth run)

One decision waits on you: Q-0431. Q-0427, Q-0428 and Q-0429 are answered (decisions files). EZD-266 is now ready. Q-0432 was answered by the orchestrator (section 2).

## 1. Decisions needed

**Q-0431 · EZD-265 (questions).** The ticket text says a stuck repair unit "still stops the launcher". Since EZD-250 a failed repair never stops it: it notifies "repair failed … The launcher keeps waiting and re-checks", and the same wait is never repaired twice.
Options:
1. (Recommended) Keep EZD-250's behavior; EZD-265 only tests that a repair is never set aside. Reason: you approved the wait in EZD-250 and the ticket then changes nothing there. The AC wording changes to drop "repair". Cost: none.
2. A repair unit that ends without progress stops the launcher. Cost: reverses EZD-250 and its test S6; a stuck repair halts all other work.

**Row only you can add (ledger tools cannot):**
- New phase 1 fix ticket from Q-0430: the gate fails a ticket diff that changes a file the builder's write rules deny and no grant lists (closes shell writes, `cp`, `>`, `sed -i`, for every tool and link). Touches scripts/gate.mjs and likely a grant patch from you.

## 2. Agent answers to confirm

Not yet confirmed (confirm or override):
- **Q-0432 (EZD-175): (a)** print min(3, 4 - W - P) summary lines after a red merge, so the "5 lines or fewer" header of scripts/unit-steps.mjs:4 stays. Source: scripts/unit-steps.mjs:4; CLAUDE.md rules 3, 16.
- **Q-0430 (EZD-260): (b)**, a separate fix ticket for shell writes, not a KNOWN-LIMITS entry. Source: security-reviewer, CLAUDE.md rules 17, 18, KNOWN-LIMITS.md:19, Q-0421.
- Q-0415 (EZD-246), Q-0416 (EZD-257), Q-0417 (EZD-250), Q-0419 (EZD-199). Older ones: earlier runs of this file (git log).

## 3. Proposed wording

EZD-265 (plan section 6, W1 to W6, launcher notifications and status notes; not yet approved):
- W1 STATUS note: `<date>: tabled by the launcher (<build|plan> unit ended twice without progress, most likely waiting on Josh; see the launcher log). Worktree kept; back to ready when Josh answers.`
- W2 notification, set aside: `<T> tabled (blocked) after two <build|plan> units without progress; the launcher goes on with the next unit. See the launcher log.`
- W3 notification, stop: `unit <next> ended twice without progress; launcher stopped. See the launcher log.`
- W4 unchanged: `unit <next> failed twice (<outcome>); launcher stopped.`
- W5, W6 table refusals: see vault/plans/EZD-265.md section 6.
EZD-266: none.

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
