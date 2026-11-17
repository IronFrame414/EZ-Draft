# Cost report, phase 4

Window: 2026-11-06 09:43Z (phase 3 wrap) to 2026-11-12 21:40Z: 65,897 rows in `vault/cost/log.jsonl`, of which 432 have a cost; 65,465 are zero-cost `error:success` rows (see "Spin loop"). The log has no phase column, so the window also holds the phase 5 to 7 planning ($632 of plan rows), the phase 5, 6 and 7 questions, and overseer repairs. Dollars are `est_usd` from the log (API-equivalent list rates, not a bill). `node vault/tools/usage-by-agent.mjs --since 2026-11-06T12:00:00Z` stopped: no rate for `claude-fable-5-2` (it must come from the claude-api pricing reference; not guessed here), so role and per-model dollar splits are not given; the per-model counts below are from the `models` field of each row.

## Totals

| Measure | Value |
| --- | ---: |
| Window total (432 costed rows) | $1,268.38 |
| Fable (`fable_est_usd`) | $21.04 (1.7%) |
| Rows by model mix | Opus+Sonnet 147 rows $759; Opus only 63 rows $267; Haiku+Opus+Sonnet 22 rows $92; Fable+Opus+Sonnet 11 rows $58; Sonnet only 166 rows $49 |
| Median costed unit | $1.33 (phase 3: $0.90) |
| Meter | 426 `proxy`, 6 `oauth`: weekly % per ticket not available |

By unit: plan $632.33 (127 rows, median $4.68); build $534.51 (140 rows, median $2.05); questions $66.32 (93, $0.23); gate-phase $16.55 (29, $0.26); repair $9.37 (38, $0.23); review-plans $8.58 (4, $2.15); wrap $0.72 (this unit, partial).
Spend by day (costed rows from 11-07): 11-07 $136.86, 11-08 $43.08, 11-09 $250.07, 11-10 $243.67, 11-11 $279.03, 11-12 $152.48.

## Per ticket

73 tickets had build rows: sum $535, median $5.45 per ticket. Most expensive builds: EZD-224 $26.05, EZD-5602 $20.60, EZD-212b $19.27, EZD-212c $18.58, EZD-294 $17.76, EZD-207a $17.13, EZD-299a $17.09, EZD-219 $16.75, EZD-299b $15.30, EZD-104 $14.91, EZD-359 $14.67. Most expensive plans: EZD-135 $16.23, EZD-105b $14.84, EZD-104 $14.33, EZD-111 $13.54, EZD-109 $13.20, EZD-128 $12.79. Gate-phase 4: $16.55 for the unit rows (one row $5.77 on 11-10, one $3.04 on 11-12, the rest under $0.70).

## Weekly ceiling (section 2a rule 9)

`weekly_ceiling_usd_est` in `vault/budget.json` is currently 1,000,000 (Josh's temporary no-limit override, memory 2026-11-06); the last real value in its history is 1,160, a third of which is $386.67. The window cost $1,268.38, about 109% of 1,160 and 3.3 times a third. Rule 9 says recommend splitting the next phase. Caveat: $632 of it is planning for phases 5 to 7, not phase 4 itself, so phase 4's own share (build $535 + gate and repairs) is about $560, still above a third. Josh sets the ceiling; the recommendation stands.

## Spin loop (build-system, not an app finding)

65,465 zero-cost rows from 2026-11-07 15:21Z to 2026-11-09 09:49Z: 32,784 `build` (EZD-299a) and 32,681 `plan` (EZD-217), each one turn, about 200 ms, `error:success`. `vault/handoff/last-failure.json` records the weekly limit message ("resets 2am") for plan EZD-217. The launcher re-dispatched the same unit every 2 to 3 s while the account was limited. It cost $0 but filled the log (66,795 rows). Noted in `vault/tooling-notes.md`; no ticket (build-system rule 17).

## Escalation and model use

- Sonnet ran 366 of 432 unit rows, Opus 249, Haiku 41, Fable 17 (a row can hold several models). Fable's 1.7% share is below phase 3 (12.6%) and phase 2 (5.6%); `claude-fable-5-2` appears on one row. The phase audit ran on Opus 5.5 (Fable not allowed, `gates/phase-04.md`).
- Tier changes per STATUS Notes were not re-read ticket by ticket in this session; the findings log shows rounds of 3 or more on EZD-294 (security-reviewer r1 to r3), EZD-212c, EZD-5603a (gate r2), EZD-221b (ui-verifier r3). Not audited further.
- Opus on low-complexity work and Haiku failures: not checked per ticket this session (`usage-by-agent.mjs` stopped). Listed as not measured.
- Defects the step-8 reviewer missed that the auditor or Josh then caught: none recorded. Phase audit READY, no defects; security PASS; PR 7 merged on a green gate (`gates/phase-04.md`). No punch-list comments from Josh were read (the `gh` CLI could not read its config in this sandbox).

## Lessons this wrap

`findings.mjs repeats` listed 13 categories. Covered: test-weak, test-defect, test-missing, test-isolation by new candidate L-068; general-case, contract-gap, scope-missing by L-069; scope-extra, docs by L-070; ui-mismatch by L-071; security by L-072; architecture-rule by L-060 (seen 2, migration timestamps); gate-red by L-053 (seen 3, stale worktree). The cover calls printed COVERED and are queued in the unit's results file; the launcher writes them. `planner.md` now has 58 entries (about 640 lines), well over the 30 guideline: consolidation was not done (see recommendation 5). `reviewer.md` 2, `builder.md` 4, `orchestrator.md` 2, `test-author.md` 11 entries.

## Automate (lessons a script could check)

1. L-053 (merge develop into the worktree before the gate) is now `seen` 3 and the cause of EZD-104's stale-worktree red. Proposal: `scripts/gate.mjs` stops with a message when the worktree lacks `origin/develop`'s head. Already proposed in phase 3; now the third occurrence.
2. L-060 (migration timestamps newer than develop's newest) is `seen` 2 (EZD-366, EZD-5601, EZD-224 in this phase). Proposal: a gate test that fails when a new migration file's timestamp is not above every migration already on `origin/develop`.
3. L-068 to L-072 are candidates; none is ratified, so none is proposed yet.
You do not apply these; Josh does.

## v2.4 watch items

Updated in `v2.4-comparison.md` (phase 4 section).

## Recommendations (PROCESS.md changes need Josh's yes)

1. Split the next phase or keep a real `weekly_ceiling_usd_est`: this window cost 3.3 times a third of 1,160.
2. Add a rate for `claude-fable-5-2` to `usage-by-agent.mjs` from the claude-api pricing reference so the wrap can split dollars by role and model.
3. Make the launcher stop re-dispatching a unit after a weekly-limit error (backoff to the reset time): 65k no-cost rows in two days.
4. Record the phase and the review round count on each `log.jsonl` row (carried over from phases 1 to 3).
5. Consolidate `planner.md` (58 entries) into a directory of smaller files per area, as section 13 says knowledge files past about 150 lines should be.
6. `per_unit_cap_usd_est`: median costed unit $1.33, median build $2.05; keep the cap well above build costs ($11 to $26 for the high builds). Josh sets it.
