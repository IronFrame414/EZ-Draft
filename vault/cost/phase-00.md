# Cost report, phase 0

Window: 2026-10-19 01:40Z to 2026-10-24 (200 launcher rows in `vault/cost/log.jsonl`, 0 missing transcripts). Dollars are API-equivalent list rates (plan runs, not a bill). Sources: `node vault/tools/usage-by-agent.mjs --since 2026-10-19T00:00:00Z` (transcripts) and the log's `est_usd`.

## Totals

| Measure | Transcript $ | Log `est_usd` |
| --- | ---: | ---: |
| Phase total | $913.77 | $894.08 |
| Fable | $183.30 (20.1%) | $186.33 |
| Opus 5.5 | $594.71 (65.1%) | |
| Sonnet 5.5 | $134.78 (14.8%) | |
| Haiku 5.5 | $0.97 (0.1%) | |

By unit (log): build $688.55 (118 rows), plan $150.58 (57), questions $37.89 (22), gate-phase $17.05 (3; Fable $8.66). One row ended `limit-weekly` (EZD-000, 2026-10-19). Median unit $3.18; 90th percentile $11.02; median build row $3.87 before v2.4 and $3.83 after.

## Per ticket (top; whole table: `usage-by-agent.mjs` "$ per ticket")

EZD-025 $35.78, EZD-033 $26.36, EZD-023a $25.79, EZD-006 $23.39, EZD-018 $23.13, EZD-023e $22.60, EZD-023d $22.29, EZD-023b $22.16, EZD-021 $20.78, EZD-017 $20.12 (6 runs). Phase-level units: questions $38.46 plus gate-phase $16.59 for phase 0.
Cheapest class: low fix tickets EZD-037/038 at about $3.4 each.

## Per unit type and role (share of $)

plan unit 16.5%; build orchestrator 16.8%; build code-reviewer 14.5%; build builder 13.7%; build test-author 12.4%; build planner 11.4%; build security-reviewer 7.6%; questions 4.2%; gate-phase 1.8%. Against `baseline-2026-10-19.md` (day one, Opus/Fable heavy): orchestrator plan share fell from 22.1% to 15.9% on its Opus line and Sonnet now carries the build orchestrator; Fable fell from the baseline's dominant test-author/builder/code-reviewer lines to security review and the phase audit only.

## Escalation and model use

- Tier changes: `STATUS.md` Notes do not record a structured tier change for any phase 0 ticket, so I report none. Fable ran after v2.4 only as security-reviewer ($28.22) and phase-auditor ($8.66).
- Fable or Opus on low-complexity work: before v2.4 (until 2026-10-22) Fable ran test-author, builder and code-reviewer on tickets of every size ($146.42 Fable before v2.4 against $36.88 after). After v2.4 nothing low ran on Fable; low fix tickets ran Sonnet/Haiku with an Opus code review.
- Haiku failures: none found. Haiku total is $0.97 (retrievers, log-summarizer, small builder/test-author use); no `STATUS.md` note records a Haiku failure.
- Resumed step-8 reviewer misses caught later: the phase gate (auditor and security-reviewer) produced six fix tickets, all small: EZD-036 (build warnings), EZD-037 and EZD-038 (stale "every push" CI text), EZD-039 (TRACE report misread), EZD-040 (error tunnel scrubbing of tags and contexts), EZD-041 and EZD-042 (production database URL passed on a command line). EZD-040, 041 and 042 are real security-class misses by the per-ticket reviews (EZD-024, EZD-023b/d). Not counted as "resumed reviewer" misses because `STATUS.md` does not mark which reviews were resumed.
- Phase gate: the auditor found one defect (stale `vault/architecture.md`), fixed in 2de25be.

## Weekly ceiling (PROCESS.md section 2a rule 9)

`weekly_ceiling_usd_est` is 300 (proxy mode only; the launcher ran on the real meters, `meter_source` `oauth` on 110 rows). The phase spent $894 to $914 in about 5.5 days, roughly 3 times that figure and far over a third of it. **Recommend splitting the next phase** (or sizing it by the real weekly meter, which is not stored per row, see below).

## Recommendations for Josh (PROCESS.md changes need your yes)

1. Split phase 1 into two phase PRs, or cap each at about 40 tickets: phase 0 was 80 tickets and cost about $11 per ticket including planning and questions.
2. Record the weekly-meter percentage per row in `log.jsonl` (the log has `meter_source` but no percentage), so weekly % per ticket can be computed. Needs a launcher change (`scripts/`, yours).
3. Record the review round count and first-round PASS/FAIL per ticket in `STATUS.md` as fixed fields (a `rounds` column or a `R1:PASS` token). The Notes are free text, so these cannot be counted reliably.
4. Mark in `STATUS.md` which reviews were resumed (step 8), so the section 8 revisit flag can be counted.
5. The plan unit is the largest single line after build orchestrator ($150.58, 16.5%) and runs on Opus; try Sonnet planning with an Opus advisor on low and medium tickets (planner already costs $104.25 on top).
6. Security review is 7.6% of the phase and Fable carried $28.22 of it after v2.4. EZD-040, 041 and 042 were only found at the gate; ask whether security review should also run on medium tickets that touch secrets or logging (a process change, your call).
7. Keep complexity table, ticket-size numbers and maxTurns as they are; the data above does not show them wrong. A `per_unit_cap_usd_est` of 40 is 12.5 times the median of $3.18 and the highest row is $25.8, so a cap of about $30 would still never have fired.

## Automate (ratified lessons a script could check; Josh applies, then the entry is marked `automated: <name>`)

- L-003 (`seen` 2, orchestrator and test-author): a gate test that runs the repo-script tests once from a temp copy of the checkout and once from `.claude/worktrees/`, to prove they do not depend on location.
- L-010 (builder): lint rule or grep step failing on `as unknown as` in non-test files.
- L-017 (test-author): a check that `app/e2e/**` and `app/test-harness/e2e/**` contain neither `import.meta` nor `__dirname`; `playwright test --list` in the gate already loads the config, so the grep adds a message only.
- L-018 (test-author): a lint rule flagging `toBe(`/`toEqual(` where the argument name contains `secret`, `token` or `key`.
