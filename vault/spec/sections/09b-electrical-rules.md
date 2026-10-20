# Calculations and rules: electrical rules
<!-- Moved word for word from vault/spec/sections/09-calculations-and-rules.md lines 14-20, 31-56 (Q-0218). Check: node --test scripts/spec/split.test.mjs -->

**Electrical code warnings (run by Check, and automatically at issue)**

- Countertop receptacle spacing; GFCI locations; AFCI locations.
- Required dedicated circuits: dishwasher, disposal, microwave, refrigerator, bathroom.
- Smoke and CO detector locations.
- Voltage drop above the company threshold. Each warning: fix it, or accept with a note. Accepted notes print in the issue log. Check runs from the tool rail on any editor tab.

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

