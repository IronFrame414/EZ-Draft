# Calculations and rules

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 8: Calculations and rules. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

Code checks are warnings to a licensed person, never automatic fixes or a guarantee. Rules are built against the 2023 NEC (adopted by Florida's 9th Edition building code, effective December 31, 2026) and against the Florida Building Code, Residential. The code edition is a per-project setting; permits applied for before that date use the 8th Edition (2023) with the 2020 NEC. Code section numbers below must be verified against the code text during build. The full rule list (receptacles, GFCI/AFCI, circuits, lighting, panel, load calc lines, smoke and CO, company rules) is in the Code check rules tab.

**Electrical load calculation**

- Methods: NEC Article 220 standard method, and the optional method for existing dwellings (220.83), turned on or off per calc with a toggle.
- Five cases: circuits added to an existing panel (does the service hold); service upgrade; subpanel feeder sizing; large adds (EV charger, heat pump); like-for-like panel replacement with no service change.
- Inputs: square footage (from rooms), small-appliance and laundry circuits, fixed appliances from catalog ratings (fallback to editable standard defaults), existing panel data and circuits, existing large appliances.
- Standard method lines: general lighting by area, small-appliance circuits, laundry, demand factors, fixed appliances, dryer, ranges, larger of heating or cooling, total VA, amps at 240 V, compare to service rating.
- Output: every line of math printed on E2.0 with the panel schedule. Stored with the model version when a set issues.
- Every electrical sheet notes that the electrical contractor of record verifies the design. Signature block per submittal profile (none, EC, architect).

**Electrical code warnings (run by Check, and automatically at issue)**

- Countertop receptacle spacing; GFCI locations; AFCI locations.
- Required dedicated circuits: dishwasher, disposal, microwave, refrigerator, bathroom.
- Smoke and CO detector locations.
- Voltage drop above the company threshold. Each warning: fix it, or accept with a note. Accepted notes print in the issue log. Check runs from the tool rail on any editor tab.

**Code check engine** (Round 26)

Check flags conflicts with every building code that applies to what is drawn, not only electrical. It is built as a registry of rule sets, one per code volume and edition, so a new code or edition is added as data plus check functions without touching the engine. The rules themselves are the Code rules catalog (Round 26 R34): the file ezdraft-code-rules.json, 1,248 rules, browsable as the EZ Draft Code Rules page. It covers the Florida Building Code, Residential (building planning, construction, mechanical, fuel gas, plumbing), the Existing Building and Energy Conservation volumes, and the NEC from Article 100 through the equipment articles, limited to what an interior remodel of an existing dwelling can trigger. Each rule has its section for both editions (8th Edition with the 2020 NEC, in force now; 9th Edition with the 2023 NEC, for permits applied for after December 31, 2026), the check in our own words, what it applies to, when a remodel triggers it, its type and how it was sourced. Three types: Automatic (277), checked from the drawing; Needs data (276), checked once the user enters the value the rule names; Reminder (695), shown as a checklist item when the triggering object exists, because it cannot be checked from a drawing. Sourcing: 756 rules were read from the published code text (all Florida volumes), 312 come from published summaries of the NEC and 180 were written from knowledge with no source opened; the last two groups carry the not-yet-verified tag until checked against the NEC itself. The two tables below were the first sample and are superseded by the catalog where they differ.

- A rule has: rule id, code and edition, section number, a plain-language title written for this app, the object types it applies to, a test condition, the warning text, and a severity (warning or note). The rule text in the app is always our own wording with the section number; the code books' text is not copied into the app. Each warning links to the section in the publisher's free online viewer.
- A rule runs only when the model holds what it needs: a bath rule runs when a room is a bathroom, a stair rule only if a stair is drawn. A check that cannot run for lack of data says so ("Ceiling height not set in Bath 2") instead of passing.
- Alterations: a rule applies to new work and to rooms that contain new or demolished objects. Existing conditions that are not altered show as notes, not warnings, except smoke alarms, which a permitted interior alteration triggers for the whole dwelling. An interior remodel is governed by the Florida Building Code, Existing Building, which applies new-construction rules to new and altered elements only.
- Every rule has verified\_by and verified\_at. Until a licensed person has checked a rule against the adopted code text, its warnings carry the tag "not yet verified" and Settings 15g lists it as unverified. The building rules below were checked on Oct 11, 2026 against the code text in the official online viewer, for both the 8th Edition (2023) and the 9th Edition (2026, for permits applied for after December 31, 2026). The 9th Edition keeps the 8th Edition section numbers for these rules; only R303.1 splits into R303.1.1 and R303.1.2, and the smoke alarm distances change. The electrical rules were checked against published summaries of the 2023 NEC, not the code book, because the NEC text could not be opened. Each rule still stores its section per edition, and a licensed person marks it verified.
- Local amendments and manufacturer instructions are outside the rule sets. Check is a warning to a licensed person, never a guarantee.

**Electrical rules (2023 NEC): first sample, superseded by the catalog**

| Rule | Applies to | Check | Section |
| --- | --- | --- | --- |
| E-01 Countertop receptacles | Each wall countertop space 12" or wider | No point along the wall line is more than 24" from a receptacle (48" at most between receptacles) | 210.52(C)(1) |
| E-02 Countertop receptacle height | Receptacles serving a countertop | Not more than 20" above the countertop | 210.52(C)(3) |
| E-03 Island and peninsula | Each island or peninsula top | 2023 NEC: a receptacle is optional; if none is drawn, the plan carries the note for a future receptacle. 2020 NEC: one receptacle for the first 9 sq ft plus one per further 18 sq ft | 210.52(C)(2) |
| E-04 Small-appliance circuits | Kitchen, pantry, dining room | At least two 20 A circuits serve the countertop and wall receptacles, with no other outlets on them except the refrigerator | 210.11(C)(1), 210.52(B) |
| E-05 GFCI | Receptacles in kitchens, bathrooms, laundry areas, garages, outdoors, within 6 ft of a sink, tub or shower. 2023 NEC: every kitchen receptacle, and the outlets for the dishwasher, range, wall oven, cooktop, dryer and microwave, cord-connected or hardwired. 2020 NEC: kitchen countertop receptacles and the dishwasher | Each is GFCI protected (device or breaker) | 210.8(A), 210.8(D) |
| E-06 Bathroom receptacle | Each lavatory basin | A receptacle within 3 ft of the outside edge of the basin; bathroom receptacles on a 20 A circuit | 210.52(D), 210.11(C)(3) |
| E-07 Wall receptacle spacing | Habitable rooms | No point along the floor line of a wall space 2 ft or wider is more than 6 ft from a receptacle | 210.52(A) |
| E-08 Hallways and foyers | Hallways 10 ft or longer; foyers over 60 sq ft | At least one receptacle in the hallway; one in each foyer wall space 3 ft or wider | 210.52(H), 210.52(I) |
| E-09 Laundry | Laundry area | At least one receptacle on a 20 A laundry circuit | 210.52(F), 210.11(C)(2) |
| E-10 AFCI | 120 V, 15 and 20 A circuits serving kitchens, family, dining and living rooms, bedrooms, closets, hallways, laundry areas and similar rooms (bathrooms and garages are not on the list); a circuit that is modified, replaced or extended more than 6 ft | The circuit is AFCI protected. 2023 NEC: 210.12(B) and (E); 2020 NEC: 210.12(A) and (D) | 210.12 |
| E-11 Dedicated circuits | Dishwasher, disposal, built-in microwave, range, cooktop, oven, refrigerator, bath heater-fan, hydromassage tub | Each is alone on its circuit. The list is a company setting in Defaults; the tub is a code requirement | 210.23, 422.10, 680.71; manufacturer instructions |
| E-12 Lighting outlets | Every habitable room, kitchen, bathroom, laundry area (2023 NEC), hallway and stairway | At least one lighting outlet controlled by a listed wall-mounted control | 210.70(A) |
| E-13 Tamper-resistant receptacles | All 15 and 20 A receptacles in the dwelling | Marked tamper-resistant in the device schedule | 406.12 |
| E-14 Tub and shower zone | The space 3 ft out from and 8 ft above a tub rim or shower threshold | No receptacle in the zone (the 2023 NEC allows one receptacle for an electronic bidet seat); no cord-connected, hanging or pendant fixture, no track light, and no ceiling fan with a light kit or metal parts in the zone; fixtures within the footprint of the tub or shower are damp rated, or wet rated where spray reaches them | 406.9(C), 410.10(D), 422.18(B) |
| E-15 Closet lights | Lights in clothes closets | 12" clear to the storage space for a surface incandescent or enclosed LED fixture; 6" for a surface fluorescent fixture and for any recessed fixture; a fixture identified for use inside the storage space may be there; no open-lamp or pendant fixtures | 410.16 |
| E-16 Panel location | Each panel | Clear working space 30" wide, 36" deep and 6'6" high; not in a bathroom, shower room or clothes closet | 110.26(A), 240.24(D), 240.24(E) |
| E-17 Voltage drop | Each circuit with a run length | Warning above the company threshold (default 3%). The NEC only recommends 3% on a branch and 5% overall | 210.19 and 215.2 informational notes (not enforceable) |

**Voltage drop formula** (Round 26, Claude)

Single-phase drop in volts = 2 x K x I x L / CM, and percent = volts / circuit voltage x 100. K is 12.9 for copper and 21.2 for aluminum. I is 80% of the breaker rating for a general circuit (16 A on a 20 A breaker) or the nameplate amps for a dedicated appliance circuit. L is the one-way run length in feet. CM is the conductor area in circular mils: 14 AWG 4,110; 12 AWG 6,530; 10 AWG 10,380; 8 AWG 16,510; 6 AWG 26,240. Circuit voltage is 120 or 240. Test value: 20 A breaker, 12 AWG copper, 58 ft, 120 V gives 2 x 12.9 x 16 x 58 / 6,530 = 3.67 V = 3.1%.

**Load calculation: worked example** (Round 26, Claude; the house on mockup 06)

This is the fixture the load calc engine must reproduce line by line. Section numbers are 2023 NEC. Josh's own hand calc for a real house stays the field check.

| Line | Input | VA |
| --- | --- | --- |
| General lighting, 220.41 | 2,450 sq ft x 3 VA | 7,350 |
| Small-appliance circuits, 220.52(A) | 2 x 1,500 | 3,000 |
| Laundry circuit, 220.52(B) | 1 x 1,500 | 1,500 |
| Subtotal |  | 11,850 |
| After demand, Table 220.45 | first 3,000 at 100% + 8,850 at 35% | 6,098 |
| Fixed appliances, 220.53 | dishwasher 1,200, disposal 960, microwave 1,500, water heater 4,500 = 8,160; four or more appliances fastened in place, each 500 W or more, so 75%. The refrigerator is covered by the small-appliance circuits and is not listed | 6,120 |
| Dryer, 220.54 | 5,000 minimum | 5,000 |
| Range 12 kW, Table 220.55 column C | one range not over 12 kW | 8,000 |
| Heating or cooling, larger of, 220.60 | heat strips 9,600 against cooling 4,200 | 9,600 |
| Largest motor at 25% | 4,200 VA motor | 1,050 |
| Total |  | 35,868 |
| Amps at 240 V | 35,868 / 240 | 149.5 A |
| Result | 200 A service | 75%, 50.5 A spare, OK |

Demand steps in Table 220.45: first 3,000 VA at 100%, the next 117,000 at 35%, the rest at 25%. Fixed appliances take 75% only when there are four or more fastened in place, each rated 1/4 hp or 500 W or more (2023 NEC); cooking equipment, dryers, space heating, air conditioning and EV chargers are never in that group. Largest motor: the example adds 25% of the air-conditioning compressor even though cooling is the smaller, omitted load. That is the conservative reading; the code text on this case is read two ways in practice, so the engine exposes the largest-motor choice as an editable line. Checked Oct 11 against published 2023 NEC summaries and worksheets, not the code book itself. The optional method for an existing dwelling (220.83) takes the first 8,000 VA of all other load at 100% and the rest at 40%, with new heating or cooling added at 100%.

**Load calculation: the five cases** (Round 26, Claude)

| Case | Inputs | Method | Output |
| --- | --- | --- | --- |
| 1. Circuits added to an existing panel | Existing panel data and circuits, existing large appliances, the new circuits | Existing load by 220.83, plus the new loads | Calculated amps against the service rating; open breaker spaces against the spaces needed; pass or fail |
| 2. Service upgrade | The whole dwelling as proposed | Standard method as in the worked example | Calculated amps and the next standard service size at or above it (100, 125, 150, 200, 225, 300, 400 A) |
| 3. Subpanel feeder | Only the loads served by the subpanel | Standard method on those loads | Feeder amps and the next standard breaker size |
| 4. Large add (EV charger, heat pump) | Existing dwelling plus the new load | 220.83 with the new heating or cooling at 100%; an EV charger at its nameplate or 7,200 VA, whichever is larger | Calculated amps against the service rating; pass or fail |
| 5. Like-for-like panel replacement | Existing circuits | No load calculation; states "No change in load; service unchanged" | Panel schedule and a check that the new panel has enough spaces |

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

**Geometry and drafting rules**

- Dimensions to finished face (drywall to drywall).
- Moving a wall stretches connected walls so corners stay joined; dimensions update live. Hosted items (doors, windows, cabinets, devices) do not move with it.
- Room closure: typed lengths must add up. A gap is shown; you pick the wall that absorbs it or override.
- One tolerance setting covers scan-vs-typed conflicts and field measurements.
- Display precision: 1/2" on plans, 1/16" on details.
- Bearing walls: removing or opening is blocked until an engineer note is attached.
- Sloped ceilings cut the tops of walls under them in plan, elevations and 3D. Bath clearance checks (Round 3, warnings only): toilet, lavatory, tub and shower clearances and shower size, with values set by the owner under Defaults and checked by Check.

**Cabinet rules**

- Auto-fill uses 3" increments plus fillers at walls and appliances.
- Run total vs wall length: fits when the difference after fillers and scribe is within the fit tolerance in Defaults; otherwise flagged.

**Countertop rules**

- Area per piece and total in square feet; exposed edge length in linear feet (status bar).
- Presets: Flush 0, Standard 1 1/2", Bar 10", Seating 12", Wall + backsplash. Typical ranges: seating 6"–12", regular 1"–2".
- Seating overhang beyond the support limit adds brackets to a detail and shows a notice. The limit is a company setting. Countertop documents are internal and client only, never in permit sets.
- Edge profile applies to exposed edges only; wall edges take backsplash.

**Ceiling and lighting rules**

- Can auto-layout by count, spacing, or light-level target.
- Keep-clear warning when a can lands on a joist or beam, only where joist or beam locations are known.
- ACT borders balanced: edge tiles at least half a tile.
- Fan blade clearance to walls and beams checked.

**Sheet set rules**

- Auto-built set, decimal numbering. Plan doc numbering: A0.0 Cover + index + key, A1.0 Existing, A2.0 Demo, A3.0 Proposed, A4.0 Interior elevations, A5.0 Details, A6.0 Reflected ceiling plan, E1.0 Electrical plan, E2.0 Panel schedule + load calc, R1.0 Finish schedule + renderings. Decided Oct 11: this plan doc set is the default; the Sheets mockup order is to be corrected.
- Scales per viewport: 1/4" = 1'-0" plans, 1/2" = 1'-0" elevations; details true scale or NTS.
- Text prints at fixed paper sizes at any scale: minimum 3/32" on 24×36; labels and dims one size up from notes.
- Line weights by role: cut heavy, beyond light, hidden dashed, dims and leaders thinnest.
- Key: the full symbol and abbreviation library is held in the system; each set shows only the symbols and abbreviations used, updated as objects are added or removed. The user chooses per set whether the key goes on every sheet or on the cover only.
- Title block: project address, parcel, owner, code edition, scope of work, revision block, a blank seal box and a separate blank department approval stamp area; logo, license and contact on/off. Permit sheets are English only.
- Issue gate: code check reviewed (fixed or noted), no red/orphan flags, title block complete.
- NTS details stamped "NTS"; typed-override dimensions underlined.
- Detail legibility warnings: leaders crossing each other, labels on linework.

**Revision rules**

- Before permit, each send to the client is "Version N". Rev 0 = first issued permit set, locked; later issues are Rev 1, 2… with no cap. Every sent version is frozen; editing continues on a working copy.
- Changes are gathered and numbered only when the set is next sent to the client or department.
- Changed objects get clouds and a delta tag automatically; revision block and log update on every sheet.

**Takeoff rules**

Formulas (Round 26, Claude). Every number named here is a Defaults value the owner can change; quantities round up to whole units.

| Quantity | Formula | Defaults used |
| --- | --- | --- |
| Floor tile | Room floor area less the footprint of base cabinets and tubs, x (1 + waste). Boxes = SF / the catalog item's coverage per box | Waste by pattern; 10 SF per box when the item has none |
| Wall tile | Area of each wall face marked for tile to its set height, less openings, x (1 + waste). A tile shower adds its walls, niche faces, bench and curb | Waste by pattern |
| Drywall | (Both faces of new walls + new ceiling area + patches marked on existing walls) x (1 + waste) / sheet area | Sheet 4 x 8 (32 SF); waste 10% |
| Paint | Wall area of rooms with new work, less openings over 20 SF, plus ceilings marked for paint. Gallons = SF x coats / coverage | 2 coats; 350 SF per gallon |
| Base trim | Room perimeter less door widths, x (1 + waste) | Waste 10% |
| Casing | Per opening: 2 x height + width, each side that is trimmed | none |
| Countertops | SF per piece and exposed edge LF, as on screen 04b | none |
| Cabinets, fixtures, devices | Counts by code or size, by type and by device type | none |
| Wire | Per circuit: the path along walls from the panel to the first device and on to each next device, plus the rise from each device height to the ceiling and back down, x (1 + slack) | Slack 15% |
| ACT tile | Count of grid cells in the laid-out grid, full and cut, x (1 + waste) | Waste 5% |
| ACT mains | Room dimension across the mains / main spacing, rounded up, x run length / 12 ft pieces | Mains at 4 ft |
| ACT cross tees | 4 ft tees at 2 ft on center between mains; for a 2 x 2 grid, one 2 ft tee per 4 ft tee | none |
| ACT wall angle | Room perimeter / 12 ft pieces | none |
| Hanger wire | One per 4 ft along each main | 4 ft spacing |

- Quantities: floor and wall tile SF with waste, drywall sheets, paint SF, trim LF, countertop SF and edge LF, cabinet count by size, fixture and device counts, estimated wire runs, ACT tiles, mains, cross tees, wall angle, hanger wire.
- Waste factor default per material, adjusted by pattern (straight, diagonal, herringbone), editable per project.
- Tile: layout preview (pattern, start point, visible cuts on elevations and 3D) and quantities in SF and boxes; no cut list in v1.
