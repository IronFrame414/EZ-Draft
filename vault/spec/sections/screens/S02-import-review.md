### 02 · Import review

**Purpose:** Confirm walls, openings, rooms, cabinets and ceiling data detected from a Polycam scan, PDF or DXF before they become model data. Resolve conflicts between typed or laser measurements and the scan.

**Entry points:**

- New project wizard "Continue to review" after a file import.
- Upload of a new file to an existing project (scan, supplier PDF, DXF, revised architect DXF), or rooms sent from the phone (17b Field measure, source kind field\_measure).
- "N to review" pill in the editor header when an import has unreviewed items.
- Notification when an import job finishes (not in mockup).

**Permissions:**

- View projects: view the review in read-only.
- Edit model: required for every accept, fix, delete, typed measurement and Finish import. Also requires holding the edit lock.
- Manage users and settings: required to change the conflict threshold (link goes to Settings).
- Create projects: needed only when the import is part of creating a new project. Upload references: needed to upload a reference DXF or PDF, including a revised architect DXF.

**Layout:**

- Header card (differs from standard shell): wordmark, project name with source subtitle, 3-step progress (Upload, Review, Finish), Cancel import, Finish import. No Plan/3D/Sheets/Render tabs.
- Left panel 320px: detected items list with mode switch.
- Canvas: scan underlay with detected geometry, legend, zoom stack.
- Right panel 336px: selected item inspector with conflict resolution.
- Status bar: source, scan accuracy, input mode, zoom.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Progress steps (Upload, Review, Finish) | Header center | Display only | Upload done (green check), Review current (blue), Finish pending |
| Cancel import | Header | Asks to confirm, then discards detected items. Uploaded source files are kept | No model changes are made |
| Finish import | Header, primary | Writes accepted items to the model as a new model version; opens 03 Plan | Disabled while any item is unresolved (see Validation). Unconverted DXF content stays as reference |
| Mode: One by one | Left panel segmented control | Steps through every detected item in order; inspector shows Accept / Fix / Delete for each; Next/Previous | Chosen per import |
| Mode: Accept + fix | Left panel segmented control | Lists only low-confidence "To check" items; high-confidence items can be accepted in one click | Default shown in mockup |
| Mode: By room | Left panel segmented control | Groups items by detected room; accept or fix room by room |  |
| Summary line | Left panel header | Display: found, high confidence, to check counts | Updates as items are resolved |
| "To check" list row | Left panel | Selects the item; canvas highlights it in blue and zooms to it; inspector shows it | Row shows status dot (blue selected, amber to check) and confidence % |
| "Accepted" summary | Left panel | Display: counts of accepted walls, windows, doors, rooms, fixtures + cabinets | Clicking a count filters the canvas to that type (not in mockup) |
| Fix selected | Left panel footer | Enters edit mode on the selected item on the canvas (move endpoints, change size, swing, type) | Requires a selection |
| Delete | Left panel footer | Removes the detected item; it does not become model data | Undoable within the session |
| Accept N | Left panel footer, primary | Accepts all high-confidence items (N = count) | Label shows count |
| Click item on canvas | Canvas | Selects it; list and inspector sync | Smallest item under cursor first |
| Drag endpoint / edge (in Fix mode) | Canvas | Moves wall ends or opening edges with live dimensions | Snaps as in Plan editor |
| Hover item | Canvas | Shows item name and confidence |  |
| Scroll / pinch | Canvas | Zoom toward cursor |  |
| Right-drag or space-drag / two-finger drag | Canvas | Pan |  |
| Zoom in / Zoom out | Canvas, top right stack | Step zoom |  |
| Show 3D mesh | Canvas, zoom stack | Toggles the Polycam GLB mesh view to check cabinets, soffits and ceiling heights | Only when a GLB was uploaded |
| Typed or laser input | Inspector | Type or laser a length; it overrides the scan | Accepts 12'6", 12' 6 1/2", 150", 12.5'. Laser in keyboard mode types into the focused field |
| Scan reads | Inspector | Display only | Read-only |
| Conflict list ("Typed wins. This creates") | Inspector | Lists every conflict the typed value creates (room no longer closes, opening offsets change) | Red icon for errors, amber for warnings. Click a line to zoom to it (not in mockup) |
| Pick the wall that absorbs it | Inspector, Resolve the gap | Enters pick mode; click a wall on the canvas; that wall's length changes so the room closes | Only shown when a room no longer closes |
| Keep the room out of square | Inspector, Resolve the gap | Accepts the gap; room is kept out of square; warning overridden | Records an override (see Events) |
| Accept / Reject this item (One by one mode, not in mockup) | Inspector footer | Accepts or removes the item and advances to the next |  |
| Conflict threshold link "change in settings" | Inspector footer | Opens Settings at the threshold field | Requires Manage users and settings; link hidden otherwise (the value still shows) |
| Esc | Canvas | Cancels Fix or pick mode |  |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z | Global | Undo / redo review actions | Session only |

**Data shown:**

- Detected items from the import job: type, label (e.g. "North wall, east half", "Window W3 size", "Ceiling slope, east", "Door D2 swing"), status (existing), confidence %.
- Canvas: scan underlay (grey), accepted (green), to check (amber dashed), selected (blue), gap marker (red) with size, typed vs scan label.
- Inspector: item name, type, status, confidence, typed value, scan value, conflict list.
- Footer: source (e.g. "Polycam Space · DXF + GLB"), scan accuracy (±1/2" for Polycam), input mode ("type or laser (keyboard mode)"), zoom %.
- Tolerance from company settings under Defaults; one setting covers scan-vs-typed and field measurements (mockup: 1/2").

**States:**

- Loading / detecting: progress with item count so far; canvas shows underlay only.
- Empty: no items detected (e.g. scanned PDF): "Nothing detected. Trace over the underlay in the Plan editor" with a button to open the Plan editor with the underlay.
- Error: import job failed: message with file name and Retry; Cancel import stays available.
- All resolved: "To check" list empty; Finish import enabled.
- Room not closed: red gap marker and inspector section "Resolve the gap".
- Locked / view-only: another user holds the edit lock; all edit controls disabled; lock banner shows who and since when, with Request edit.
- Offline: review can continue on cached data; Finish import queues as an offline change and syncs later.
- Permission-denied: without Edit model, read-only with a note "You can view this import but not change it".
- Revised architect DXF: change highlights show what changed and which markups and model objects sit on changed areas (Round 22).
- Supplier kitchen PDF: cabinet labels read (W3030, B24) and plan vs elevation cross-check results shown per cabinet.

**Validation & warnings:**

- Confidence below the high-confidence cutoff goes to "To check".
- Typed vs scan difference greater than the tolerance (company setting under Defaults, shared with field measurements; mockup 1/2") creates a conflict.
- Room closure: typed lengths must add up; a gap is shown with its size; resolve by picking an absorbing wall or keeping the room out of square.
- Typed value change that moves an opening relative to a corner: warning with the change amount.
- Bearing walls detected or marked: flagged; later removal is blocked without engineer.
- Finish import blocked while any "To check" item is unresolved or any room has an unresolved gap.

**Events emitted:**

- import.completed (new): project id, source\_file ids, counts accepted/deleted, model\_version\_id.
- import.cancelled (new).
- room.closure\_overridden (new): room id, gap size, user.
- model.saved on Finish import.

**Decisions:**

- The high-confidence cutoff is a company setting under Defaults, entered by the owner (Round 24).
- Finish import requires every item to be resolved (accepted, fixed or deleted) and every room gap resolved. Nothing imports with a pending flag. (Claude)
- This screen is outside the editor shell. The header shows the progress steps instead of the Plan/3D/Sheets/Render tabs. (Claude)
- "Accept N" accepts only high-confidence items. Each "To check" item needs its own action. (Claude)
- There is no separate Finish page. Finish import writes the items, marks step 3 done and opens 03 Plan with a short notice of the counts imported. (Claude)
- "Pick the wall that absorbs it" accepts any wall of the room that does not close, adjacent to the gap or not. Walls of other rooms cannot be picked. (Claude)
- Ceiling slope items are fixed in the inspector with the same three inputs as Round 1: heights at points (low/high wall), pitch, or the value read from the mesh. (Claude)
- DXF layer selection (convert all, some layers, or none) happens in the upload step. This screen lists only items from the layers chosen for conversion. (Claude)
