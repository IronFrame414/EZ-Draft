# Worked examples · fixtures, existing conditions, tile shower, blocking and bearing walls (phase 10)

Added by spec-check 10 (Q-0704). Phase 10 has no formulas beyond rounding and differences; these are its rules with cases. The rules are in decisions 03-data-model, 05-screens, 09-calculations-and-rules and 10-permissions-and-settings, rows Q-0704. Code values are from `vault/spec/code-rules.json` check text, as the calc-auditor checked them.

## Bearing warning (EZD-215)

| # | Case | Result | Source |
| --- | --- | --- | --- |
| 1 | Bearing wall deleted | Deleted; 1 engineer_note, warning on | Q-0205; Q-0704 |
| 2 | Non-bearing wall deleted | Deleted; no note | S03:154 |
| 3 | Bearing wall set to Demo, then deleted | 2 notes (one per action) | Q-0704 |
| 4 | Delete undone | Wall and note both gone (one undo step) | Q-0704 |
| 5 | Note saved with an empty engineer name | Refused | phase-02.md:33 |
| 6 | Note with name and approval text | Warning cleared | Q-0205; Q-0704 |

## Utilities to move (EZD-234)

| # | Case | Result | Source |
| --- | --- | --- | --- |
| 1 | Range with a gas and an electric point moved 24" | List of 2, each with its distance | S03:157 |
| 2 | Refrigerator with no linked points moved | No list | S03:157 |
| 3 | Appliance clicked without dragging (moved 0") | No list | 09e:7 |
| 4 | Linked appliance deleted | Points stay, unlinked | Q-0704 |
| 5 | Electric point 240 V / 50 A; 120 V / 20 A; 0 A | Saved; saved; refused | 09b:35; Q-0704 |

## Floor level (EZD-229)

Stored to 1/16" with the 03g halfway rule; no limit.

| # | Typed | Stored | Source |
| --- | --- | --- | --- |
| 1 | 0.7" | 11/16" (0.6875) | 03g; 03b rule 5 |
| 2 | 0 | 0 | Q-0704 |
| 3 | −1/32" | 0 (halfway goes up) | 03g |
| 4 | −3/32" | −1/16" | 03g |
| 5 | 8" | 8" (stored; step checks warn in Check, R3-092, R3-093, R3-099) | Q-0704 |

## Transitions (EZD-229)

| # | Rooms meeting | Result | Source |
| --- | --- | --- | --- |
| 1 | 0 and 3/4" through a door | 1 transition, labelled 3/4" | phase-02.md:50 |
| 2 | 1/2" and 1/2", same finish | None | Q-0704 |
| 3 | −1/2" and 1/4" | 1 transition, 3/4" | Q-0704 |
| 4 | Same level, tile and wood, open plan with no wall | 1 transition along the shared edge, no level label | 03f:15; Q-0704 |

## Tile shower (EZD-226)

Stored at any positive size; code limits warn later.

| # | Case | Result | Source |
| --- | --- | --- | --- |
| 1 | 60" × 36" | 2,160 sq in, least 36"; passes P-035 | P-035 |
| 2 | 30" × 30" | 900 sq in, exactly the minimum | P-035 |
| 3 | 52" × 25" | 1,300 sq in with 25" least; passes the P-035 alternative | P-035 |
| 4 | 24" × 24" | 576 sq in; saves; Check warns later | 09e:12 |
| 5 | Curb 2" or 9" above the drain | At the P-044 minimum or maximum | P-044 |
| 6 | Curb none | Curbless (curb null) | P-044 |
| 7 | Pan slope not set | 1/4" per ft (P-045 range 1/4" to 1/2") | P-045 |
| 8 | 0, 1 or 2 niches | Niche count 0, 1 or 2 | 03f:10 |
| 9 | Width 0" | Refused | Q-0704 |

## Blocking (EZD-227)

| # | Case | Result | Source |
| --- | --- | --- | --- |
| 1 | Length 24", height 34" | Saved (test values, not defaults) | Q-0704 |
| 2 | Length 0" | Refused | Q-0704 |
| 3 | Height left empty | Refused (required, no default) | Q-0704 |
| 4 | Wall moved without the blocking selected | Blocking stays, flagged "Not on a wall" | S03:152; Q-0630 |
