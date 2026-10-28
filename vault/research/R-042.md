---
title: Verify three repos at pinned commits (license, file facts, fork ancestry)
scope: https://raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>, https://api.github.com/repos/<owner>/<repo>/commits/<sha>, https://api.github.com/repos/<owner>/<repo>/commits?sha=<sha>&per_page=30, https://api.github.com/repos/<owner>/<repo>/compare/<a>...<b>, https://api.github.com/repos/<owner>/<repo>/git/trees/<sha>?recursive=1 for the three repos above only
ticket: EZD-1609
---

# A. github.com/buildvisionai/construction-calculators @ 4dde4be0b2b6bd13fd0c97eb837d8b3b99e4129b

- Tree: https://api.github.com/repos/buildvisionai/construction-calculators/git/trees/4dde4be0b2b6bd13fd0c97eb837d8b3b99e4129b?recursive=1 (truncated: false). No LICENSE, LICENSE.md, COPYING or NOTICE at root. Only license file is python/LICENSE (subdirectory).
- package.json: https://raw.githubusercontent.com/buildvisionai/construction-calculators/4dde4be0b2b6bd13fd0c97eb837d8b3b99e4129b/package.json
  - "name": "@buildvisionai/construction-calculators"
  - "author": "BuildVision (https://buildvisionai.com)"
  - "license": "MIT"
- Commit: https://api.github.com/repos/buildvisionai/construction-calculators/commits/4dde4be0b2b6bd13fd0c97eb837d8b3b99e4129b
  - Author wiktorleon; author and committer date 2026-04-22T22:19:14Z; message "1.0.1"
- src/drywall.ts: exists (tree). https://raw.githubusercontent.com/buildvisionai/construction-calculators/4dde4be0b2b6bd13fd0c97eb837d8b3b99e4129b/src/drywall.ts
  - Exports: interface DrywallInput, interface DrywallResult, function calculateDrywall(input: DrywallInput): DrywallResult. SHEET_AREAS_IMPERIAL/METRIC not exported.
  - Imports: none.
  - Units: ft (imperial) or m (metric) for dimensions; area implied sq ft (4x8 sheet = 32) or m2 (metric 2.97 per sheet). Units not stated in code.
  - Does: wallArea = perimeter * height - doors * doorArea - windows * windowArea. Imperial door 21, window 15; metric door 1.95, window 1.4.
  - Assumes: perimeter-based walls (rectangular room implied by perimeter input); fixed opening deductions above.
  - Waste: sheets = Math.ceil((totalArea * 1.10) / sheetArea), i.e. 10%, sheet count only (tape, compound, screws not covered).
- src/flooring.ts: exists (tree). https://raw.githubusercontent.com/buildvisionai/construction-calculators/4dde4be0b2b6bd13fd0c97eb837d8b3b99e4129b/src/flooring.ts
  - Exports: interface FlooringInput, interface FlooringResult, function calculateFlooring(input: FlooringInput): FlooringResult. FLOORING_DEFAULTS not exported.
  - Imports: none.
  - Units: imperial room ft, plank in, area sq ft; metric room m, plank mm, area m2; cost converted with 10.7639 to sq ft.
  - Does: totalArea = roomLength * roomWidth; perimeter = 2 * (roomLength + roomWidth).
  - Assumes: rectangular room. No opening deductions.
  - Waste: caller-supplied wastePercent; totalAreaWithWaste = totalArea * (1 + wastePercent / 100). No default number in file.
- src/paint.ts: exists (tree). https://raw.githubusercontent.com/buildvisionai/construction-calculators/4dde4be0b2b6bd13fd0c97eb837d8b3b99e4129b/src/paint.ts
  - Exports: interface PaintInput, interface PaintResult, function calculatePaint(input: PaintInput): PaintResult. DOOR_AREA, WINDOW_AREA, PAINT_COVERAGE, PAINT_RATE not exported.
  - Imports: none.
  - Units: ft2 (imperial) or m2 (metric). Coverage sq ft per gallon or m2 per liter; metric result is labeled gallonsNeeded though it is liters.
  - Does: netWallArea = Math.max(0, totalWallArea - doorDeduction - windowDeduction); gallonsNeeded = Math.ceil(totalPaintableArea / coverage), totalPaintableArea = (netWallArea + ceilingArea) * coats.
  - Assumes: fixed opening deductions: door 21 ft2 / 1.95 m2, window 15 ft2 / 1.4 m2.
  - Waste: none in file.

# B. github.com/HexNinja555/opentakeoff @ 2cac7a43636b1e4e227c5dc7b82600babb13396f

- LICENSE: https://raw.githubusercontent.com/HexNinja555/opentakeoff/2cac7a43636b1e4e227c5dc7b82600babb13396f/LICENSE
  - First line "Apache License"; "Apache License, Version 2.0". Copyright line: "Copyright 2026 Kentucky AI and the OpenTakeoff contributors" (appendix).
- NOTICE: https://raw.githubusercontent.com/HexNinja555/opentakeoff/2cac7a43636b1e4e227c5dc7b82600babb13396f/NOTICE returned content the fetch tool summarized as: "OpenTakeoff" / "Copyright 2026 Kentucky AI and the OpenTakeoff contributors" / "---". Fewer than 30 lines. Not re-verified against the raw bytes.
- Commit: https://api.github.com/repos/HexNinja555/opentakeoff/commits?sha=2cac7a43636b1e4e227c5dc7b82600babb13396f&per_page=30 shows 2cac7a43 committer date 2026-07-20T19:32:49Z, "Add Flip Horizontal/Vertical to the Edit menu; label Redo (#70)".
- CHANGELOG.md top entries: https://raw.githubusercontent.com/HexNinja555/opentakeoff/2cac7a43636b1e4e227c5dc7b82600babb13396f/CHANGELOG.md
  - "## 2026-07-19": Added: "Labor type & subfloor type on every condition."
  - "## 2026-07-18": Added: "In-canvas takeoff agent — proposals with evidence, reviewed at an accept gate."
  - "## 2026-07-18 — opentakeoff-mcp 0.4.0": Changed: "MCP: shapes the server commits now tell the truth about who made them."
- Upstream commit 84c7f48e458f6cd74f694e3a970dd011c73a8f2e (Kentucky-ai/opentakeoff): https://api.github.com/repos/Kentucky-ai/opentakeoff/commits/84c7f48e
  - committer and author date 2026-10-10T15:10:05Z; "fix(import): glued MATERIAL CODE header, word-after key cells, C/W kept apart (#529)".
- Ancestry: the compare URL https://api.github.com/repos/Kentucky-ai/opentakeoff/compare/84c7f48e...HexNinja555:2cac7a43636b1e4e227c5dc7b82600babb13396f returned HTTP 404 (no compare result). Commit list pages 1 (24 rows read) and 2 (27 rows read, truncated) of https://api.github.com/repos/HexNinja555/opentakeoff/commits?sha=2cac7a43636b1e4e227c5dc7b82600babb13396f&per_page=30 do not contain a sha starting 84c7f48e. Newest commit in the fork history read is 2026-07-20T19:32:49Z; no commit dated after 2026-10-10 appears in the rows read. Since 84c7f48e (2026-10-10) is newer than the fork head (2026-07-20), the fork head is before 84c7f48e by date and 84c7f48e is not in its visible history. Full history was not read (page 2 truncated at 113774 chars; pages 3+ not read).
- web/src/lib/geometry.js exists: https://raw.githubusercontent.com/HexNinja555/opentakeoff/2cac7a43636b1e4e227c5dc7b82600babb13396f/web/src/lib/geometry.js
  - Imports: none. Exports (functions unless noted): starPath, arrowheadPath, cloudPath, cloudBezier, reflectVertsNorm, buildSnapGrid, nearestSnap, ANGLE_TOL (const = 4), angleSnap, closedMetrics, openLen, pointInPoly, distToSeg, hitShape, thinStroke, strokePathD, chiselRibbon.
  - closedMetrics(pts): pts [x,y][] -> {area, perim}; shoelace area and closed-ring perimeter for 3+ points; for fewer, area 0 and perim = open length. Units: input coordinates (not stated; comments mention image px).
  - openLen(pts): sum of segment lengths of open polyline. Units: input coordinates.
  - pointInPoly(x, y, pts): ray-casting even-odd test, returns boolean. Same space as vertices.
  - distToSeg(px, py, ax, ay, bx, by): Euclidean distance from point to segment AB, projection clamped; zero-length segment returns distance to A. Units: input.
- web/src/lib/totals.js exists: https://raw.githubusercontent.com/HexNinja555/opentakeoff/2cac7a43636b1e4e227c5dc7b82600babb13396f/web/src/lib/totals.js
  - Imports (verbatim): round2 from "./num.js"; csvEsc as esc from "./csv.js"; GETTERS, CSV_PROFILE, colGetter, floorPerimeterLf, applyUnits, METRIC_CSV_LABELS from "./reportColumns.js"; M_PER_FT, M2_PER_SF from "./units"; attrValue from "./conditionColumns.js"; shapeLabelValue from "./shapeLabels.js"; compareSheetKeys from "./sheetKey".
  - Exports include conditionTotals, sheetTotals, sheetGroupedRows, labelGroupedRows, BY_SHEET_BASE_NOTE, hasMultipliers, roundSheetRow, verticalWallSf, materialsSummary, grandTotals, totalsToCsv, reportJson, downloadText (and round2 re-export). accumulateRole not exported.
  - verticalWallSf(shapes, conditionId, heightFt, multiplier = 1): units heightFt in ft, perimeter from computed.perimeter_lf (LF), returns SF. Sums perimeter LF of the condition's floor_area shapes x height x multiplier, rounded to 2 dp; 0 if height not positive. Display-only.
  - materialsSummary(rows): qty stays in each material's own unit (buckets, bags etc.), not SF/LF. Sums already-rounded qty across rows with same name and unit, rounds to 2 dp.

# C. github.com/Kentucky-ai/opentakeoff @ 798ee8813865c882697eef48b71bd4941fdaf1a7

- LICENSE: https://raw.githubusercontent.com/Kentucky-ai/opentakeoff/798ee8813865c882697eef48b71bd4941fdaf1a7/LICENSE: "GNU AFFERO GENERAL PUBLIC LICENSE" / "Version 3, 19 November 2007" (GNU AGPL v3).
- Commit: https://api.github.com/repos/Kentucky-ai/opentakeoff/commits/798ee8813865c882697eef48b71bd4941fdaf1a7: author and committer date 2026-10-26T20:53:11Z; "Scan star: the agent's mark, in the app and the PDF watermark (#571)".

# Fetch notes

- Not read: fork history beyond the 51 commits seen; upstream history between 84c7f48e and 798ee88.
- The brief's KNOWN said upstream moved to AGPL on 2026-10-10. The fetched data shows 84c7f48e dated 2026-10-10 and the AGPL LICENSE at 798ee88 dated 2026-10-26. The 2026-10-10 date of the AGPL change itself was not checked against a LICENSE blob history.
