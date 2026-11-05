# Cost report, phase 1

Window: 2026-10-24 11:13Z to 2026-11-04 11:38Z (560 launcher rows in `vault/cost/log.jsonl`, 0 missing transcripts). The window is everything run since the phase 0 wrap, so it also holds the Q-0268 fix tickets, the tooling track (EZD-244, 245, 250, 253, 316 and others), phase 2 starts (EZD-110a/b) and the phase 2 questions unit; the log carries no phase column, so a phase-1-only figure cannot be cut. Dollars are API-equivalent list rates (plan runs, not a bill). Sources: `node vault/tools/usage-by-agent.mjs --since 2026-10-24T11:00:00Z` and the log's `est_usd`.

## Totals

| Measure | Transcript $ | Log `est_usd` |
| --- | ---: | ---: |
| Window total | $2275.75 | $2252.40 |
| Fable | $491.54 (21.6%) | $491.54 |
| Opus 5.5 | $1307.78 (57.5%) | |
| Sonnet 5.5 | $454.84 (20.0%) | |
| Haiku 5.5 | $21.59 (0.9%) | |

By unit (log): build $1317.40 (234 rows, median $2.73), plan $625.10 (149, median $3.96), questions $258.85 (136, median $0.34), gate-phase $38.01 (10, median $5.45), review-plans $8.06 (2), repair $4.97 (29). Median unit $2.49; 90th percentile $8.30. Two rows ended `interrupted`; none ended on a limit. Daily spend peaked at $530 (10-25) and $414 (10-24).

## Per ticket (top; whole table: `usage-by-agent.mjs` "$ per ticket")

EZD-153 $109.82 (blocked on Q-0331 after 3 review rounds), EZD-172 $72.09 (13 runs), EZD-148 $68.90, EZD-132 $67.85 (blocked on Q-0312 at first), EZD-103a $55.16, EZD-173 $45.43, EZD-108 $43.52 (10 runs), EZD-250 $40.57, EZD-112 $39.61, EZD-241 $39.24. Phase 2 questions unit ("1" in the table is phase 1's questions plus gate-phase) $277.21 for phase 1: questions $234.74, gate-phase $37.83, review-plans $4.64. Phase 2: questions $21.44, review-plans $2.33.

## Per unit type and role (share of $)

plan unit 27.6% (Opus orchestrator $585.34 alone is 25.7%); build orchestrator 12.8% (Sonnet 9.4%, Opus 3.4%); build code-reviewer 11.5%; questions 11.3%; build planner 10.7% (Opus $125.42, Fable $116.45); build security-reviewer 8.6% (Fable $145.65); build builder 8.1%; build test-author 6.5%; gate-phase 1.7%. Against `baseline-2026-10-19.md`: the plan unit and the build planner are now the two biggest lines (38.3% together); build builder and test-author shrank to 14.6% together. Against phase 0 (`phase-00.md`): plan unit share rose from 16.5% to 27.6%.

## Escalation and model use

- Tier changes: STATUS Notes record them as free text only, so no count is claimed. Seen in the Notes read this session: EZD-102 builder round 2 moved to Fable 5.1 xhigh; EZD-103a/103b ran Fable xhigh reviewers on medium tickets; EZD-153 and EZD-132 blocked and resumed.
- Fable share was 21.6% of the window against 8.9% after v2.4 in phase 0 (`v2.4-comparison.md`): worse than that baseline. Fable ran as build planner ($116.45), questions planner ($65.36), security-reviewer ($145.65), code-reviewer ($95.59), builder ($35.81) and test-author ($5.69). I cannot say how much of it ran on low-complexity tickets, because the log has no tier column; EZD-1707 (low) used Haiku builder and Opus reviewers, as intended.
- Opus on low work: the plan unit's Opus orchestrator ($585.34) is the largest single line. Not split by tier (same reason).
- Haiku failures: none recorded in STATUS Notes this window; Haiku total $21.59 (test-author $12.03, builder $7.06).
- Resumed step-8 reviewer misses (section 8 revisit flag): the gate-phase auditor and security review of phase 1 found zero defects (`vault/tickets/gates/phase-01.md`: READY, PASS in three parts), so none are attributed this phase. The gate record says six realtime/email files in the PR body were not reviewed.

## Weekly ceiling (section 2a rule 9)

`weekly_ceiling_usd_est` is $1160 (`vault/budget.json`); a third is $387. The window spent $2252.40, 1.94 times the weekly ceiling over 11 days. The whole window is over a third; the phase-1-only share is not measurable (no phase column). Recommendation 1 below.

## Meter

`meter_source` on the 560 rows: oauth 384, proxy 173, statusline 3. The rows carry no weekly percentage field, so weekly-limit % per ticket cannot be reported; `oauth-poll.json` last result is `unreadable` (2026-11-04).

## Recommendations (numbered; PROCESS.md changes need Josh's yes)

1. Split the next phase (phase 2 product tickets) into two gate slices, because the window cost more than a third of the weekly ceiling (section 2a rule 9).
2. Add `complexity` and `phase` fields to `vault/cost/log.jsonl` rows so tier and phase costs are countable; today they cannot be cut.
3. Review the plan unit's Opus orchestrator ($585.34, 25.7%): try Sonnet with the Opus advisor on medium and low plans, as build already does.
4. Limit Fable to security-reviewer and phase-auditor on medium and low tickets; Fable planners and code-reviewers on medium tickets (EZD-103a/b) cost $116.45 and $95.59.
5. Set `per_unit_cap_usd_est` from the measured median $2.49 and p90 $8.30; the current $40 is 16 times the median. Josh sets the figure.
6. Record the weekly percentage on each log row so the meter can be reported per ticket.
7. Record reviewer round count and tier changes as fields in `tickets.json` instead of free text, so first-round PASS rate and tier changes can be counted next wrap.

## Automate (proposals; Josh applies)

- L-041 (ratified, seen 5): a lint rule or gate check that fails when a test file reads `docs/*.md`, `CLAUDE.md`, `STATUS.md` or `vault/` (allowed list: secrets-in-docs and migration-list checks).
- L-053 (candidate, scriptable): a gate pre-step that fails a worktree whose branch is behind develop (the EZD-323 failure).
- Candidates seen 2 or more and not yet ratified (L-035, L-042 at 3, L-048): ratify at the next questions unit, then automate.
