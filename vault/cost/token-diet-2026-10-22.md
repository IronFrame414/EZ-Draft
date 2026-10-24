# Token diet test 2026-10-22

PR IronFrame414/EZ-Draft#1 (`chore/token-diet`) merged into develop 2026-10-22 10:43 UTC (b24c446, 8332e47). Units then ran from Josh's terminal with `node scripts/run.mjs --once` in two loops: 10:44–11:22 UTC (4 units) and 13:23–13:53 UTC (4 units). The second loop ended in a budget hold (weekly usage 80%, `vault/handoff/BUDGET_HOLD.md`); the first loop's terminal output was not kept, so why it ended after 4 units is not recorded. STOP is back in place.

Figures come from `node vault/tools/usage-by-agent.mjs` (list API rates, Max plan, so API-equivalent value, not a bill) and `vault/cost/log.jsonl`. Review results come from the ticket rows in `vault/tickets/STATUS.md` and `vault/handoff/log/2026-10-22-10-57.md`.

## What ran

| Unit | Ticket | Plan format | $ (tool) | Wall | Result |
|---|---|---|---:|---:|---|
| build | EZD-012c | old (plan_lint: no "Do not touch") | $3.55 | 13 m | done |
| build | EZD-014 | old | $3.42 | 9 m | split into 014a/b/c at re-validation (Q-0244); nothing built |
| plan | EZD-014a | new, PLAN LINT OK | $4.10 | 9 m | planned |
| plan | EZD-014b | new, PLAN LINT OK | $3.09 | 7 m | planned |
| plan | EZD-014c | new, PLAN LINT OK | $3.45 | 9 m | planned |
| questions | phase 0 | – | $1.30 | 2 m | ok |
| build | EZD-014a | new | $2.53 | 10 m | done |
| build | EZD-014b | new | $2.73 | 10 m | done |

Total $24.17 (launcher `est_usd` $22.83). 3 tickets built. **Correction to the brief:** only EZD-012c had an old-format plan. EZD-014a and 014b were planned and built today in the new format, so this run measures both the Sonnet orchestrator and the new plan format, on 2 tickets.

## Comparison windows

- **Oct 21** (`--since 2026-10-20T23:55Z --until 2026-10-21T01:40Z`, $32.32): Opus build orchestrator, Sonnet test-author and builder, Opus code-reviewer. Builds that built: EZD-011a, 011b, 011c, 012a, 012b; plus EZD-012 (split only), plans 012a/b/c and 034, one questions unit. The closest match: same phase, same worker models; only the orchestrator and plan format changed.
- **Oct 19 baseline** (`vault/cost/baseline-2026-10-19.md`, $354.98, 83 rows): Opus orchestrator with Fable 5.1 workers for part of the day. Different worker models, so it shows the starting point rather than this change.

## $ per built ticket

| | Today | Oct 21 | Change |
|---|---:|---:|---:|
| Build unit, mean per built ticket | $2.94 (3) | $3.33 (5) | −12% |
| Build unit, new-format tickets only (014a, 014b) | $2.63 | $3.33 | −21% |
| Split-only build unit | $3.42 (EZD-014) | $4.13 (EZD-012) | −17% |
| Plan unit, mean | $3.55 (3) | $2.06 (4) | **+72%** |
| Plan + build, new-format tickets (014a $6.64, 014b $5.81 / 012a $5.18, 012b $6.23) | $6.22 | $5.71 | **+9%** |

Oct 19 baseline, for scale: build units for single tickets ran $1.81–$25.79; build-orchestrator spend alone was $64.20 (18.1%).

## $ by role and model (build units)

| Role | Today $ (4 build units) | per unit | Oct 21 $ (6 build units) | per unit | Change per unit |
|---|---:|---:|---:|---:|---:|
| Orchestrator | $3.46 Sonnet | $0.87 | $9.41 Opus | $1.57 | **−45%** |
| Code-reviewer (Opus) | $3.26 | $0.82 | $3.95 | $0.66 | +24% |
| Planner (re-validation) | $2.64 (Opus $2.15, Sonnet $0.49) | $0.66 | $3.37 Opus | $0.56 | +18% |
| Test-author | $1.12 | $0.28 | $1.85 | $0.31 | −10% |
| Builder | $0.92 | $0.23 | $1.32 | $0.22 | +5% |
| General-purpose + ui-verifier | $0.81 | $0.20 | $0.88 | $0.15 | – |
| **All build roles** | **$12.21** | **$3.05** | **$20.78** | **$3.46** | **−12%** |

The orchestrator went from 45% of build spend (Oct 21) to 28%. Code-reviewer is now the largest build role. By model, all units: Opus $16.58 (68.6%), Sonnet $7.58 (31.4%); Oct 21 Opus 87.4%.

Plan units: orchestrator (Opus) $9.87 + plan-checker (Sonnet) $0.77 for 3 plans ($3.29 + $0.26 per plan), against $8.22 for 4 plans on Oct 21 ($2.06 per plan). The plan orchestrator read 268,773 plan characters across 57 reads in 3 units.

## Quality

| | Today (3 built) | Oct 21 (5 built) |
|---|---|---|
| Test-review FAILs | 1 (014b r1: 4 of 5 CSS files covered) | 3 (011b ×2, 012b ×1) |
| Code-review mode 3 FAILs | 0 | 0 |
| Second rounds | 012c: gate red round 1, PLAN-GAP patch, round 2 green. 014b: test-author fix round | 011b: 2 test rounds; 012b: 1 test round + 2 structural repairs |
| Builder rounds | round 1 only, all 3 | round 1 only, all 5 |
| PLAN-GAP reports | 1 (012c B2, old-format plan); 0 on new-format plans | not a process step yet |

EZD-014b: the builder and test-author could not run Vitest (local Supabase was down); the orchestrator's gate ran `db:up` and passed first time. Worth watching: a builder that cannot run its tests is building blind.

## Wall time

| | Today | Oct 21 |
|---|---:|---:|
| Build unit that built, mean | 11 m | 14 m |
| Plan unit, mean | 8.3 m | 4 m |
| 8 units end to end | 68 m running | – |

## Read

- The Sonnet orchestrator works: 3 tickets built, the EZD-014 split handled correctly, mode 3 PASS on all, and build-orchestrator $ per unit fell 45%. Build units are 12% cheaper per ticket (21% on the 2 new-format tickets).
- The saving is eaten by planning: new-format plans cost 72% more and take twice as long, so plan + build for a ticket is about 9% more than on Oct 21. Planning is now 44% of the window's spend.
- Fewer review FAILs (1 in 3 vs 3 in 5) and zero PLAN-GAPs on new-format plans are early signs the plan format helps quality, but 2–3 tickets is too few to call it.
- Next measurement should cover at least 8–10 built tickets that were planned in the new format, to settle whether the extra planning pays for itself in fewer review rounds.
