# Common loads seed · typical appliance ratings (phase 20)

Added for EZD-640 (Q-0766, Q-0770). Josh (chat, 2026-11-18): "research common loads and use what is found. allow user to edit". This is the starting list on the S15e "Appliance rating defaults" card, which is also the common loads list. Every new company gets these rows, and every company can edit, add and delete them.
- retriever-web (agent) found the values on 2026-11-18.
- calc-auditor (agent) checked every V × A product exactly.

## Rules

- **Values are typical, not code values.** Each is one representative model's nameplate figure, or the 09a example value where no nameplate draw was found. On a real job the user replaces it with the model's own nameplate.
- **Weak sources are marked.** Many figures come from a search summary of a spec sheet that could not be opened. Those rows are marked "snippet".
- **Every load-calc line built from a seed row shows the "not yet verified" tag** (KNOWN-LIMITS item 2).
- **VA = volts × amps**, as stored (S15e; EZD-614). Volts are 120 or 240 (09b:35; Q-0704). A 208/230 V nameplate is restated at 240 V, which errs high.
- **EV chargers store nameplate amps only.** The 7,200 VA floor of the 2023 NEC is applied by the engine (Q-0761; NE4-008) and is never written into the seed.
- **Refrigerator and clothes washer rows are for reference.** The standard method does not add them as lines: the refrigerator is covered by the small-appliance circuits (09a), and the washer by the 1,500 VA laundry circuit (220.52(B)).
- **Test fixtures never read the seed.** The 09a example (35,868 VA, 149.5 A) and the 09r examples keep their own input values. The EZD-640 tests check that a new company has exactly these rows and that an edited value is used.

## Seed rows

| # | Type (calc kind) | Volts | Amps | VA | Source |
| --- | --- | --- | --- | --- | --- |
| 1 | Range | 240 | 48.75 | 11,700 | GE JB256 spec sheet, 11.7 kW, 40 A breaker (snippet): static.pcrichard.com/docs/JB256DMBB_Specifications-Sheet_01.pdf |
| 2 | Cooktop, 30" | 240 | 30.8 | 7,392 | GE JP3030, 7.4 kW max connected load, 30.8 A max current (snippet): ajmadison.com/cgi-bin/ajmadison/JP3030TWWW.html; canadianappliance.ca GE_JP3030DWBB |
| 3 | Wall oven, 30" single | 240 | 15.4 | 3,696 | Frigidaire FGEW3065P, 3.7 kW, 15.4 A (snippet): frigidaire.bynder.com FGEW3065P spec PDF |
| 4 | Microwave, over the range | 120 | 14.0 | 1,680 | GE JNM3163, 14.0 A, 1,600 W input (retailer snippet): buydig.com GEJNM3163DJBB |
| 5 | Range hood | 120 | 2.5 | 300 | GE JVX3300, 120 V, 2.5 A, 81 W: manualmachine.com/ge/jvx3300djbb/4993522-specifications |
| 6 | Refrigerator (reference only) | 120 | 6.5 | 780 | GE service manual, 6.5 A: manualslib.com/manual/1072529/Ge-Hps15bthr.html?page=11 |
| 7 | Dishwasher | 120 | 10 | 1,200 | 09a worked-example value. No nameplate draw was found: the Whirlpool instructions give only a 15 A supply circuit |
| 8 | Disposal, 1/2 hp (motor) | 120 | 6.3 | 756 | InSinkErator Badger 5, "6.3 amps at 120v": thegranitegroup.com/Product/INSBADGER5 |
| 9 | Clothes washer (reference only) | 120 | 10 | 1,200 | GE GTW500, 10 A (sheet URL not captured); 15 A circuit per manualslib.com/manual/2719026/Ge-Wcvh4815k.html?page=16 |
| 10 | Dryer, electric | 240 | 22.5 | 5,400 | 5,400 W on a 30 A circuit: easybear-appliancerepair.com/blog/electric-dryer-amps-watts-breaker (a repair blog; its "about 24 A" does not match 5,400 W at 240 V, so the watts figure is used). The engine still applies the 5,000 VA minimum (220.54) |
| 11 | Water heater, 50 gal | 240 | 18.75 | 4,500 | 4,500 W, 240 V element (retailer snippet): shopkoopman.com Richmond 6EM50-D; matches NE4-018 and 09a |
| 12 | Heat strips, 10 kW (heating) | 240 | 41.7 | 10,008 | Mitsubishi EH10-SVZ-M kit, 41.7 A at 240 V (snippet): budgetheating.com. V × A is 8 VA over the 10 kW label because the nameplate amps are rounded |
| 13 | A/C or heat pump, 3 ton (cooling, motor) | 240 | 17.5 | 4,200 | 09a worked-example value. Corroborated by a Goodman GSZB403610 listing at RLA 16.0 A at 208/230 V (snippet): supplyhouse.com. A circuit figure (MCA) is not used as a load |
| 14 | EV charger, 32 A (ev_charger) | 240 | 32 | 7,680 | ChargePoint Home Flex, 32 A on a 40 A breaker: chargepoint.com/drivers/home/installation/flex |
| 15 | EV charger, 48 A (ev_charger) | 240 | 48 | 11,520 | ChargePoint Home Flex, 48 A on a 60 A breaker (same page); Tesla Wall Connector, 48 A on 60 A: energylibrary.tesla.com Wall Connector install guide |
| 16 | Pool pump, 1.5 hp (other, motor) | 240 | 10.0 | 2,400 | Century HSQ1152 motor (Hayward TriStar), 10.0 A at 230 V (snippet): sunplay.com centurion HSQ1152. Restated at 240 V |

**No source found:** pool pump at the pump level (only the motor's figure), and a single-phase 3-ton condenser running-amps page that could be opened.
