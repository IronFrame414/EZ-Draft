# Lean build process: analysis (session 5, 2026-11-04)

Brief: vault/handoff/lean-process-brief.md. Proposal for Josh: vault/handoff/lean-process-proposal.md.
Not adopted as an R-NNN report (no retriever wrote it; vault/research/INDEX.md is owned by research.mjs).

## 0. Windows and sources
- Git: develop first-parent commits 2026-10-18 to 2026-11-04 (`git log --first-parent develop`).
- Launcher: ~/Library/Logs/ezdraft/launcher.log, which starts 2026-10-23 (2,158 lines). Its dollar figures are the proxy estimate ("no usage meter reading fresher than 20 minutes"), not metered usage. Interactive sessions (fix mode, orchestrator, build-watch) are not in it.
- Ledger: vault/tickets/tickets.json now vs at 2026-10-19 23:59; vault/debt.md; vault/questions/QUESTIONS*.md.
- "Product" merge = a feat/fix commit touching app/, packages/, worker/ or supabase/; everything else is "build system". Counting phase 0 as build system is a judgment call (it is mostly harness and launcher work).

## 1. Where the work goes

**Merges, 2026-10-18 to 11-04 (17 days):** 270 feat/fix commits on develop: 111 product (6.5 a day), 159 build system (9.4 a day), 59%. Plus 2,207 docs(vault) bookkeeping commits (session end 520, build 290, plan 188, done 169, status 133, questions 237, blocked 89).

**Launcher units since 10-23 (proxy $):**

| Unit | Runs | Est. $ | Note |
| --- | --- | --- | --- |
| build | 271 | 1,556 | 152 tickets; 118 runs (44%) were re-runs of a ticket already built once |
| plan | 166 | 705 | 157 tickets; 9 re-planned |
| questions | 155 | 274 | 24% of all units; 22 logged "changed nothing"; three in two minutes at 23:38-23:39 today |
| repair | 34 | 6 | |
| gate-phase, review-plans, wrap | 17 | 66 | |

By ticket kind (phase 0 or track tooling = build system): build system 141 plan/build units, $624 (28%); product 296 units, $1,637. In dollars the build system is a quarter, in merges more than half. Some phase 1 build-system fixes (EZD-316, 317, 328) are untagged, so 28% is a floor.

Worst retry outliers: EZD-154 (guard hardening) 13 build runs, EZD-172 (lane databases) 12, EZD-108 (avatar menu, product) 9. Two of the three are build system.

**New work per day.** Tickets 430 (10-19) → 601 (now); 193 new IDs (some old IDs were retired):

| Kind | Count |
| --- | --- |
| Split parts of existing tickets | 20 |
| New product tickets | 28 |
| App fixes (security, behaviour, data) | ~30 |
| Test flakiness and test plumbing fixes | ~17 |
| Build system (launcher, guards, sandbox, pilot rows, CI pins, docs) | ~98 |

So about 115 of 193 new tickets (60%) are about the build system or its tests. About 11 new tickets a day against about 16 merges a day.

**Questions:** Q-0170 on 10-19 → Q-0580 now: about 410 in 16 days, about 26 a day. Ledger totals: answered-josh 304, confirmed-josh 102, answered-agent 131, escalated 2. Josh has answered or confirmed about 406 questions in three weeks, 25 a day. A keyword match puts about 40% of all questions on build-system topics (launcher, guard, gate, sandbox, ledger, rounds).

**Debt list** (opened 2026-11-01 under D3 (a)): 86 rows in 4 days; 77 open; 56 of them tooling, 21 app. D-015 and D-016 are each used twice.

## 2. Main stop causes (launcher log since 10-23)

| Cause | Log lines | Root |
| --- | --- | --- |
| Ledger check failed | 41 | Mostly "plan Architecture line differs from tickets.json": the plan-ticket skill never runs `--set-architecture` (grep finds no mention in .claude/skills/plan-ticket/SKILL.md) |
| Waiting for running units / lanes | 41 | Lanes design: questions, repair and review run only when nothing else runs |
| STOP file (fix mode) | 33 | Interactive build-system work pauses the launcher (one line per minute) |
| Waiting on Josh | 12 | Real product questions plus guard grants |
| Guard grant / "needs Josh: apply patch" | ~14 | The safety classifier blocks agents from editing their own guards and launcher (memory: tooling-edits-need-patch) |
| Five-hour pause | 1 | One real pause in 12 days (10-25) |
| Weekly hold | 0 | |

The machine rarely stops for money or for the app. It stops for its own bookkeeping, for its own repair, and for Josh to approve its own changes.

## 3. Why the backlog grows

The loop that creates work:
1. Rule 17 (no known issue parked) turns every finding into work, and rule 18 (close the whole class) makes every security-flavoured finding a class to close.
2. Most findings are about the build system, because reviewers review build-system tickets with the same strictness as app code.
3. Agent guards (guard-bash, guard-paths) are pattern matchers on shell text. They are accident guards, not a sandbox (the EZD-154 and EZD-316 questions say this). Every round finds a new spelling that slips past (EZD-316 round 4: 14 findings, each a new case of one class), so "close the class" never ends for them.
4. The classifier will not let unattended agents edit guards, hooks or launcher code. Every build-system ticket therefore needs fix mode: launcher stopped, an interactive session, often a patch Josh applies by hand.
5. Each build-system merge changes the launcher, which produces new edge cases, new debt rows, new questions and new fix tickets.

Product work alone does not show this pattern: of 193 new tickets only 28 are new product scope.

## 4. Rule and mechanism by mechanism

K = keep, S = simplify, D = drop. "Protects" = what it protects in the app.

| Rule / mechanism | Verdict | Cost today | What is lost if changed |
| --- | --- | --- | --- |
| Tests first, separate test-author, builder cannot edit tests | K | Part of every build | The main defence against code that only passes its own tests |
| Gate script must be green; CI gate on the phase PR | K | Minutes per ticket | Broken develop |
| Code review per ticket; test review on high tickets | K | ~1 review dispatch per ticket | Missed requirements and extras |
| Security review on auth, permissions, money, data isolation, migrations, API | K | | Tenant leaks, money exposure |
| ui-verifier on visual checklists; phase audit; Josh's punch list | K | | Screens that do not match the mockup or spec |
| Secret-file guards (.env read and shell guards, EZD-279/280) | K | | Secrets in agent context |
| Josh owns product, scope, wording, money | K | | His product |
| One ticket = one branch = one commit; tests never call live services; no secrets; dependency line in architecture.md | K | Near zero | |
| Never guess / cite a source | K for product facts and numbers; S for build-system choices (the orchestrator decides how to build) | Questions on build-system detail | Nothing for the app |
| Rule 17, every finding becomes work | S: app findings unchanged (fix in place or defect ticket at the front). Build-system and test-plumbing findings that did not fail the gate become one line in a notes file with no deadline and no severity; they never block a merge or a phase gate. One tidy-up ticket per phase at most, only if Josh says yes | 56 open tooling debt rows; ~98 new build-system tickets | Some tooling rough edges stay rough. App quality unchanged |
| Rule 18, close the whole class | S: keep for app security and data integrity; drop for agent accident guards (guard-bash, guard-paths), where it never converges | EZD-154 13 runs, EZD-316 four rounds and Q-0548 | Agents could in theory spell a shell command the guard misses. The classifier, the deny rules and review still stand behind it |
| New build-system tickets | S: frozen. Allowed only if (a) the launcher cannot run at all, or (b) secrets or app data are exposed. Each still needs Josh's yes | 59% of merges | Launcher stops improving; it already builds 16 tickets a day |
| Plan size caps (15k product, 5k tooling) and waiver questions | D the caps; keep the split guidance (one fresh session per ticket) | Waiver questions (Q-0578), tightening rounds | Larger plans for complex tickets (they are read by range already) |
| plan_lint + plan-checker | K | One Sonnet dispatch per plan | PLAN-GAP stops (only 1 in the log, so it works) |
| Review-plans unit per phase | K | 3 runs, $9 | Contract mismatches between tickets |
| Re-validation when a dependency deviated | S: only when the dependency's interface contract changed, not its notes | ~30 re-validate commits | Nothing if contracts are unchanged |
| Questions chain levels 1-3 | K, with one change: build-system questions stop at the orchestrator (level 2) and never go to Josh | | |
| "Agent answers to confirm" list for Josh | S: only answers that touch product, wording, money or security; drop the rest | 102 confirmations | Josh no longer sees agent answers about tooling |
| Lesson ratification by Josh | D: agents own lessons; Josh sees them in the PR (info only) | One section of every questions file | Josh's veto on agent lessons (he can still reject in the PR) |
| Questions unit re-runs | S: run once per real change (today three runs in two minutes with no change; the guard logs "1 in a row" and runs again) | 155 units, $274 | Nothing |
| --set-architecture after plan | S: one line in the plan-ticket skill | 41 ledger failures, each a stall plus a repair | Nothing |
| Model ladder (Haiku → Fable) and launcher code for it (EZD-268) | S: keep the ladder already in build-ticket (round 3 one tier up, then set aside); drop the new code | | Automatic ladder for plan and phase-wide units |
| Multi-round reviewer ladder (3 rounds) | K for product. For build-system tickets that are still allowed, 2 rounds then Josh decides ship or drop | | |
| Budget gates, meters, five-hour classifier (EZD-271/274) | S: keep the existing gate; stop building more. One real pause in 12 days; Josh says budget is not the holdup | | Finer limit handling |
| Records inbox / ledger queue | S: leave as it is; no records redesign (H1). Fewer interactive sessions means less lag | Queued edits miss merges (D-079) | |
| Fix mode protecting the launcher's own files | K (the classifier requires it), but with the freeze it is rarely needed | 33 STOP minutes logged, Josh patch steps | |
| Lanes (2 lanes) | K | | Throughput |
| Handoff, STATUS, session-end commits | S: one session-end commit per unit, not several | 2,207 vault commits | Some history granularity |

## 5. The ten unfrozen build-system tickets

Test: does it protect secrets or app data, or remove a stop the log counts?

| Ticket | Decision | Reason |
| --- | --- | --- |
| EZD-279 read guard, secret files in any case | Finish | Secret protection; code and security reviews PASS; waits only on EZD-330 |
| EZD-280 shell guard, any command naming a secret file | Keep, re-validate against 279's globReach, cap at 2 review rounds | Secret protection |
| EZD-154 remove PA3 grant, two guard-bash gaps | Shrink to Block A3 (remove the leftover builder grant); drop the guard-bash hardening (B5 and the rest) | Removing a grant closes a permission; the bash hardening is the non-converging class (13 runs) |
| EZD-265 watchdog, one ticket never stops the launcher | Drop | Stops it targets are rare in the log; the orchestrator already applies the rule by hand |
| EZD-268 model ladder in launcher code | Drop (tests 79e0d30d stay on t/EZD-268, unmerged) | The skill-level ladder already exists; sunk test work is not a reason |
| EZD-269 a wait is a dependency | Drop | Applied by hand today; few such waits |
| EZD-270 chain answers every question | Drop; replaced by the rule change in section 4 | |
| EZD-271 usage-limit classification | Drop | One real five-hour pause in 12 days, no weekly hold |
| EZD-272 a step for classifier refusals | Drop; one rule line: a refusal sets the ticket aside and the launcher moves on | Already a KEEP stop |
| EZD-274 limit-like error is an ordinary failure | Drop | Same as 271 |

Also outstanding but outside the ten: the Q-0580 gate-lock flake is a defect (it failed a gate), so it stays at the front. EZD-316 and EZD-317 (sandbox) should get the same test; they were not in the brief's list and are not decided here.

## 6. Forecast (rough)
Product tickets not done: about 390 across phases 1-55. At 6.5 product merges a day that is about 60 working days. If build-system merges fall from 9.4 a day to near zero and the lanes go to product, product merges should rise, but by how much is not measured. The honest claim is: the freed lane time and Josh's attention move to product; the size of the gain will show in the first week's numbers.

## 7. Risks
- The rewrite itself becomes a build-system project. Mitigation: step one is text only (rules, skills); no launcher code.
- CLAUDE.md, PROCESS.md and skills sit under guards: the edit needs fix mode in an interactive session with the launcher paused (STOP needs Josh's yes, memory ledger-edits-while-launcher-runs).
- Tooling rough edges left as notes could later cause a real stop. Then it is a defect by the existing bar ("fails the gate") and gets a ticket.
- Fewer agent answers shown to Josh: a wrong tooling answer goes unseen. Product, wording, money and security answers are still shown.
