# Worked examples · load calc optional method (220.83), cases 1, 3, 4 and Table 220.55 (phase 20)

Added for EZD-615 (Q-0761). 09a is frozen word for word by the spec split check (`scripts/spec/split.test.mjs`, Q-0218), so these examples sit here and read with 09a. The rules are in decisions 09-calculations-and-rules, row Q-0761. The arithmetic was recomputed exactly by the calc-auditor (agent) on 2026-11-18.

**Source quality.** Like 09a, these follow published summaries and one published worked example, not the code book (KNOWN-LIMITS item 2). Every line they use shows the "not yet verified" tag. The sources:
- 220.83 pool and the 8 kVA / 40% split: ckelectricandsons.com/code/220-83; evchargeright.com/blog/nec-220-83-existing-homes; necmastery.com/blog/master-section-22083-nec-2023-calculate-electrical-service; code-check-rules O-02, O-03; catalog NE4-137.
- EV charger: catalog NE4-008 (Published summary); 09a case 4.
- Table 220.55: electricaltoolbox.com/range-demand-load-calculator; code-check-rules L-07.
- Breaker sizes: catalog NE3-003; loomi.fyi/nec/tables/240-6a.

**Rounding (all methods).** Each line is rounded to whole VA, half up, before summing; this is how 09a reaches 6,098 from 3,097.5 + 3,000. Amps are total VA × 10 / 240, half up, shown to 0.1 A, computed on integers. Pass/fail and size picks compare exact VA: amps pass when total VA ≤ service A × 240; the next size is the smallest size with total VA ≤ size × 240.

## Optional method, 220.83

- **Pool ("all other load")**: general lighting at 3 VA per sq ft; 1,500 VA per small-appliance circuit and per laundry circuit; the nameplate of every appliance, including the range, cooktop, ovens, dryer and water heater. There is no Table 220.45, 220.53 (75%), 220.54 or 220.55 demand, and no 25% motor line.
- **Pool demand**: the first 8,000 VA at 100% plus the rest at 40%.
- **(A) No new heating or cooling**: existing heating and existing cooling both go in the pool at nameplate. This is the conservative reading.
- **(B) New heating or cooling is installed**: the larger of heating or cooling goes at 100%, outside the pool. No heating or cooling goes in the pool.
- **New circuits** other than heating, cooling and EV join the pool (O-02: "existing plus new loads").
- **EV charger**: at 100%, outside the pool. Its value is the larger of nameplate or 7,200 VA under the 2023 NEC, and nameplate under the 2020 NEC (NE4-008).

### Toggle fixture: the 09a house under 220.83(A)

| Line | VA |
| --- | --- |
| General lighting, 2,450 sq ft × 3 | 7,350 |
| Small-appliance circuits, 2 × 1,500 | 3,000 |
| Laundry circuit, 1 × 1,500 | 1,500 |
| Dishwasher, disposal, microwave, water heater (nameplate) | 1,200 + 960 + 1,500 + 4,500 |
| Dryer (nameplate) | 5,000 |
| Range (nameplate) | 12,000 |
| Heat strips and cooling, both existing | 9,600 + 4,200 |
| Pool | 50,810 |
| First 8,000 at 100% | 8,000 |
| Remaining 42,810 at 40% | 17,124 |
| Total | 25,124 |
| Amps at 240 V | 104.7 A (exact 104.683) |

The standard method on the same house gives 35,868 VA and 149.5 A (09a). Turning the toggle on changes the total by −10,744 VA.

### Published check (necmastery.com example)

| Line | VA |
| --- | --- |
| Lighting, 1,800 × 3 | 5,400 |
| Small-appliance and laundry | 4,500 |
| Range, dryer, water heater, dishwasher | 12,000 + 5,000 + 4,500 + 1,200 |
| Existing A/C | 4,000 |
| EV charger, 32 A × 240 | 7,680 |
| Pool as published | 44,280 |
| 8,000 + 36,280 × 40% | 8,000 + 14,512 = 22,512 |
| Amps | 93.8 A (the page says "about 94") |

The page puts the EV charger in the pool. EZ Draft keeps it out at 100% (case 4a), so this table is a check of the pool arithmetic only. The page is not a fixture for the case 4 total.

### Existing load E (the published house without the EV)

| Pool | 8,000 + 28,600 × 40% | Total | Amps |
| --- | --- | --- | --- |
| 36,600 | 8,000 + 11,440 | 19,440 | 81.0 A |

## Case 1: circuits added to an existing panel

The E house has a 100 A service. New circuits join the pool. A 1-pole circuit needs 1 space and a 2-pole circuit needs 2. The case passes only when the amps pass and open spaces ≥ spaces needed.

| # | New circuits | Pool | Total VA | Amps | Spaces needed / open | Result |
| --- | --- | --- | --- | --- | --- | --- |
| 1a | microwave 1,500 (1P), small-appliance circuit 1,500 (1P), induction cooktop 7,200 (2P) | 46,800 | 8,000 + 15,520 = 23,520 | 98.0 A | 4 / 4 | Pass |
| 1b | as 1a | 46,800 | 23,520 | 98.0 A | 4 / 3 | Fail (spaces) |
| 1c | as 1a, plus a second water heater 4,800 (2P) | 51,600 | 8,000 + 17,440 = 25,440 | 106.0 A | 6 / 6 | Fail (amps) |

## Case 3: subpanel feeder

This uses the standard method exactly as in 09a, on the subpanel's loads only. The breaker is the next standard size at or above the feeder amps, from the 2023 Table 240.6(A) list: 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400 A. The 2020 list has no 10 A, and no fixture here changes because of that.

**3a**: a 600 sq ft unit with 2 small-appliance circuits and no laundry.

| Line | Input | VA |
| --- | --- | --- |
| General lighting | 600 × 3 | 1,800 |
| Small-appliance circuits | 2 × 1,500 | 3,000 |
| Subtotal |  | 4,800 |
| After demand, Table 220.45 | 3,000 + 1,800 × 35% | 3,630 |
| Fixed appliances | dishwasher 1,200 + water heater 4,500; only 2, so 100% | 5,700 |
| Range 8 kW, column C | one range not over 12 kW | 8,000 |
| Heating or cooling, larger of | heat 5,000 against cooling 2,400 | 5,000 |
| Largest motor at 25% | 2,400 VA compressor | 600 |
| Total |  | 22,930 |
| Feeder amps |  | 95.5 A (exact 95.542) |
| Breaker |  | 100 A |

| # | Total VA | Feeder amps | Breaker |
| --- | --- | --- | --- |
| 3b | 24,000 | 100.0 A | 100 A (at the size is enough) |
| 3c | 24,240 | 101.0 A | 110 A |

## Case 4: large add

| # | Service | Add | Pool part | Outside pool | Total VA | Amps | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4a | 100 A | EV charger, nameplate 7,680 (32 A × 240) | E: 19,440 | 7,680 (larger than 7,200) | 27,120 | 113.0 A | Fail |
| 4b | 100 A | EV charger, nameplate 5,760 (24 A × 240), 2023 NEC | E: 19,440 | 7,200 (larger than 5,760) | 26,640 | 111.0 A | Fail |
| 4b-2020 | 100 A | same charger, 2020 NEC | E: 19,440 | 5,760 (nameplate) | 25,200 | 105.0 A | Fail |
| 4c | 125 A | new heat pump, 220.83(B): cooling 4,800 and heat strips 9,600; the existing 4,000 A/C is removed | pool 32,600 → 8,000 + 9,840 = 17,840 | 9,600 (heat, the larger) | 27,440 | 114.3 A (exact 114.333) | Pass |

## Table 220.55 rows (standard method and case 3)

- **Column C** applies to cooking appliances over 1¾ kW. Its values: 1 appliance 8,000 VA, 2 = 11,000, 3 = 14,000, 4 = 17,000, 5 = 20,000.
- **Note 1**: a range over 12 kW, up to 27 kW, raises column C by 5% for each kW over 12. A fraction of a kW rounds half up to whole kW (a choice, recorded in Q-0761).
- **Note 4**: a counter-mounted cooktop and up to two wall ovens in the same room count as one range, rated at the sum of their nameplates. One wall oven or one cooktop alone counts at nameplate.
- **Columns A and B** are not used. Their values were not confirmed from a source, and column C is the value used for every appliance over 1¾ kW. A cooking appliance of 1¾ kW or less counts at nameplate.
- **Errors**: more than 5 cooking appliances, or a range over 27 kW, gives the calc error naming the range line.

| # | Cooking setup | Line VA |
| --- | --- | --- |
| R1 | one 14 kW range | 8,000 × 110% = 8,800 |
| R2 | cooktop 7.2 kW + wall oven 4.8 kW, same room | 12.0 kW, one range: 8,000 |
| R3 | cooktop 7.6 kW + wall oven 6.0 kW, same room | 13.6 kW, 1.6 over rounds to 2: 8,800 |
| R4 | two ranges, each not over 12 kW | 11,000 |
| R5 | one wall oven 4.8 kW alone | 4,800 (nameplate) |
| R6 | one 27 kW range | 15 kW over: 8,000 × 175% = 14,000 |
