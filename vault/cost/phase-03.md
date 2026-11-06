# Cost report, phase 3

Window: 2026-11-05 19:08Z (phase 2 wrap) to the phase 3 wrap, 2026-11-06: 62 launcher rows in `vault/cost/log.jsonl`, 0 missing transcripts, all `meter_source` proxy. The log has no phase column, so the window also holds the phase 4 questions and planning, the tooling and build-system fixes (EZD-336, 337, 345 were interactive or launcher-side) and the overseer repairs. Dollars are API-equivalent list rates (plan runs, not a bill). Sources: `node vault/tools/usage-by-agent.mjs --since 2026-11-05T19:08:00Z` and the log's `est_usd`. The wrap row is included at its partial value.

## Totals

| Measure | Transcript $ | Log `est_usd` |
| --- | ---: | ---: |
| Window total | $170.68 | $159.93 |
| Fable | $21.47 (12.6%) | |
| Opus 5.5 | $91.54 (53.6%) | |
| Sonnet 5.5 | $57.41 (33.6%) | |
| Haiku 5.5 | $0.26 (0.2%) | |

Weekly ceiling: `weekly_ceiling_usd_est` is 1160 (`vault/budget.json`); a third is $386.67. The window cost $159.93 (log), 13.8% of the ceiling: no split needed (section 2a rule 9).

By unit (log): build $102.77 (22 rows, median $2.25), plan $32.14 (10, median $3.60), gate-phase $11.87 (6, median $0.83), questions $10.10 (18, median $0.27), repair $2.00 (5), wrap $1.06 (1). Median unit $0.90 (phase 2: $1.35); that is the figure for `per_unit_cap_usd_est`. Outcomes: 60 `ok`, 2 `error` (build EZD-337, $0 each, 2026-11-06 02:34Z: `vault/handoff/last-failure.json`; EZD-337 was then merged in interactive fix mode as 5dd9bc0b and is `done`).

## Per ticket (whole table: `usage-by-agent.mjs` "$ per ticket")

Build: EZD-120d $18.39, EZD-203 $14.87, EZD-120b $13.91, EZD-342 $11.51 (plus plan $3.61), EZD-120a $10.87, EZD-120c $10.25, EZD-202 $6.88, EZD-346 $6.21 (plus plan $4.53), EZD-238 $4.98, EZD-338 $2.92, EZD-347 $2.69, EZD-206 $2.06, EZD-341 $1.77, EZD-339 $1.14, EZD-340 $0.71, EZD-348 $0.58, EZD-236 $0.37. Plan: EZD-337 $5.53, EZD-347 $4.99, EZD-341 $4.76, EZD-346 $4.53, EZD-342 $3.61, EZD-339 $2.07, EZD-338 $2.06, EZD-348 $1.86, EZD-343 $1.51, EZD-340 $1.26. Gate-phase 3: $12.76 (phase-auditor Fable $5.28, Opus security-reviewer $2.15, orchestrator Sonnet $5.31). Questions: phase 4 $5.17, phase 3 $2.79, phase 1 $4.00. The five product tickets (EZD-120a to d, 202) cost $60.4 of the build total; the six low fix tickets (338 to 340, 343, 348 and 341) cost under $8 together.

## Per unit type and role (share of $)

Opus plan orchestrator 18.3%; build builder (Opus) 11.6%; build orchestrator (Sonnet) 11.1%; build code-reviewer (Opus) 10.6%; build security-reviewer (Fable) 8.6%; build test-author (Sonnet) 7.9%; build planner (Opus) 6.1%; questions orchestrator 5.0%; gate-phase orchestrator 3.1%; gate-phase phase-auditor (Fable) 3.1%. Against phase 2 (`phase-02.md`): the plan unit share fell from 48.7% to 18.9% (this window has 10 plan runs against 20), the build builder and test-author rose to 25.3% together (10.9%), and the build security-reviewer on Fable rose from 3.6% to 8.6% of the window. Against `baseline-2026-10-19.md`: not compared line by line; that baseline is a different process version.

## Escalation and model use

- Tier changes (STATUS Notes, read this session for the tickets above): EZD-120b builder Opus medium r1, high r2, fresh high r3 (Q-0597 approved the extra round); EZD-120d builder Sonnet r1 and r2, Opus medium fresh r3 (advisor consulted); EZD-203 builder Opus medium r1, high r2 fresh; EZD-342 builder Opus medium r1, high r2 with the test-author also moved to Opus high; EZD-120a builder resumed at r2 though `--dispatch` said high. Planner plan-gap patches ran on EZD-120a, 120b (x3), 120c, 120d (x3), 342, 343, 346.
- Fable: $21.47 of the window (12.6%), against 5.6% in phase 2 and 21.6% in phase 1. It ran as security-reviewer on EZD-120a to d, 202, 203, 238, 342 and 346, and as phase-auditor ($5.28 gate, $0.91 build, $0.55 questions). Its share is back above the phase 2 level because every high product ticket here is security-flagged.
- Opus on low-complexity work: build test-author Opus $3.24 (EZD-203, EZD-342 r2) and build calc-auditor Opus $1.86 (EZD-203, EZD-238) are on high tickets. EZD-206 (medium) used Sonnet. The low fix tickets (EZD-338, 340, 343, 348) used Haiku test-authors and builders with Opus medium code-reviewers, as intended; EZD-339 and EZD-348 skipped the builder by plan.
- Haiku failures: none found. The STATUS Notes of EZD-338, 339, 340, 343, 348 record no Haiku redo or escalation; EZD-343 failed review round 1 for a plan gap (test E1 not run in the gate scope), fixed by a plan patch, not by a tier change.
- Defects the step-8 reviewer missed that the auditor or Josh then caught: none recorded. The phase audit was READY with no fix tickets; the security pass was PASS. No comment from Josh on PR 6 was seen in this session's read of its comments.

## v2.4 and Josh's items

Advisor calls in the window per `usage-by-agent.mjs`: EZD-120d 3, EZD-120b 2, EZD-342 1, EZD-338 1, gate-phase 3 1; about 8 over 22 build rows, no dollar split. Weekly % per ticket: meter missing (all 62 rows `proxy`). The v2.4 table update is in `v2.4-comparison.md`.

## Automate (lessons a script could check)

1. L-053 (gate parts the change touches, merge develop into the worktree before the gate) now has `seen` 2. Check proposal: `scripts/gate.mjs` prints a failure and stops when the worktree does not contain `origin/develop`'s head (EZD-342's merge-gate reds came from a stale worktree). 
2. L-055 (doc lines found by grep for the old value) now has `seen` 2. Check proposal: a gate lint that fails when `docs/architecture.md` names an exported function with a signature that differs from the code (EZD-342 `isForwardedHttps`, EZD-120b `idb` import). 
3. L-059 (outcome on a non-not-found error and on a throw) now has `seen` 2. Check proposal: none a script can do generally; stays a plan-check line.
4. L-064 (candidate, new): fixture source and e2e project named in the Tests row. Not ratified yet.
You do not apply these; Josh does.

## Recommendations (PROCESS.md changes need Josh's yes)

1. Keep the complexity table as is. The six low fix tickets all passed on Haiku with Opus medium review (about $1.2 each at most).
2. Put the number of review rounds in a `rounds` column or STATUS field so the v2.4 watch items are countable without reading free-text Notes (still recommended since phase 1).
3. Record the phase on each `log.jsonl` row so a wrap does not need to cut a window by date; this window mixed phase 3, phase 4 planning and tooling work.
4. `per_unit_cap_usd_est`: keep; median unit $0.90; a cap at three times the median ($2.70) would stop the high product builds ($11 to $18), so the cap must stay above the build median of $2.25 by a wide margin; Josh sets it.
5. High product tickets cost $11 to $18 each to build (EZD-120a to d, 203). Splitting them further is not needed: none reached `blocked`.
6. The wrap session could not run `findings.mjs cover` to completion outside a launcher unit if the results file is not read; check that the four `cover` lines were applied (the log still showed 23 uncovered findings during the wrap).
