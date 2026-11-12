# B1. Measured history; B6. Usage

Audit 2026-11, session 16. The numbers come from a general-purpose agent's jq, awk and git commands. That agent could not write files (the Write hook refuses non-roster agents), so the orchestrator wrote this file and re-ran the starred (★) numbers itself.

Sources:
- `vault/cost/log.jsonl`: 66,629 rows; every row has `auth=plan`, so `est_usd` is a dollar stand-in for subscription use, not money billed (vault/cost/README.md).
- `~/Library/Logs/ezdraft/launcher.log`: 47 MB, starting 10-23 11:39; its lines carry only a time of day.
- `git log develop`
- `vault/cost/usage.json`
- `vault/handoff/overseer-log.md`
- `vault/tickets/STATUS.md`

## B1.1 Tickets merged per day

`TZ=UTC git log develop --format='%cd %s' --date=format-local:%Y-%m-%d | grep ' feat(EZD-'`, counted by day. ★ Total: 279 feat commits (`git log develop --format=%s | grep -c '^feat(EZD-'` → 279), covering 278 distinct tickets.

| Week | Per day (UTC) |
| --- | --- |
| 10-19 to 10-25 | 32, 9, 5, 9, 18, 7, 14 |
| 10-26 to 11-01 | 28, 10, 8, 15, 5, 1, 0 |
| 11-02 to 11-08 | 7, 9, 22, 20, 26, 11, 1 |
| 11-09 to 11-10 | 8, 14 |

The best stretch is 11-04 to 11-06, at 22, 20 and 26. The two crashes are 10-31 to 11-02 (STOP for fix mode) and 11-08 (the weekly limit plus the loop below).

## B1.2 Units per merged ticket

Cost-log rows per merged ticket, with the loop rows of B1.5 left out. Over 265 tickets: median 2, p90 4, mean 2.54, max 14. The worst ten: EZD-154 (14), EZD-172 (13), EZD-108 (10), EZD-000 (8), EZD-294 (7), EZD-017, 153 and 299a (6 each), EZD-163 and 173 (5 each). Thirteen merged tickets have no cost rows, because they were built interactively: EZD-020, 280, 329, 331, 333, 334, 336, 344, 345, 360, 361, 365, 369.

## B1.3 Estimated cost per merged ticket

- **Merged tickets:** $3,379 in total. Per ticket: median $7.81, p90 $25.09, mean $12.75. The most expensive: EZD-153 $112, EZD-172 $70, EZD-148 $68, EZD-132 $68.
- **All rows:** $4,325, of which Fable was $730.
- **By unit:**

| Unit | est_usd |
| --- | --- |
| build | $2,512 |
| plan | $1,321 |
| questions | $368 |
| gate-phase | $85 |
| review-plans | $18 |
| repair | $15 |
| wrap | $3 |

- The busiest days were 10-25 ($530) and 10-24 ($476).
- The log does not record which model each dollar went to. By model mix: opus+sonnet $1,902, fable+opus+sonnet $735, fable+opus $534, haiku+opus+sonnet $424, opus alone $307, sonnet alone $105.

## B1.4 Gate attempts

- **Per ticket: cannot be derived.** Each ticket's gate.log lives in its worktree, and the worktree is removed after the merge. The nearest stand-in is build units per merged ticket: mean 1.63, p90 3.
- **Per phase gate:** runs of `gate-phase N: claude -p` in launcher.log were phase 0: 3, phase 1: 10, phase 2: 2, phase 3: 6, **phase 4: 22** (★ `grep -c 'gate-phase 4: claude -p'` → 22).
- The brief's "19 attempts" is low. Of the 22 runs, 18 logged "ended ok but changed nothing", and 6 were reruns within about 30 s of the run before.

## B1.5 Set-asides, tabled builds, repairs

| Event | Count |
| --- | --- |
| Set-asides | gate-phase 4 ×8, gate-phase 3 ×1, build EZD-337, build EZD-212a; EZD-291 set to blocked |
| Tabled builds | TABLE OK ×3 (EZD-337, 291, 212a); TABLE failed ×2 (EZD-284, 258) |
| Repair units | 70: check 43, waiting 20, ci 5, security 1, probe 1. **8 failed** (check 3, waiting 5) |

**The empty-unit loop (the biggest single loss).**
- ★ 65,468 cost-log rows have outcome `error:success`, no model, about $0 cost and 1 turn each.
- ★ By day: 11-04: 1, 11-07: 34, **11-08: 49,028**, **11-09: 16,405**.
- ★ By unit: build EZD-299a 32,521; plan EZD-217 32,461.
- The launcher restarted the same two units non-stop, from the weekly-limit hit (11-07 15:21Z, overseer-log.md line 44) to 11-09 09:49Z.
- For about 33 hours, 7 of 65,478 rows were real work.

## B1.6 Launcher idle time

The dates were rebuilt from the 23:59 rollovers and the dated "polling paused until" and "next poll after" lines. As a check, unit ends per day match cost-log rows per day within 4 on every day. Days before 10-23 are not covered.

34 gaps of 30 minutes or more, **10,884 minutes (about 181 hours)**:

| Minutes | When | Cause |
| --- | --- | --- |
| 3,160 | 10-31 to 11-02 | STOP file (fix mode), then code restarts |
| 1,078 | 10-25 to 10-26 | STOP file (fix mode) |
| 518 | 10-27 | EZD-154 ended twice without progress; the launcher stopped |
| 509 | 11-07 15:21 to 23:51 | STOP file and sign-in 401s |
| 476 | 10-24 | waiting for the phase 0 PR to merge |
| 445 | 11-03 | waiting on Josh to apply the EZD-300 patch |
| 415, 370, 330 | 10-30, 10-27, 10-30 | open questions |
| 362 | 11-10 | repair `waiting` failed; EZD-208b and EZD-212a blocked (the 6 h merge-guard stall of session-13-brief item 4) |
| 351 | 11-05 | blocked tickets |
| 266 | 11-08 | five-hour pause |
| 254 | 11-02 | EZD-284 stopped |
| 251 | 11-05 | waiting for the phase 2 PR |
| 195 | 10-28 | open questions |

The loop is not in this table: the gap method counts it as busy. Counting it, the idle-or-wasted total is about 181 h plus 33 h.

## B6. Usage

- **Spent:** $4,325 in total (est_usd), 26,007 real turns (91,468 recorded, minus 65,461 loop rows).
- **Waste:**
  - Units that ended with an outcome other than ok: $50.31.
  - Repeated plan or build units that ended ok: $786 over 197 rows, **about 18% of all spend**.
- **Weekly limit.** launcher.log never records a weekly-limit pause; it shows only "weekly usage at 70%; hold at 80%". The evidence is elsewhere:
  - vault/cost/usage.json: seven_day at 100% at 11-08 09:54;
  - overseer-log.md line 44: the limit hit at 15:21Z on 11-07;
  - a five-hour pause on 11-08 from 00:48 to 05:12.
- **The launcher's guard did not stop on the weekly limit.** It looped instead (B1.5).
- **The meter.** Unreadable since 11-09: OAuth 401, and launcher.log at 20:26 says "no usage meter reading fresher than 20 minutes; gating on the dollar proxy". The same log line reports "Fable weekly window at 91421%", a meter value that is plainly broken.
- **Week before the limit** (10-31 15:21 to 11-07 15:21): $973.55, 381 rows, 94 feat commits.
- **Capacity needed:** 350 tickets remain (337 todo plus 13 ready; the 32 blocked are not counted).
  - On the last 7 days' costs (84 merged tickets: median $10.35, mean $12.98, times 1.28, the whole-build ratio of all spend to merged-ticket spend), the rest costs $3,624 to $5,816 in est_usd.
  - At the measured $973.55 per week, that is **3.7 to 6.0 weeks** of limit-free running. It assumes no new loop, no fix-mode stops, and a weekly limit of about $975 of est_usd per account per week. That limit is an inference: the account reached 100% after that spend.
  - With two accounts, as Josh said (memory: pace-limit-not-budget), it is about 2 to 3 weeks of running time if nothing else stops it. B1.6 shows other stops took about 181 h in 18 days.
