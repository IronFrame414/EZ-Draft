# EZ Draft build audit, November 2026

Session 16, 2026-11-10. This is a read-only audit of what has been built (phases 0 to 4) and how it was built. The detail is in the part files linked in each section; every number there has its source (a file, command or log line). The scripts and raw data are in `scripts/` and `data/`.

---

> **Update, 2026-11-10 (after Josh's reply).** Josh answered the decisions below: yes to the design question and to recommendations 2 to 6, the full check "2 at a time", and the second account to be switched automatically. He also asked for much more planning before each ticket is built. The answers and the design for each, the new planning method (five checked steps, and a template that covers what a ticket must do, what it connects to, its design and its database), and the order of work are in **[PLANNING-REDESIGN.md](PLANNING-REDESIGN.md)**. That file supersedes recommendations 3, 4 and 5 below where they differ.

## Summary for Josh (one page, plain words)

**What is solid**
- **The live site's code is exactly what was checked.** The code at ezdraft.ezcontractorbinder.com is the code the phase 3 checks passed, with no unchecked change since. The database under it is a different matter (risk 3) (A5).
- **The core protections hold up.** Each company sees only its own data, roles are enforced, money fields are hidden from people who may not see them, and AI keys are stored encrypted and never sent to the browser. The tests for these are real tests: they would fail if the protection broke (A1, A4).
- **The drawing math checks out**: room areas, gaps, absorbing a gap, typed lengths and angles all match the worked examples in the spec (A1, phase 4). One exception: on some angled walls the length shown can read 1/2" short. A wall typed as 12' 6 1/4" at 45° shows 12' 6", not 12' 6 1/2" (rounding error; to be fixed as a defect).
- **A lot got built:** 279 tickets merged in 23 days, 22 to 26 a day at the best stretch (B1). Most are the build machine itself: phase 0 is setup (79), and about 117 of phase 1's 128 are build machinery. Roughly 90 are product work you can see, fix tickets included (STATUS.md phase rows; A1).

**What is at risk**
1. **Phase 4 cannot be released yet, and the fix now being built will not change that.**
   - The automatic check that runs on GitHub after every change has been red for four days, since Nov 6 (A3).
   - On that machine the floor plan draws no text (room labels and numbers), and the same 9 screen tests failed in both runs checked. Two of them are the price-hiding checks, but they **could not finish** on that machine (they timed out after 5 minutes); **they did not show a price.** On your Mac the same code passes.
   - The release needs that check green. Nobody was watching it, and the current fix ticket (EZD-372) only steadies the Mac.
   - Until we know whether the missing text is a quirk of GitHub's machine or a real bug a customer could hit, phase 4 should not go out.
2. **New work quietly breaks finished work.** In four days, five later changes broke tests from earlier phases (A3). Each change only re-checks its own phase, so the breaks were found only when the whole set happened to run.
3. **The live site runs on the newest database layout, under last week's screens.** That was your choice (Q-0264), so the dev database could serve the live address until launch. It is fine with test data. But the live screens can stop working between releases, and no check covers that (A5).
4. **About a third of the time was lost.**
   - About 181 hours idle in 18 days, mostly from stops for repairs, waiting on answers, and waiting on releases.
   - About 33 more hours when the machine kept restarting the same two jobs after the weekly limit.
   - About 18% of the spend went to work that had to be repeated (B1, B6).
   - The limit loop can probably happen again (B2).
5. **The build machine may have a gap in its own safety walls.** One setting could let a test run as your user account instead of the walled-off one. This is not proven, and one quick test settles it (A4).

**The top three changes** (section C has the detail)
1. **Stop the line when the full check is red.** One check, run every 30 minutes, must be green before anything else merges. A red check gets one owner and stops new merges until it is fixed.
2. **Re-check everything before each merge, not just the ticket's own phase.** The full check took about 13 minutes on your Mac (11-10). It would have caught 4 of the 5 silent breaks the same day. The fifth (EZD-033) was a one-time timing failure.
3. **Plan more before building.** Check a ticket's size before writing its full plan, and check the plan against the real code before building. 47 plans were written and then split, and about a third of builds strayed from their plan (B3).

**Your decisions**
- **One design question:** when the floor plan cannot draw its text (an error the app now only notes in its log), should the screen show you a message?
- **Yes or no on build-machine changes.** The build machine is frozen, so each change needs your yes on its why and cost (rule 18).
  - **Rec 2, stop the line.** Why: GitHub's check was red 4 days with nobody watching. Cost: one ticket.
  - **Rec 3, full check before each merge.** Why: 5 silent breaks in 4 days. Cost: about 13 minutes more per merge, about 1 to 3 hours of machine time a day, no extra AI usage.
  - **Rec 4, end the weekly-limit loop.** Why: it wasted about 33 hours and can recur. Cost: one small ticket.
  - **Rec 5, plan checks.** Why: 47 plans were thrown away and split, and a third of builds strayed from their plan. Cost: about two tickets.
  - **Rec 6, honest repair reports and automatic hand-off.** Why: 8 failed repairs were recorded as fine, and stalls lasted 3 to 33 hours. Cost: one small ticket.
  - **Rec 8, the safety-wall test.** No yes needed: if the probe confirms the gap, the fix is allowed because secrets would be exposed.
- **Your money decision:** a second account or overflow capacity (numbers in B5).
- **Not yours to decide:** recs 1, 7 and 9 are app and ledger work, settled inside the build.

---

## Detail

### A. What has been built

| Part | Finding | File |
| --- | --- | --- |
| **A1, ticket by ticket** | **All recorded commits are on develop:** 274 of 274 done tickets. **Judgement pass:** sampled by risk, about 40 tickets deep-checked (P0 8, P1 product 7, P1 build system 8, P2-P3 about 8, P4 about 7); each slice names what it did not reach. Across slices: **4 defects** (all phase 4: the shown length on angled walls is 1/2" short in some cases (calc-auditor); and three about CI: the plan draws no text on CI; the pan-check counts depend on the machine; no ticket owns CI green), about 10 debt rows (out-of-date AC text for EZD-112, 117a and 118; weak tests for EZD-018 T5, EZD-102's per-file write-route check, EZD-113 T3; EZD-034's captcha hand check never recorded) and about 15 ledger notes (EZD-243's wrong commit; EZD-262 and 282 marked done but never built; EZD-365 and 369 merged but `blocked`; EZD-267, 250 and 277 ACs whose code was later removed). The fixes for EZD-323 T8 (EZD-370) and EZD-108 T18 (EZD-371) are real, not weakened tests. 23 blocked tickets, 14 of them with no owner or next step (4 waiting on a sandbox that is back, 7 dropped but left blocked, 3 waiting on a fix-mode session nobody scheduled). | A1-tickets.md, a1-mechanical.csv |
| **A2, spec coverage** | The coverage figure counts done tickets, not tested criteria (TRACE.md header), and every AC gets its ticket's whole test list. Uncovered: phase 0: 1, phase 1: 62 (22 blocked tickets; 306/364 once EZD-365 and 369 are recorded), phase 2: 2 (EZD-276), phase 4: 1 (EZD-372). 19 "covered" ACs belong to tickets no test names; 2 of those are real gaps (EZD-361 T1; EZD-282, which was never built). | A2-A6-coverage-debt.md |
| **A3, cross-phase regressions** | Develop's CI full suite was **last green 2026-11-06 18:27Z** and failed in every run since: 38 failures over 4 days. **5 cross-phase breaks:** EZD-014b (phase 0, red for about 2 days, no ticket), EZD-033 (phase 0, timing), EZD-299a T9 (phase 3, by EZD-294; expected value edited inside another ticket's commit), EZD-323 T8 and EZD-108 T18 (by EZD-5601). My own suite run was not started, because lanes 0 to 3 were in use (LANES.json, ps). CI is the full-suite source. | A3-regressions.md, data/ |
| **A4, security** | 4 findings: **high, unconfirmed**: `EZD_GATE_AS_SELF=1` turns off the gate-user switch and nothing strips it; **medium**: EZD-323 T8 matches only the text `createJobsDbClient`, so another secret-key client could slip past; 2 low (AI-key functions don't all check active membership; conflict rows need only View projects). AI keys, new definer functions and changed routes passed. | A4-A5-security-live.md |
| **A5, live site** | **Code matches** the phase 3 gate (only vault files differ since f6576236). **Database schema does not:** the live check reports 20261110130000, 13 develop migrations past main, because of Q-0264 (production uses `ezdraft-dev` until launch). Risk: the live phase 3 screens call functions that later tickets have replaced. | A4-A5-security-live.md |
| **A6, debt** | **11 overdue debt rows** (3 medium from phase 2, 8 low), 8 more due at the phase 4 gate, and 5 faults in debt.md itself (a duplicate ID, a duplicate finding, a stale Closed cell, 2 malformed rows). **The ui-verifier could not take screenshots 7 times**, filed as tooling notes, so visual checklists go unchecked and nothing blocks. 5 phase 0 follow-ups have no record anywhere. | A2-A6-coverage-debt.md |

### B. How it was built

| Part | Finding | File |
| --- | --- | --- |
| **B1, measured history** | 279 feat commits, 10-19 to 11-10. Units per merged ticket: median 2, p90 4. est_usd per merged ticket: median $7.81, p90 $25.09; $3,379 on merged tickets, $4,325 overall. Gate-phase runs: phase 0: 3, 1: 10, 2: 2, 3: 6, **4: 22** (the brief said 19; 18 of the 22 "changed nothing"). 70 repair runs, 8 failed by their own reports, and **all 70 recorded as ok**. Idle: 34 gaps of 30 minutes or more, **about 181 h**, plus **about 33 h of the empty-unit loop** (65,468 rows, 11-07 15:21Z to 11-09 09:49Z). | B1-B6-history-usage.md |
| **B2, failure classes** | 16 classes in a table: root cause, fix commit, and whether the fix closes the class. **Closed:** the 10-minute stop, false port holds, the attempt counter (EZD-369). **Partly closed:** leftover servers (own lane only), uncommitted files (full gate only, EZD-365). **Open:** the ledger queue deadlock, unrecorded develop, mutual-red merges, the pan perf check, the weekly-limit loop (probably reopened by EZD-369's exemption, see below), questions alternating between phases, split proposals, sandbox network, cross-phase regressions, **develop CI red and unwatched**, **plan text missing on CI**. | B2-B4-process.md |
| **B3, planning** | **105 of 313 built tickets (phases 0 to 5) deviated from their plan.** 47 split proposals came after a full plan had been written (about $3.81 median per plan unit, from the cost log). Re-validations: 96, mostly phases 0 and 1. Round 2+ reviews: 45, 28 of them in phase 1. | B2-B4-process.md |
| **B4, oversight** | Stalls before an interactive fix: merge guard 6 h, guarded paths about 12.4 h, port 3000 about 5 h, port 3210 about 3.3 h, the loop about 33 h. **The overwatch runbook has no step for 9 patterns**, including develop CI red, a fast error loop (it counts as "healthy"), two tickets red on each other's failure, failures seen only on CI, and repair reports with no verdict. | B2-B4-process.md |
| **B6, usage** | $4,325 est_usd. The week before the limit: $973.55. 350 tickets left: **$3,624 to $5,816**, or **3.7 to 6.0 weeks** of one account at that pace, if nothing else stops it. The meter has been unreadable since 11-09; the 11-10 log shows "Fable weekly window at 91421%", a broken reading. | B1-B6-history-usage.md |

**The weekly-limit loop is probably still open** (B2, orchestrator's reading of the code):
- `classifyLimit` (scripts/run.mjs:194-201, unchanged since 10-18) did not recognise the limit reply, so each unit ended `error:success` and restarted at once.
- EZD-369's `strikeExempt` (vault/tools/next_ticket.mjs:959-961) exempts any note that says "hit your weekly limit". If that was the reply's wording, three strikes will not stop a repeat either.
- One probe in fix mode settles it.

### B5. The four speed-ups session 13 proposed

| Proposal | Status / evidence | Expected effect | Cost |
| --- | --- | --- | --- |
| Gate tests only committed files (EZD-365) | **Merged** (beca1e89). | Removes the uncommitted-vault-file red **for the full gate**. That was about 8 to 11 hand fixes (session-13 brief item 3; OL). It does not cover ticket gates, or the ledger stop hook that fires on any untracked vault file (this audit hit it twice). | Done. Ticket gates would need the same change: about one low-complexity build-system ticket (median build $7.81). |
| More capacity (a second Max account, or API overflow) | Josh's money decision. | B6: 350 tickets need 3.7 to 6.0 account-weeks. Two accounts halve the calendar time **only if** the loop and the idle stops are fixed first. The 33 h loop and 181 h idle in 18 days are larger than the limit pauses. | A second subscription, or API cost at roughly the est_usd figures ($3.6k to $5.8k for the rest; est_usd is a stand-in for subscription use, so real API prices may differ, which is not measured here). |
| Check ticket size before writing the full plan | Not built. | 47 split proposals came after full plans (B3). At a median of $3.81 per plan unit that is about $180, plus the re-plans and questions loops that split proposals caused (B2 rows 10 and 11) and session 13's hours of splitting by hand. | A short sizing step in the plan unit, plus a launcher split path: one medium build-system ticket. |
| Run phase sign-offs several phases ahead in a side session | Not built. | Idle stretches waiting on open questions add up to 1,310 min in the top-15 list alone (415 + 370 + 330 + 195; B1.6), plus 445 min waiting on a patch from Josh. Sign-offs ahead remove most of the question waits. | Josh's time in batches instead of one by one. No build cost. |

### C. Recommendations

The order of work runs from cheapest and most blocking to most expensive. "Removes" names the failure classes in B2.

| # | Recommendation | Evidence | Removes | Cost (build time, tokens, Josh's time) |
| --- | --- | --- | --- | --- |
| 1 | **Find out why the plan draws no text on CI before more phase 4 work.** Read the CI browser console for `plan.glyph_atlas`, then decide: if it is the CI setup (fonts or canvas on the Ubuntu runner), fix CI; if it is a real app failure, fix the app and show the user a message. Re-scope EZD-372 so its done-when is a **green CI gate**, not 10 Mac gates, and allow it to change the machine-dependent counts (pan.test.mjs:100-111). | A1 phase 4 rows 1 to 3; A3 | plan text missing on CI; the pan check; the phase 4 PR block | 1 or 2 fix tickets, interactive or Opus. No Josh time except the design question in the summary. |
| 2 | **"Stop the line" on develop's CI.** Overwatch reads `gh run list --branch develop --workflow CI` every run. When the newest finished run is red: (a) file one defect ticket at the front of the queue with the failing test names; (b) let no product merge until it is green, though fix tickets still merge. Add the 9 missing runbook patterns (B4). | A3: 4 days red, 38 failures, nobody watching | develop CI red and unwatched; cross-phase regressions hiding behind a red test | One overwatch skill edit plus a launcher hold: one medium build-system ticket. Needs Josh's yes (build-system freeze, rule 18). Why: CI was red 4 days unseen. Cost: about 1 build ticket. |
| 3 | **The full gate before every merge** (every unit and browser test, not only the ticket's phase plus @smoke). Perf may stay phase-scoped while recommendation 1 fixes the machine-dependent pan counts. Unit-only is not enough: **EZD-108 T18 is a browser test** (app/e2e/my-profile.spec.ts:401), so unit-only would have missed it. Of the 5 breaks in A3, the full gate catches 4 (EZD-014b touch-css, EZD-299a T9, EZD-323 T8, EZD-108 T18) the same day. EZD-033 T13 failed once on timing and might not repeat. | A3: 5 cross-phase breaks in 4 days; the EZD-371 plan says its own gate "does not run T18" | cross-phase regressions | The local full gate took **13.3 min** (gate.log 19:11:50 to 19:25:09Z, 11-10). The scoped ticket gate's time was not measured here, so the extra cost is up to about 13 min per merge. At 14 merges a day (11-10), that is roughly 1 to 3 more hours of machine time a day across 2 build lanes. No extra AI usage: gates are scripts. |
| 4 | **Fix the weekly-limit loop for good.** Teach `classifyLimit` the real limit wording (take it from a recorded reply). Treat an empty unit (about $0, 1 turn) as a strike or a pause, never as a reason to restart at once. Add a fast-loop check: the same unit key more than 3 times in 10 minutes stops the launcher. | B1.5: 65,468 rows, about 33 h; B2: EZD-369 exempts the wording | weekly-limit loop; any future fast loop | One small build-system ticket. Needs Josh's yes: it already cost about 33 h. |
| 5 | **Plan before building: three checks.** (a) **Size check** before the full plan. (b) **Contract check against the code:** every file and function a plan names must exist, or be listed as new, checked by a script, not a reader. (c) **Dependency check:** a merged ticket's deviations go in a fixed field that its dependents' planners read automatically. Keep review-plans for the cross-plan check. | B3: 105 of 313 deviated; 47 splits after planning; 96 re-validations | split proposals planned twice; builder deviations; re-validation churn | A script and a template field: about 2 build-system tickets. It saves about 1 re-plan per split (median $3.81 each) and review rounds. |
| 6 | **Repairs must report honestly, and the hand-off rule must be clear.** Record the repair report's verdict (FAILED counts as a strike). Three strikes on any key, or any stall over 2 h, hands off to an interactive Opus session automatically, with a notice to Josh's phone. Every stall over 30 min gets an overseer-log line with its start and end time. | B4: 70 repairs all "ok", 8 really failed; stalls of 3 to 33 h | repairs that fail silently; long unseen stalls | Small. EZD-369 already has the strike file; this extends what counts. |
| 7 | **Clean the ledger.** Record EZD-365 and 369 as done. Mark EZD-262 and 282 as superseded, not done. Fix EZD-243's commit. Close or own the 14 ownerless blocked tickets. Fix the 5 faults in debt.md. Clear the 11 overdue debt rows, or move their deadlines with a reason. Turn the recurring "ui-verifier could not screenshot" note into an app-verification defect: visual checks are being skipped. | A1, A2, A6 | ledger drift; parked findings | About one orchestrator session. |
| 8 | **Close the gate-user hole if the probe confirms it.** Strip `EZD_GATE_AS_SELF` from the unit environment, or refuse it in guard-bash for builders. Make the EZD-323 T8 check search for the secret-key variable itself, not one function name. | A4 rows 1 and 2 | sandbox escape (if real); secret-key client drift | One probe, then one small ticket. Allowed under rule 18 (secrets exposed). |
| 9 | **Live database against the live code.** Until launch, either run main's e2e smoke tests against the dev database after each `supabase-dev.yml` push, or hold develop migrations that replace a function main still uses until the phase merge. | A5 | the live site breaking between releases | One small ticket; a scope decision for the orchestrator (Q-0264). |

**When a person or Opus must step in:**
- the same key gets 3 strikes, or a phase gate has run twice without passing;
- a stall lasts more than 2 hours;
- develop CI has been red for more than 2 hours;
- any security finding rated medium or higher;
- any fix that needs a guarded path.

Only design and screen questions go to Josh.

### C3. Before phase 6 goes back on the build list

1. The phase 4 gate passes **and the phase 4 PR's CI `gate` check is green** (recommendation 1). Phase 4 is merged to main.
2. Develop's CI is green, and the stop-the-line watch (recommendation 2) is running.
3. The weekly-limit loop fix (recommendation 4) is merged and proven by a replayed limit reply.
4. The gate-user probe (recommendation 8) has been run; if the hole is real, it is closed.
5. The ledger is clean (recommendation 7): no done ticket that was never built; EZD-365 and 369 recorded.
6. Phase 6's plans have had the size and contract checks from recommendation 5. Only the cheap script check is required for this; the full template change can wait.
7. Josh has answered the design question above, the one about the plan's missing-text message.

### Limits of this audit

- **The A1 judgement pass is a risk-chosen sample.** About 40 of 274 done tickets were deep-checked; every slice lists what it did not reach. The phase 1 build-system tickets EZD-142 to 200 were not reached at all.
- **I did not run the full suite myself**, to avoid clashing with the launcher's lanes. CI was the source.
- **Some counts come from agents that could not write files.** The orchestrator re-ran the starred numbers in B1 and the A5 checks. Other counts are the agents' grep and awk output, and each file says which.
- **Gate attempts per ticket cannot be measured.** Each ticket gate's log is deleted with its worktree.
- **The calc-auditor's full pass is in A1 (phase 4 section):** 11 rows checked, 10 PASS, 1 defect. The defect is the shown wall length on angled walls: length.ts:73 rounds a floating-point length that has no margin for error (AC-EZD-209-1, 09j row 12). 724 of 9,620 start/angle pairs were affected. The orchestrator re-ran the example. The fix goes into recommendation 1's batch of phase 4 defect tickets.
