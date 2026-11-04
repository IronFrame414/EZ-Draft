# Reuse map · phases 33–43 (85 tickets)

Source: open-source reuse unit, 2026-10-28 (vault/handoff/OPEN_SOURCE_REUSE.md; summary report R-033 (vault/research/R-033.md)). Verdicts by the copy criteria in that report. `reference` = read the named file while planning, copy nothing; `none` = build as planned. Pinned SHAs: pascalorg/editor fec1d14b; laanlabs/openPlan3D 98f9cb46; gdsestimating/three-dxf 20e14cbd; microsoft/maker.js 53bb7f64; mozilla/pdf.js 24a63a4d. Root package.json at mapping time: three 0.186.1, pdfjs-dist 6.4.299; no three-bvh-csg, dxf-writer, dxf-viewer, drei or mathjs.

Result: 0 port, 15 reference, 70 none. Spec read: S07, S11, 08 Imports/Exports, S12 rows.

| Ticket | Phase | Title | Verdict | Repo and files | Coverage | Why |
|---|---|---|---|---|---|---|
| EZD-1001a | 33 | 3D scene core | reference | pascal wall-system.tsx (react/three); openPlan3D planWallOutline.ts, wallProfiles.ts | little | S07 Data shown; candidates import react/three or $lib types |
| EZD-1001b | 33 | 3D ceilings and beams | reference | openPlan3D roomSlabGeometry.ts | little | S07 Data shown (ceiling slope, beams); candidate is a floor slab |
| EZD-1001c | 33 | 3D cabinets, fixtures, devices and finishes | none | — | — | S07 Data shown; no 3D candidate |
| EZD-1002 | 33 | Navigation | reference | pascal components/editor/first-person-controls.tsx | little | S07 Controls (orbit/walk, iPad gestures); pointer lock fails on iPad (conflict) |
| EZD-1004 | 33 | Section and display modes | none | — | — | S07 Section; no candidate clips a plane |
| EZD-1005 | 33 | 3D layers | none | — | — | title |
| EZD-1006 | 33 | Saved views | none | — | — | S07 Data shown (camera_view); no candidate |
| EZD-1015 | 33 | iPad memory guard and states | none | — | — | title |
| EZD-1003 | 34 | Walk and Look up | reference | pascal first-person-controls.tsx; openPlan3D walkthroughMotion.ts | little | S07 Controls (iPad joystick); pointer lock conflicts |
| EZD-1007 | 34 | Select and apply finish | none | — | — | title |
| EZD-1008 | 34 | Rail on the 3D tab | none | — | — | title |
| EZD-1012 | 34 | Measure in 3D | none | — | — | S07 Controls (distance between two points); gap search: no permissive 3D measure |
| EZD-1017 | 34 | Inspector 3D preview | none | — | — | title |
| EZD-1009 | 35 | Design options data | none | — | — | title |
| EZD-1010 | 35 | Options inspector | none | — | — | title |
| EZD-1011 | 35 | Make options from the RCP | none | — | — | title |
| EZD-1013 | 35 | Phone 3D viewer | none | — | — | S07 Layout (phone viewport); no candidate |
| EZD-1014 | 35 | GLB and USDZ export | reference | pascal glb-export.ts, usdz-export.ts | some | 08 Exports (GLB compressed, USDZ); compression and standalone status unverified |
| EZD-1018 | 35 | Spike: AR on iPhone and iPad | none | — | — | title |
| EZD-1019 | 35 | AR viewing | reference | pascal usdz-export.ts | little | 08 Exports (AR Quick Look) |
| EZD-1020 | 35 | AR editing | none | — | — | title |
| EZD-1021 | 35 | IFC export | none | — | — | title; no IFC candidate |
| EZD-1101 | 36 | Render records and jobs | none | — | — | title |
| EZD-1102 | 36 | Render models settings | none | — | — | title |
| EZD-1103 | 36 | Provider adapters | none | — | — | title |
| EZD-1106 | 36 | Step 1: angle | none | — | — | title |
| EZD-1107 | 36 | Preview and optional alignment | none | — | — | title |
| EZD-1108 | 36 | Step 2: style and direction | none | — | — | title |
| EZD-1109 | 36 | Tiers and Generate | none | — | — | title |
| EZD-1110 | 36 | Renders list and notifications | none | — | — | title |
| EZD-1111 | 37 | Render view | none | — | — | title |
| EZD-1112 | 37 | Comment pins | none | — | — | title |
| EZD-1113 | 37 | Fix and regenerate | none | — | — | title |
| EZD-1114 | 37 | Two-step approval | none | — | — | title |
| EZD-1115 | 37 | Model changed detection | none | — | — | title |
| EZD-1116 | 37 | Download | none | — | — | title |
| EZD-1117 | 37 | Render allowance | none | — | — | title |
| EZD-737 | 37 | Scope PDF with renders | none | — | — | title; no sheet/PDF generator found |
| EZD-1104a | 38 | Local worker protocol | none | — | — | title |
| EZD-1104b | 38 | Local worker program | none | — | — | title |
| EZD-1105 | 38 | Browser path tracer | none | — | — | title |
| EZD-1118 | 38 | Render A/B/C from 3D | none | — | — | title |
| EZD-1119 | 38 | R1.0 finish schedule + renders | none | — | — | title |
| EZD-1121 | 38 | Second provider adapter | none | — | — | title |
| EZD-1201 | 39 | Share links | none | — | — | title |
| EZD-1202 | 39 | Client page shell | none | — | — | title |
| EZD-1205 | 39 | Plans tab | none | — | — | title |
| EZD-1208 | 39 | Selection offers and choice pages | none | — | — | title |
| EZD-1209 | 39 | Edge choice | none | — | — | title |
| EZD-1210 | 39 | Verify and sign | none | — | — | title |
| EZD-1211 | 39 | Approve | none | — | — | title |
| EZD-1212 | 39 | Selections PDF | none | — | — | title |
| EZD-1215 | 39 | Send to client composer | none | — | — | title |
| EZD-734 | 39 | Tile layout client sign-off | none | — | — | title |
| EZD-1203 | 40 | Render gallery | none | — | — | title |
| EZD-1204 | 40 | Client comments | none | — | — | title |
| EZD-1206 | 40 | Send options to client | none | — | — | title |
| EZD-1207 | 40 | Option choice | none | — | — | title |
| EZD-1213 | 40 | Send image | none | — | — | title |
| EZD-1214 | 40 | Archive options on signing | none | — | — | title |
| EZD-901a | 41 | Reference conversion job | reference | three-dxf src/index.js getBulgeCurvePoints, drawSpline; maker.js chain.ts findChains | little | 08 Imports (DXF model and paper space, blocks, hatches); no DXF parser in candidates; hatches need dxf-viewer (dependency) |
| EZD-901b | 41 | Reference drawing in Plan | reference | three-dxf src/index.js drawLine, drawArc, drawSpline | little | 08 Imports; functions nested in Viewer, old three API |
| EZD-902 | 41 | Reference under the model | reference | pascal corner-snap.ts, snap.ts | little | S11 Controls (snap on reference geometry) |
| EZD-903 | 41 | Alignment | none | — | — | S11 Decision 2 (two-point align); no candidate |
| EZD-904 | 41 | Reference layers panel | none | — | — | title |
| EZD-905 | 41 | Paper-space layouts | none | — | — | S11 Controls; no DXF layout candidate |
| EZD-913 | 41 | DXF export | reference | openPlan3D canvasSymbolDxf.ts (dxf-writer) | little | 08 Exports (CAD DXF); dxf-writer would be a dependency |
| EZD-921 | 41 | Architect revision labels | none | — | — | title |
| EZD-906 | 42 | Convert layers | reference | pascal room-graph.ts; openPlan3D roomDetection.ts | little | S11 Controls (walls, openings, rooms, cabinets to Import review); candidates cover rooms only |
| EZD-907 | 42 | Markup layer | none | — | — | S11 Controls; no candidate |
| EZD-908 | 42 | Reference versions | none | — | — | title |
| EZD-909a | 42 | Reference diff job | none | — | — | S11 Decision 1; gap search: no DXF diff candidate |
| EZD-909b | 42 | Reference diff view | none | — | — | S11 Controls; no candidate |
| EZD-910 | 42 | Keep or accept a revision | none | — | — | title |
| EZD-911 | 42 | Export markup | reference | openPlan3D canvasSymbolDxf.ts (dxf-writer) | little | 08 Exports (markup layer DXF or PDF overlay) |
| EZD-912 | 42 | Section or callout from reference | none | — | — | title |
| EZD-922a | 42 | Reference states (screen 11) | none | — | — | title |
| EZD-914 | 43 | Supplier files panel | none | — | — | title |
| EZD-915 | 43 | Supplier vector PDF import | reference | pdf.js makePathFromDrawOPS; maker.js chain.ts | little | 08 Imports (vector PDF); pdfjs-dist is already a dependency |
| EZD-916 | 43 | 2020 order report import | none | — | — | S12 Order report import; no candidate |
| EZD-917 | 43 | Tag and link tools | none | — | — | title |
| EZD-918 | 43 | Read codes | none | — | — | title |
| EZD-919 | 43 | Compare and resolve mismatches | none | — | — | S12 Comparison table; no candidate |
| EZD-920 | 43 | Suggested finishes | none | — | — | title |
| EZD-922b | 43 | Supplier markup states (screen 12) | none | — | — | title |

Spec vs candidate conflicts and dependencies:
1. S07 Controls requires iPad joystick and touch; pascal first-person-controls and drei PointerLockControls use pointer lock, which fails on iPad Safari (EZD-1002, EZD-1003).
2. 08 Exports asks for compressed GLB; pascal glb-export.ts compression unverified (EZD-1014 stays reference until checked).
3. drei would be needed by EZD-1002, EZD-1003 (PointerLockControls), EZD-1004 (Edges), EZD-1001a (Text labels). dxf-viewer by EZD-901a/b (hatches). dxf-writer by EZD-913, EZD-911. All three are dependencies for Josh's yes.
