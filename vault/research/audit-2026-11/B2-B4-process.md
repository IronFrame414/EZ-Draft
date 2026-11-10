# B2. Failure classes; B3. Planning; B4. Oversight

Audit 2026-11, session 16.
- **Who did what.** A general-purpose agent did the counting with read-only grep and awk. The Write hook refuses that agent type, so the orchestrator wrote this file and corrected one row against the cost log (the weekly-limit loop).
- **Sources.** L = `~/Library/Logs/ezdraft/launcher.log`; its lines carry a time of day but no date. OL = `vault/handoff/overseer-log.md`. TN = `vault/tooling-notes.md`. STATUS = `vault/tickets/STATUS.md`.

## B2. Every failure class behind a repeated run

| Class | Seen | Count (method) | Time lost | Root cause | Fixed now? | Closes the whole class? |
| --- | --- | --- | --- | --- | --- | --- |
| 10-minute background stop | noted as D-062 11-04; fixed 11-10 | gate-phase 4 ran 22 times (`grep -c 'gate-phase 4: claude -p' L`) | about 5 days. It was logged as a build-system *note*, which never blocks (rule 17). | A background command stops at 600,000 ms by default, and the skill passed no timeout. | cb46ac83, 81dec3ab | yes, for gate calls |
| Leftover app server on :3000 | 11-09 ~16:43 to 21:40Z | OL 18:16, 21:40 | about 5 h; Josh had to `sudo kill` it | A stopped gate left `next start` running as the ezdraft user. | EZD-364 lane port sweep (091601a) | yes, for its own lane |
| Uncommitted vault files | 11-05 to 11-09 | about 11 OL commits of stray files; 32 lines matching `uncommitted\|untracked` in L | each holds until a repair runs | Units leave plans and ledger edits uncommitted on develop, and the full gate copied the working tree. | beca1e89 (EZD-365) | **no**: it fixes the full gate only, and units still leave the files. The ledger stop hook also fires on any untracked vault file. This audit hit it twice. |
| Plan-record / architecture mismatch | 11-06 to 11-10 | 67 lines `ledger check failed` in L | a 12:32-12:45 deadlock (TN:109); repairs at 11-06 12:32 and 23:43 and 11-10 18:26 could not pass | The records inbox is applied only between units. | open (overwatch step A, by hand) | no |
| Unrecorded develop stops every merge | 11-10 | 15+ `develop not recorded` lines in L | **6.0 h** (L 07:03:20 to 13:06:03) | A protected-file commit was not recorded. | a rule plus overwatch step C only | no |
| Merge clash; EZD-367/368 deadlock | 11-10 | EZD-367 "Assessed after 4 runs" (STATUS) | part of 11-10 | Each branch was red on the other's failure. | 2c6d9909 carried both; overwatch step D | no: nothing detects two branches red on each other |
| False port 3210 holds | 11-10 14:44 to 18:02 | EZD-366, EZD-367 | about 3.3 h | The bind test gave EADDRINUSE with nothing listening. | e9e61366 | yes |
| Pan long-task perf check | 11-06 to now | fix tickets EZD-356 (523cd691), EZD-358 (cf9593e5), EZD-359 (1b3abcd9); EZD-372 in build | CI red on it from 11-07 14:41Z to now (A3) | The check expects exact long-task counts that depend on the machine (A1 phase 4 row 2). | open | **no**: three fixes passed locally and never on CI |
| **Empty-unit loop at the weekly limit** | 11-07 15:21Z to 11-09 09:49Z | 65,468 `error:success` cost-log rows: build EZD-299a 32,521 (11-07 15:21 to 11-09 09:49), plan EZD-217 32,461 (11-08 05:35 to 11-09 09:49) | **about 33 h** after the pause was lifted at 11-08 00:03Z (OL line for session 12) | When a unit returned the limit error with `outcome error:success`, the launcher restarted it at once. | maybe EZD-369 (20acdd99, three strikes). Not checked: whether `error:success` counts as a strike. | unverified |
| Questions 5/56 loop | 11-04 (questions 3, D-082); 11-09 17:37-17:55Z | 40 runs (22 `questions 5 →`, 18 `questions 56 →` in L) | about 18 min, about $7 (TN:134) | `.questions-last-run.json` holds only one phase. | workaround only (split proposals blocked) | no. EZD-369 counts each key separately, so two keys that take turns can still loop. |
| Split proposals planned twice | 11-07, 11-09 | EZD-221 split by hand; 7 bases split into 16 parts on 11-09 18:16; plan retries of EZD-217, 211, 204 | session 13 hours | The launcher has no split path, so the base ticket is planned or questioned again. | open (by hand) | no |
| Network fetches blocked by the sandbox | 11-07 to 11-10 | 1 `ENOTFOUND` line in L; OL cases 210a, 210b, 221b, 217 | 210a 14 min; others until an interactive session or overwatch | `icons:fetch` needs network, and the unit sandbox has none. | overwatch step E | no |
| Cross-phase regressions | 11-07 to 11-10 | 5 cases (A3: EZD-014b ×8 runs, EZD-299a ×1, EZD-033 ×1, EZD-323 T8, EZD-108 T18) | until someone read CI or ran a full gate | A ticket gate runs only its own phase plus @smoke. | 9aff3804, 45146b1c (two cases only) | **no** |
| **NEW: develop's CI gate red, and no one watches it** | 11-06 18:27Z to now | 0 green CI runs 11-07 to 11-10; failures per day 17, 2, 10, 9 (A3) | 4 days so far | No unit, overwatch step or ticket reads develop's CI. | open | no |
| **NEW: the plan draws no text on the CI machine** | every CI run checked | 9 browser tests, including the EZD-133 money-pages @smoke pair (A1 phase 4 row 1) | blocks the phase 4 PR (rule 11) | Unknown: the font or canvas on the CI runner, or an app bug | open; EZD-372 does not cover it | no |
| **NEW: phase gates that change nothing** | phase 4 | 18 of 22 gate-phase 4 runs "ended ok but changed nothing"; 6 were reruns within about 30 s (B1.4) | 22 phase-gate units | A gate unit that cannot pass ends `ok`, and the launcher offers it again. | EZD-369 (strike count and assessment) | probably, for repeats of the same key |

## B3. Planning

Counted with awk over the STATUS Notes cells, by phase column. A deviation is counted only when a `Deviations:` field is not followed by none, no or 0. Raw `grep -ci` over all of STATUS: split 82, re-validat 98, Deviations 217, round 2 40, r2 56, Gate fault 2.

| Phase | Rows | Real deviations | Re-validated | Re-validated after a dependency deviated | Split parts (letter IDs) | "split proposal" notes | Questions-unit plan edits | Reviews needing round 2+ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 80 | 33 | 55 | 2 | 50 | 36 | 4 | 5 |
| 1 | 150 | 46 | 24 | 3 | 4 | 2 | 3 | 28 |
| 2 | 20 | 5 | 5 | 0 | 4 | 0 | 0 | 2 |
| 3 | 19 | 6 | 4 | 1 | 6 | 0 | 0 | 4 |
| 4 | 30 | 12 | 5 | 1 | 9 | 0 | 0 | 5 |
| 5 | 14 | 3 | 3 | 1 | 12 | 5 | 0 | 1 |
| 56 | 7 | 0 | 0 | 0 | 4 | 4 | 0 | 0 |

- **About a third of built tickets deviated from their plan:** 105 of 313 rows in phases 0-5 (33+46+5+6+12+3 of 80+150+20+19+30+14). Most were file-path or interface drift, which a contract check at planning time would catch.
- **Splits after planning:** 47 "split proposal" notes in all, giving 89 letter-ID parts. In phase 5 and 56, 9 of 21 rows carry a split proposal. Each one cost a full plan before the size problem showed, and some were planned or questioned again until split by hand.
- **What would have caught each earlier:**
  - **Splits:** a cheap size check before the full plan, plus a split path in the launcher.
  - **Re-validations:** each merged ticket's deviations written in a fixed form that its dependents' planners read automatically.
  - **Builder deviations:** a planning-time check that every file and function in the plan's interface contract exists at the stated path. The phase plan review (review-plans) checks plans against each other, not against the code.

## B4. Oversight

**Repairs that failed, and why:**
- **No verdict line in the report:** 11-06 11:18, 11-07 05:06, 11-10 13:06.
- **Guarded paths that need fix mode (EZD-354, 8 paths):** 11-06 13:53. Fixed interactively at 11-07 02:14, about 12 h later.
- **The ledger was still invalid inside the unit:** 11-07 02:15, 11-10 18:26.
- **The sandbox has no network (EZD-210a icons):** 11-07 02:54. Cleared at 03:08 (14 min).
- **Merge-blocked EZD-208b and EZD-212a (develop not recorded):** 11-10 07:03. About 6 h until builds restarted at 13:06. The overwatch runbook was written at 13:50.
- **"REPAIRED" but not applied:** 11-06 12:32 and 23:43, 11-09 13:54. The fix sat in the records queue, which is applied only between units.
- **The launcher records every repair as ok.** All 70 repair runs (check 43, waiting 20, ci 5, probe 1, security 1) show `→ ok` in L, even when the report says FAILED. So failed repairs are not counted anywhere; 8 failed by their own reports (B1.5).

**Stall lengths before an interactive fix:**

| Stall | Length |
| --- | --- |
| Merge guard | 6 h |
| Guarded paths | about 12 h |
| :3000 | about 5 h |
| Port 3210 | about 3.3 h |
| Empty-unit loop | about 33 h |
| Questions loop | 18 min |
| Icons fetch | 14 min |
| STOP for fix mode (B1.6) | 3,160 min and 1,078 min |

**Stall patterns the overwatch runbook (.claude/skills/overwatch/SKILL.md) has no step for:**
1. Develop CI red. No step reads CI.
2. A fast error loop. "A unit started in the last 20 minutes" counts as healthy, so the 32k-retry loop would pass the health check. Step J only says to change nothing.
3. Two questions units taking turns (5/56).
4. Split proposals waiting to be applied.
5. A queued records op not applied while the ledger is red.
6. Two tickets each red on the other's failure.
7. `push-develop` blocked by the EZD-023b hook inside overwatch (3 runs, commits left local).
8. A repair report with no verdict line.
9. Failures that happen only on CI (the missing plan text).
