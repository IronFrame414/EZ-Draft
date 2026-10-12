### 05 · Ceiling plan / RCP

**Purpose:** Edit each room's ceiling (type, heights, slope) and the objects on it, and produce the reflected ceiling plan (RCP) for the permit set (sheet A6.0) and the crew. Not a client tool; client-facing ceiling choices go through options A/B/C and renders.

**Entry points:**

- Plan tab, then the Ceiling tool (roofing icon) in the standard tool rail. The rail switches to the ceiling tool rail shown in the mockup.
- Plan tab, left panel segment "Ceiling" or "Both".
- Callouts to sheet A6.0 from Sheets (13).
- Right-click a ceiling object (beam, light, fan, detector) in 3D (07) and choose "Edit in plan" (not in mockup).

**Permissions:**

- View the RCP: View projects.
- Place, edit, move or delete any ceiling object, change ceiling type and heights, auto-layout cans, draw switching zones, create options A/B/C: Edit model (and the project edit lock, see 06).
- Pick a catalog finish for a client selection: Edit model. Adding a new catalog item from the picker also needs Edit catalog.
- Option cost values (if shown from this screen): See company costs.

**Layout:** Standard editor shell, with these differences:

- Tool rail is the ceiling rail: Select, Ceiling type, Beam, Recessed light, Ceiling fan, Acoustical grid, HVAC diffuser or return, Smoke or CO detector, Speaker or low voltage, Access panel, Soffit/tray/coffer, Height and material tag, code Check, Help.
- Left panel (248px): Floor / Ceiling / Both segment; current room ceiling summary; Lighting actions; Fixture schedule.
- Canvas: RCP drawing, legend chip bottom left, zoom stack top right.
- Inspector (336px): selected object properties, Section A-A preview, Client selections, Make options A/B/C.
- Header and status bar follow the standard shell ("N to review" pill, Existing/Proposed toggle). Status bar adds View, Scale and Joists status. The mockup omits the pill and the toggle; build them.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Select (V) | Ceiling rail | Activates select tool. Click picks the smallest object under the cursor; repeated clicks cycle outward (e.g. can, beam, ceiling). | Always available, including view only. |
| Ceiling type | Ceiling rail | Click a room to set its ceiling type: flat, single slope, vaulted/cathedral, tray, coffered. Opens the ceiling type editor in the inspector. | Edit model. |
| Beam | Ceiling rail | Places faux beams on the selected ceiling surface. Beams follow the slope or sit level per Placement. | Edit model. Pressed state shown in mockup. |
| Recessed light | Ceiling rail | Click to place a can. Same object as on the electrical plan (06). | Edit model. Snaps to ceiling; in ACT areas, troffers snap into tiles. |
| Ceiling fan | Ceiling rail | Click to place a fan. | Edit model. Blade clearance to walls and beams checked (see Validation). |
| Acoustical grid | Ceiling rail | Places a 2x2 or 2x4 ACT grid in a room; set direction and start point. Grid auto-balances borders. | Edit model. |
| HVAC diffuser or return | Ceiling rail | Places supply diffuser, return or exhaust fan. In ACT, snaps into a tile. | Edit model. |
| Smoke or CO detector | Ceiling rail | Places a detector, status existing or proposed. Same object as electrical plan. | Edit model. |
| Speaker or low voltage | Ceiling rail | Places in-ceiling speaker, camera or Wi-Fi access point. | Edit model. |
| Access panel | Ceiling rail | Places an access panel or attic hatch. | Edit model. |
| Soffit, tray, coffer | Ceiling rail | Draws a soffit, tray, coffer or crown; edges get dimensions. | Edit model. |
| Height and material tag | Ceiling rail | Click an area to place a tag (e.g. "CLG 8' 0" · ACT 2x2"). Tag reads from the ceiling data. | Edit model. Tag text is generated, not free text. |
| Check (not in mockup) | Ceiling rail, above Help | Runs code checks on demand for the whole project (same check as 06). | Run code check. Hidden without it. Present on every editor tab. |
| Help | Ceiling rail, bottom | Opens help for the ceiling tools. | Always. |
| Sprinkler head tool (not in mockup) | Ceiling rail | Not built in v1. | Plan marks sprinklers as mainly commercial, v2 scope. Do not show in v1. |
| Floor / Ceiling / Both segment | Left panel, top | Floor: floor plan with the standard rail. Ceiling: RCP with the ceiling rail. Both: RCP over a greyed floor plan, ceiling rail. | Selected state "Ceiling" in mockup. Available in view only. |
| Room ceiling summary | Left panel | Shows type and ridge direction, wall heights, ridge height, pitch (e.g. "walls 8' 0" · ridge 13' 0" · 9.4/12"). | Read only. Updates when the active room changes. |
| Change ceiling | Left panel, under summary | Opens the ceiling type editor for the active room: type, heights per wall or per point, or pitch, or read from Polycam mesh. | Edit model. Heights accept typed formats (12'6", 12' 6 1/2", 150", 12.5'). |
| Read heights from scan (not in mockup) | Ceiling type editor | Fills heights and slope from the Polycam mesh. | Only when a GLB mesh exists for the project. |
| Auto-layout cans | Left panel, Lighting | Opens auto-layout: by count, by spacing, or by light-level target in foot-candles. Places cans in the room. | Edit model. Result shown for confirmation before it is committed (AI/auto results never applied silently). |
| Switching zones | Left panel, Lighting | Draws switching zones and dimmers on the RCP (dashed accent lines). | Edit model. Zones sync to switch legs on the electrical plan. |
| Fixture schedule rows | Left panel | One row per type tag (A, F, S, T): tag, description, count. Click selects all fixtures of that type on canvas. | Read only list. Full schedule (lumens, color temperature, trim, catalog link) appears on the sheet (not in mockup in the panel). |
| Fixture type tag edit (not in mockup) | Inspector, on a light | Set type tag, lumens, color temperature, trim, catalog item. | Edit model. Required by plan Round 16. |
| Canvas click | Canvas | Selects object (cycle outward on repeat click). | Allowed in view only. |
| Canvas shift-click | Canvas | Adds to selection. | Bulk edit of many objects in inspector. |
| Canvas box select | Canvas, drag on empty space | Selects all objects in box, limited by layer filter. |  |
| Canvas drag on object | Canvas | Moves the object; live dimensions show. | Edit model. Beams in a set move as a set unless one is selected alone. |
| Spacing dimension pill (e.g. "4' 0" o.c.") | Canvas, above selected beam set | Shows spacing. Click to type a new spacing. | Typed dimension on every edit. |
| Right-click on object | Canvas | Context menu (copy, paste, mirror, align, delete, save as group). | Same as Plan (03). |
| Zoom in / Zoom out / Fit to screen | Canvas, top right stack | Zoom by step; fit drawing to canvas. | Always. |
| Scroll / pinch | Canvas | Zoom toward cursor / pinch center. Two-finger drag pans on iPad. | Always. |
| Legend chip | Canvas, bottom left | Shows switch zone line style and ACT border sizes for the selected grid. | Read only. |
| Placement select | Inspector, beams | Level beams in vault / Follow slope / On flat ceiling. | Edit model. |
| Height AFF input | Inspector, beams | Bottom-of-beam height above finished floor. | Shown for "Level beams in vault". Disabled when Match = Adjoining room (value copied). |
| Match select | Inspector, beams | Adjoining room / Custom. Adjoining room sets Height AFF to the finished ceiling height of the adjoining room. | Level beams only. |
| Size W x H input | Inspector, beams | Beam width x height. | Typed format, fractions to 1/16". |
| Spacing input | Inspector, beams | On-center spacing across the span. | Mutually exclusive with Count. |
| Count input (not in mockup) | Inspector, beams | Number of beams across the span; spacing is computed. | Plan Round 13: spacing or count. |
| Length input (not in mockup) | Inspector, beams | Beam length. | Plan Round 13. Default is wall to wall span. |
| Direction select | Inspector, beams | Across ridge / With ridge. |  |
| End detail select | Inspector, beams | Square to slope / Corbel. |  |
| Section A-A preview | Inspector | Live section through the selected beams: adjoining height, beam height, ridge height. | Read only. |
| Beam finish (client selection) | Inspector, Client selections | Opens catalog picker filtered to beam finishes. Sets the finish as the selection item of the current option; it feeds the selections PDF and client approval. | Edit model. |
| Make options A / B / C | Inspector, bottom | Creates design options from the current ceiling (e.g. beam size, spacing, stain). Opens options in 3D (07). | Edit model. Maximum three options. |
| More (…) | Inspector, bottom | Menu: Duplicate, Save as group, Show in 3D, Delete. | Edit model for Duplicate, Save as group, Delete; hidden without it. |
| Framing known (not in mockup) | Inspector, when a ceiling is selected | Choose Unknown / New construction / Full demo / Enter locations. Enter locations: draw joist or beam lines with direction and spacing. Turns keep-clear checks on. | Edit model. Status bar text changes from "unknown · beam clash checks off". |
| Keyboard shortcuts | Global | V for Select; other ceiling tool shortcuts as set in company settings under Defaults. Undo/redo, copy/paste, delete, Esc as in the standard editor. | Undo within session only. |

**Data shown:**

- Room ceilings: type, ridge line and direction, heights per wall or point, pitch (model object: ceiling type per room).
- Ceiling objects: beams (size, length, spacing/count, direction, placement, height, finish, end detail), cans, fans, troffers, diffusers, returns, exhaust fans, detectors (existing/proposed), speakers, low voltage, access panels, soffits, trays, coffers, crown.
- ACT grid: module, direction, start point, border sizes.
- Height/material tags per area.
- Fixture schedule: tag, description, count; on sheet also lumens, color temperature, trim, catalog link.
- Switching zones and dimmers.
- Room name and area label (e.g. "FAMILY ROOM · 320 SF").
- Object status badge in inspector (Existing / Demo / New).
- Status bar: view name, sheet scale (1/4" = 1'-0"), joist status, zoom.
- Project header: project name, client, model version, last saved.

**States:**

- Empty: room has no ceiling set; default is flat at the wall height. Fixture schedule shows "No fixtures yet".
- Loading: canvas skeleton while the model version loads.
- Error: model failed to load or save; show retry; unsaved changes kept locally.
- Locked / view-only: another user holds the edit lock. Amber banner (see 06). Rail tools other than Select disabled; inspector fields read only; Make options disabled. Pan, zoom, select and measure allowed.
- Offline: editing continues if this user holds the lock; changes queue on device and sync on reconnect.
- Permission-denied: user without Edit model sees view-only state without Request edit.
- Joists unknown: keep-clear checks off; status bar says so.
- Joists known: keep-clear checks on.
- Ceiling slope changed: walls under a slope get their top edge cut to match in plan, elevations and 3D.

**Validation & warnings:**

- Keep-clear warning when a can lands on a joist or beam. Only where joist/beam locations are known (new construction, full demo, or user-entered). Otherwise no warning.
- ACT balanced borders: edge tiles at least half a tile (12" on a 2x2 module; 12" or 24" on 2x4 per direction). Balancing picks the start point that meets this; warn if the user overrides it. Minimum border is a company setting under Defaults.
- Ceiling fan blade clearance to walls and beams: warning when closer than the clearance in company settings under Defaults.
- Level beams in a vault must sit below the ridge and at or above the wall plate; warn otherwise.
- Hosted ceiling item left off any ceiling surface: red flag, listed in the issue check.
- Typed heights: invalid format shows inline error, value not applied.

**Events emitted:**

- takeoff.updated (beam, fixture, ACT tile/main/cross tee/wall angle/hanger wire quantities change).
- model.saved on save.
- design\_option.created when Make options A/B/C runs.

**Decisions:**

1. The RCP and sheet A6.0 are v1. (Round 24)
2. The RCP uses the standard shell: "N to review" pill in the header and the Existing/Proposed toggle in the status bar. (Claude)
3. The half-tile rule stands. The mockup border values are placeholders. Balancing picks a start point that gives borders of at least half a tile; the minimum is a company setting under Defaults. (Claude)
4. The fan blade clearance is a company setting under Defaults, entered by the owner. (Round 24)
5. Joist/beam locations are entered through a "Framing known" section in the inspector of the selected ceiling: Unknown, New construction, Full demo or Enter locations (draw lines with direction and spacing). (Claude)
6. The light-level target is in foot-candles, using the lumen method with the fixture's catalog lumens. The default target per room type is a company setting. (Claude)
7. The More menu holds Duplicate, Save as group, Show in 3D and Delete. (Claude)
8. The Floor / Ceiling / Both segment switches rails: Floor shows the standard rail; Ceiling and Both show the ceiling rail. (Claude)
9. Keyboard shortcuts for ceiling tools are company settings under Defaults. V for Select stays. (Round 24)
10. Beam finish is the selection item of the current option. It feeds the selections PDF and client approval. (Claude)
