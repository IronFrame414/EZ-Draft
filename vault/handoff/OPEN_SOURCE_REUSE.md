# Handoff: reuse open-source code instead of building it

To: the EZ Draft orchestrator, as one research unit in a fresh session. From: Josh, 2026-10-28. Where this fits: run it now, while phase 1 waits on Josh; it touches no app code and no spec text, so it does not conflict with the blocked tickets. Place this file at `vault/handoff/OPEN_SOURCE_REUSE.md`.

## Premise

Do not rebuild what already exists. Before a ticket is planned, the build should know whether permissively licensed code already implements that part, and the plan should port it instead of writing it from scratch. Expected result: some tickets in phases 2 to 55 shrink a lot, a few disappear into others, and the rest are unchanged.

This unit does the research, the mapping and the porting: it takes the code each ticket needs, converts it, and stages it so the ticket's build is mostly wiring and tests. Tickets whose dependencies are already done and whose work is mostly covered are then built through the normal plan → build → gate cycle, so they can finish in the same run.

## Rules for this unit

1. **Licenses.** Code may be copied only from MIT, Apache-2.0, BSD-2/3, ISC, 0BSD, Unlicense or CC0 sources. MPL-2.0 is usable only as an unmodified npm dependency. GPL, LGPL, AGPL, a custom or "source-available" license, "all rights reserved", or no license file at all: not usable. A repo with no license is not free to use; it means no permission was given. The EZ Draft repo is public and will be sold to other companies.
2. **Verify, do not trust this file.** Every repo, path and function name below came from a quick sweep on 2026-10-28. Confirm each LICENSE and each named file at a pinned commit SHA. A package.json license field without a LICENSE file counts, but say so in the report.
3. **Do not clone repos (Josh, 2026-10-28).** Read single files over the web instead: the commit SHA from `git ls-remote <repo> HEAD`, then each file from `https://raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>` (or `https://cdn.jsdelivr.net/gh/<owner>/<repo>@<sha>/<path>`). Fetch only the LICENSE, NOTICE and the files a ticket needs. Never install, build or run anything from a source repo.
4. **No code rule text** (CLAUDE.md rule 13). Take engine and calculation logic only. Rule text, numbers and conditions come only from `vault/spec/code-rules.json`.
5. **No new dependency without Josh.** Anything that would be installed (not copied) goes to Josh as a question with the reason, license and size. Already pending: `json-rules-engine` (phase 21) and `dxf-viewer` (phase 41, MPL-2.0, hatch patterns).
6. **Ported code** keeps its copyright line in a header comment; is listed in `THIRD_PARTY_NOTICES.md` at the repo root (repo, SHA, license, files); carries the source's NOTICE file if it is Apache-2.0 and has one; is converted to EZ Draft's own types, Zod schemas and inch units; gets EZ Draft's own tests. Ported code is held to the same review as written code; a reviewer finding in it is fixed, not waved through because it came from elsewhere.
7. **Spec wins.** Where a source behaves differently from the spec, the spec is right; the plan adapts the code or uses it as reference only.
8. **Knowledge files are directories of small files.** The report is `vault/research/R-033.md` (index entry via `node vault/tools/research.mjs adopt`) plus one small file per phase group in `vault/research/reuse/`, so a planner reads only its own phase.
9. **Write limits for this unit.** Steps 1 to 6 write only `vault/research/`, `vault/reuse/`, `THIRD_PARTY_NOTICES.md` and the questions ledger; grant this in `guard-paths.mjs` for this unit only, the way earlier handoffs did. Staged code in `vault/reuse/code/` must not be picked up by lint, typecheck or tests; if the gate sees it, store it as `.ts.txt`. App code changes only inside step 7, through normal tickets. No edits to `vault/PROCESS.md` or `vault/spec/`.
10. **Ticket changes.** Shrinking a ticket's plan because ported code covers it is the planner's normal job. Merging, splitting or dropping a ticket, and any process change, go to Josh as a proposal list; apply only after his yes.
11. **Order still holds.** A ticket is built only when its `depends_on` tickets are done. Staging code early is fine; wiring it in waits for its turn.

## Steps

1. **Verify the candidates** in the table below by reading single files (rule 3). For each: pinned SHA, license confirmed, last commit date, files confirmed, fit to the EZ Draft spec section, adaptation effort (low / medium / high), verdict (port / reference / skip).
2. **Fill the gaps.** Search again, broader, for every item in "Not found yet". Use WebSearch and single-file reads (the GitHub search API is blocked here). Also check npm for small permissive packages that do one job (e.g. feet-inch parsing). Report what you searched, so a "none found" is believable.
3. **Map to tickets.** Walk every ticket in phases 2 to 55 (`vault/tickets/tickets.json`). For each, write one of: `port <repo> <files>`, `reference <repo> <files>`, or `none`. Estimate how much of the ticket the reuse covers (most / some / little).
4. **Write the report**: `R-033.md` (summary, license rules above, the verified table, rejected list) and `vault/research/reuse/<phase-range>.md` files with the per-ticket mapping.
5. **Create `THIRD_PARTY_NOTICES.md`** at the repo root with a header and an empty table (repo, SHA, license, files, ticket), so the first porting ticket has a place to write.
6. **Stage the code.** For every ticket marked `port` with coverage "most" or "some": fetch the needed source files at the pinned SHA, convert them to TypeScript in EZ Draft's style (inch units, EZ Draft types and Zod schemas, no framework code it does not use), keep the copyright header, and save them in `vault/reuse/code/<ticket>/` with a short `README.md` (source repo, SHA, license, files, what was changed, what the ticket still has to write). Add each to `THIRD_PARTY_NOTICES.md` marked "staged". Write the per-ticket mapping so the planner points the plan at the staged files.
7. **Build what is ready.** For each ticket with staged code whose `depends_on` are all done, run it through the normal process now (plan, questions, build, gate). The plan uses the staged files; the builder moves them into `app/` or `packages/`, wires them in and adds EZ Draft's own tests; the gate and reviewers apply as usual. Mark the `THIRD_PARTY_NOTICES.md` row "merged" with the ticket's commit. Tickets not yet ready keep their staged code for when their turn comes.
8. **Propose to Josh**, as a numbered list in the questions ledger:
   - tickets to merge, split or drop because reuse covers them, with the reason;
   - the two pending dependencies (rule 5) plus any new ones found;
   - one process line for planners: "Read the `vault/research/reuse/` file for this phase and the staged code in `vault/reuse/code/<ticket>/`; use it or state why not." (Process edits need Josh's approval first.)

## Candidates to verify

| EZ Draft phase | Repo (license, last commit seen) | Files / functions | Notes |
|---|---|---|---|
| 4–6 walls, joins, snapping, openings, undo | github.com/pascalorg/editor (MIT, 2026-10-28) | `packages/core/src/systems/wall/wall-mitering.ts` (calculateLevelMiters, getWallMiterBoundaryPoints, getAdjacentWallIds); `packages/core/src/lib/corner-snap.ts` (evaluateCorner); `packages/core/src/services/snap.ts`; `packages/editor/src/components/tools/wall/wall-snap-geometry.ts`; `packages/core/src/building/wall-openings.ts` (clampDoorToWall, clampWindowToWall, findWallChildOverlap, planWallOpening); `packages/core/src/store/history-control.ts`; `packages/editor/src/lib/history.ts` | Strongest match found. Same three 0.186 and Zustand 5; uses zundo for undo. Units are metres: every tolerance constant needs converting to inches |
| 4–6 rooms, closure gaps | pascalorg/editor | `packages/core/src/lib/room-graph.ts` (extractRooms, detectRoomFaces, polygonArea, detectOpenWallEnds); `packages/core/src/lib/space-detection.ts` (detectSpacesForLevel, wallClosesRoom); `packages/core/src/building/wall-gaps.ts` (gapBridges) | Relevant to the room-closure acceptance test |
| 6 dimensions | pascalorg/editor | `packages/editor/src/components/editor-2d/renderers/floorplan-dimension-renderer.tsx`; `floorplan-annotation-layout.ts`; `packages/core/src/schema/nodes/construction-dimension.ts`; formatScheduleLength in `packages/editor/src/lib/floorplan/schedules.ts` (1/16" rounding, 3'-0" output) | No parser here |
| 4, 13, 14 measurement entry | github.com/Driven-Waterproofing-Solutions-Pty-Ltd/take-off (MIT, 2026-10-17) | `utils/geometry.ts` parseDimensionInput (10' 6 1/2", 10-6, fractions) | Returns feet; change to inches. Check against all four acceptance-test formats: 12'6", 12' 6 1/2", 150", 12.5' |
| 4–10 door symbols, wall outlines, rooms | github.com/laanlabs/openPlan3D (MIT, 2026-10-22) | `src/lib/utils/doorSymbol.ts`; `planWallOutline.ts` (planWallOutlines); `roomDetection.ts` (detectRooms, getRoomPolygon, roomCentroid, roomLabelPosition); `canvasSymbolSvg.ts`; `canvasSymbolDxf.ts` | Svelte app, but these utils are framework-free. Also has `roomplanImport.ts` (Apple RoomPlan) |
| 15–16 cabinets, countertops | pascalorg/editor | `packages/nodes/src/cabinet/continuous-placement.ts` (fillCabinetContinuousSpan); `run-finishing.ts` (cabinetWallFillerPlan, fitCabinetWallFillers); `countertop-layout.ts` (getCabinetCountertopLayout) | Fill uses one fixed module width plus remainder; the 3" increment auto-fill still has to be written |
| 33–35 3D walls with cutouts, walk, GLB/USDZ | pascalorg/editor | `packages/viewer/src/lib/csg-utils.ts` (csgEvaluator, subtractCsgBrush, prepareBrushForCSG); `packages/viewer/src/systems/wall/opening-cutout-geometry.ts`; `wall-system.tsx` (generateExtrudedWall, mergeWallCutoutBrushes); `packages/editor/src/lib/usdz-export.ts` (exportSceneToUsdz); `glb-export.ts`; `first-person-controls.tsx` | Already uses three-bvh-csg, same as EZ Draft |
| 33–35 floors, walkthrough | laanlabs/openPlan3D | `roomSlabGeometry.ts` (createRoomSlabGeometry); `wallProfiles.ts` (buildWallSegments, openings without CSG); `walkthroughMotion.ts` | |
| 33–35 3D helpers | github.com/pmndrs/drei (MIT, 2026-09-30) | `src/core/PointerLockControls.tsx`, `Line.tsx`, `Edges.tsx`, `Grid.tsx`, `Text.tsx` | Would be a dependency: question for Josh |
| 13 PDF vector import | github.com/mozilla/pdf.js (Apache-2.0, 2026-10-27) | `src/display/display_utils.js` makePathFromDrawOPS; `src/shared/util.js` DrawOPS; `src/display/canvas.js` constructPath | Reference only: shows how path data comes out of the operator list. The extractor (track save/restore/transform, decode paths) is ours |
| 13 joining loose segments | github.com/microsoft/maker.js (Apache-2.0, 2026-10-27) | `packages/maker.js/src/core/chain.ts` (findChains, toKeyPoints) | |
| 25–27 PDF at scale | microsoft/maker.js | `packages/maker.js/src/core/pdf.ts` toPDF (units → inches → 72 pt) | Built on PDFKit, same as EZ Draft |
| 28 revision clouds | microsoft/maker.js | `layout.ts` childrenOnPath | Reference for placing arcs along an outline |
| 41–42 DXF drawing | github.com/gdsestimating/three-dxf (MIT, 2021-10-21) | `src/index.js` drawLine, drawArc, drawSpline/getBSplinePolyline, getBulgeCurvePoints, drawBlock, createDashedLineShader | Old three API; port the per-entity functions only |
| 41 hatch patterns | github.com/vagran/dxf-viewer (MPL-2.0, 2026-10-17) | `src/HatchCalculator.js`, `src/Pattern.js`, `src/patterns/*.pat` | Unmodified dependency only; question for Josh |
| 21, 46–49 code check engine | github.com/CacheControl/json-rules-engine (ISC, 7.3.2, 2026-02-16) | `src/engine.js`, `src/almanac.js`; types in `types/index.d.ts` | Dependency: question for Josh. Compare against the engine already specified in 09c before proposing |
| 21 check result shape | github.com/pnnl/ruleset-checking-tool (BSD-3, 2026-02-01) | `rct229/rule_engine/rule_base.py` RuleDefinitionBase (get_context, is_applicable, get_calc_vals, rule_check, manual_check_required) | Python; reference only. Its rules are energy code: do not copy |
| 19 receptacle wall runs | github.com/Nearly-Free-Energy/nfe-electrical-toolkit (Apache-2.0, 2026-10-21) | `src/nfe_electrical/placement.py` RoomWalls, WallRun, _spread, propose | Python, British rules. Reference for usable wall length with door gaps excluded |
| 52 takeoff formulas | github.com/buildvisionai/construction-calculators (MIT in package.json, no LICENSE file, 2026-04-22) | `src/drywall.ts` calculateDrywall; `src/flooring.ts` calculateFlooring; `src/paint.ts` | Assumes rectangular rooms and fixed opening deductions; feed real wall and opening sizes |
| 52 takeoff geometry | github.com/HexNinja555/opentakeoff (Apache-2.0 fork, 2026-07-20) | `web/src/lib/geometry.js` closedMetrics, openLen, pointInPoly, distToSeg; `web/src/lib/totals.js` verticalWallSf, materialsSummary | Upstream (Kentucky-ai/opentakeoff) moved to AGPL on 2026-10-10. Use only code at or before upstream commit `84c7f48e`; confirm in its CHANGELOG. Keep NOTICE |
| 52 user formulas, polygon metrics | Driven take-off | `utils/math.ts` evaluateFormulaChecked (mathjs); `utils/geometry.ts` calculatePolygonArea, calculatePolylineLength, calculateArcLength | mathjs would be a dependency |
| 14, 45 Bosch laser, Web Bluetooth | github.com/PointerEvent/bosch-plr-demo (MIT, 2024-10-03) | `app/index.html`: service/characteristic UUIDs, start command bytes, parseExchangeDataContainer, extractData | Tested on PLR 50 C only; it skips the checksum check, so add it. Its `docs/` protocol PDFs are Bosch's, not under the code license |
| 14, 45 Leica DISTO | github.com/lz1asl/CaveSurvey (MIT, 2026-10-02) | `src/main/java/com/astoev/cave/survey/service/bluetooth/device/ble/LeicaDistoBluetoothLEDevice.java` | Java/Android; port protocol constants and decoding only. Its Bosch support uses a private library: skip that part |
| 14, 45 Leica confirmation | github.com/seichter/d2relay (MIT, 2025-01-17) | `app/__main__.py` | Reference only, confirms the DISTO characteristic |
| 4–6 feet-inch reference | github.com/dobriai/footinch (MIT option, 2022) and github.com/Liksu/to-inches (MIT, 2025) | `lib/parse.js`, `lib/format.js`; `src/to-inches.ts` | Reference only |

Reference only, already superseded by the above: cvdlab/react-planner (MIT, 2019), furnishup/blueprint3d (MIT, 2016), mehanix/arcada (Apache-2.0, PixiJS), NREL/floorspace.js (BSD-3, Vue), charmlinn/blueprint3d-modern (MIT).

## Not found yet (search again in step 2)

- NEC residential load calculation (Article 220 standard method, 220.82, 220.83). Every implementation found was unlicensed or "all rights reserved".
- NEC receptacle spacing, GFCI/AFCI and dedicated-circuit checks; circuit assignment.
- Plumbing fixture and electrical device symbol SVGs under a permissive license.
- Acoustic ceiling tile grid centering (border tile never below half), tile layout.
- Wall detection from parallel line pairs in vector PDFs.
- Revision cloud and delta tag drawing.
- Sheet set, title block and viewport-at-scale generators.
- Polycam layered DXF mapping (walls, openings, rooms by layer).
- DXF diff between two versions of a drawing.
- 3D measure tool.
- Supplier cabinet label parsing (W3030, B24…).
- Translation glossary / phrase reuse (phases 50–51).

## Rejected in the first sweep (do not use)

No license: softpython2884/IntelliPlan, DekeMcskeat/ee-workbench (NEC kernel), aren4570-dwelling-service-calculator, leeatvision/load-calc, scmcclure01/house-electrical, TysunM/pipefit-pro, Disto-for-Mac, Disto_Control, pymtprotocol, CodeHole7/threejs-3d-room-designer. All rights reserved or custom: augustov58/sparkplan, volkov596/planum, ElecPLan ("UNLICENSED"). Copyleft: Kentucky-ai/opentakeoff (current AGPL), hikikomori82/osifont (GPL). Not relevant: BOSCH-GLM-rangefinder (classic Bluetooth, not reachable from Web Bluetooth), standby-sizer, VoltGecko, electrical-plan-editor, adekom/decitectural. Not reviewed (could not clone): volkov596/measureup.

## Report back

The normal report format, plus:
1. The verified table: each candidate marked verified, changed (what differs from this file) or failed.
2. The gap search results, including what was searched.
3. Ticket counts: how many tickets in phases 2 to 55 got `port`, `reference` or `none`, and the proposed merge / split / drop list.
4. Staged code: tickets with code in `vault/reuse/code/`, and which of them were built and merged in step 7.
5. The questions added for Josh.

## Decisions in session (Josh, 2026-10-28, interactive)

- Route: copy with notices (one-line copyright header per ported file, `THIRD_PARTY_NOTICES.md` at the root; nothing in the UI). "Realistically, this will not be sold. EZ Draft is for me and a couple of friends."
- Copy only code that fits perfectly and saves time: license confirmed at a pinned SHA; does what the spec says; standalone; conversion limited to units, names and types; replaces most of a ticket or a whole step; no code-rule text or numbers. Anything else is reference or skip.
- Step 7: stage everything; build EZD-201 now as the proof (pause the launcher with Josh's yes); the launcher builds the rest in turn.
