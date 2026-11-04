# Calculations and rules: walls, rooms and lengths, worked examples

Added by spec-check 4 (Q-0558 to Q-0562, Q-0568 to Q-0570). Worked examples for typed lengths, wall size, room area and closure. Statements come from the decisions named; 03g holds the comparison and rounding rule.

**Typed lengths** (Q-0561; 03g: nearest 1/16", halfway goes up; limits Q-0568, Q-0570: wall and room fields only, above zero, at most 200 ft, checked after rounding)

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
| 13 | 0" (zero, in a wall or room field; other fields accept it, 03g row 9) | refused | none | none |
| 14 | -5" (below zero) | refused | none | none |
| 15 | 200' (maximum) | accepted | 2400 | 200' 0" |
| 16 | 200' 0 1/16" (just over) | refused | none | none |
| 17 | 0 1/64" (rounds to 0") | refused | none | none |
| 18 | 200' 0 1/64" (rounds down to 200') | accepted | 2400 | 200' 0" |
| 19 | 200' 0 1/32" (halfway goes up, over the limit) | refused | none | none |
| 20 | 12 1/2 | accepted | 12.5 | 1' 0 1/2" |
| 21 | 6-1/2" | accepted | 6.5 | 6 1/2" |
| 22 | 6.5" | accepted | 6.5 | 6 1/2" |
| 23 | 12' 6 | accepted | 150 | 12' 6" |
| 24 | 12’6” (curly marks) | accepted | 150 | 12' 6" |

**Default wall** (Q-0558): 3 1/2" stud + 1/2" drywall + 1/2" drywall = 4 1/2" thick.

**Typed length to outside size** (Q-0559: typed is the inside finished face, thickness goes outside)

| # | Room typed | Inside area | Outside size with default walls |
| --- | --- | --- | --- |
| 1 | 12' × 10' | 120 SF | 12' 9" × 10' 9" |
| 2 | 5' × 8' | 40 SF | 5' 9" × 8' 9" |

**Thickness side** (Q-0569 b)

| # | Wall | Thickness goes |
| --- | --- | --- |
| 1 | Lone wall drawn east | South, the right side of the drawing direction |
| 2 | Chain drawn east, north, west, south, once closed | Outside the room, which is already its right side |
| 3 | Chain drawn clockwise, once closed | Moves to outside the room |
| 4 | Partition inside a room | Centered on the line drawn: 2 1/4" each side |

**Turn angle** (Q-0560; Q-0570)

| # | Typed | Result |
| --- | --- | --- |
| 1 | 90 after a wall | Square corner; cursor side picks left or right |
| 2 | 45 after a wall | 45° turn |
| 3 | 0 after a wall | Straight on |
| 4 | 12.5 | Accepted as typed |
| 5 | 90 on a first wall | Measured from the page's horizontal; cursor side picks up or down |
| 6 | 180 | Refused: it folds back on the last wall |
| 7 | 200 | Refused |
| 8 | -90 | Refused |

**Snapping** (Q-0569 a; Q-0570: within 10 screen pixels or 5°; priority endpoints, midpoints, wall faces, 90/45°, increment)

| # | Cursor | Result |
| --- | --- | --- |
| 1 | 6 pixels from a wall's endpoint | Snaps to the endpoint |
| 2 | 15 pixels from any endpoint, midpoint or face | No object snap; the increment applies |
| 3 | 6 pixels from both an endpoint and a midpoint | Endpoint wins |
| 4 | Wall drawn 87° from the last wall | Snaps to 90° |
| 5 | Wall drawn 43° from the last wall | Snaps to 45° |
| 6 | Wall drawn 80° from the last wall | No angle snap |
| 7 | 37.3" along, increment only | Snaps to 37 1/2" |
| 8 | 37.2" along, increment only | Snaps to 37" |

**Room area** (Q-0207: whole square feet; Q-0568: halfway goes up)

| # | Inside size | Exact SF | Shown |
| --- | --- | --- | --- |
| 1 | 12' × 10' | 120 | 120 SF |
| 2 | 12' 6" × 10' | 125 | 125 SF |
| 3 | 11' 9 1/2" × 14' (rounds down) | 165.08 | 165 SF |
| 4 | 12' 3" × 10' (exactly halfway) | 122.5 | 123 SF |
| 5 | 200' × 200' (maximum) | 40,000 | 40,000 SF |
| 6 | 6" × 6" (smallest shown rounds to zero) | 0.25 | 0 SF |
| 7 | L shape: 12' × 10' with a 4' × 3' corner out | 108 | 108 SF |
| 8 | Right triangle with 12' and 10' sides | 60 | 60 SF |
| 9 | 12' × 10' split by a partition centered 5' from the west face (Q-0569 b): west room 57.75" × 120" | 48.125 | 48 SF |
| 10 | The same partition, east room 81.75" × 120" | 68.125 | 68 SF |

**Closure** (Q-0562; Q-0568: closed means within 1/64", 03g, inclusive; a gap shows up to 12", inclusive). Four walls typed east, north, west, south from the start point.

| # | Typed east, north, west, south | Miss | Result |
| --- | --- | --- | --- |
| 1 | 12', 10', 12', 10' | 0 | Closed, room detected, 120 SF |
| 2 | 12', 10', 12', 9' 11 1/2" | 1/2" | Gap shown as 1/2" |
| 3 | 12', 10', 12', 9' 11 15/16" | 1/16" | Gap shown as 1/16" |
| 4 | 12', 10', 12', 9' | 12" | Gap shown as 12" (at the limit) |
| 5 | 12', 10', 12', 8' 11 15/16" | 12 1/16" | No gap shown, unfinished walls, no room |
| 6 | 12', 90, 10', 90, 11' 11 1/2", 90, 9' 11 1/2" | 1/2" each way, 0.71" straight | Gap shown as 11/16"; only Keep out of square is offered (Q-0569 c) |
| 7 | Miss of 8 1/2" each way | 12.02" straight | No gap shown, unfinished walls |
| 8 | A computed miss of 0.02" | 0.02" | Gap shown as 1/16", never 0" (Q-0570) |
| 9 | One 10" wall, or two walls, ending within 12" | under 12" | No gap: fewer than three walls (Q-0570) |

**Absorbing a gap** (Q-0568: only a wall parallel to the gap). For row 2 above, the gap runs north and south:

| # | Wall picked | Result |
| --- | --- | --- |
| 1 | The 9' 11 1/2" wall | It becomes 10' 0"; the room closes at 120 SF |
| 2 | The 10' wall | It becomes 9' 11 1/2"; the far walls follow so corners stay joined; the room closes at 9' 11 1/2" deep, 119.5 SF, shown as 120 SF |
| 3 | Either 12' wall | Refused with a message: it runs across the gap |
| 4 | A wall of another room | Refused (S02 Decisions) |
| 5 | The 12" wall of a 12', 12", 12' chain, 12" miss | Refused: it would become 0"; Keep out of square stays offered (Q-0570) |

**Keep out of square** (Q-0568). For row 2 above, the area closes the outline across the gap: 120 SF. The override stores who, when and the 1/2" gap on the room. If a later edit changes the gap, the override clears and the gap shows again.

**Moving a wall** (09e; 12 Wall move). 12' × 10' room, east wall moved:

| # | Move | Result |
| --- | --- | --- |
| 1 | 6" east | North and south walls become 12' 6"; corners stay joined; area 125 SF; hosted items stay where they were |
| 2 | 0" | Nothing changes |
| 3 | 12' west, leaving the connected walls at 0" | Refused (Q-0570) |
