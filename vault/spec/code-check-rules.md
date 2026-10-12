# Code check rules

These are EZ Draft's code-check rules, written as our own app logic with section references. They contain no NEC text. Every reference must be verified against a licensed copy before the rule ships.

## How rules work

Each rule is a test the app runs on the model when someone presses Check, and again at issue. A rule never changes the drawing; it lists a warning that a licensed person fixes or accepts with a note.

**Rule fields**

| Field | Meaning |
| --- | --- |
| ID | Stable rule ID (e.g. R-REC-01). Never reused. |
| Check | What the app tests, in our own words |
| Inputs | Model data the rule reads |
| Warns when | The condition that raises a warning |
| Reference | Code section, for the reviewer to look up |
| Source | NEC 2023, NEC 2020, FBC-R (Florida Building Code, Residential), or Company |
| Status | Draft until Josh checks it against a licensed copy; then Verified with the date |

**Edition handling**

- Each project has a code edition. Florida's 9th Edition building code adopts the 2023 NEC effective Dec 31, 2026; permits under the 8th Edition use the 2020 NEC.
- A rule carries the editions it applies to. Where the two editions differ (marked in the tables), the app runs the version for the project's edition.
- Section numbers below are 2023 NEC unless noted. Several Article 220 sections were renumbered in 2023; both numbers are shown where known.

**Warning behavior**

- Warnings show in the Check list with the object highlighted on the plan. Each can be fixed, or accepted with a note that prints in the issue log.
- Rules only run on objects with status New, plus Existing objects inside the work area when a rule says "existing included".
- Thresholds that are company choices (voltage drop, tolerances) come from Defaults, not from these tables.

**Accuracy**

These rules are written from general knowledge of the NEC and FBC, not from the code text. Every reference and every number is Draft until verified (section 8 of this tab).

## Receptacle rules

These rules check that required receptacles exist and are spaced correctly in dwelling rooms. All are Status: Draft.

| ID | Check | Inputs | Warns when | Reference | Source |
| --- | --- | --- | --- | --- | --- |
| R-REC-01 | General wall spacing in habitable rooms | Room walls, wall segments 2 ft or wider, doors, fixed panels, receptacles | Any point along the floor line of usable wall is more than 6 ft from a receptacle | 210.52(A)(1)–(2) | NEC 2020 / 2023 |
| R-REC-02 | Kitchen countertop wall spacing | Countertop wall spaces 12 in or wider, sinks, ranges, receptacles | Any point along a countertop wall line is more than 24 in from a receptacle | 210.52(C)(1) | NEC 2020 / 2023 |
| R-REC-03 | Island and peninsula receptacles (2023) | Island/peninsula countertop area | Fewer receptacles than one for the first 9 sq ft plus one per additional 18 sq ft (or fraction) | 210.52(C)(2) | NEC 2023 only |
| R-REC-04 | Island and peninsula receptacles (2020) | Island/peninsula long dimension and depth | Island or peninsula of 24 in by 12 in or larger has no receptacle | 210.52(C)(2)–(3) (2020 numbering) | NEC 2020 only |
| R-REC-05 | Countertop receptacle height | Receptacle mount height, countertop height | A countertop receptacle is more than 20 in above the countertop | 210.52(C)(5) | NEC 2020 / 2023 |
| R-REC-06 | Face-up countertop receptacles | Receptacle orientation | A receptacle is installed face-up in a countertop and is not a listed countertop assembly | 406.5(E) | NEC 2020 / 2023 |
| R-REC-07 | Bathroom basin receptacle | Basins, receptacles in the bathroom | No receptacle within 3 ft of the outside edge of each basin | 210.52(D) | NEC 2020 / 2023 |
| R-REC-08 | Laundry receptacle | Laundry area, receptacles | Laundry area has no receptacle | 210.52(F) | NEC 2020 / 2023 |
| R-REC-09 | Outdoor receptacles | Dwelling front and back, grade-level access | Front or back of a one-family dwelling has no outdoor receptacle within 6 ft 6 in of grade | 210.52(E)(1) | NEC 2020 / 2023 |
| R-REC-10 | Hallway receptacle | Hallway length | A hallway 10 ft or longer has no receptacle | 210.52(H) | NEC 2020 / 2023 |
| R-REC-11 | Garage and basement receptacles | Garage bays, unfinished basement areas | Garage (each car space in 2023) or unfinished basement portion has no receptacle | 210.52(G) | NEC 2020 / 2023 (2023 per bay) |
| R-REC-12 | Tamper-resistant receptacles | 15 A and 20 A, 125 V and 250 V receptacles in the dwelling | A new receptacle is not marked tamper-resistant | 406.12 | NEC 2020 / 2023 |
| R-REC-13 | Countertop receptacles on small-appliance circuits | Countertop receptacles, circuits | A countertop receptacle is on a circuit that is not a 20 A small-appliance circuit | 210.52(B)(1)–(3) | NEC 2020 / 2023 |
| R-REC-14 | Existing receptacles in remodeled area | Existing receptacles inside the work area (existing included) | Existing receptacle is replaced and does not meet the GFCI, AFCI or tamper-resistant replacement rules | 406.4(D) | NEC 2020 / 2023 |

## GFCI and AFCI rules

These rules check protection type on receptacles and circuits by location. All are Status: Draft.

| ID | Check | Inputs | Warns when | Reference | Source |
| --- | --- | --- | --- | --- | --- |
| R-GF-01 | GFCI in bathrooms | Receptacles in rooms tagged bathroom | Any receptacle is not GFCI protected | 210.8(A)(1) | NEC 2020 / 2023 |
| R-GF-02 | GFCI in kitchens | Receptacles in rooms tagged kitchen | 2023/2020: any kitchen receptacle (not only countertop) is not GFCI protected | 210.8(A)(6) | NEC 2020 / 2023 |
| R-GF-03 | GFCI near sinks | Receptacles, sink locations | A receptacle within 6 ft of the top inside edge of a sink bowl is not GFCI protected | 210.8(A)(7) | NEC 2020 / 2023 |
| R-GF-04 | GFCI near tubs and showers | Receptacles, tub and shower locations | A receptacle within 6 ft of the outside edge of a tub or shower is not GFCI protected | 210.8(A)(9) | NEC 2020 / 2023 |
| R-GF-05 | GFCI in laundry areas | Receptacles in laundry areas | Any receptacle is not GFCI protected | 210.8(A)(10) | NEC 2020 / 2023 |
| R-GF-06 | GFCI in garages, outdoors, crawl spaces, basements | Receptacles in those locations | Any receptacle is not GFCI protected | 210.8(A)(2)–(5) | NEC 2020 / 2023 |
| R-GF-07 | GFCI for dishwasher | Dishwasher outlet | Dishwasher outlet is not GFCI protected | 422.5(A)(7) (2020); 210.8(D) (2023) | NEC 2020 / 2023 |
| R-GF-08 | GFCI voltage range | Receptacle voltage and amperage | A 125–250 V receptacle in a GFCI location (e.g. range, dryer) is not GFCI protected | 210.8(A) charging text | NEC 2020 / 2023 |
| R-AF-01 | AFCI by room | Circuits serving outlets in kitchens, family, dining, living rooms, parlors, libraries, dens, bedrooms, sunrooms, recreation rooms, closets, hallways, laundry areas and similar rooms | The circuit is not AFCI protected | 210.12(A) | NEC 2020 / 2023 |
| R-AF-02 | AFCI on modified circuits | Existing circuits in those rooms that are extended, modified or replaced (existing included) | The modified circuit has no AFCI protection and does not meet the short-extension exception | 210.12(D) | NEC 2020 / 2023 |
| R-AF-03 | Combined protection where both apply | Circuits needing GFCI and AFCI (e.g. kitchen, laundry) | Circuit shows only one protection type | 210.8, 210.12 | NEC 2020 / 2023 |

## Branch circuit, switching and lighting rules

These rules check required circuits, conductor size, switching and luminaire locations. All are Status: Draft.

| ID | Check | Inputs | Warns when | Reference | Source |
| --- | --- | --- | --- | --- | --- |
| R-CIR-01 | Small-appliance circuits | Kitchen, pantry, dining and similar areas; their circuits | Fewer than two 20 A small-appliance circuits serve these areas | 210.11(C)(1) | NEC 2020 / 2023 |
| R-CIR-02 | Small-appliance circuits serve no other outlets | Outlets on small-appliance circuits | A small-appliance circuit also serves lighting or other outlets not allowed by the exceptions | 210.52(B)(2) | NEC 2020 / 2023 |
| R-CIR-03 | Laundry circuit | Laundry receptacles, circuits | No 20 A circuit for the laundry receptacles, or it serves other outlets | 210.11(C)(2) | NEC 2020 / 2023 |
| R-CIR-04 | Bathroom circuit | Bathroom receptacles, circuits | Bathroom receptacles are not on a 20 A circuit meeting the bathroom-circuit rule | 210.11(C)(3) | NEC 2020 / 2023 |
| R-CIR-05 | Garage circuit | Garage receptacles, circuits | No 20 A circuit for garage receptacles | 210.11(C)(4) | NEC 2020 / 2023 |
| R-CIR-06 | Conductor size vs breaker | Circuit breaker size, wire gauge (copper) | 14 AWG on more than 15 A, 12 AWG on more than 20 A, or 10 AWG on more than 30 A | 240.4(D) | NEC 2020 / 2023 |
| R-CIR-07 | Appliance circuit rating | Appliance nameplate amps (catalog or default), circuit rating | Appliance load exceeds the circuit or the manufacturer's required breaker | 110.3(B), 210.23 | NEC 2020 / 2023 |
| R-CIR-08 | Voltage drop | Circuit length, load, wire size | Calculated drop exceeds the company threshold (Defaults); reference is advisory only | 210.19 Informational Note | NEC (advisory) + Company |
| R-LGT-01 | Lighting outlet in habitable rooms and bathrooms | Rooms, switched lighting outlets | A habitable room or bathroom has no wall-switch-controlled lighting outlet | 210.70(A)(1)–(2) | NEC 2020 / 2023 |
| R-LGT-02 | Hallway, stair, entrance lighting | Hallways, stairs, exterior doors | Missing switched lighting; stairs with 6 or more risers lack switches at each level | 210.70(A)(2) | NEC 2020 / 2023 |
| R-LGT-03 | Neutral at switch locations | Switch boxes | A new switch box has no grounded (neutral) conductor and no exception applies | 404.2(C) | NEC 2020 / 2023 |
| R-LGT-04 | Ceiling fan support | Fans, ceiling boxes | A ceiling fan is on a box not listed for fan support | 314.27(C) | NEC 2020 / 2023 |
| R-LGT-05 | Luminaires near tubs and showers | Luminaires, tub and shower zones (3 ft horizontally, 8 ft vertically from the rim or threshold) | A luminaire in the zone is not listed for damp or wet location, or is a pendant or track type | 410.10(D) | NEC 2020 / 2023 |
| R-LGT-06 | Recessed luminaires near insulation | Cans in insulated ceilings | A recessed can in contact with insulation is not IC-rated | 410.116 | NEC 2020 / 2023 |
| R-LGT-07 | Closet luminaires | Closet luminaires and storage space | A luminaire type or clearance is not allowed in the closet storage area | 410.16 | NEC 2020 / 2023 |

## Panel and service rules

These rules check where a new or relocated panel sits and its clear working space. All are Status: Draft.

| ID | Check | Inputs | Warns when | Reference | Source |
| --- | --- | --- | --- | --- | --- |
| R-PNL-01 | Working space depth | Panel location, objects in front | Less than 36 in clear in front of the panel | 110.26(A)(1) | NEC 2020 / 2023 |
| R-PNL-02 | Working space width | Panel location, side objects | Less than 30 in wide (or the panel width, if wider) | 110.26(A)(2) | NEC 2020 / 2023 |
| R-PNL-03 | Working space height | Ceiling height, objects above | Less than 6 ft 6 in headroom, or less than the equipment height | 110.26(A)(3) | NEC 2020 / 2023 |
| R-PNL-04 | Dedicated equipment space | Ducts, pipes, cabinets over the panel | Foreign systems in the space above the panel footprint | 110.26(E) | NEC 2020 / 2023 |
| R-PNL-05 | Panel not in bathroom | Panel room | Overcurrent devices located in a bathroom | 240.24(E) | NEC 2020 / 2023 |
| R-PNL-06 | Panel not in clothes closet or near combustibles | Panel room | Overcurrent devices in a clothes closet or near easily ignitible material | 240.24(D) | NEC 2020 / 2023 |
| R-PNL-07 | Spaces available | Panel spaces, existing and new circuits | New circuits need more spaces than the panel has | Company check | Company |
| R-PNL-08 | Service capacity | Load calc result, service rating | Calculated load exceeds the service or feeder rating | Article 220, 230.42 | NEC 2020 / 2023 |

## Load calculation lines

The load calc prints every line below on E2.0. Values in the table are the app's calculation settings; each must be verified, because 2023 renumbered several Article 220 sections. All are Status: Draft.

**Standard method (single-family dwelling)**

| Line | Calculation | Reference |
| --- | --- | --- |
| L-01 General lighting and receptacles | Living area sq ft × 3 VA | 220.41 (2023); 220.12 (2020) |
| L-02 Small-appliance circuits | 1,500 VA × number of small-appliance circuits (minimum 2) | 220.52(A) |
| L-03 Laundry circuit | 1,500 VA × laundry circuits (minimum 1) | 220.52(B) |
| L-04 Demand on L-01 to L-03 | First 3,000 VA at 100%; 3,001–120,000 VA at 35%; above 120,000 VA at 25% | Table 220.45 (2023); Table 220.42 (2020) |
| L-05 Fixed appliances | Nameplate VA of fastened-in-place appliances (dishwasher, disposal, water heater, microwave hood, etc.); 75% when four or more, excluding ranges, dryers, space heating and AC | 220.53 |
| L-06 Dryer | Larger of 5,000 VA or nameplate | 220.54 |
| L-07 Cooking | Ranges, cooktops and ovens per the demand table (e.g. one range up to 12 kW = 8 kW) | Table 220.55 |
| L-08 Heating vs cooling | Larger of heating or cooling load; smaller one omitted | 220.60 |
| L-09 Largest motor | Add 25% of the largest motor | 220.50, 430.24 |
| L-10 Total | Sum of L-04 to L-09 in VA | — |
| L-11 Amps | Total VA ÷ 240 V | — |
| L-12 Result | Compare amps to service or feeder rating; pass or warn (R-PNL-08) | 230.42, 230.79 |

**Optional methods (toggle per calc)**

| Line | Calculation | Reference |
| --- | --- | --- |
| O-01 New or whole dwelling, optional | General loads (3 VA/sq ft, 1,500 VA per small-appliance and laundry circuit, nameplate of appliances): first 10 kVA at 100%, remainder at 40%; plus heating/AC per the section's percentages | 220.82 |
| O-02 Existing dwelling, no added heat or AC | Existing plus new loads: first 8 kVA at 100%, remainder at 40% | 220.83(A) |
| O-03 Existing dwelling, adding heat or AC | 100% of the new heating or AC load; other loads first 8 kVA at 100%, remainder at 40% | 220.83(B) |
| O-04 Existing load from utility data | Maximum demand from 12 months of utility data (or 30-day metering) × 125%, plus new loads | 220.87 |

**The five cases (Round 5) map to methods**

| Case | Default method | Notes |
| --- | --- | --- |
| Circuits added to an existing panel | O-02 or O-04 | O-04 when utility demand data is entered |
| Service upgrade | Standard method | Optional O-01 toggle |
| Subpanel feeder sizing | Standard method on the subpanel loads | Feeder result compared to feeder breaker |
| Large adds (EV charger, heat pump) | O-03 or O-04 | EV charger at 100% of nameplate (625.42) |
| Like-for-like panel replacement | No calc required; app records existing service and notes no load change | Company rule |

## Smoke and CO alarm rules

Smoke and CO alarms come from the Florida Building Code, Residential (FBC-R), not the NEC. Florida law also has its own CO alarm statute. All are Status: Draft.

| ID | Check | Inputs | Warns when | Reference | Source |
| --- | --- | --- | --- | --- | --- |
| R-SMK-01 | Alarms in sleeping rooms | Rooms tagged bedroom, smoke alarms | A sleeping room has no smoke alarm | FBC-R R314.3 | FBC-R |
| R-SMK-02 | Alarm outside sleeping areas | Hallway or area adjacent to bedrooms | No smoke alarm outside each separate sleeping area in its immediate vicinity | FBC-R R314.3 | FBC-R |
| R-SMK-03 | Alarm on each story | Levels | A story (including a basement) has no smoke alarm | FBC-R R314.3 | FBC-R |
| R-SMK-04 | Upgrade on permitted alterations | Project scope (interior alteration with permit), existing alarms (existing included) | Alterations requiring a permit and the dwelling lacks alarms meeting R314.3 (exceptions for exterior-only work) | FBC-R R314.2.2 | FBC-R |
| R-SMK-05 | Power and interconnection | New alarms | A new alarm is not hardwired with battery backup, or alarms are not interconnected (where wiring is accessible) | FBC-R R314.4, R314.6 | FBC-R |
| R-SMK-06 | Distance from bathrooms and cooking | Alarm positions, tub/shower bathroom doors, cooking appliances | Alarm too close to a bathroom door with a tub or shower, or to a cooking appliance (distances per the section) | FBC-R R314.3.3 | FBC-R |
| R-CO-01 | CO alarm required | Fuel-fired appliances, attached garage | Dwelling has a fuel-fired appliance or attached garage and no CO alarm outside each sleeping area | FBC-R R315.3; F.S. 553.885 | FBC-R / Florida Statutes |
| R-CO-02 | CO alarm in bedrooms with fuel-fired appliances | Fuel-fired appliance in a bedroom or its attached bathroom | No CO alarm in that bedroom | FBC-R R315.3 | FBC-R |
| R-CO-03 | CO on permitted alterations | Alteration scope, existing alarms | Permitted alteration and CO alarms are not provided per R315.3 | FBC-R R315.2.2 | FBC-R |
| R-CO-04 | Combination alarms | Alarm type | A combination smoke/CO alarm is not listed for both | FBC-R R314.1, R315.1 | FBC-R |

## Company rules

These are Worth Properties standards, not code requirements. The warning text says "Company rule" so a reviewer does not mistake them for code. Each can be turned off in Defaults.

| ID | Check | Warns when | Why |
| --- | --- | --- | --- |
| C-01 | Dedicated refrigerator circuit | Refrigerator shares a circuit | Plan doc Round 5 list; often required by the manufacturer (110.3(B)) |
| C-02 | Dedicated microwave circuit | Built-in or over-range microwave shares a circuit | Same |
| C-03 | Dedicated dishwasher circuit | Dishwasher shares a circuit with anything but the disposal (setting allows shared DW/disposal) | Same |
| C-04 | Dedicated disposal circuit | Disposal shares a circuit (unless the shared DW/disposal setting is on) | Same |
| C-05 | Voltage drop threshold | Branch drop above the Defaults value (3% suggested) | NEC note is advisory only |
| C-06 | Panel spaces left | Fewer than the Defaults number of spare spaces after new circuits | Room for future work |
| C-07 | EC verification note | Electrical sheet lacks the "EC of record verifies" note | Spec section 8 |
| C-08 | Device height notes | Height notes are on while the profile says off | Round 5 / Round 24 #36 |
| C-09 | Bearing wall opened | A wall flagged bearing is removed or opened with no engineer note | Spec section 8 (structural out of scope) |
| C-10 | Fixture not on a circuit | A placed device or appliance has no circuit | Drafting completeness |

## Verification checklist

Check each rule against your signed-in NFPA 70 (2023 and 2020) and the FBC-R, then mark it Verified with the date. Rules ship to the app only when Verified. The items below are the ones most likely to be wrong in this draft.

- [ ] R-REC-03: the 2023 island/peninsula rate (one for the first 9 sq ft, one per additional 18 sq ft) and where those receptacles may be placed.
- [ ] R-REC-04: the 2020 island and peninsula rule and its section numbers.
- [ ] R-REC-11: whether 2023 requires a receptacle per garage vehicle bay.
- [ ] R-GF-02 and R-GF-08: whether the kitchen GFCI rule covers all kitchen receptacles, and the 2023 voltage and amperage range.
- [ ] R-GF-07: where the dishwasher GFCI rule sits in 2023 (210.8(D) vs 422.5).
- [ ] R-AF-02: the length of the short-extension exception.
- [ ] L-01 and L-04: the 2023 section and table numbers for general lighting load and its demand factors.
- [ ] L-05 to L-09: section numbers and percentages.
- [ ] O-01 to O-04: the optional-method percentages and the 220.87 metering rule.
- [ ] EV charger at 100% of nameplate (625.42).
- [ ] R-SMK-06: the exact distances from bathrooms and cooking appliances.
- [ ] R-CO-01: whether F.S. 553.885 applies to remodels or only new construction, and the FBC-R 9th Edition section numbers.
- [ ] R-PNL-01 to R-PNL-06: confirm unchanged in 2023.
- [ ] Every other rule: section number and threshold.

After verification, these rules feed the code-check tickets in Phase 6 of the Phases and tickets tab. A rule that fails verification is corrected here first.
