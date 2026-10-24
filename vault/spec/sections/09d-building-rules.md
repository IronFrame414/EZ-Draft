# Calculations and rules: building rules
<!-- Moved word for word from vault/spec/sections/09-calculations-and-rules.md lines 89-120 (Q-0218). Check: node --test scripts/spec/split.test.mjs -->

**Building rules (Florida Building Code, Residential): first sample, superseded by the catalog**

| Rule | Applies to | Check | Section |
| --- | --- | --- | --- |
| B-01 Ceiling height | Habitable rooms and hallways; bathrooms, toilet rooms and laundry rooms | 7'0" in habitable rooms and hallways; 6'8" in bathrooms, toilet and laundry rooms; beams and girders spaced at least 36" apart may come down to 6'6" (6'4" only in a basement); under a sloped ceiling at least half the required floor area is at 7'0" and none of it under 5'0" | R305.1 |
| B-02 Ceiling height at shower | Showers and tubs with a showerhead | 6'8" over a 30" x 30" area at the showerhead | R305.1 |
| B-03 Room size | Habitable rooms other than kitchens | At least 70 sq ft and 7 ft in every horizontal direction; floor under a ceiling lower than 5 ft is not counted | R304 |
| B-04 Light and ventilation | Habitable rooms | Window glass at least 8% of the floor area and openable area at least 4%, unless the room is marked as mechanically ventilated and lit (9th Edition: R303.1.1 and R303.1.2) | R303.1 |
| B-05 Bathroom ventilation | Bathrooms and toilet rooms | A window of 3 sq ft with half openable, or an exhaust fan to the outdoors of 50 cfm (20 cfm if it runs continuously) | R303.3, Table M1507.4 |
| B-06 Kitchen exhaust | Kitchens | Where the kitchen relies on exhaust instead of 4% openable window area: 100 cfm (25 cfm continuous). A hood over 400 cfm needs makeup air; in a single-family house Florida allows up to 800 cfm without it when no gravity-vented appliance is in the conditioned space | R303.1, Table M1507.4, M1503.4 |
| B-07 Toilet clearances | Each toilet and bidet | Centerline at least 15" from a side wall, partition, vanity or tub, and 30" center to center from the next fixture; at least 21" clear in front | R307.1, P2705.1 |
| B-08 Lavatory clearances | Each lavatory | Centerline at least 15" from a side wall, partition or vanity and 30" center to center from the next fixture; at least 21" clear in front. The code gives no front clearance for a tub; the Defaults value applies there | R307.1 |
| B-09 Shower size and access | Each shower | At least 900 sq in inside with 30" in every direction; an access opening at least 22" clear; 24" clear in front of the opening | P2708.1, R307.1 |
| B-10 Shower and tub walls | Walls of showers and of tubs with a showerhead | A nonabsorbent finish to at least 6 ft above the floor | R307.2 |
| B-11 Safety glass in doors | Glass in swinging, sliding and bifold doors | Marked as safety glazing | R308.4.1 |
| B-12 Safety glass beside doors | Glass within 24" of either side of a closed door in the same plane, or on a wall at less than 180 degrees to it within 24" of the hinge side of an in-swinging door, with its bottom lower than 60" above the floor | Marked as safety glazing | R308.4.2 |
| B-13 Safety glass, large panes | Panes over 9 sq ft with the bottom lower than 18", the top higher than 36" and a walking surface within 36" | Marked as safety glazing | R308.4.3 |
| B-14 Safety glass in wet areas | Glass in or facing a tub or shower, bottom lower than 60" above the standing surface and within 60" of the water's edge | Marked as safety glazing | R308.4.5 |
| B-15 Emergency escape opening | Each sleeping room | An opening of at least 5.7 sq ft net clear (5.0 at grade), 24" high and 20" wide, with its sill no higher than 44" above the floor. A replacement window in an existing opening is exempt when it is the largest standard size that fits. Florida also lets the opening face a screen enclosure that has a screen door | R310.1, R310.2.1 to R310.2.3, R310.2.6 |
| B-16 Egress door | The dwelling | One side-hinged exit door with 32" clear width and 78" clear height | R311.2 |
| B-17 Hallway width | Hallways | At least 36" | R311.6 |
| B-18 Bathroom door, Florida | New dwellings only: a bathroom on the habitable grade level | A door with a 29" clear opening to at least one such bathroom | R320.1.1 |
| B-19 Smoke alarms | The dwelling, triggered by any permitted alteration | One in each sleeping room, one outside each sleeping area and one on each story; at least 3 ft from a bathroom door; clear of cooking appliances (8th Edition: 20 ft ionization, 10 ft with a silence switch, 6 ft photoelectric; 9th Edition: 10 ft for every type, 6 ft where needed to place a required alarm). The 9th Edition adds an attached garage and a room open to a sleeping loft. Exterior-only, plumbing and mechanical work do not trigger it. Ten-year sealed-battery alarms are allowed for a repair or Level 1 alteration | R314.2.2, R314.3, R314.3.1, R314.6 |
| B-20 Carbon monoxide alarms | New buildings and additions with a fuel-fired appliance, a fireplace or an attached garage (an interior alteration alone does not trigger it) | One within 10 ft of each sleeping room | R315; Florida Statutes 553.885 |
| B-21 Garage separation | Walls and doors between a garage and the dwelling | Door of 1-3/8" solid wood or steel, or 20-minute rated; no opening from a garage into a sleeping room; 1/2" gypsum board on the garage side | R302.5, R302.6 |
| B-22 Clearance above a cooktop | Cabinets and combustibles above a range or cooktop | At least 30" to unprotected combustibles, or less where the listing of the hood or appliance allows; over gas, 24" with the protection the code specifies | M1901.1, G2447.5 |
| B-23 Dryer exhaust | Dryer duct, when drawn | Not over 35 ft less the deduction for each bend | M1502.4.5.1 |
| B-24 Stairs | Stairs, when drawn | Width 36", headroom 6'8", riser no more than 7-3/4", tread at least 10" | R311.7 |
| B-25 Lighting efficacy | Permanently installed light fixtures | Every fixture, except lights inside kitchen appliances, is at least 45 lumens per watt or uses lamps of at least 65 lumens per watt (from the fixture schedule) | FBC Energy Conservation R404.1 |

The bath clearance values that Round 3 put in Defaults now start at these code minimums; the owner can raise them but a value below the code minimum is refused. Bearing-wall removal (engineer note) and the pre-1978 lead flag stay as separate rules. Not covered in v1, because the model does not hold the data: structural and wind design, plumbing pipe sizing and venting, gas piping, mechanical duct sizing, energy envelope calculations and flood requirements. Check lists these as "not checked by EZ Draft".

