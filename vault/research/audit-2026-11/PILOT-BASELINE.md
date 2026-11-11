# Planning-method pilot: baseline before the change (written 2026-11-11, session 17)

PLANNING-REDESIGN.md 1.5 says: pilot the new planning method on phase 6, compare with phases 2 to 5, and keep it if kinds c, d, e and i fall by half or more. These are the "before" numbers, fixed now so the comparison is not rebuilt later.

## Source counts (PLANNING-REDESIGN.md 1.1, one phase-auditor over STATUS.md, phases 2 to 5 plus EZD-5601)
| Kind | Items | Per done ticket (79) |
| --- | --- | --- |
| (c) missed connections, incl. 8 later fix tickets | 31 | 0.39 |
| (d) database detail missing or wrong | 12 | 0.15 |
| (e) screen or interaction detail missing | 18 | 0.23 |
| (i) behaviour or edge case never decided | 18 | 0.23 |
| c + d + e + i | 79 | 1.00 |
| all kinds (a to i) | 237 | 3.00 |

Done tickets, phases 2 to 5, from vault/tickets/STATUS.md on 2026-11-11 (status `done`, all tracks): phase 2: 19, phase 3: 19, phase 4: 33, phase 5: 8; total 79. The audit's counts may be off by about two each (PLANNING-REDESIGN.md 1.1).

## Cost (PLANNING-REDESIGN.md 1.5, vault/cost/log.jsonl)
- Plan unit median: $3.81 est_usd per successful plan unit (308 units).
- Ticket median: $7.81 est_usd per fix ticket.
- Split re-plans: 47. Re-validations: 96. Fix tickets from missed connections: 8.

## What the pilot records for each phase 6 ticket
Deviations of each kind (a to i) from its STATUS note and plan, PLAN-GAPs, re-plans, re-validations, fix tickets it causes, and est_usd for its plan units and build. Pass mark: kinds c + d + e + i per done ticket at 0.50 or below.

## Running log (session 17)
| Ticket | Template | Planner turns | Plan size | Plan-checker gaps | Deviations at build | Fix tickets caused | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EZD-382 | v1 (built the v2 template) | 40 + resume | 29k | 2 (r1), READY r2 | 1 (a test pin the plan missed, kind c) | 0 | gate red 4 times for causes outside the ticket |
| EZD-386 | v1 | 40 + resume | 15.5k | READY r1 | 1 (a Verify-with claim, kind f) | 0 | |
| EZD-387 | v1 | under 40 | 11k | READY r2 | 0 | 0 | |
| EZD-383 | v2 (first) | 100 + resume | 93k | 18 (r1) | 2 in-place minor (kind i), 2 notes | 0 | contract and connections checks passed on its own plan |

Launcher plans dated 2026-11-11 (after EZD-382): every full plan carries the v2 marker; 4 of 11 were split proposals (EZD-105, 106, 116, 125), found only after a planner run (P1 is EZD-384).
Phase 6 pilot: EZD-135, 224 and 235 re-planned now (every dependency done); EZD-214, 216, 218, 237 and 6001 wait for their dependencies, then the code-bound step.

### Phase 6 re-plan (session 17, 2026-11-11)
| Ticket | Result | Planner turns | Plan size | Checks found and fixed | Plan-checker gaps (r1, r2) | Security read at plan stage | Connections the v1 plan missed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EZD-135 | full v2 plan | about 112 plus 2 resumes | 74.7k | contract 8, connections 9 | 13, 9 | PASS (1 note) | money page count 35 to 36; DISCLAIMER_PAGES row |
| EZD-224 | split, then part a v2 plan | 24 (split) + about 115 plus 4 resumes | 25k split; 80.5k part a | lint 1, contract 12, connections 10 | 12, 8 | FAIL then fixed: type check only with a declared type; leftover object owner (EZD-123 row edited); writer guard trigger; then tenancy.test.ts:199 | stale hook location; card needs 'use client' |
| EZD-235 | split, then part a v2 plan | 38 (split) + about 60 plus 2 resumes | 22.6k split; about 60k part a | none on first run | 7, 4 | not needed (no database) | money page count if a dev page is added (avoided); 3 pinned perf counts; createPlanController scale option |
| EZD-384 | split proposal (tooling) | one run | | | | | |

Findings for the next audit:
- v2 product plans need more than 100 planner turns; the plan-checker's 60 and the security-reviewer's 30 are also too few for 60-80k plans.
- Launcher v2 plans cost about $10 to $15 each (EZD-104, 105b, 111, 126, 128), against a $3.81 median before.
- Split proposals are common (6 of about 16 tonight); P1 (EZD-384) should find them before a full plan.
- The plan-stage security read found 3 real defects in EZD-224 before any code: the method's intended gain.
- Lettered test cases make test counts rise (EZD-135: 46); the 25-test split line needs a counting rule.
