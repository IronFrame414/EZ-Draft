### 17 · Field pack (phone)

**Purpose:** Room-by-room field view for crews on a phone: dimensioned plan, 3D, measuring, task list in build order and photo notes, in the user's language, usable offline.

**Entry points:**

- EZ Binder job tab opens the job's field pack directly, already signed in (shared sign-on, plan Round 8).
- Magic link email for crew, with "Copy link" on the sender's side (Round 24).
- Notification "New field pack issued" (in-app and email).

**Permissions:**

- View field pack, all tabs, measure, Save PDF: View projects (scoped to assigned projects).
- Check off tasks: Check off tasks. Photo + note: Photo notes. Flag conflict to office: Flag conflict. Send measurement: Send field measurement. Edit task text: Edit field tasks.
- Controls the user lacks are hidden (Round 24).
- Company costs never shown without See company costs, nor sell prices without See sell prices.
- Field actions do not need the edit lock; they are not model edits (Round 24 #16).
- Approving measurements into the model: Approve field measurements, on the office Field measurements review screen.

**Layout:** Phone 390x844. Not the editor shell.

- Header: "EZ Binder" back link, offline status icon, revision badge ("Rev 1" after permit; "Version N" before); project title; subtitle (issue date, current sheet); room chips row.
- Main canvas (per tab): plan, 3D, measure, tasks or photo content; layers button top right; zoom control bottom right; hint bottom left.
- Bottom sheet (Measure tab): result, comparison, tolerance notice, actions.
- Tab bar: Plan, 3D, Measure, Tasks (count of open tasks), Photo.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Back to EZ Binder | Header left | Returns to the same job in EZ Binder. | Persistent on every tab (plan Round 8). Offline: shows "EZ Binder needs a connection". |
| Offline status icon | Header | Green "offline\_pin" = pack cached; spinner while caching; amber with count = offline with n queued actions. |  |
| Revision badge | Header | Shows the sent version ("Rev 1" or "Version 3"). Tap shows the revision note and date. | Round 24 #26 numbering. |
| Project title / subtitle | Header | "Kitchen remodel · Hendricks"; "Field pack · issued Oct 8 · A3.0 Proposed plan". | Display. |
| Room chips | Header, below subtitle | One chip per room plus "All"; selects the room page. | Plan Feature spec 9 (Claude: chips as in the earlier field pack mockup). |
| Tab: Plan | Tab bar | Dimensioned room plan (A3.0 Proposed by default), elevations, selected finishes, detail callouts. | Tapping a detail bubble opens the detail. |
| Tab: 3D | Tab bar | Full 3D view with orbit; measure between two points. | One finger orbit, two-finger pan, pinch zoom. |
| Tab: Measure | Tab bar | Measure tool (shown). A Field measure button at the top of the tab opens 17b for room shapes (Round 25). |  |
| Tab: Tasks | Tab bar | Task list grouped by trade phase (demo → rough-in → inspection → drywall → finish); badge = open tasks. |  |
| Tab: Photo | Tab bar | Camera capture, then tap the plan to pin, then add a note. | Hidden without Photo notes. |
| Layers button | Canvas top right | Sheet with toggles: Existing, Demo, New, Electrical, Dimensions, Photo pins. |  |
| Plan canvas: tap point | Measure tab | Sets point A, then B; snaps to walls, corners and cabinets. A third tap starts a new measurement. |  |
| Plan canvas: drag point | Measure tab | Moves a placed point; value updates live. |  |
| Plan canvas: pinch / two-finger drag | Canvas | Zoom / pan. |  |
| Measured value field (laser input) | Bottom sheet | Focused after A and B are set; a Bluetooth laser in keyboard mode types its reading here, replacing the tapped distance. Typed entry works the same way. | Round 24 #47. No connection or battery labels (Round 24 #27). |
| Zoom + / − | Canvas bottom right | Zoom in / out. |  |
| Highlighted object | Canvas | Measured object (SB36) outlined in blue dashed. |  |
| Measurement labels | Canvas | Measured value pill ("36 1/4"") and drawing value ("dwg 36""). |  |
| Bottom sheet grabber | Bottom sheet | Drag to expand / collapse. |  |
| Measurement readout | Bottom sheet | Label "Sink base opening · SB36 · A to B", value 36 1/4", Drawing 36", delta pill "+1/4"". | Delta amber when over tolerance. |
| Tolerance notice | Bottom sheet | "Over the 1/8" tolerance. Add a filler or confirm with office before ordering." | Tolerance = the one company tolerance in 15d. Shown only when exceeded. |
| Save PDF | Bottom sheet | Downloads the field pack PDF (in the user's language) to the phone. | Works offline from the cached pack. |
| Send measurement | Bottom sheet | Sends the field-verified measurement (object, points, value, drawing value, optional photo and note) to the office. Toast "Sent to office for approval". | Separate from Flag conflict (Round 24 #28). Model changes only after office approval. Queued offline. |
| Flag conflict to office | Bottom sheet, primary | Creates a conflict flag (field differs from drawing) with location, measurement, optional photo and note; notifies office. | Queued offline. |
| Task row checkbox | Tasks tab | Marks task done; records user and time. | Hidden without Check off tasks. Queued offline. |
| Task row: add photo | Tasks tab | Attaches a photo to the task. | Photo notes. |
| Task row: edit text | Tasks tab | Edits the task text. | Edit field tasks; online only. |
| Photo pin | Plan canvas | Tap opens photo + note. |  |

**Data shown:**

- Project, sent version or revision and date, current sheet name.
- Model objects for the room: walls, openings, cabinet boxes with codes (F, B15, DW24, SB36, B18, B21, DB18, R30, B24, DB24), appliances (REF), island, overall dimensions (13'-0" x 13'-0").
- Measurement: target object, points A/B, measured value, drawing value, delta, tolerance.
- field\_task: text in the user's language (text\_en / text\_es), status, photos.
- Selected finishes (no prices).
- Language from the user's setting; Spanish users always see Spanish, reviewed or not.

**States:**

- First load: downloads and caches the pack; offline icon shows progress.
- Offline: fully usable after first load; tasks, photos, flags and measurements queue as offline\_change and sync on reconnect.
- Revision conflict on reconnect: queued actions made against an older revision are flagged; a sheet lists them with "Resend against Rev N" or "Discard" per item, and the office sees them as conflicts.
- Within tolerance: delta pill neutral, no notice.
- Over tolerance: amber delta and notice.
- No permission for an action: that control is hidden.
- Signed out: SSO fails → magic-link sign-in prompt.
- Error: PDF or sync failure with Retry.
- No set sent yet: "No field pack issued yet."

**Validation & warnings:**

- Measured vs drawing delta compared to the company tolerance.
- Typed lengths accept 12'6", 12' 6 1/2", 150", 12.5'.
- Field measurements never change the model until approved by a user with Approve field measurements.
- Company costs never displayed for users without See company costs, nor sell prices without See sell prices.

**Events emitted:**

- field\_task.completed
- field.conflict\_flagged: project, room, object, measured, drawing, delta, photo, note, user.
- field.measurement\_submitted; field.measurement\_approved and field.measurement\_rejected from the office review screen.
- field\_photo.added (new)
- field\_pack.pdf\_saved (new)
- offline\_change.synced (new); offline\_change.conflicted (new)

**Decisions:**

1. "Laser connected" and battery labels are removed; a keyboard-mode laser types into the measured value field (Round 24).
2. Send measurement and Flag conflict to office are separate buttons (Round 24).
3. The office is notified when measurements arrive and approves them on the Field measurements review screen (Round 24).
4. One company tolerance (15d) covers field measurements and scan-vs-typed checks (Round 24).
5. Field actions use the permissions Check off tasks, Photo notes, Flag conflict, Send field measurement; the Foreman preset ticks all four; Crew ticks all but Send field measurement (section 9 permission table).
6. Save PDF needs only View projects, because crews must be able to save the pack (plan Round 8); Export covers model and set exports (Claude).
7. Queued actions against an older revision are flagged as conflicts on reconnect, with Resend or Discard per item (Round 24, Claude for the controls).
8. Room chips, phase-grouped Tasks, Photo capture-then-pin and a full 3D tab with measure follow the earlier field pack mockup (Claude).
9. Plan tab opens A3.0 Proposed by default; the mockup subtitle "A2.0 proposed plan" is corrected (Round 24 sheet set).
