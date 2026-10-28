# Reuse map · phases 44–55 (70 tickets)

Source: open-source reuse unit, 2026-10-28 (vault/handoff/OPEN_SOURCE_REUSE.md; summary report R-033 (vault/research/R-033.md)). Verdicts by the copy criteria in that report. `reference` = read the named file while planning, copy nothing; `none` = build as planned. Pinned SHAs: pascalorg/editor fec1d14b; Driven take-off 46079c8c; RadloffBot/panelwright e08d7066.

Result: 0 port, 10 reference, 60 none. Spec read: S17 Tab: Measure, S17b Entry points and Controls, 09c lines 6-15, 09i lines 10-27.

| Ticket | Phase | Title | Verdict | Repo and files | Coverage | Why |
|---|---|---|---|---|---|---|
| EZD-1403 | 44 | Offline editing and conflicts | none | — | — | title |
| EZD-1412 | 44 | Stale actions on reconnect | none | — | — | title |
| EZD-1404 | 45 | Field pack shell | none | — | — | title |
| EZD-1405 | 45 | Plan and 3D tabs | none | — | — | title |
| EZD-1406 | 45 | Measure tab | reference | pascal snap.ts, corner-snap.ts; Driven parseDimensionInput (via EZD-201) | some | S17 Tab: Measure: snap to walls/corners and typed entry; laser is keyboard mode only, so the BLE repos are not used |
| EZD-1407 | 45 | Send measurement and Flag conflict | none | — | — | title |
| EZD-1408 | 45 | Field task templates and publishing | none | — | — | title |
| EZD-1409 | 45 | Tasks tab | none | — | — | title |
| EZD-1410 | 45 | Photo tab and pins | none | — | — | title |
| EZD-1411 | 45 | Field pack PDF | none | — | — | title |
| EZD-1413 | 45 | Field measurements review | none | — | — | title |
| EZD-1414 | 45 | Field conflicts list | none | — | — | title |
| EZD-1420 | 45 | Field tasks screen | none | — | — | title |
| EZD-1421 | 45 | Issue field pack | none | — | — | title |
| EZD-1424 | 45 | Field measure from the field pack | none | — | — | S17b Entry points: routing only |
| EZD-616 | 46 | Code rules: Florida Residential Ch. 3 (3 of 4) | none | — | — | 09c: rule data is ours |
| EZD-617 | 46 | Code rules: Florida Residential Ch. 3 (4 of 4) | none | — | — | 09c: rule data is ours |
| EZD-618 | 46 | Code rules: Existing Building | none | — | — | 09c: rule data is ours |
| EZD-621 | 46 | Code rules: Florida construction chapters (1 of 2) | none | — | — | 09c: rule data is ours |
| EZD-622 | 46 | Code rules: Florida construction chapters (2 of 2) | none | — | — | 09c: rule data is ours |
| EZD-623 | 47 | Code rules: Energy Conservation | none | — | — | 09c: rule data is ours |
| EZD-624 | 47 | Code rules: Mechanical (1 of 2) | none | — | — | 09c: rule data is ours |
| EZD-625 | 47 | Code rules: Mechanical (2 of 2) | none | — | — | 09c: rule data is ours |
| EZD-626 | 47 | Code rules: Fuel gas | none | — | — | 09c: rule data is ours |
| EZD-627 | 47 | Code rules: Plumbing (1 of 3) | none | — | — | 09c: rule data is ours |
| EZD-628 | 47 | Code rules: Plumbing (2 of 3) | none | — | — | 09c: rule data is ours |
| EZD-629 | 47 | Code rules: Plumbing (3 of 3) | none | — | — | 09c: rule data is ours |
| EZD-630 | 48 | Code rules: NEC Art. 100-230 (1 of 4) | reference | panelwright app.js serviceLoad22082 (structure only) | little | 09c load calc lines; every number from code-rules.json; article-to-ticket mapping not checked |
| EZD-631 | 48 | Code rules: NEC Art. 100-230 (2 of 4) | reference | panelwright app.js | little | as EZD-630 |
| EZD-632 | 48 | Code rules: NEC Art. 100-230 (3 of 4) | reference | panelwright app.js | little | as EZD-630 |
| EZD-633 | 48 | Code rules: NEC Art. 100-230 (4 of 4) | reference | panelwright app.js | little | as EZD-630 |
| EZD-634 | 48 | Code rules: NEC Art. 240-410 (1 of 4) | reference | panelwright app.js autoBalance (structure only) | little | 09c panel lines |
| EZD-635 | 49 | Code rules: NEC Art. 240-410 (2 of 4) | reference | panelwright app.js | little | as EZD-634 |
| EZD-636 | 49 | Code rules: NEC Art. 240-410 (3 of 4) | reference | panelwright app.js | little | as EZD-634 |
| EZD-637 | 49 | Code rules: NEC Art. 240-410 (4 of 4) | reference | panelwright app.js | little | as EZD-634 |
| EZD-638 | 49 | Code rules: NEC Art. 422-820 (1 of 2) | none | — | — | 09c: rule data; panelwright covers 220/408 only |
| EZD-639 | 49 | Code rules: NEC Art. 422-820 (2 of 2) | none | — | — | 09c: rule data |
| EZD-1501 | 50 | Translation store | none | — | — | title; gap search: no translation-memory candidate |
| EZD-1502 | 50 | AI drafting | none | — | — | title |
| EZD-1504 | 50 | Review table | none | — | — | title |
| EZD-1505 | 50 | Review card actions | none | — | — | title |
| EZD-1506 | 50 | Draft warnings | none | — | — | title |
| EZD-1507 | 50 | Glossary | none | — | — | title; gap search: none |
| EZD-1503 | 51 | Spanish display | none | — | — | title |
| EZD-1508 | 51 | Bulk approve | none | — | — | title |
| EZD-1509 | 51 | Propagation | none | — | — | title |
| EZD-1510 | 51 | Translation settings | none | — | — | title |
| EZD-1609 | 52 | Catalog settings | none | — | — | title |
| EZD-1611a | 52 | Takeoff framework and room finishes | reference | Driven calculatePolygonArea; pascal room-graph.ts polygonArea | some | 09i: floor area less cabinet/tub footprint; buildvisionai rejected (fixed deductions conflict with 09i openings-over-20-SF rule) |
| EZD-1611b | 52 | Takeoff: cabinets, tops, fixtures and electrical | none | — | — | 09i: device counts and wire runs; no candidate |
| EZD-1611c | 52 | Takeoff: ACT, option costs and snapshot | none | — | — | 09i ACT grid count; gap search: none |
| EZD-1612 | 52 | Waste factors | none | — | — | 09i waste per pattern; buildvisionai has no waste model |
| EZD-1613 | 52 | Takeoff screen | none | — | — | title |
| EZD-1614 | 52 | Tile layout preview | none | — | — | 09i layout preview; gap search: none |
| EZD-1615 | 52 | Takeoff CSV | none | — | — | title |
| EZD-1617 | 52 | Catalog settings: markup per category and edge library | none | — | — | title |
| EZD-1711 | 53 | Billing and paywall for other companies | none | — | — | title |
| EZD-1712 | 53 | Seats meter | none | — | — | title |
| EZD-1713 | 53 | Onboarding a new company | none | — | — | title |
| EZD-1120 | 54 | Local worker: real runner | none | — | — | title |
| EZD-1314 | 54 | Canonical event registry | none | — | — | title |
| EZD-1705 | 54 | Security review | none | — | — | title |
| EZD-1706 | 54 | Event log coverage | none | — | — | title |
| EZD-1710 | 54 | Code rule list and verification | none | — | — | 09c verified_by/verified_at |
| EZD-1701 | 55 | Performance targets | none | — | — | title |
| EZD-1702 | 55 | DXF size limits | none | — | — | title |
| EZD-1708 | 55 | Accessibility pass | none | — | — | title |
| EZD-1709a | 55 | Screen states: Projects and Settings | none | — | — | title |
| EZD-1709b | 55 | Screen states: editor tabs | none | — | — | title |
| EZD-1709c | 55 | Screen states: phone and client screens | none | — | — | title |

Spec vs candidate conflicts:
1. S17 Measure (keyboard-mode laser, no connection) vs the Bosch/Leica BLE protocols: BLE would add a connection the spec removed; reference only.
2. S17b Controls requires fractions to 1/16"; Driven parseDimensionInput splits any "a/b" fraction (read directly in geometry.ts), so 1/16 is covered.
3. 09c requires a "cannot run for lack of data" result; json-rules-engine has no such state.
4. 09i paint deducts openings over 20 SF; buildvisionai paint.ts uses fixed deductions.
