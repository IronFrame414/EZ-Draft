# Open-source reuse unit · checkpoint

Handoff: vault/handoff/OPEN_SOURCE_REUSE.md. Branch r/open-source-reuse, worktree .claude/worktrees/reuse. Sessions end at 30% context; the next session reads this file first.

| Step | State | Notes |
| --- | --- | --- |
| 0 setup | in progress | worktree, handoff file, grant patch (vault/handoff/OPEN_SOURCE_REUSE-grant.patch, Josh applies), process-line question |
| 1 verify candidates | todo | retriever-web per repo group; reports in vault/research/pending/ |
| 2 gap search | todo | |
| 3 map tickets | todo | Explore agents per 3-4 phases; files vault/research/reuse/phases-NN-NN.md |
| 4 report | todo | summary report ticket: EZD-201; number assigned at adoption |
| 5 notices file | todo | needs the grant applied |
| 6 stage code | todo | vault/reuse/code/<ticket>/ |
| 7 build EZD-201 | todo | after staging; launcher paused with Josh's yes |
| 8 proposals | todo | Q-IDs taken at commit time |

Pinned SHAs: (filled by step 1)

## Step 1 facts so far (2026-10-28, from pending reports + direct fetches)
- pascalorg/editor fec1d14bff94b042c4bd913ba2f0cb2f61dac943, MIT "Copyright (c) 2026 Pascal Group Inc.", no NOTICE, commit 2026-10-28. 22 of 23 files at the named paths; first-person-controls.tsx is at packages/editor/src/components/editor/first-person-controls.tsx. Units metres (explicit in wall-system.tsx, wall-openings.ts, schedules.ts; inferred elsewhere). Many files import @pascal-app/core, react, three.
- laanlabs/openPlan3D 98f9cb467e4045c6abc5d9880ada1f03dff50c68, MIT "Copyright (c) 2026 theLodgeStudio", commit 2026-10-22. All 9 files exist; units centimetres; most import $lib/models/types and other $lib modules (not framework-free as the sweep said).
- Driven take-off 46079c8cb9686412ac101d96bae90e708447fa51, MIT "Copyright (c) 2026 Driven Waterproofing Solutions Pty Ltd", commit 2026-10-16. utils/geometry.ts parseDimensionInput read directly (scratchpad copy): handles 12'6", 12' 6 1/2", 150", 12.5', 10-6; returns decimal feet; imports ../types only. math.ts evaluateFormulaChecked needs mathjs.
- dobriai/footinch 72d3c18360c8f11b1375892ac7ce5a5d1f680033: NO LICENSE file (package.json "license": "MIT", author Ivan Dobrianov), commit 2022-02-02. Changed from the sweep ("MIT option").
- Liksu/to-inches 13a6502ed46a285cb7a02d2f2fb244fe61aa2234, MIT "Copyright (c) 2024 Petro Borshchahivskyi", commit 2025-07-13; input mm only.
- microsoft/maker.js 53bb7f6481e9eefd3da4a22ca5d2ef220a1dbe54, Apache-2.0 "Copyright 2015-2016 Microsoft", no NOTICE, commit 2026-10-27. chain.ts, pdf.ts (inches × 72, PDFKit type only), layout.ts all present, no imports.
- mozilla/pdf.js 24a63a4d488d4fe26c2a5ca32216ac9698d0de59, Apache-2.0, no NOTICE, commit 2026-10-28. makePathFromDrawOPS, DrawOPS present; constructPath is a CanvasGraphics method. Reference only.
- gdsestimating/three-dxf 20e14cbd13735e16a1b691f7b864936dd688fb74, MIT "Copyright (c) 2015 GDS Storefront Estimating", commit 2021-10-22. The seven functions exist but are nested inside Viewer (not exported); imports three, troika-three-text, @dxfom/mtext.
- vagran/dxf-viewer d601f94f7114d3df9044289ff185c460ab57fc40, MPL-2.0 (SIA SPH Engineering 2024), commit 2026-10-17, npm dxf-viewer 1.0.50; patterns are .js files (117 imperial, 128 metric), not .pat.
- pmndrs/drei bf6f4addf47467d3885de272d94ca5127f6ef68f, MIT "Copyright (c) 2020 react-spring", commit 2026-09-30; npm @react-three/drei 10.7.9, unpacked 1,753,692 bytes; peers react ^19, three >=0.159, @react-three/fiber ^9. All five files exist; dependency only.
- CacheControl/json-rules-engine e1f1fda81bb384752531dc29a3817672df51d439, ISC "Copyright (c) 2017 Cache Hamm", commit 2026-02-16; repo 7.3.2, npm latest 7.3.1, unpacked 100,901 bytes; deps clone, eventemitter2, hash-it, jsonpath-plus. Dependency only.
- pnnl/ruleset-checking-tool 977e8c9c2311bdc4409bfdabab4a6cb285cb64c3, BSD-style "Copyright Battelle Memorial Institute 2021", commit 2026-02-01; rule_base.py has all five methods. Python; reference only.
- Nearly-Free-Energy/nfe-electrical-toolkit c2485a70e4ea1f36c8d8b29aff7bb81f35727da3, Apache-2.0, NOTICE "Copyright 2026 Nearly Free Energy", commit 2026-10-22; placement.py present (shapely, metres; no BS 7671 limits). Python; reference only.
- PointerEvent/bosch-plr-demo 8fb074b225dfa856c2721724b2862398a7bb9bf8, MIT "Copyright (c) 2024 Tobbe", commit 2024-10-03; service 00005301-0000-0041-5253-534f46540000, characteristic 00004301-...; AutoSync c0 55 02 01 00 1a, measure c0 40 01 00 fa; float32 LE at payload offset 3+4; CRC8 not verified (TODO in code). docs/ holds two Bosch PDFs (excluded).
- lz1asl/CaveSurvey 43f6ef352d8de4b6f3a9ddf29ba3536a464b9be0, MIT (LICENSE.txt) "Copyright (c) 2013 Cave Survey Project", commit 2026-10-02; DISTO service 3ab10100-f831-4395-b29d-570977d5bf94, distance characteristic 3ab10101-..., name "DISTO ", float32 LE metres.
- seichter/d2relay d0f5d22399a4ace4be8bebca1cab24a11c7094ab, MIT wording (license.md) "Copyright (c) 2021 Hartmut Seichter", commit 2025-01-17; same characteristic 3ab10101, 4-byte float. Confirms CaveSurvey.
- buildvisionai/construction-calculators 4dde4be0b2b6bd13fd0c97eb837d8b3b99e4129b: no LICENSE at root (python/LICENSE only), package.json license "MIT", author "BuildVision (https://buildvisionai.com)", commit 2026-04-22. drywall/flooring/paint: no imports; rectangular rooms, fixed door/window deductions, 10% drywall waste. Thin formulas.
- HexNinja555/opentakeoff 2cac7a43636b1e4e227c5dc7b82600babb13396f, Apache-2.0 "Copyright 2026 Kentucky AI and the OpenTakeoff contributors", NOTICE present (same line), commit 2026-07-20; history read (51 commits) has no 84c7f48e and nothing after 2026-10-10; upstream 84c7f48e is 2026-10-10, upstream HEAD 798ee881 is AGPL-3.0 (2026-10-26). geometry.js (closedMetrics, openLen, pointInPoly, distToSeg) no imports; totals.js imports six sibling modules.
- Kentucky-ai/opentakeoff: AGPL-3.0 at HEAD. Not usable.
Step 1: complete (all 19 repos). Step 2: three retrievers dispatched (NEC/electrical/symbols; ceiling/walls/clouds/sheets; DXF/3D measure/labels/glossary/npm feet-inch).
Step 2 (gap search) complete, three reports in pending/. Found: RadloffBot/panelwright (MIT 2026, JS, NEC 220.82 + panel autoBalance; written by an AI agent; numbers embedded → reference only, catalog supplies numbers). None found (permissive): receptacle/GFCI/AFCI checks, plan symbol SVGs, ceiling grid, wall detection, revision clouds/delta tags in JS (ezdxf.revcloud is Python), sheet/title block/viewport generators, Polycam layer names (blog only: walls/openings/fixtures/labels layers), DXF diff, three.js measure tool, cabinet SKU parser, translation memory. npm feet-inch: measures (MIT 2022), pretty-imperial (MIT 2022, simple units) — weaker than take-off's parser. DXF parsers (dependencies, MIT): gdsestimating/dxf-parser, @dxfjs/parser, bjnortier/dxf.
Step 3 (mapping): Explore agents per group; 02-10 and 11-21 dispatched.
Step 3 (mapping) complete: five files in vault/research/reuse/, 371 tickets, 1 port / 57 reference / 313 none (script check: no missing, no extra).
Step 4 (report) complete: adopted as R-033 (summary) and R-034..R-042 (retriever reports); research.test passes.
Steps 5-7 wait on Josh: EZD-201 parser as port (a) or reference (b). Under (b) no notices file, no grant, no staging.
Step 8: proposals are in R-033 (no merges/splits/drops; dependency table; planner process line). Questions ledger entries not yet written (Q-IDs taken at commit time on develop).
