# Cost report, phase 2

Window: 2026-11-04 11:38Z (phase 1 wrap) to 2026-11-05 14:52Z: 74 launcher rows in `vault/cost/log.jsonl`, 0 missing transcripts, all `meter_source` proxy. The log has no phase column, so the window also holds the phase 3 and phase 4 questions and planning (EZD-120a to d, 202, 203, 205 to 207, 209, 210, 221, 236, 238) and the overseer repairs; those cannot be cut out of the total. Dollars are API-equivalent list rates (plan runs, not a bill). Sources: `node vault/tools/usage-by-agent.mjs --since 2026-11-04T11:38:00Z` and the log's `est_usd`. The wrap row itself ($0.71 at the time of counting) is included.

## Totals

| Measure | Transcript $ | Log `est_usd` |
| --- | ---: | ---: |
| Window total | $211.34 | $204.81 |
| Fable | $11.82 (5.6%) | $11.82 |
| Opus 5.5 | $155.26 (73.5%) | |
| Sonnet 5.5 | $43.83 (20.7%) | |
| Haiku 5.5 | $0.42 (0.2%) | |

By unit (log): plan $102.89 (20 rows, median $5.05), build $69.03 (15, median $2.63), questions $18.79 (19, median $0.29), gate-phase $6.56 (2), review-plans $3.88 (2), repair $2.96 (15), wrap $0.71 (1). Median unit $1.35; 90th percentile $7.74. Outcomes: 73 `ok`, 1 `error:success` (build EZD-268, `vault/handoff/last-failure.json`: the orchestrator ended with the test-author still running in the background; EZD-268 is `done`).

## Per ticket (top; whole table: `usage-by-agent.mjs` "$ per ticket")

Build: EZD-117b $26.40 (3 runs), EZD-133 $8.40 (plus plan $8.14), EZD-118 $15.34, EZD-117a $4.84, EZD-252 $3.75, EZD-251 $3.43, EZD-201 $2.16, EZD-332 $2.30, EZD-325 $2.18, EZD-330 $1.57, EZD-326 $1.24, EZD-335 $0.89, EZD-268 $0.46. Plan unit (phase 3 and 4 tickets): EZD-120b $11.53, EZD-120c $9.81, EZD-120a $8.71, EZD-120d $8.37, EZD-221 $6.76, EZD-236 $5.36, EZD-209 $5.34, EZD-238 $5.15, EZD-202 $5.03, EZD-203 $4.19, EZD-206 $3.52, EZD-207 $3.49, EZD-205 $2.75, EZD-210 $2.71. Questions units: phase 3 $11.38, phase 4 $6.23, phase 2 $2.24. Gate-phase 2: $6.61 (phase-auditor Fable $4.05).

## Per unit type and role (share of $)

plan unit 48.7% (Opus orchestrator $100.25 alone is 47.4%); questions 9.7%; build orchestrator 7.4% (Sonnet); build builder 6.7%; build code-reviewer 6.1% (Opus); build planner 5.4% (Opus); build test-author 4.2%; build security-reviewer 3.6% (Fable $7.01); gate-phase 3.1%; review-plans 1.8%; repair 1.6%; build ui-verifier 0.8%; wrap 0.4%. Against phase 1 (`phase-01.md`): the plan unit share rose from 27.6% to 48.7%, because this window has 20 plan runs against 15 build runs; build builder and test-author fell to 10.9% together (14.6% in phase 1). The Opus orchestrator on the plan unit is still the largest line (phase 1: $585.34, 25.7%).

## Escalation and model use

- Tier changes (STATUS Notes, read this session for EZD-117b only): EZD-117b builder ran Opus medium round 1, high round 2 and the fix round; the planner patched the plan twice (B12, B13, `.newButton`) after the code-reviewer found 44 px tap areas; the advisor advised no tier move. EZD-117a went to review round 4 (security-reviewer: migration order and cursor bounds, `findings.jsonl`). I did not read the Notes of the other tickets, so no count of tier changes is claimed.
- Fable: $11.82 of the window (5.6%), against 21.6% in phase 1 and 8.9% in the phase 0 v2.4 window (`v2.4-comparison.md`): better than both. It ran as security-reviewer on EZD-117a, 118, 133, 252 ($7.01) and as phase-auditor ($4.81 across gate-phase and questions). Fable did not run as planner or builder this window.
- Opus on low-complexity work: build builder Opus $13.83, mostly high-tier tickets (EZD-117a/b, 118); EZD-252 ran Opus builder and test-author (tier not read). Low fix tickets EZD-325, 326, 330, 332, 335 used Haiku builders and test-authors (dispatch table in `usage-by-agent.mjs`) with Opus medium code-reviewers, as intended. Not split by tier (no tier column in the log).
- Haiku failures: a search of the STATUS Notes of EZD-117a, 117b, 118, 330, 332 and 335 for a Haiku failure, redo or escalation found none (other tickets not searched); Haiku total $0.42.
- Resumed step-8 reviewer misses (section 8 revisit flag): the gate-phase auditor and security review of phase 2 found no defects and made no fix tickets (`vault/tickets/gates/phase-02.md`: READY, PASS, PASS, debt D-086 low), so none are attributed. Josh has not yet worked the six-item punch list (all boxes unchecked on PR 5, no comments from him); no problem is traced to a ticket yet. The phase PR CI gate itself failed twice and needed EZD-334 (ledger test copies, B6 wait) and EZD-336 (job timeout 45 minutes), which is build-system cost, not a ticket miss.

## Weekly ceiling (section 2a rule 9)

`weekly_ceiling_usd_est` is $1160 (`vault/budget.json`); a third is $387. The window spent $204.81 over about 27 hours, 17.7% of the ceiling, so the phase is under a third. No split recommended on cost grounds.

## Meter

`meter_source` is `proxy` on all 74 rows; the rows carry no weekly percentage, so weekly-limit % per ticket cannot be reported (`oauth-poll.json` was `unreadable` at the phase 1 wrap; not re-checked).

## Outside fixes (Q-0274)

EZD-141 (supabase/auth#2852): `gh issue view 2852 -R supabase/auth --json state` returns OPEN on 2026-11-05. Still open; the ticket stays `blocked`. EZD-276 stays `blocked` (put off by Josh 2026-11-03). EZD-327 stays `blocked` (duplicate of EZD-326, nothing to build; Josh can drop it).

## Lessons (wrap step)

`findings.mjs repeats` listed eight categories. Five got new candidate planner lessons with a `Plan check:` line (L-057 scope-missing, L-058 contract-gap, L-059 error-handling, L-060 architecture-rule, L-061 security) and three raised `seen` on lessons that already state the rule (test-defect to L-034, now 2; test-missing and test-weak to L-050, now 3). Each category was then covered with `findings.mjs cover`; inside a unit that call is queued in the results file and the launcher applies it, so `repeats` still lists them until it does. Candidates L-057 to L-061 are ratified or rejected at the next questions unit.

Consolidation to about 30 entries per file was **not** done for `planner.md` (46 entries, 71,363 characters). Reason: `findings.jsonl` lines carry planner lesson IDs (21 IDs in use, e.g. L-047 on 20 lines, L-029 on 14), and `findings.mjs` (`lineProblem`) rejects a log line whose lesson is not a heading in `planner.md`, so deleting or renumbering a referenced entry breaks `next_ticket.mjs --check`. The other role files are under 30 (test-author 11, builder 4, orchestrator 2, reviewer 2). See recommendation 4.

## Recommendations (numbered; PROCESS.md changes need Josh's yes)

1. Keep the Haiku builder and test-author on low fix tickets and the Sonnet orchestrator with the Opus advisor on build; this window's build median ($2.63) is below phase 1's ($2.73).
2. The plan unit's Opus orchestrator is 47.4% of the window ($100.25). Try Sonnet with the Opus advisor on medium and low plans, as build already does (same as phase 1 recommendation 3, not yet done).
3. Add `complexity` and `phase` fields to `vault/cost/log.jsonl` rows so tier and phase costs are countable (phase 1 recommendation 2; the phase 3 and 4 planning in this window could not be separated).
4. Let `findings.mjs` accept a lesson ID that `planner.md` has merged into another entry (a one-line `merged-into: L-nnn` map), so the wrap can merge `planner.md` to about 30 entries without breaking the log. Tooling is frozen (rule 18), so this needs Josh's yes on a one-line why: the planner file is 71 KB and every plan dispatch reads the area-filtered part of it. Cost: one small tool change and a test.
5. `per_unit_cap_usd_est` is $40 against a measured median $1.35 and p90 $7.74 in this window ($2.49 and $8.30 in phase 1). Josh sets the figure.
6. Record reviewer round count and tier changes as fields in `tickets.json` (phase 1 recommendation 7), so first-round PASS rate and tier changes are countable. Today the only round signal is `findings.jsonl`.

## Automate (proposals; Josh applies)

- L-041 (ratified, seen 5): a lint rule or gate check that fails when a test file reads `docs/*.md`, `CLAUDE.md`, `STATUS.md` or `vault/` (allowed list: secrets-in-docs and migration-list checks). Carried from phase 1.
- L-053 (ratified, scriptable): a gate pre-step that fails a worktree whose branch is behind develop. Carried from phase 1.
- L-060 (candidate, scriptable): a gate check that fails a new migration whose timestamp sorts before the newest migration on develop (EZD-117a), and a touch-target test that enumerates every `.linkButton` and `.iconButton` class in CSS modules.
- L-042 (ratified, seen 3), L-050 (ratified, seen 3): not scriptable as a check; they stay as plan-checker items.
