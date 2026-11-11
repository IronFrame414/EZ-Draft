# Glossary addendum · Phase 10

Added by spec-check 10 (Q-0704). Definitions only, each from the source named; no new rules. Read with `vault/spec/glossary.md` and addenda 00b to 00j.

| Term | Meaning | Code name | Source |
| --- | --- | --- | --- |
| Fixture | A plumbing fixture or appliance placed from the Fixtures panel. | `fixture` (kind) | S03:44; Q-0704 |
| Utility point | Where an appliance's electric (volts and amps), gas, water or drain line arrives. | `utility_point` | 03f:10 |
| Utilities to move | The list shown after an appliance moves: its linked utility points that stayed put. | none (UI) | S03:157 |
| Existing-condition pin | A marker on the existing plan (damage/moisture, protect, lead, plumbing, gas, water heater) that may hold a photo. | `pin` | 03f:16; W3 |
| Floor level | A room's finished floor height against 0, in signed inches. | `room.floorLevel` | 03f:16; Q-0704 |
| Transition | The mark drawn where two rooms meet with a different floor level or floor finish. | derived | 03f:15; Q-0704 |
| Custom tile shower | A site-built shower with curb, niches, bench, glass, pan slope and drain. | `tile_shower` | 03f:10; Q-0704 |
| Curb | The raised lip at the shower entry, measured above the top of the drain; none means curbless. | `tile_shower.curb` | P-044 |
| Niche | A recess in a shower wall. | `tile_shower.niches` | 03f:10 |
| Pan slope | The shower floor's fall toward the drain, in inches per foot. | `tile_shower.panSlope` | P-045 |
| Grab-bar blocking | Framing hosted on a wall for a future grab bar (length, height to centre, side). | `blocking` | 03f:10; Q-0704 |
| Engineer required | The warning raised when a bearing wall is removed, demolished or opened. | `engineer_note` (not filled) | Q-0205; S03:154 |
| Engineer note | The engineer's name and approval, with an optional letter, that clears the warning. | `engineer_note` (filled) | phase-02.md:33; Q-0205 |
