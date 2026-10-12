# 04 · Cabinet run + elevation

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** Build and edit a cabinet run from individual boxes, fillers, panels and trim, seeing the plan strip and the wall elevation with real door and drawer faces at the same time. Cabinets are never one block (Round 21).

**Entry points:**

- Cabinets (C) tool on the rail.
- Double-click a cabinet run on the 03 plan (not in mockup).
- "Cabinet schedule" in the 03 inspector, then a run row.
- Runs tab of this screen's left panel.
- Finish import of a supplier kitchen PDF, 2020 DXF or cabinet order report (cabinets arrive as real boxes).

**Permissions:**

- View projects: view runs, plan strip, elevation and schedule.
- Edit model: place, drag, resize, swap, delete boxes; Auto-fill run; inspector edits. Also requires the edit lock.
- See company costs: Cost row in the inspector Catalog section; costs in the schedule.
- Edit catalog: add or change vendor lines and SKUs in the catalog (the library here only reads them).
- Export: export the cabinet schedule (CSV/PDF) from the schedule view.

**Layout:**

- Standard editor shell, Cabinets tool active. Differences: status bar shows View "Plan + elevation A", Scale, Increment, Zoom and the Existing/Proposed toggle. The rail is the full standard rail, including Countertops (K), Detail callout and Check.
- Left panel 248px "Cabinet library": tabs Boxes / Runs / Saved; search; line section; Fillers, panels, trim section.
- Canvas: run header bar; plan strip of the run against its wall; Elevation A of the same run with uppers, countertop, toe kick, chain dimensions (widths) and height dimensions.
- Inspector 336px: selected box (title, position in run, status pill, size fields, Face section, Catalog section, Swap box, Cabinet schedule).

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Tab: Boxes | Left panel | Shows box library for the active line | Default |
| Tab: Runs | Left panel | Lists every run in the project (name, box count, fit status); click to open that run on the canvas |  |
| Tab: Saved | Left panel | Lists saved groups / runs from the company library; drag to place a copy | Copy is independent of the library version |
| Search "Code or size, e.g. B24" | Left panel | Filters library rows by code or size | Matches code prefix and width |
| Line label "Line: \[Supplier\] Shaker" | Left panel | Click opens a line picker: vendor lines and "Custom boxes" (not in mockup) | Lines come from the tenant catalog |
| Library row B9–B24 "Base, 1 door" | Left panel | Drag onto plan strip or elevation to insert a box; drop position sets order in the run | Width set by typing in the dimension bar on drop, in 3" steps within the range |
| Library row B27–B36 "Base, 2 doors" | Left panel | Same as above |  |
| Library row DB12–36 "Drawer base" | Left panel | Same |  |
| Library row SB30–36 "Sink base" | Left panel | Same |  |
| Library row BBC42 "Blind corner" | Left panel | Same | Corner/blind type |
| Library row W1230+ "Wall, 30" tall" | Left panel | Same; placed in the upper row |  |
| Library row T1884 "Tall pantry" | Left panel | Same; spans base and upper rows |  |
| Library row F3 "Filler, scribe" | Left panel | Drag to place a filler | Carries a scribe allowance |
| Library row EP "End panel 3/4"" | Left panel | Drag to place an end or decorative panel |  |
| Library row DWP "Dishwasher panel" | Left panel | Drag to place an appliance panel |  |
| Library row TK / LR / CM "Toe kick, light rail, crown" | Left panel | Drag or click to add trim along the run | Each is its own object |
| Drag handle icon on rows | Left panel | Indicates draggable | Cursor "grab" |
| Run name ("Back wall run") | Canvas header | Click to rename (not in mockup) |  |
| Run counts ("6 boxes · 2 fillers") | Canvas header | Display |  |
| Fit chip ("Run 117" fits wall 117 1/2" · 1/2" scribe") | Canvas header | Display; click zooms to the filler/scribe location (not in mockup) | Green when run + scribe matches the wall; flagged when it does not (Round 21) |
| Auto-fill run | Canvas header | Fills the selected wall run with real boxes in 3" increments plus fillers at walls and appliances; shows result for confirmation | Existing boxes are replaced only after confirm. Any box can be swapped after |
| Click box (plan strip or elevation) | Canvas | Selects that box; same box highlights in both views; inspector shows it | Selected box drawn blue |
| Shift+click box | Canvas | Adds to selection for bulk edit (finish, depth, height) |  |
| Drag box | Canvas | Reorders within the run; others shift | Run total recalculates live |
| Drag box side edge | Canvas | Resizes width in the run increment (3") | Code updates (e.g. B15 to B18) |
| Double-click box | Canvas | Focuses Width field |  |
| Right-click box | Canvas | Context menu: Swap box, Duplicate, Delete, Save as group (not in mockup) |  |
| Hover box | Canvas | Highlights the same box in both views |  |
| Chain dimension text | Elevation, bottom | Click to type an exact width for that box |  |
| Height dimension text (30", 18", 36") | Elevation, right | Click to type upper height, backsplash gap, base height (not in mockup) |  |
| Status pill (New) | Inspector header | Change status: Existing, Demo, New | Default from phase |
| Width | Inspector | Typed width | Length formats as in 03 |
| Depth | Inspector | Typed depth |  |
| Height | Inspector | Typed box height (34 1/2" for base) |  |
| Face > Layout select | Inspector | False drawer + 2 doors; 2 doors; Drawer + 2 doors | Options depend on box type; elevation redraws |
| Face > Hinges: Left / Pair / Right | Inspector | Sets hinge side |  |
| Face > Finished ends: None / Left / Right / Both | Inspector | Sets finished ends |  |
| Catalog > Item | Inspector | Display SKU; click opens catalog to pick another SKU (not in mockup) |  |
| Catalog > Finish | Inspector | Display; click opens finish picker | Finish selection can be a client selection |
| Catalog > Cost | Inspector | Display "$… · internal" | Hidden without See company costs |
| Swap box | Inspector footer | Lists compatible boxes (same width or same slot); pick to replace | Keeps position in run |
| Cabinet schedule | Inspector footer | Opens the schedule: code, qty, finish, notes | Used by sheets, takeoff and supplier order |
| Delete / Backspace | Global | Removes selected box(es); run total updates |  |
| Esc | Global | Clears selection / cancels drag |  |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z | Global | Undo / redo | Session only |
| Zoom (scroll / pinch), pan | Canvas | As in 03 | No zoom stack shown in this mockup |

**Data shown:**

- Box: code, width, depth, height, type (base, wall, tall, vanity, sink base, drawer base, corner/blind, appliance panel), door/drawer layout, hinge side, finished ends, catalog item (SKU), finish, cost, status, position ("Box 4 of 6").
- Run: name, box count, filler count, run total, wall length, scribe.
- Plan strip: wall, boxes with codes, fillers dashed.
- Elevation: door and drawer faces from layout, uppers, window, countertop, toe kick, chain widths, heights.

**States:**

- Empty wall: no boxes; prompt "Drag boxes or Auto-fill run".
- Run mismatch: fit chip turns to warning with the difference.
- Imported run: boxes from supplier import carry import confidence until reviewed in 02.
- Loading, error, offline, locked/view-only, permission-denied: as in 03.

**Validation & warnings:**

- Run total vs wall length mismatch flagged (Round 21).
- Box widths in standard 3" increments; custom boxes allowed outside increments (Round 3).
- Hosted cabinet left off a wall after a wall move: red "Not on a wall" flag (Round 11).

**Events emitted:**

- takeoff.updated (cabinet count by size).
- cabinet\_schedule.updated (new).

**Decisions:**

- The 04 status bar shows the Existing/Proposed toggle, same as 03. (Claude)
- The fit tolerance is a company setting under Defaults (Round 24). The chip is green when the wall length minus run total and fillers is within tolerance, amber otherwise, and shows the difference. (Claude)
- An elevation picker in the run header lists the elevations that include this run (A, B, ...). Base and upper rows always show together; there is no row switch. (Claude)
- The rail in 04 is the full standard rail: Countertops (K), Detail callout and Check included. (Claude)
- Auto-fill fills around appliances and openings already placed and leaves their openings. If none are placed, it fills the whole wall run, and the user swaps boxes for appliances afterward. (Claude)
