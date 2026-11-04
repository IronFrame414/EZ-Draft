# Calculations and rules: walls, rooms and lengths, worked examples

Added by spec-check 4 (Q-0558 to Q-0562, Q-0568). Worked examples for typed lengths, wall size, room area and closure. Statements come from the decisions named; 03g holds the comparison and rounding rule.

**Typed lengths** (Q-0561; 03g: nearest 1/16", halfway goes up; limits Q-0568: above zero, at most 200 ft)

| # | Typed | Result | Stored (inches) | Shown on a plan (1/2") |
| --- | --- | --- | --- | --- |
| 1 | 12'6" | accepted | 150 | 12' 6" |
| 2 | 12' 6 1/2" | accepted | 150.5 | 12' 6 1/2" |
| 3 | 150" | accepted | 150 | 12' 6" |
| 4 | 12.5' | accepted | 150 | 12' 6" |
| 5 | 150 (bare number is inches) | accepted | 150 | 12' 6" |
| 6 | 10' | accepted | 120 | 10' 0" |
| 7 | 6 1/2" | accepted | 6.5 | 6 1/2" |
| 8 | 12'-6" | accepted | 150 | 12' 6" |
| 9 | 12 6 | refused, lists the formats | none | none |
| 10 | 12.33' (rounding: 147.96" to the nearest 1/16") | accepted | 147.9375 | 12' 4" |
| 11 | 11' 11 3/4" (display carries to the next foot) | accepted | 143.75 | 12' 0" |
| 12 | 12' 6 1/4" (exactly halfway on display goes up) | accepted | 150.25 | 12' 6 1/2" |
| 13 | 0" (zero) | refused | none | none |
| 14 | -5" (below zero) | refused | none | none |
| 15 | 200' (maximum) | accepted | 2400 | 200' 0" |
| 16 | 200' 0 1/16" (just over) | refused | none | none |

**Default wall** (Q-0558): 3 1/2" stud + 1/2" drywall + 1/2" drywall = 4 1/2" thick.

**Typed length to outside size** (Q-0559: typed is the inside finished face, thickness goes outside)

| # | Room typed | Inside area | Outside size with default walls |
| --- | --- | --- | --- |
| 1 | 12' × 10' | 120 SF | 12' 9" × 10' 9" |
| 2 | 5' × 8' | 40 SF | 5' 9" × 8' 9" |

**Room area** (Q-0207: whole square feet; Q-0568: halfway goes up)

| # | Inside size | Exact SF | Shown |
| --- | --- | --- | --- |
| 1 | 12' × 10' | 120 | 120 SF |
| 2 | 12' 6" × 10' | 125 | 125 SF |
| 3 | 11' 9 1/2" × 14' (rounds down) | 165.08 | 165 SF |
| 4 | 12' 3" × 10' (exactly halfway) | 122.5 | 123 SF |
| 5 | 200' × 200' (maximum) | 40,000 | 40,000 SF |

**Closure** (Q-0562; Q-0568: closed means within 1/64", 03g, inclusive; a gap shows up to 12", inclusive). Four walls typed east, north, west, south from the start point.

| # | Typed east, north, west, south | Miss | Result |
| --- | --- | --- | --- |
| 1 | 12', 10', 12', 10' | 0 | Closed, room detected, 120 SF |
| 2 | 12', 10', 12', 9' 11 1/2" | 1/2" | Gap shown as 1/2" |
| 3 | 12', 10', 12', 9' 11 15/16" | 1/16" | Gap shown as 1/16" |
| 4 | 12', 10', 12', 9' | 12" | Gap shown as 12" (at the limit) |
| 5 | 12', 10', 12', 8' 11 15/16" | 12 1/16" | No gap shown, unfinished walls, no room |

**Absorbing a gap** (Q-0568: only a wall parallel to the gap). For row 2 above, the gap runs north and south:

| # | Wall picked | Result |
| --- | --- | --- |
| 1 | The 9' 11 1/2" wall | It becomes 10' 0"; the room closes at 120 SF |
| 2 | The 10' wall | It becomes 9' 11 1/2"; the far walls follow so corners stay joined; the room closes at 9' 11 1/2" deep, 119.5 SF, shown as 120 SF |
| 3 | Either 12' wall | Refused with a message: it runs across the gap |

**Keep out of square** (Q-0568). For row 2 above, the area closes the outline across the gap: 120 SF. The override stores who, when and the 1/2" gap on the room. If a later edit changes the gap, the override clears and the gap shows again.

**Moving a wall** (09e; 12 Wall move). 12' × 10' room, east wall moved:

| # | Move | Result |
| --- | --- | --- |
| 1 | 6" east | North and south walls become 12' 6"; corners stay joined; area 125 SF; hosted items stay where they were |
| 2 | 0" | Nothing changes |
