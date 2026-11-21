# Phase 57: questions for Josh

Written 2026-11-20 when phase 57 was prepared for the build loop.

Phase 57 draws every object the code rules ask about that EZ Draft couldn't draw before, and switches those rules on (your answer "yes to everything", Q-0789): stairs, guard rails, ramps, lofts, skylights, garage doors, carports, saunas, glass block, fireplaces and chimneys, furnaces, heaters, boilers, stoves, generators, pools and spas, floor drains, and valves and backflow devices. It has 21 tickets, EZD-644 to EZD-664.

**No questions need you.** Everything was settled from the rule book (`vault/spec/code-rules.json`), the spec and your decisions. The new screens follow the style of the plan editor's inspector, the same way you approved for earlier phases. The choices are in `vault/build/assumptions.md` under "Phase 57 code-rule objects" and "Phase 57 prep", including the proposed tool names and labels marked "Wording for Josh to confirm".

## For your information (no answer needed)

- **Some phase 57 tickets wait on phases 48 and 49.** Those code-rule tickets are held until 48–55 are prepared. Until then, these phase 57 tickets can't start: the stair rules (EZD-646, needs EZD-633 and EZD-634), the guard, ramp and loft rules (EZD-648, after EZD-646), carport and sauna rooms (EZD-651, needs EZD-630), gas furnace and heater rules (EZD-656, needs EZD-632 and EZD-638), generator rules (EZD-658, needs EZD-639), pool and spa rules (EZD-660, needs EZD-639) and the final check (EZD-664). The drawing tools themselves can build.
- **A few rules still can't fully check** because the rule book doesn't carry the code value they need: glass block above 20 psf wind pressure, the room-volume part of the unvented-heater rule, a garage door's required wind pressure (Table R301.2(4)), and a floor drain's drainage load. Those parts show as "can't check" rather than a guessed number.
- **About 57 rules aren't about these objects** (vehicle lifts, foam insulation, hose bibbs and similar). They stay under "Not checked by EZ Draft".
