# 03 · Plan editor

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** Draw and edit the one parametric model in plan: walls, openings, rooms, cabinets, countertops, fixtures, electrical, ceiling, dimensions and annotations. Every other output reads this model.

**Entry points:**

- Project card on 01 Projects.
- "Plan" tab in the header.
- Finish import on 02.
- Notification or "N to review" item that targets a plan object.
- Field conflict or field-verified measurement notifications.
- EZ Binder inbound link to a project.

**Permissions:**

- View projects: open the editor in view-only.
- Edit model: every drawing tool, inspector edit, move, delete, undo/redo, and Request edit. Also requires holding the edit lock.
- See company costs: cost fields in inspectors.
- Approve field measurements: approve or reject field measurements on the Field measurements review screen, opened from the review pill or the notification.
- Share (Send to client), Export, Issue set (Issue permit sets / Issue revisions): header buttons per standard shell.
- Run fast renders: Render tab per standard shell. Run code check: Check button on the rail. Controls the user lacks permission for are hidden.

**Layout:**

- Standard editor shell.
- Left rail: tool buttons (see Controls).
- Left panel 248px with tabs Layers, Rooms, Versions, Tasks (see Field tasks). Layers tab sections: Phase, Overlays, Rooms.
- Canvas: plan with grid; floating typed-dimension bar bottom center; zoom stack top right.
- Inspector 336px: properties of the selection, client selections, run totals, live 3D preview, primary action plus More.
- Status bar: View (Existing / Proposed), Scale, Snap, Cursor coordinates, Zoom.

**Controls — rail tools:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Select (V) | Rail | Click picks the smallest object under the cursor; repeated clicks at the same spot cycle outward (e.g. outlet → cabinet → wall) | Default tool. Esc returns here from any tool. Selection limited by layer filter |
| Move (M) | Rail | Drag the selection, or click base point then target point; type a distance in the dimension bar | Snaps apply. Walls follow wall move behavior below |
| Wall (W) | Rail | Single-wall mode: click start, type length, Enter, turn, continue; double-click or Enter twice to finish; click start point to close | Thickness, layers (stud, drywall, tile backer) and height from defaults, editable in inspector. Dimensions are to finished face. Status from phase switch |
| Room rectangle (R) (not in mockup) | Rail, or Wall tool option | Click corner, drag or type width and depth; creates four walls and a room | Plan doc Round 2 and older mockups list it; Studio mockup omits it |
| Door (D) | Rail | Hover a wall to preview; click to place; type offset from a corner, or drag along the wall with live distances to both sides | Must be hosted on a wall. Size and swing from library; swing flip with Space or inspector |
| Window (no key shown) | Rail | Same placement as Door | Attributes: size, rough opening, sill height, impact rating |
| Cabinets (C) | Rail | Switches the left panel to the cabinet library and opens the cabinet run workflow (screen 04) | Tooltip "Cabinets C" shown in mockup on hover |
| Countertops (K) (not in this mockup) | Rail | Opens countertop tools (screen 04b) | Present in 04b and later mockups but missing from 03 |
| Fixtures | Rail | Opens fixture library (plumbing fixtures, appliances, custom tile showers with curb, niche, bench, glass, pan slope and drain type, grab-bar blocking); click to place | Appliances carry utility points (electric, gas, water, drain) |
| Electrical (E) | Rail | Opens device library and circuit tools (Electrical screen) | Devices are the same objects on RCP and electrical plan |
| Ceiling | Rail | Opens ceiling tools (RCP screen) |  |
| Dimension (L) | Rail | Click two points or a wall face; place the dimension line; type to override text | Auto dimensions (overall, rooms) placed automatically, then adjustable |
| Text (T) | Rail | Click to place a note or label; leader optional | Prints at fixed paper size at any scale |
| Sketch | Rail | Freehand pen on a markup layer; strokes auto-clean to lines, arcs, circles, rectangles; hold to keep the raw stroke | Pencil-only or finger per user setting |
| Detail callout | Rail | Place a callout bubble linked to a detail; click an existing bubble to open the detail | Draw a section line to start a "cut from the model" detail |
| Revision cloud (not in mockup) | Rail | Draw a cloud and delta tag manually | Plan doc rail list includes "cloud". Automatic clouds are added on revision |
| Check | Rail, above Help (every editor tab) | Runs the code check on demand and opens the warning list; click a warning to zoom to the object | Requires Run code check; hidden otherwise. Warnings only, never auto-fixes |
| Help | Rail, bottom | Opens help and shortcut list |  |
| Hover rail button | Rail | Tooltip with tool name and shortcut |  |

**Controls — canvas interactions and shortcuts:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Click | Canvas, Select tool | Select smallest object; inspector shows it |  |
| Repeated click same spot | Canvas | Cycles selection outward to the next larger object | Cycle resets when the cursor moves |
| Shift+click | Canvas | Add/remove object from selection |  |
| Drag on empty space | Canvas, Select tool | Box select | Respects layer filter |
| Drag object | Canvas, Select or Move | Moves the object with live dimensions |  |
| Drag selection handle (corner circles) | Canvas | Resize the selected object | Typed size accepted during drag |
| Drag wall | Canvas | Connected walls stretch so corners stay joined; dimensions update live | Hosted doors, windows, cabinets and devices do not move with the wall |
| Double-click | Canvas | Edits the object in place (e.g. dimension text, text, wall length field) |  |
| Right-click / long-press | Canvas | Context menu: Copy, Paste, Duplicate, Mirror, Align, Group, Save as group, Set status (Existing / Demo / New), Delete (not in mockup) |  |
| Hover | Canvas | Highlights the object that a click would select |  |
| Scroll / pinch | Canvas | Zoom toward cursor |  |
| Space-drag, right-drag or two-finger drag | Canvas | Pan |  |
| Snap: endpoints, midpoints, 90/45°, wall faces | Canvas while drawing or moving | Snap marker shows snap type | Snap increment shown in status bar |
| Typed dimension bar | Canvas, bottom center | Shows active tool and field (e.g. "Length 6' 0""); type a size or use the laser | Formats: 12'6", 12' 6 1/2", 150", 12.5'. Enter commits |
| Tab | Typed dimension bar | Moves to the next field (e.g. Length → Angle, or offset left → offset right) | Shown as hint chip |
| Enter | Global while drawing | Commits typed value |  |
| Esc | Global | Cancels current operation; second Esc clears selection and returns to Select |  |
| Delete / Backspace | Global | Deletes selection | Bearing wall deletion blocked with engineer prompt |
| Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z | Global | Undo / redo | Session only; older changes come back through Versions |
| Ctrl/Cmd+C / V | Global | Copy / paste |  |
| Ctrl/Cmd+A | Global | Select all on visible, selectable layers (not in mockup) |  |
| Zoom in / Zoom out / Fit to screen | Canvas, top right stack | Step zoom; fit model to view |  |
| Live distance chips | Canvas | Display distances from selection to nearest walls while dragging (e.g. 3' 10 1/2", 4' 11 1/2") | Click a chip to type an exact distance |
| Red flag on hosted item | Canvas | Click selects the item; inspector shows "Not on a wall" | See hosted-item flags |

**Controls — left panel:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Tab: Layers | Left panel | Shows Phase, Overlays, Rooms sections | Default |
| Tab: Rooms | Left panel | Room list with area; select room; room properties (name, floor finish, ceiling type, photos) |  |
| Tab: Versions | Left panel | Version history: sent versions (Version N, Rev N), named snapshots and unnumbered working versions; Name snapshot, Revert. No visual compare in v1 (Claude) | Unsent working versions auto-delete at 30 days through the cleanup sheet (tick to keep; kept ones become named snapshots; unticked delete 7 days later). Sent versions and named snapshots are never deleted. Revert requires Edit model |
| Phase row: Existing (eye) | Layers > Phase | Show/hide existing objects | Grey dot |
| Phase row: Demo (eye) | Layers > Phase | Show/hide demo objects | Red dot |
| Phase row: New (eye) | Layers > Phase | Show/hide new objects | Blue dot |
| Overlay: Electrical (eye) | Layers > Overlays | Show/hide electrical objects | Hidden in mockup (greyed row) |
| Overlay: Ceiling (eye) | Layers > Overlays | Show/hide ceiling objects |  |
| Overlay: Dimensions (eye) | Layers > Overlays | Show/hide dimensions |  |
| Overlay: Architect DXF (REF, eye) | Layers > Overlays | Show/hide reference drawing; expand to show its own layers with show/hide and recolor (not in mockup) | Reference is locked under the model; snap and measure work on it |
| Layer lock / selectable toggle (not in mockup) | Each layer row | Limits what can be selected (layer filter) | Plan doc Round 11 |
| Room row | Layers > Rooms | Selects the room and zooms to it | Shows name and sf |

**Controls — inspector (selection: Island run, as in mockup):**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Title and subtitle | Inspector header | Object name and contents (e.g. "Island run · 2 boxes · 2 end panels") |  |
| Status pill (New) | Inspector header | Click to change status: Existing, Demo, New | Defaults from phase switch; per-object override |
| Width / Depth / Height | Inspector | Typed lengths; model updates | Length formats as above |
| Client selection tiles (Countertop, Cabinet finish) | Inspector | Opens catalog picker for that selection | Shows swatch and item name |
| Run total line | Inspector | Display: box list and total (e.g. "B36 + DB36 + 2 × 3/4" panel · 73 1/2"") |  |
| Live 3D preview | Inspector | Small live 3D of the selection |  |
| Open 3D | Live 3D preview | Opens the 3D tab focused on the selection |  |
| Cabinet schedule | Inspector footer | Opens cabinet schedule | Primary action changes by object type |
| More (…) | Inspector footer | Menu: Copy, Mirror, Align, Group, Save as group, Delete (not in mockup) |  |
| Bulk edit (multi-select, not in mockup) | Inspector | Shared fields editable for all selected; mixed values shown as "Mixed" |  |
| Wall inspector fields (not in mockup) | Inspector, wall selected | Length, thickness, layers, height, status, bearing flag | Bearing wall cannot be set to Demo without engineer prompt |
| Door/window inspector fields (not in mockup) | Inspector | Size, swing/hand, offset from corner, rough opening, sill height, impact rating, catalog item |  |

**Controls — status bar:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| View: Existing / Proposed | Status bar | Sets the phase for new objects and the plan display. Existing: draws new objects as existing. Proposed: new objects default to New | Individual objects can be overridden in the inspector |
| Scale | Status bar | Shows current plan scale (e.g. 1/2" = 1'-0"); click to change (not in mockup) | Sheet scale is set per viewport on Sheets |
| Snap | Status bar | Shows snap increment (e.g. 1/2"); click to open snap toggles: endpoints, midpoints, 90/45°, wall faces, increment (not in mockup) | Plan doc puts snap toggles in the bottom bar |
| Cursor | Status bar | Live cursor coordinates | Display only |
| Zoom % | Status bar | Shows zoom; click to type a zoom value (not in mockup) |  |

**Data shown:**

- Model objects of the current version: walls, openings, rooms with area, cabinets with codes, fixtures, devices, dimensions, annotations, reference drawings.
- Header subtitle: client, version label ("Working copy", or the last sent "Version N" / "Rev N"), save state ("Saved 2 min ago").
- Overall and room dimensions (auto) at 1/2" display precision.
- Inspector: dimensions, status, finish selections, catalog item, cost (only with See company costs).

**States:**

- Empty (blank project): grid only with a hint to pick a template or draw walls.
- Loading: canvas skeleton; tools disabled until model loads.
- Saving / saved: header subtitle shows "Saving…", "Saved just now", "Saved N min ago".
- Error saving: banner "Changes not saved" with Retry; edits kept locally.
- Offline: edits continue and save on the device; banner "Offline · changes will sync"; edit lock is held unless another user's Request edit times out.
- Locked / view-only: another user is editing: amber banner "\<Name> is editing since \<time>" with Request edit; all edit tools disabled. Turns green "Available to edit" when released; the first user to press Start editing gets the lock. The holder releases with Stop editing in the header or by closing the project; both save first.
- Request edit pending: editor gets release / keep prompt; auto release after 5 minutes with the editor's work saved first. The 5 minutes run even if the holder is offline; on reconnect the former holder gets a conflict notification listing clashes to resolve.
- Permission-denied: without Edit model, view-only without Request edit.
- Sent or issued version (Version N or Rev N): that version is frozen; editing continues on a working copy; changes are gathered for the next revision and will be clouded.
- Hosted item not on a wall: red flag.
- Room not closed: gap shown.

**Validation & warnings:**

- Wall move: hosted doors, windows, cabinets and devices stay in place. If one is left off any wall it is flagged red "Not on a wall" until fixed. Open flags appear in the issue check and block Issue set.
- Room closure: typed lengths must add up; gap shown; pick the wall that absorbs it or keep the room out of square.
- Bearing walls: removing or opening a wall marked bearing is blocked or flagged with "Engineer required".
- Typed measurement that conflicts with the scan by more than the threshold: lists every conflict it creates.
- Length input parse errors show accepted formats.
- Moving an appliance shows which utilities must move. Bath clearance checks warn when fixture clearances fall below the values in Defaults (Round 3).

**Events emitted:**

- model.saved: on save.
- takeoff.updated: when quantities change.
- lock.requested, lock.released.
- field.measurement\_approved / field.measurement\_rejected.

**Decisions:**

- The rail adds Room rectangle and Revision cloud from the plan doc, and Check from Round 24. (Claude)
- Sketch and Detail callout both stay on the rail on every editor tab. Detail callout uses the frame\_inspect icon. (Claude)
- Countertops (K) is on the rail on every editor tab. Fixtures uses the wash icon. (Claude)
- Keyboard shortcuts are company settings under Defaults (Round 24). The mockup letters (V, M, W, D, C, K, E, L, T) are kept; the other default keys are in the section 3 rail table; all are editable (Claude).
- Existing/Proposed sets the default status for new objects and the display. Existing shows existing objects and hides new ones. Proposed shows objects to remain plus new ones and hides demo. The Phase eye toggles override the display. (Claude)
- Demo is set per object, from the status pill or Set status in the context menu. Multi-select works for many objects at once. (Claude)
- The Versions tab lists sent versions (permanent), named snapshots and unnumbered working versions, with the 30-day cleanup sheet (Round 24).
- Scale and Snap in the status bar are clickable and open small popovers. Snap holds the snap toggles and increment; Scale holds the plan display scale. (Claude)
- Save as group is in the context menu and More. Saved groups appear in the Saved tab of the matching library and are dragged in to place. (Claude)
- The layer filter is a lock icon on each layer row in the Layers panel. The status bar has no filter control. (Claude)
