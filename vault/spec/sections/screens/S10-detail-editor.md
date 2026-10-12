### 10 · Detail editor

**Purpose:** Draw custom 2D detail drawings for one-off conditions (Round 19), with parts, hatches, line roles, keynotes, dimensions and steps, then place them on detail sheets or extrude a closed profile to 3D.

**Entry points:**

- Left rail Detail tool (icon frame\_inspect).
- Tapping a detail callout bubble on a plan, elevation or sheet opens the detail (also from the field pack plan, read-only).
- Countertop support check (Round 23): a seating overhang past the company limit adds support brackets to a detail and shows a notice that links here.
- New detail creation (not in mockup): from blank, cut from model (section line on a plan or elevation), reusable parts, photo or PDF underlay, or copy of a saved detail.
- Library tab in the left panel.

**Permissions:**

- View: View projects.
- Draw, edit, place on sheet, extrude: Edit model, plus project edit lock.
- Save to company library: Edit catalog.
- Print preview: View projects. Export of the detail: Export.

**Layout:** Standard editor shell, with these differences: rail shows Detail active and no Catalog button; status bar has no Existing/Proposed toggle and shows View, Scale, Line role, Parts, Warnings, zoom.

- Left panel: Parts / Layers / Library tabs; parts list; Line role list; Hatch swatches.
- Canvas: detail drawing; floating tool bar top left; NTS indicator card top right.
- Inspector: detail header, Title, Scale, Sheet, warning, Keynotes, Steps, action buttons.
- Status bar.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Detail rail button | Left rail | Opens the detail editor. | Pressed while active. |
| Tab: Parts | Left panel | Shows parts list with quantity. | Default tab. |
| Tab: Layers | Left panel | Shows detail layers; toggling layers is one way to show steps (Round 19). | Content not in mockup. |
| Tab: Library | Left panel | Shows company detail library; copy a saved detail into the job. | Copy is edited in place; the library version does not change. |
| Part row | Parts list | Click selects the part on the canvas. Shows name, size note, qty. | Parts carry their own name and size; "ex." qty means existing. |
| Add part (not in mockup) | Parts list | Inserts a reusable part (studs, blocking, anchors, threaded rod, mesh sleeve, LED channel, brackets, fasteners). | Round 19 starting point. |
| Line role row: Cut, Beyond, Hidden, Center | Left panel | Sets role of selected or next lines. Shows pen width (0.50, 0.18, 0.25, 0.18 mm). | Users pick role, not pen width. Hidden is dashed. Dims and leaders use the thinnest weight automatically. |
| Hatch swatch: Wood, Steel, Gypsum, CMU | Left panel | Applies hatch to the selected closed region. | Plan doc standard set also includes plywood, MDF, concrete, insulation, tile, epoxy/grout (not in mockup), plus custom hatches saved to the company library. |
| Tool: Line | Canvas tool bar | Draws lines with snap, typed length and angle. |  |
| Tools: Polyline, Rectangle, Circle, Arc (not in mockup) | Canvas tool bar | Draw shapes. | Round 19. |
| Tool: Freehand pen (not in mockup) | Canvas tool bar | Strokes auto-clean to lines, arcs, circles, rectangles. Hold, or toggle, to keep the raw stroke. | Round 19. |
| Tool: Hatch | Canvas tool bar | Click a closed region to fill with the active hatch. |  |
| Tool: Keynote | Canvas tool bar | Places a numbered keynote bubble with leader; adds a row to Keynotes. | Shown active in mockup. |
| Tool: Leader | Canvas tool bar | Draws a leader attached to an object; it follows the object when moved. Free arrows also allowed. | Label text typed, filled from the part, or a keynote number. |
| Tool: Text (not in mockup in tool bar) | Canvas tool bar | Free text. | Fixed print sizes. |
| Tool: Dimension | Canvas tool bar | Linear and angular dims, thickness and spacing ("16" o.c."), typed override. | Fractions to 1/16". Typed overrides on NTS details are underlined. |
| Tool: Break | Canvas tool bar | Places a break line symbol. | Kept in v1. |
| Mirror, copy, align (not in mockup) | Canvas / context menu | Same as plan editor. | Round 19. |
| NTS indicator card | Canvas top right | Shows "NTS" with a toggle. | Indicator only; mirrors the inspector Scale. NTS details are stamped "NTS" automatically. |
| Canvas click | Canvas | Selects the smallest object; repeat clicks cycle outward (plan editor rule). |  |
| Canvas drag | Canvas | Moves selection; attached leaders follow. |  |
| Keynote bubble click | Canvas | Selects the keynote and highlights its row. |  |
| Callout bubble (3 / A5.0) | Canvas bottom | Detail title bubble: number, sheet, title, scale. | Generated. |
| Warning marker (triangle) | Canvas | Marks a problem location. Click opens the warning in the inspector. |  |
| Title input | Inspector | Edits detail title ("D-3 Floating shelf at range wall"). | Required. |
| Scale toggle: 1 1/2", 3", NTS | Inspector | Sets detail scale. | Set at creation; can be changed later. Options list is a setting under Defaults. |
| Sheet select (A5.0, A4.0) | Inspector | Chooses the sheet the detail is placed on. | Default A5.0. |
| Warning row with fix link ("Snap to blocking") | Inspector | Fix link applies the suggested change. | Mockup warning: leader points to empty space. |
| Keynotes "+ Add" | Inspector | Adds a keynote row. | Numbers sequential. |
| Keynote row | Inspector | Edit keynote text inline. | Listed beside the detail on the sheet. |
| Steps list row | Inspector | Edit step text. "Prints with detail". | Addition to side-by-side and layer steps. |
| Add step (not in mockup) | Inspector | Adds a step. |  |
| Place on sheet | Inspector footer | Opens print preview at actual size on 24x36, 11x17 and phone (not in mockup), then places the detail on the selected sheet and creates the callout. | Round 19: preview before placing. |
| Extrude to 3D | Inspector footer (primary) | Extrudes a closed section profile into a simple 3D piece the crew can rotate. | Disabled unless a closed profile is selected or present. Annotations, freehand marks, open lines stay 2D. |
| Save to company library (not in mockup) | Inspector or Library tab | Saves the detail to the company library. |  |
| Status bar fields | Status bar | View (Detail D-3 · section), Scale, Line role, Parts (8 · 3 hatches), Warnings count, zoom 200%. | Warnings count opens the warning. |
| Keyboard: Esc, Delete, Undo/redo (implied) | Canvas | Cancel tool, delete selection, undo/redo within session. | Round 11: undo within session. |

**Data shown:**

- detail: id, number (D-3), title, scale or NTS, sheet, linework with roles, hatches, parts (name, size, qty), keynotes, steps/layers, library link, references (e.g. "Referenced from Elev 2/A4.0 · 3D"), source badge ("Custom").
- Warnings list from legibility checks.

**States:**

- Empty (blank start): empty canvas, no parts (not in mockup).
- Loading: as in 03 (canvas skeleton).
- Error: as in 03 (banner with Retry; edits kept locally).
- View-only (edit lock held by another user, or field pack): tools disabled; tap bubble opens detail read-only.
- Permission denied: no Edit model gives view-only.
- Offline: editing continues; saved on device and synced (Round 13).
- Library copy: shows that the detail is a project copy of a library item.
- Warnings present: count in status bar and inspector.

**Validation & warnings:**

- Text prints at fixed sizes regardless of detail scale: minimum 3/32" on a 24x36 sheet; labels and dims one size up from notes.
- Line weights by role: cut heavy, beyond light, hidden dashed, dims and leaders thinnest.
- Warning when leaders cross each other.
- Warning when labels sit on linework.
- Mockup warning: "Leader N points to empty space" with a snap fix.
- NTS details stamped "NTS" automatically; typed-override dims underlined.
- Extrude requires a closed profile.
- Print preview at actual size before placing on a sheet.

**Events emitted:**

- detail.created (new)
- detail.updated (new)
- detail.placed (new): detail id, sheet number, callout locations
- detail.extruded (new)
- detail\_library.saved (new)

**Decisions:**

1. Scale can be changed after creation. Switching to or from NTS re-checks typed-override dimensions and their underlines. (Claude)
2. Scales offered: 3/4", 1", 1 1/2", 3", 6" = 1'-0", full size, and NTS. The list is a company setting under Defaults. (Claude)
3. The NTS card on the canvas is an indicator only; it mirrors the inspector Scale control. (Claude)
4. The numbered steps text list is an addition. Steps can also be shown as details side by side or as layers toggled on and off; the text list prints beside the detail. (Claude)
5. Keep the Center line role. (Claude)
6. Keep the Break tool. (Claude)
7. Tool bar order: Line, Polyline, Rectangle, Circle, Arc, Pen, Hatch, Text, Keynote, Leader, Dimension, Break. (Claude)
8. "Leader points to empty space" is a v1 warning: the leader end is not on any object or linework within the snap tolerance (a setting under Defaults). (Claude)
9. Saving to the company detail library needs Edit catalog. (Claude)
10. New detail opens a dialog with five start tiles (Blank, Cut from model, Parts, Underlay, Copy saved detail), plus Title and Scale, and a Create button. (Claude)
11. The canonical reference is the callout form "3 / A5.0" (detail number / sheet). "D-3" is shown only as the editor label. (Claude)
