# Usage report, 2026-10-19
Sources: `vault/cost/log.jsonl` (LOG) and `vault/tickets/STATUS.md` Notes (ST). "Day" = LOG `ts` starting `2026-10-19` (UTC, as logged). Six units stamped 2026-10-20 ($21.45) are left out. All dollars are the launcher's estimates (`est_usd`). Review and test-author sessions run inside the build unit; LOG has no separate review rows and no review-plans unit today.
## 1. Totals
**83 units, $337.80, 320 minutes of logged run time.** Full per-ticket table (32 rows): `side-session-notes/.../usage-per-ticket-2026-10-19.md`.

By kind: build 47 units $255.41 (avg 5.43); plan 28 units $63.51 (avg 2.27); questions 8 units $18.87 (avg 2.36); review-plans 0.
LOG records models per unit, not dollars per model, except `fable_est_usd`. So the split is by which models a unit used:

| Models in the unit | Units | $ |
|---|---|---|
| Fable (with Opus, some Haiku) | 10 | 142.02 (Fable's own part: 117.97 = 34.9%) |
| Opus + Sonnet (some Haiku), no Fable | 23 | 79.42 |
| Opus only | 43 | 95.31 |
| Opus + Haiku | 7 | 21.05 |
## 2. Ten most expensive units (all builds; together $145.06 = 43% of the day)
| # | Ticket | $ | Turns | Min | Fable |
|---|---|---|---|---|---|
| 1 | EZD-023a | 25.79 | 8 | 1.5 | yes |
| 2 | EZD-006 | 23.39 | 7 | 2.0 | yes |
| 3 | EZD-001 | 19.58 | 14 | 1.8 | yes |
| 4 | EZD-023d | 17.46 | 8 | 1.7 | yes |
| 5 | EZD-004a | 14.77 | 11 | 1.5 | yes |
| 6 | EZD-023b | 11.67 | 7 | 1.3 | yes |
| 7 | EZD-005a | 9.75 | 1 | 0.1 | yes |
| 8 | EZD-002 | 7.78 | 1 | 0.1 | no |
| 9 | EZD-000 | 7.64 | 19 | 17.4 | yes |
| 10 | EZD-005b | 7.22 | 24 | 13.3 | yes |
## 3. Built tickets (grouped; plan + questions share + split share + build, $)
Rounds are from ST. Build rounds happen inside one build unit, so a second round cannot be priced alone. Split share = the parent's split-build unit divided over its children.

| Tickets | Split? | Plan | Qs | Split | Build | Total | Build rds | Review FAILs (test/code/security) | Overhead > build |
|---|---|---|---|---|---|---|---|---|---|
| EZD-000 | no | 0 | 0 | 0 | 14.91 | 14.91 | 1 | 0 | no |
| 000b-000i (8) | yes, from 000b | 16.54 | 4.57 | 0.63 | 22.23 | 43.97 | 1; 000f, 000h 2 | 000f 1/1/0, 000h 0/1/0 | no (21.74 vs 22.23); 000b,c,d,g yes |
| EZD-000j | no | 1.88 | 1.19 | 0 | 2.40 | 5.47 | 1 | 0 | yes (3.07) |
| 001, 002, 003, 006, 022 | no | 0 | 0 | 0 | 19.58, 7.78, 4.28, 23.39, 3.87 | 58.90 | 1 each | 002: 3 test rounds + security FAIL | no |
| EZD-023a | no | 0 | 0 | 0 | 25.79 | 25.79 | 2 | 0/1/1 | no |
| 004a-c (3) | yes | 5.98 | 1.48 | 4.03 | 22.90 | 34.38 | 1 | 004a 1/0/0, 004b 1/0/0 | no |
| 005a-b (2) | yes | 3.25 | 1.25 | 3.68 | 16.97 | 25.15 | 1 | none | no |
| 008a-b (2) | yes | 4.57 | 2.24 | 3.55 | 7.47 | 17.83 | 008a 2, 008b 1 | 008a 0/1/0, 008b 1/0/0 | yes (10.36 vs 7.47) |
| 010a-c (3) | yes | 6.17 | 1.21 | 3.90 | 10.17 | 21.46 | 010b 2, others 1 | 010b 1/1/0 | yes (11.28 vs 10.17) |
| 023b-d (3) | yes | 11.97 | 4.24 | 7.06 | 34.68 | 57.95 | 023d 2, others 1 | 023c 1/0/0, 023d 0/1/0 | no (23.27 vs 34.68); 023c yes |
| 026a,c,d (3) | yes | 5.16 | 1.27 | 3.53 | 7.55 | 17.51 | 1 | 026d 1/0/0 | yes (9.97 vs 7.55) |

Per-ticket flags (detail file): overhead beat build on 13 of 32 tickets: 000b, c, d, g, j; 008a, b; 010a, c; 023c; 026a, c, d. Not built today but paid for: 023e (plan 4.96 + questions share 1.41), 007 (split build 5.06 + 007a plan 3.03).
## 4. Repeat work (same ticket, same kind, more than once; or split parents)
| What | Units | $ |
|---|---|---|
| 8 split-parent builds (004, 005, 008, 010, 023b-first, 026a-first, 000b-first, 007) | 8 | 31.44 |
| EZD-000: one build stopped by weekly limit (4.74) + six builds of $0.25-0.60 at 01:40-01:44Z (2.53; LOG and ST do not say why) | 7 | 7.27 |
| EZD-000b second plan | 1 | 1.23 |
| **Total** | 17 | **39.94 (11.8% of day)** |
## 5. Observations (no recommendations)
1. Fable was 10 of 83 units but 42% of dollars ($142.02); a Fable unit averages $14.20 against $3.45 for the 23 Sonnet-build units. Review FAILs hit 3 of the 9 Fable-built tickets and 9 of the 23 others (12 of 32 overall, ST).
2. Splitting cost $31.44 in parent builds, 9.3% of the day, before the children's own plans ($63.51 across all plans). For 13 tickets, plan + questions + split share exceeded the build.
3. $7.27 went to units that built nothing: the weekly-limit stop (4.74) and six sub-$1 EZD-000 starts (2.53).
4. EZD-005a ($9.75) and EZD-002 ($7.78) show 1 turn in 0.1 minute. LOG does not show where those dollars went, so treat those two figures as unchecked.
5. 12 of 32 tickets had a review FAIL and 6 needed a second build round (per-ticket file).
