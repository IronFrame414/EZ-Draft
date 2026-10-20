# Calculations and rules: electrical load calculation
<!-- Moved word for word from vault/spec/sections/09-calculations-and-rules.md lines 5-13, 57-88 (Q-0218). Check: node --test scripts/spec/split.test.mjs -->

**Electrical load calculation**

- Methods: NEC Article 220 standard method, and the optional method for existing dwellings (220.83), turned on or off per calc with a toggle.
- Five cases: circuits added to an existing panel (does the service hold); service upgrade; subpanel feeder sizing; large adds (EV charger, heat pump); like-for-like panel replacement with no service change.
- Inputs: square footage (from rooms), small-appliance and laundry circuits, fixed appliances from catalog ratings (fallback to editable standard defaults), existing panel data and circuits, existing large appliances.
- Standard method lines: general lighting by area, small-appliance circuits, laundry, demand factors, fixed appliances, dryer, ranges, larger of heating or cooling, total VA, amps at 240 V, compare to service rating.
- Output: every line of math printed on E2.0 with the panel schedule. Stored with the model version when a set issues.
- Every electrical sheet notes that the electrical contractor of record verifies the design. Signature block per submittal profile (none, EC, architect).

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

