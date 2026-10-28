# Reuse map · phases 2–10 (60 tickets)

Source: open-source reuse unit, 2026-10-28 (vault/handoff/OPEN_SOURCE_REUSE.md; summary report R-033 (vault/research/R-033.md)). Verdicts by the copy criteria in that report. `port` = staged code in vault/reuse/code/<ticket>/; `reference` = read the named file while planning, copy nothing; `none` = build as planned. Pinned SHAs: pascalorg/editor fec1d14b; laanlabs/openPlan3D 98f9cb46; Driven take-off 46079c8c.

Result: 0 port, 7 reference, 53 none.

| Ticket | Phase | Title | Verdict | Repo and files | Coverage | Why |
|---|---|---|---|---|---|---|
| EZD-108 | 2 | Avatar menu and My profile | none | — | — | title |
| EZD-110 | 2 | Notifications | none | — | — | title |
| EZD-117a | 2 | Projects page: query and cards | none | — | — | title |
| EZD-117b | 2 | Projects page: header, search and states | none | — | — | title |
| EZD-118 | 2 | New project wizard | none | — | — | title |
| EZD-137 | 2 | Mark complete and Completed filter | none | — | — | title |
| EZD-140 | 2 | Notification settings per user | none | — | — | title |
| EZD-120a | 3 | Model tables, save function and checkpoints | none | — | — | title |
| EZD-120b | 3 | Model store, outbox and editor route | none | — | — | title (store) |
| EZD-133 | 3 | Access and money-field harness | none | — | — | title |
| EZD-202 | 3 | Model document schema | none | — | — | title |
| EZD-238 | 3 | Drawing list | none | — | — | title; maker.js toPDF is a primitive, not a drawing list |
| EZD-201 | 4 | Length parse and format | reference | Driven take-off utils/geometry.ts parseDimensionInput; pascalorg schedules.ts formatScheduleLength | some | 04-app-shell §Measurement entry lists 4 formats and 1/16" storage; Driven returns decimal feet and also accepts "10-6"; pascal formatter takes metres and sits in a file that imports @pascal-app/core (the function itself is pure) |
| EZD-203 | 4 | Walls core | reference | pascal wall-mitering.ts | little | 09e: moving a wall stretches connected walls; mitering only draws joins |
| EZD-205 | 4 | Rooms and closure | reference | pascal room-graph.ts; openPlan3D roomDetection.ts | little | 09e closure gap and wall choice; candidates detect faces, no gap logic |
| EZD-207 | 4 | Plan canvas | none | — | — | title |
| EZD-209 | 4 | Typed dimension bar | reference | Driven parseDimensionInput (via EZD-201) | some | S03 Typed dimension bar lists the 4 formats; the parser lands in EZD-201 |
| EZD-210 | 4 | Wall and Room rectangle tools | none | — | — | S03 Wall, Room rectangle: tool UI, no candidate |
| EZD-221 | 4 | Blank templates | none | — | — | title |
| EZD-236 | 4 | Benchmark project generator | none | — | — | title |
| EZD-204 | 5 | Openings core | reference | pascal wall-openings.ts | little | 04 Selection, undo and flags: off-wall items stay put and turn red; clampDoorToWall moves them (conflict) |
| EZD-206 | 5 | Snapping | reference | pascal snap.ts, corner-snap.ts | some | S03 status bar snap toggles; snap.ts not standalone |
| EZD-208 | 5 | Selection | none | — | — | title |
| EZD-211 | 5 | Door and window tools | reference | pascal wall-openings.ts planWallOpening; openPlan3D doorSymbol.ts | some | S03 Door, Window: hosted on a wall; symbol needs retyping |
| EZD-212 | 5 | Move, handles, distance chips | none | — | — | S03 Move and Live distance chips: no candidate |
| EZD-213 | 5 | Inspector fields | none | — | — | title |
| EZD-217 | 5 | Undo, redo and clipboard | reference | pascal history.ts, history-control.ts | little | 04 undo (Cmd+Z in session); no clipboard; zundo-bound |
| EZD-135 | 6 | System status page | none | — | — | title |
| EZD-214 | 6 | Status and phase switch | none | — | — | title |
| EZD-216 | 6 | Dimensions and text | reference | pascal floorplan-dimension-renderer.tsx, floorplan-annotation-layout.ts | little | S03 Dimension and Text; renderer is React |
| EZD-218 | 6 | Left panel: Layers and Rooms | none | — | — | title |
| EZD-219 | 6 | Status bar popovers | none | — | — | title |
| EZD-224 | 6 | Plan thumbnail | none | — | — | title |
| EZD-235 | 6 | Derived values and workers | none | — | — | title |
| EZD-237 | 6 | Benchmark page | none | — | — | title |
| EZD-104 | 7 | Users table | none | — | — | title |
| EZD-105 | 7 | Invite user | none | — | — | title |
| EZD-106 | 7 | User inspector | none | — | — | title |
| EZD-107 | 7 | Custom roles | none | — | — | title |
| EZD-109 | 7 | Event log | none | — | — | title |
| EZD-129 | 7 | User project scope | none | — | — | title |
| EZD-138 | 7 | Invite link and code for the sender | none | — | — | title |
| EZD-116 | 8 | Defaults framework | none | — | — | title |
| EZD-125 | 8 | Edit lock service | none | — | — | title |
| EZD-126 | 8 | Edit lock UI | none | — | — | title |
| EZD-128 | 8 | Project switcher | none | — | — | title |
| EZD-130 | 8 | Project settings dialog | none | — | — | title |
| EZD-225 | 8 | Editor states | none | — | — | title |
| EZD-111 | 9 | Send dialog with Copy link | none | — | — | title |
| EZD-121 | 9 | Sent versions and numbering | none | — | — | title |
| EZD-122 | 9 | Versions panel | none | — | — | title |
| EZD-123 | 9 | Version cleanup | none | — | — | title |
| EZD-124 | 9 | Project card menu | none | — | — | title |
| EZD-139 | 9 | Visual diff of an old version | none | — | — | title; no DXF diff candidate found |
| EZD-215 | 10 | Bearing wall rule | none | — | — | 09e bearing-wall block: no candidate |
| EZD-220 | 10 | Existing-condition pins | none | — | — | title |
| EZD-226 | 10 | Custom tile shower objects | none | — | — | 09e and S03 Fixtures: no candidate |
| EZD-227 | 10 | Grab-bar blocking | none | — | — | title |
| EZD-229 | 10 | Existing-condition details | none | — | — | title |
| EZD-234 | 10 | Fixtures tool and utility points | none | — | — | title |

Spec vs candidate conflicts:
1. EZD-204, EZD-211: pascal clampDoorToWall moves hosted items onto the wall; spec 04 says off-wall items stay put and turn red "Not on a wall".
2. EZD-201, EZD-209: Driven parseDimensionInput also accepts "10-6"; the spec lists only the four formats. Returns decimal feet; spec stores inches to 1/16".

Note on EZD-201: the parser was the closest thing to a port in this group. Josh (2026-10-28): reference only; EZD-201 writes its own parser from 04 §Measurement entry and reads the take-off file for the format cases.
