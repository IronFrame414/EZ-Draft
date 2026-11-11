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
