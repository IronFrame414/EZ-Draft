# Reuse map · phases 11–21 (90 tickets)

Source: open-source reuse unit, 2026-10-28 (vault/handoff/OPEN_SOURCE_REUSE.md; summary report R-033 (vault/research/R-033.md)). Verdicts by the copy criteria in that report. `port` = staged code in vault/reuse/code/<ticket>/; `reference` = read the named file while planning, copy nothing; `none` = build as planned. Pinned SHAs: Driven take-off 46079c8c; pascalorg/editor fec1d14b; mozilla/pdf.js 24a63a4d; microsoft/maker.js 53bb7f64; bosch-plr-demo 8fb074b2; CaveSurvey 43f6ef35; json-rules-engine e1f1fda8; pnnl 977e8c9c; nfe c2485a70.

Result: 0 port, 14 reference, 76 none (EZD-1416 was the one port candidate; Josh 2026-10-28: reference only, it uses the EZD-201 parser).

| Ticket | Phase | Title | Verdict | Repo and files | Coverage | Why |
|---|---|---|---|---|---|---|
| EZD-131 | 11 | Libraries shell | none | — | — | title |
| EZD-222 | 11 | Keyboard shortcuts and Help | none | — | — | title |
| EZD-223 | 11 | Sketch tool | none | — | — | S03 Sketch row: freehand auto-clean; wall/snap candidates do not match |
| EZD-230 | 11 | Default key map and full rail | none | — | — | title |
| EZD-231 | 11 | Measure tool (plan) | none | — | — | S06 Measure row; no candidate |
| EZD-232 | 11 | Manual revision cloud (plan) | none | — | — | title; revcloud is Python only (gap search) |
| EZD-233 | 11 | Context menu, mirror, align, groups | none | — | — | title |
| EZD-301 | 12 | Upload step | none | — | — | title |
| EZD-302 | 12 | Polycam DXF detection | none | — | — | 08 Polycam Space scan row: layer detection; no candidate reads DXF layers |
| EZD-303 | 12 | Polycam GLB mesh | none | — | — | 08 Polycam mesh row: underlay; glb-export is export only |
| EZD-307 | 12 | Import review screen | none | — | — | title |
| EZD-308 | 12 | Review modes | none | — | — | title |
| EZD-309 | 12 | Fix and delete | none | — | — | title |
| EZD-310 | 12 | Typed vs scan conflicts | none | — | — | title |
| EZD-311 | 12 | Resolve the gap | none | — | — | S02 closure rule; no candidate absorbs a gap |
| EZD-313 | 12 | Finish and cancel | none | — | — | title |
| EZD-304 | 13 | PDF underlay and scale | reference | Driven parseDimensionInput (typed distance; lands in EZD-201) | little | S01 PDF: scale calibration |
| EZD-305 | 13 | Vector PDF wall detection | reference | pdf.js makePathFromDrawOPS (path extraction); maker.js chain.ts findChains (joins segments) | little | S01 PDF detect type; 08 Existing plan row: findChains does not detect walls |
| EZD-306 | 13 | DXF conversion choice | none | — | — | S01 DXF conversion choice (UI) |
| EZD-312 | 13 | Ceiling slope in review | none | — | — | title |
| EZD-314 | 13 | Import states | none | — | — | title |
| EZD-315 | 13 | Laser keyboard input | reference | bosch-plr-demo app/index.html; CaveSurvey LeicaDistoBluetoothLEDevice.java | little | 08 Laser row, 04 Measurement entry: keyboard mode only; Bluetooth is not in the spec (conflict) |
| EZD-134 | 14 | App-shell cache and device storage | none | — | — | title |
| EZD-1401 | 14 | Service worker cache | none | — | — | title |
| EZD-1402 | 14 | Offline change queue | none | — | — | title |
| EZD-1415 | 14 | Field measure: shapes and walls | reference | Driven calculatePolygonArea, calculatePolylineLength | little | S17b Layout and Controls: shapes and closure; helpers do not close walls |
| EZD-1416 | 14 | Field measure: keypad and closure | reference | Driven parseDimensionInput (format cases); the parser itself comes from EZD-201 | some | S17b Keypad row and 04 Measurement entry: same four formats; closure not covered |
| EZD-1417 | 14 | Field measure: offline save and send | none | — | — | title |
| EZD-1418 | 14 | Field measure into Import review | none | — | — | title |
| EZD-1419 | 14 | Field measure entry points and states | none | — | — | title |
| EZD-1422 | 14 | Field measure as wizard input | none | — | — | title |
| EZD-401 | 15 | Catalog items (minimal) | none | — | — | title |
| EZD-402 | 15 | Cabinet object model | none | — | — | title |
| EZD-403 | 15 | Cabinet library panel | none | — | — | title |
| EZD-404 | 15 | Plan strip and elevation | none | — | — | title |
| EZD-405 | 15 | Box editing on canvas | reference | pascal snap.ts | little | S04: place, drag, resize boxes; snap is generic |
| EZD-406 | 15 | Box inspector | none | — | — | title |
| EZD-407 | 15 | Fit chip | reference | pascal continuous-placement.ts fillCabinetContinuousSpan | little | 09f Cabinet rules: fit after fillers and scribe |
| EZD-408 | 15 | Auto-fill run | reference | pascal continuous-placement.ts fillCabinetContinuousSpan | some | S04 Auto-fill; 09f Cabinet rules: 3" increments plus fillers; source uses one module width plus remainder (conflict) |
| EZD-409 | 15 | Cabinet schedule | reference | pascal formatScheduleLength (length format only) | little | title |
| EZD-410 | 15 | Cabinet flags and states | none | — | — | title |
| EZD-411 | 16 | Countertop object model | none | — | — | title |
| EZD-412 | 16 | Trace and Draw outline | reference | pascal countertop-layout.ts; room-graph.ts detectRoomFaces | little | S04b Trace cabinets, Draw outline |
| EZD-413 | 16 | Seams and cutouts | none | — | — | S04b split a piece; no 2D candidate |
| EZD-414 | 16 | Edges and overhangs | reference | pascal run-finishing.ts | little | S04b; 09f Countertop rules |
| EZD-415 | 16 | Seating support check | none | — | — | 09f Countertop rules; no candidate |
| EZD-416 | 16 | Left panel and status bar | none | — | — | title |
| EZD-417 | 16 | Edge profiles | none | — | — | title |
| EZD-418 | 16 | Top schedule | reference | pascal formatScheduleLength | little | S04b Top schedule; output is sq ft |
| EZD-419 | 16 | Plan inspector: run selection | none | — | — | title |
| EZD-127 | 17 | Review pill | none | — | — | title |
| EZD-501 | 17 | Ceiling data per room | none | — | — | title |
| EZD-502 | 17 | RCP view and ceiling rail | none | — | — | title |
| EZD-503 | 17 | Ceiling type editor | none | — | — | title |
| EZD-504 | 17 | Walls cut under slopes | none | — | — | 09e; no candidate |
| EZD-507 | 17 | Ceiling devices | none | — | — | title |
| EZD-508 | 17 | Fixture schedule panel | none | — | — | title |
| EZD-513 | 17 | Soffits, trays, coffers, crown, tags | none | — | — | title |
| EZD-505 | 18 | Beams | none | — | — | title |
| EZD-506 | 18 | Section A-A preview | none | — | — | title |
| EZD-509 | 18 | Auto-layout cans | none | — | — | title; no candidate |
| EZD-510 | 18 | Switching zones | none | — | — | title |
| EZD-511 | 18 | ACT grid | none | — | — | gap search: no tile-grid centring found |
| EZD-512 | 18 | HVAC objects | none | — | — | title |
| EZD-514 | 18 | Framing known and keep-clear | none | — | — | title |
| EZD-515 | 18 | Fan clearance and hosted flags | none | — | — | title |
| EZD-516 | 18 | Beam finish, More menu, canvas | none | — | — | title |
| EZD-601 | 19 | Electrical mode and left panel | none | — | — | title |
| EZD-602 | 19 | Device toolbar | none | — | — | S06 Device toolbar: manual placement; nfe placement.py is spacing only |
| EZD-603 | 19 | Device height notes | none | — | — | title |
| EZD-604 | 19 | Circuits | none | — | — | title |
| EZD-605 | 19 | Switch legs | none | — | — | title |
| EZD-606 | 19 | Panel and existing panel dialog | none | — | — | title |
| EZD-609 | 19 | Panel schedule | reference | panelwright app.js autoBalance (structure only; numbers from code-rules.json) | little | title |
| EZD-610 | 19 | Selected circuit and voltage drop | none | — | — | title; no voltage-drop candidate |
| EZD-607 | 20 | Load calc engine | reference | panelwright app.js serviceLoad22082 (structure only); Driven math.ts evaluateFormulaChecked (mathjs, dependency) | little | 09a Electrical load calculation: standard-method lines; numbers only from code-rules.json |
| EZD-608 | 20 | Load calc inspector | none | — | — | title |
| EZD-614 | 20 | Appliance rating defaults | none | — | — | title |
| EZD-615 | 20 | Load calc: optional method and cases | reference | panelwright app.js serviceLoad22082 (structure only) | little | 09a optional method; numbers only from code-rules.json |
| EZD-640 | 20 | Common loads list | none | — | — | title |
| EZD-642 | 20 | Commercial load calculation | none | — | — | title; no candidate |
| EZD-228 | 21 | Bath clearance check | none | — | — | title |
| EZD-611a | 21 | Code check engine and rule registry | reference | json-rules-engine engine.js, almanac.js (dependency, needs Josh); pnnl rule_base.py (result shape) | little | 09c Code check engine: registry, editions, three rule types; json-rules-engine has none of those (conflict) |
| EZD-611b | 21 | Code rules: Florida Residential Ch. 3 (1 of 4) | none | — | — | 09c Code rules catalog: rule text is ours |
| EZD-611c | 21 | Code rules: Florida Residential Ch. 3 (2 of 4) | none | — | — | 09c Code rules catalog |
| EZD-612 | 21 | Check button and results | reference | pnnl rule_base.py (result shape) | little | S06 Check row: results list |
| EZD-613 | 21 | Code edition settings | none | — | — | title |
| EZD-620 | 21 | Code data fields | none | — | — | 09c Code rules catalog |
| EZD-641 | 21 | Scope of work match check | none | — | — | title |
| EZD-643 | 21 | Other code editions | none | — | — | 09c Code check engine; no candidate |

Spec vs candidate conflicts:
1. EZD-315: spec is keyboard mode only; Bluetooth (Bosch PLR, Leica DISTO) is a path the spec does not have. Bluetooth constants are kept for phase 45 if the spec there asks for it.
2. EZD-223: S03 Sketch is freehand auto-clean; no candidate matches.
3. EZD-305: S01 needs wall detection; findChains only joins segments.
4. EZD-408: 09f requires 3" increments; the pascal fill uses one module width plus remainder.
5. EZD-611a: 09c defines a registry with editions and three rule types and a "cannot run, say so" rule; json-rules-engine only evaluates JSON conditions against facts. It could at most evaluate each rule's test inside our registry, and only with Josh's yes on the dependency.
