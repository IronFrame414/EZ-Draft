### 06 · Electrical + edit lock

**Purpose:** Place electrical devices, assign circuits, review the NEC Article 220 residential load calc and the panel schedule, and run code checks on demand. This screen also specifies the project edit lock (banner, Request edit, 5-minute auto release), which applies to every editor screen.

**Entry points:**

- Plan tab, Electrical tool (E) in the standard rail.
- Left panel tabs Circuits / Devices / Panel once in electrical mode.
- Sheets (13): sheet E1.0 or E2.0 "Edit in plan" (not in mockup).
- Issue set: the code check runs and lists open warnings; clicking a warning opens this screen at the device.
- Notification or banner "Available to edit" (edit lock).

**Permissions:**

- View plan, circuits, load calc, panel schedule, code check results: View projects.
- Place/move/delete devices, assign circuits, create circuits, edit circuit attributes, edit load calc inputs (existing panel, appliances, method, case): Edit model, plus holding the edit lock.
- Run Check: Run code check.
- Accept a code warning with a note: Edit model (at issue time, Issue permit sets or Issue revisions).
- Add to E2.0: Edit model.
- Request edit: Edit model.
- Release lock / Keep editing (prompt to the lock holder) and Stop editing: the lock holder.
- Controls a user lacks permission for are hidden, not disabled.

**Layout:** Standard editor shell, with these differences:

- Header shows presence avatars (other users in the project) left of the "N to review" pill, and a Stop editing button for the lock holder.
- Tool rail adds the code Check button (on every editor tab).
- Left panel: Circuits / Devices / Panel tabs; panel header ("Panel A · 200A main", units AMPS · VA); circuit list; New circuit; Show chips; footer totals.
- Canvas column: edit-lock banner (top), floating device toolbar plus check status pill, electrical plan, "Available to edit" toast (bottom right, when shown).
- Inspector: Panel load calc (top), Selected circuit (middle), Panel schedule and Add to E2.0 (bottom).
- Status bar adds: Layer, Service, Code, and a "View only" lock indicator.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Electrical tool (E) | Standard rail | Enters electrical mode. | Pressed state. Shortcut E (company setting). |
| Check (not in mockup) | Left tool rail, on every editor tab | Runs code checks on demand. Results list in a panel: each warning with rule, NEC reference, device, and Go to. | Run code check; hidden without it. Not live while drawing. Never auto-fixes. Allowed in view only. |
| Circuits tab | Left panel segment | Lists circuits for the selected panel. | Default tab. |
| Devices tab | Left panel segment | Lists placed devices grouped by room: device type, circuit, GFCI/AFCI. Click selects the device on canvas. |  |
| Panel tab | Left panel segment | Compact panel schedule: two columns of spaces (odd/even) with circuit number, name, breaker; open spaces shown empty. Click a space selects its circuit. |  |
| Panel selector (not in mockup) | Left panel header ("Panel A · 200A main") | Switch between main panel and subpanels. | Needed for subpanel feeder case (Round 5). |
| Circuit row | Left panel list | Click selects the circuit: highlights its devices and home run on canvas, shows details in inspector. Row shows circuit number, name, breaker/type/count, VA. | Selected state (accent). Allowed in view only. |
| Circuit row double-click (not in mockup) | Left panel list | Rename circuit inline. | Edit model. |
| New circuit | Left panel, under list | Creates a new circuit in the next open space. | Edit model; hidden without it. Disabled in view only (mockup shows disabled). Disabled when no spaces left. |
| Show chips: Receptacles, Switch legs, Lighting, Home runs, Low voltage | Left panel | Toggle display of each layer on canvas. | Multiple on. Display only; allowed in view only. |
| Circuit/space footer | Left panel bottom | Shows "8 circuits · 11 spaces" and total connected VA. | Read only. |
| Device toolbar: Receptacle | Canvas, floating toolbar | Places receptacles. Attributes: circuit, GFCI/AFCI, type (duplex, 240V), optional height note (off by default). | Edit model. Paused (55% opacity, disabled) in view only with note "Editing tools paused while view only". |
| Device toolbar: Switch | Canvas toolbar | Places single, 3-way, dimmer switches. | Same. |
| Device toolbar: Light | Canvas toolbar | Places lights (same objects as RCP). | Same. |
| Device toolbar: Switch leg | Canvas toolbar | Draw a switch leg from switch to fixtures (dashed). | Same. |
| Device toolbar: Circuit | Canvas toolbar | Assign circuit by clicking devices in turn. Circuit line drawn automatically. | Same. |
| Device toolbar: Low voltage (not in mockup) | Canvas toolbar | Places data, TV, doorbell, speakers. | Round 5. |
| Device toolbar: Smoke/CO, Fan (not in mockup) | Canvas toolbar | Places detectors and fans. | Same objects as RCP. |
| Device height note toggle (not in mockup) | Inspector, on a selected device | Shows a height note (e.g. "MW +66"") on the plan for that device. | Off by default. Edit model. |
| Check status pill ("Spacing checks pass") | Canvas, right of toolbar | Shows result of the last check. Click opens the check results list. | Green when no open warnings; amber with count when warnings exist; grey "Check not run" after changes since the last check. |
| Canvas click on device | Canvas | Selects device; inspector shows device and its circuit. Repeat click cycles outward. | Allowed in view only. |
| Canvas click on circuit tag | Canvas | Selects that circuit. | Allowed in view only. |
| Canvas drag device | Canvas | Moves device; live distances. | Edit model. |
| Canvas right-click | Canvas | Context menu: assign to circuit, set GFCI/AFCI, delete. | Edit model. |
| Measure (implied by banner) | Canvas | Measure between two points. | Allowed in view only. |
| Pan / zoom | Canvas | Drag empty space / scroll / pinch. | Allowed in view only. |
| Optional method toggle (not in mockup) | Inspector, load calc header | Off: NEC 220 standard method. On: optional method for existing dwellings. | Edit model. Available for every case. |
| Load calc case select (not in mockup) | Inspector, load calc header | Circuits added to existing panel / Service upgrade / Subpanel feeder / Large add (EV, heat pump) / Like-for-like panel replacement. | Edit model. Round 5. |
| Existing panel (not in mockup) | Inspector, load calc header button; opens a dialog | Service size, main breaker, panel label photo (AI reads brand, rating, spaces; user confirms), existing circuit list (typed or read from directory photo; user confirms), existing large appliances (range, dryer, AC, water heater). | Edit model. AI values shown for confirmation, never applied silently. |
| Load calc line rows | Inspector | Each line of the math with its basis (e.g. "2,450 sf x 3", "T220.55 col C"). | Read only. Appliance values from catalog item specs first, else standard defaults (editable). |
| Appliance rating override (not in mockup) | Inspector, click a load calc line | Edit the default rating for that appliance. | Edit model. Marked as overridden. |
| Service bar | Inspector, under total | Shows % of service used and spare amps. | Read only. Pill "200A OK" at top. Green below the warning threshold, amber at or above it, red above 100% of service. |
| Selected circuit block | Inspector | Circuit tag, name, location summary, breaker, wire, run length, voltage drop, per-circuit code check rows with NEC references. | Read only in view only. Fields editable with Edit model (breaker, wire, name). Voltage drop shows a warning above the threshold in settings. |
| Code info note | Inspector | "Permits applied after Dec 31, 2026 use FBC 9th ed. Load calc only; no structural calcs." | Text depends on project code edition setting. |
| Panel schedule | Inspector, bottom | Opens the generated panel schedule: space, circuit, breaker size, poles, wire size, AFCI/GFCI type, load; flags spaces left. | Read only in schedule; edits happen on circuits. |
| Add to E2.0 | Inspector, bottom | Places/updates panel schedule and load calc on sheet E2.0. | Edit model. If already placed, label reads "Update E2.0" (not in mockup). |
| Existing / Proposed toggle | Status bar | Switches phase view and default status for new devices. | Standard shell. |
| Edit-lock banner (amber) | Canvas column, top | "\[Name\] is editing since \[time\] · view only", "You can pan, zoom and measure". | Shown to every user who does not hold the lock. Live. |
| Request edit | Edit-lock banner | Sends a request to the lock holder. Button changes to "Requested \[time\]" with a cancel option (not in mockup). | Edit model; hidden without it. One pending request per user. No cooldown after a Keep. |
| Lock holder prompt (not in mockup) | Lock holder's screen, modal | "\[Requester\] wants to edit. Release / Keep editing". Shows a 5-minute countdown. | Release: saves holder's work, releases lock. Keep: lock stays; requester is notified. No answer in 5 minutes: work saved, lock released. The timer does not pause while the holder is offline. |
| Available to edit toast (green) | Canvas, bottom right | "Available to edit · \[Name\] left the plan". | Shown to everyone in the project the moment the lock is free. |
| Start editing | Green toast | Takes the lock. Banner and "View only" indicator clear; tools enable. | Edit model. First user to press it gets the lock; others see the amber banner with the new holder. |
| Stop editing (not in mockup) | Header, lock holder only | Saves, then releases the lock. Closing the project does the same. | Lock holder. |
| View only indicator | Status bar | Lock icon and "View only". | Shown while not holding the lock. |
| Presence avatars | Header | Users currently in the project. Hover shows name and whether editing. | Lock holder ring color amber. |
| Keyboard: E, V, M, W, D, C, K, L, T | Rail | Standard tool shortcuts; values are company settings under Defaults. | Drawing shortcuts inactive in view only. |

**Data shown:**

- Circuits (model object circuit): number (single or 2-pole e.g. "1-3"), name, breaker amps, poles, GFCI/AFCI/dual function, dedicated flag, device count, wire size and type, run length, VA.
- Devices (model object device): type, circuit, GFCI/AFCI, location; circuit tags on canvas.
- Panel: name, main breaker, service size, spaces total and used.
- Load calc (electrical\_calc for the current model\_version): method, case, inputs, every line of the math, total VA, amps at 240V, % of service, spare amps. Recomputed in the browser when an input changes while the load calc is on screen; stored when a set is issued.
- Code edition (project setting): "NEC 2023 · FBC 9th ed.".
- Check results: rule, NEC reference, pass/warning, device.
- Edit lock (edit\_lock): holder, since, release requests.
- Status bar: layer, scale (1/2" = 1'-0"), service and calculated amps, code edition.

**States:**

- Empty: no devices; circuit list empty with "Place devices or add a circuit"; load calc shows general lighting and required small appliance/laundry only, or prompts for square footage.
- Loading: list and canvas skeletons; load calc "Calculating".
- Error: calc failed (missing input) shows the missing input by name.
- Locked / view-only: amber banner, Request edit, tools paused, New circuit disabled, inspector read only, status bar "View only". Selecting, panning, zooming, measuring, commenting and running Check allowed.
- Request pending: Request edit shows pending state and countdown.
- Available: green toast with Start editing.
- Offline (lock holder): editing continues, lock holds, changes queue and sync on reconnect. If the lock auto-released while offline, on reconnect the former holder gets a conflict notification listing clashes to resolve.
- Offline (viewer): view of last loaded version; Request edit disabled.
- Permission-denied: controls the user lacks are hidden (no Request edit, no tools, no Check without Run code check).
- Check not run since last change: pill shows "Check not run".
- Service over capacity: pill turns amber or red (see Validation).
- No spaces left: New circuit disabled; panel schedule flags it.

**Validation & warnings:**

- Code checks (warnings only, never auto-fix), run by Check: countertop receptacle spacing (210.52(C): ≤ 48" apart, ≤ 24" from ends per mockup), GFCI locations (210.8), AFCI locations (210.12), required dedicated circuits (dishwasher, disposal, microwave, fridge, bath), two small-appliance circuits minimum (210.11(C)(1)), smoke/CO locations.
- Code checks are a project-edition rule set (default 2023 NEC).
- Issue set runs the check automatically and lists open warnings; each can be accepted with a note. A permit set cannot issue until the check is reviewed.
- Every electrical sheet carries the note that the electrical contractor of record verifies the design. The EC signature/seal block is optional per submittal profile; departments accept the GC's load calc.
- Load warning threshold (% of service) is a company setting under Defaults; amber at or above it, red above 100%.
- Voltage drop: warning above the threshold in company settings under Defaults.
- Panel spaces: schedule flags spaces left; zero spaces blocks New circuit.
- AI-read panel label and directory values must be confirmed before use.
- Edit lock: one editor per project; covers every change to model, sheets, options and markup; no silent idle timeout; auto release only after a Request edit goes unanswered for 5 minutes.

**Events emitted:**

- takeoff.updated (device counts, estimated wire runs).
- electrical\_calc.updated (new) on recompute.
- code\_check.completed (new) with warning count.
- code\_warning.accepted (new) with note.
- sheet.updated (new) on Add to E2.0.
- lock.acquired, lock.requested, lock.released (reason: stop\_editing, closed, request\_accepted), lock.auto\_released, lock.request\_declined (new), lock.conflict (new) on reconnect after an offline auto release.
- model.saved on save (unnumbered working version; a version number is assigned only on send).

**Decisions:**

1. Check is a button on the left tool rail on every editor tab and runs on demand. The pill shows the last result. (Round 24)
2. Device height notes are optional per device and off by default. (Round 24)
3. The 5-minute auto release does not pause while the holder is offline. On reconnect the former holder gets a conflict notification listing clashes to resolve. (Round 24)
4. After release the lock is free for anyone. The first user to press Start editing gets it. (Round 24)
5. After Keep editing, the requester is notified and can request again at once. Each request restarts the 5-minute timer. (Claude)
6. Running Check needs the Run code check permission. (Round 24)
7. The load warning threshold is a company setting under Defaults: amber at or above it, red above 100% of service. (Round 24 + Claude)
8. Voltage drop warns above a threshold set in company settings. (Round 24)
9. The Devices tab lists devices grouped by room. The Panel tab shows a compact two-column panel schedule. (Claude)
10. The optional method is a toggle in the load calc header, next to a case select. Existing panel inputs open in a dialog from an "Existing panel" button. (Round 24 + Claude)
11. The optional method toggle is available for every case. (Claude)
12. The holder releases with a Stop editing button in the header or by closing the project. Both save first. (Round 24)
13. The lock covers every change to model, sheets, options and markup on all tabs. Viewing, commenting and running renders do not need it. (Round 24)
