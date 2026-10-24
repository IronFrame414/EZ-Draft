# 07 · 3D view

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** Show the live 3D model from the plan, let users orbit, walk, look up, cut sections, save camera views, and build design options A/B/C with internal cost for client comparison.

**Entry points:**

- 3D tab in the header.
- Make options A / B / C on the RCP inspector (05).
- Saved view links from Render setup (08).
- Phone: 3D viewer from the field pack or client view (phone layout not in mockup).

**Permissions:**

- View 3D, orbit, walk, section, measure: View projects.
- Save view, rename/delete saved views: Edit model. No edit lock needed.
- Toggle layers: View projects (display only, not saved to model).
- Create, duplicate, edit options; edit beam parameters; apply finishes: Edit model, plus the edit lock.
- See option cost deltas: See company costs. Without it, the cost value is hidden; the "Internal" label stays.
- Send options to client: Send to client.
- Render A/B/C: Run fast renders, Run standard renders or Run photoreal renders, by tier chosen.
- Controls a user lacks permission for are hidden.

**Layout:** Standard editor shell, with these differences:

- Tool rail: standard rail plus the code Check button. Drawing tools switch to the Plan tab with that tool active.
- Left panel: Saved views (count, thumbnail list), Layers (visibility, opacity), footer "Model synced with plan".
- Canvas: top toolbar (Orbit, Walk, Look up, Section, Save view) and display mode toggle (Shaded, Lines, X-ray); 3D viewport; view cube with Home and Fit (corner); control hint strip.
- Inspector: Design options (A/B/C cards), selected object details, actions (Send options to client, Copy link, Duplicate option, Render A/B/C).
- Status bar adds Camera, Target, Option, Ridge, frame rate.
- Phone: full-screen viewport with view cube, Measure button and saved views in a bottom sheet; no inspector.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Orbit | Canvas toolbar | Orbit mode (default). Free 360° in any direction, over the top and underneath, no locked angles. | Selected by default. |
| Walk | Canvas toolbar | Walk / look-around mode at eye height (default 5'-6", company setting; editable in the status bar). Drag to turn the head. Desktop: W/A/S/D or arrow keys move. iPad: on-screen joystick bottom left moves. | Movement keys are company settings under Defaults. |
| Look up | Canvas toolbar | Preset: walk camera at eye height aimed up at the ceiling. | Shortcut U. |
| Section | Canvas toolbar | Places a vertical section plane through the orbit target. Drag its arrow handle to move it; click a view cube face to align it; Flip reverses the kept side; press Section again to clear. | Display only. |
| Save view | Canvas toolbar | Saves current camera as a named camera\_view; prompts for a name. Appears in Saved views and in Render setup (08) and the client gallery. | Edit model. No edit lock needed. |
| Shaded / Lines / X-ray | Canvas, top right toggle | Display mode. | One active. Display only. |
| Left-drag | Viewport (mouse) | Orbit around target. | Same in render studio model view. |
| Right-drag or Shift-drag | Viewport (mouse) | Pan. |  |
| Scroll | Viewport (mouse) | Zoom toward cursor. |  |
| One-finger drag | Viewport (iPad) | Orbit. |  |
| Two-finger drag | Viewport (iPad) | Pan. |  |
| Pinch | Viewport (iPad) | Zoom. |  |
| Click object | Viewport | Selects object; inspector shows details (e.g. beam B2). Tag shown on canvas with bottom-of-beam height AFF, matching the inspector. | Allowed in view only. |
| Double-click object (not in mockup) | Viewport | Sets orbit target to that point. | Status bar Target updates. |
| Right-click object (not in mockup) | Viewport | Menu: Edit in plan, Apply finish, Hide. |  |
| View cube face or corner | Canvas corner | Click a face (TOP, FRONT, RIGHT) or corner to snap to top, front, side or isometric. Click again to return to free orbit. |  |
| Home (reset view) | Under view cube | Resets camera to default. |  |
| Fit to screen | Under view cube | Fits model in viewport. |  |
| Control hint strip | Canvas bottom | "Drag to orbit any direction · Shift-drag to pan · Look up U". | Read only. iPad shows touch gestures instead (not in mockup). |
| Saved view row | Left panel | Click moves camera to the view. Row shows thumbnail, name, mode (orbit/walk/ortho, angle or eye height). | Selected state. |
| Saved view rename / delete / update (not in mockup) | Left panel row menu or right-click | Rename, overwrite with current camera, delete. | Edit model. Warn if a render or client gallery uses the view. |
| Layer row visibility | Left panel, Layers | Show/hide: Walls + openings, Ceiling, Faux beams (option), Cabinets + tops, Furniture, Lighting, Demo. | Display only. |
| Layer opacity (e.g. Ceiling 50%) | Left panel, Layers | Click value to set opacity. | Display only. |
| Scan mesh layer (not in mockup) | Left panel, Layers | Show/hide Polycam GLB mesh as reference. | Plan section 1. Row shown only when a mesh exists. |
| Apply finish (not in mockup) | Viewport, click a surface with Select | Inspector shows a Finish picker; choosing a catalog item applies it as a texture. | Edit model, plus the edit lock. |
| Measure (not in mockup on desktop) | Canvas toolbar | Distance between two points. | Required on phone (Round 18). |
| Option card A / B / C | Inspector | Click selects option; viewport shows that option. Card shows label, name, spec, mini diagram, "Internal · not shown to client" and cost (Base or +$ delta). | Selected state. Cost hidden without See company costs. |
| Option name / spec edit (not in mockup) | Inspector, option card | Rename option, edit its parameters. | Edit model. |
| Option status pill ("Draft") | Inspector header | Shows options state: Draft, Sent (Version N), Approved, Archived (not in mockup for later states). | Approved options lock that version. |
| Selected object details | Inspector | For a beam: section, height bottom AFF, span, spacing, finish, attachment. | Editable with Edit model; values same as RCP inspector. |
| Option cost detail (not in mockup) | Inspector, click cost | Structured lines: option, item, qty, unit cost, total. | See company costs. Internal only. |
| Info note | Inspector | "Decorative, non-structural. Client sees layouts and renders only; cost deltas stay in your view." | Read only. |
| Send options to client | Inspector, primary | Emails the client a share link to options A/B/C (3D layout snapshot per option plus any client-ready renders). Cost data never included. Freezes the sent version as "Version N"; editing continues on a working copy. | Send to client. No edit lock needed. Renders not required. |
| Copy link (not in mockup) | Inspector, next to Send options to client | Copies the share link to the clipboard. | Send to client. |
| Duplicate option | Inspector | Copies selected option into the next free letter. | Edit model. Disabled when three options exist. |
| Render A/B/C | Inspector | Opens Render setup (08) with all options queued from the current angle. | Render permission for chosen tier. Angle required. No edit lock needed. |
| Existing / Proposed toggle | Status bar | Shows existing or proposed model. | Standard shell. |
| Check | Left tool rail | Runs code checks (see 06). | Run code check. |
| Rail drawing tools | Left tool rail | Switch to the Plan tab with that tool active. | Edit model. |
| Keyboard: U | Global in 3D | Look up. | Company setting. |

**Data shown:**

- Model geometry for the current model\_version, finishes as textures, ceiling slope, beams.
- Dimension labels in viewport (e.g. "4'-6" o.c.", "16'-0"", "18'-0" family room", "14'-0" ridge", "9'-0" plate").
- Saved camera views (camera\_view): name, mode, angle/eye height, thumbnail.
- Layers and their visibility/opacity.
- Options (design\_option, label A/B/C): name, spec, diagram, cost delta (option, item, qty, unit cost, total).
- Selected object attributes.
- Sync status: "Model synced with plan".
- Status bar: camera mode, projection, field of view, target, option, ridge/plate, frame rate.

**States:**

- Empty: model has no geometry; viewport shows "Draw walls in Plan to see 3D".
- Loading: progressive load; geometry first, textures after.
- Error: WebGL unavailable or out of memory (iPad Safari limits); show message and a lighter display mode.
- Model out of sync: footer shows "Updating from plan" until the current version loads.
- Locked / view-only: camera, layers, views list, Save view, Send and Render usable; option editing and Apply finish disabled.
- Offline: last loaded version viewable; Send options and Render disabled.
- Permission-denied: controls the user lacks are hidden (cost values, Send, Copy link, Render).
- Options sent: the sent version is frozen permanently; editing continues on a working copy; the next send creates a new version for a new signature.
- Option approved: that version is locked; non-selected options stay archived with it, read only.

**Validation & warnings:**

- Maximum three options (A/B/C).
- Option cost never leaves the internal view (not in share link, not in selections PDF unless allowance add-on is chosen there).
- Large scene on iPad: warn and offer lighter mode when memory is low.
- Renders labeled "for illustration; drawings govern".

**Events emitted:**

- camera\_view.saved (new), camera\_view.deleted (new).
- design\_option.created / design\_option.updated for options.
- version.sent on Send options to client.
- render.requested (new) per option on Render A/B/C.

**Decisions:**

1. Walk mode: drag to look; W/A/S/D or arrow keys move on desktop; on-screen joystick on iPad. Eye height defaults to 5'-6" (company setting) and is editable in the status bar. (Claude)
2. Section places a vertical plane through the orbit target with an arrow handle to move it, view-cube faces to align it, and a Flip control. Pressing Section again clears it. (Claude)
3. Rail drawing tools in 3D switch to the Plan tab with that tool active. (Claude)
4. Apply finish: click a surface with Select and pick a catalog finish in the inspector. It needs Edit model and the edit lock. (Claude)
5. A "Scan mesh" layer row appears when a Polycam mesh exists. (Claude)
6. Shaded / Lines / X-ray stay as display modes. (Claude)
7. The 3D tag shows bottom-of-beam height AFF, matching the inspector. The mockup values are placeholders. (Claude)
8. Phone 3D is a full-screen viewport with view cube, Measure and saved views in a bottom sheet, and no inspector. (Claude)
9. When the client signs an approval, the options not chosen are archived with that version, read only. Choosing alone archives nothing (Round 24 #32). (Claude)
10. Sending options does not require renders. The client sees a 3D layout snapshot per option plus any client-ready renders. Send is emailed, with Copy link beside it. (Round 24 + Claude)
