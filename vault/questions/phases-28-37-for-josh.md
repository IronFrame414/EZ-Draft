# Phases 28 to 37: questions for Josh

Written 2026-11-18 when phases 28 to 37 were prepared for the build loop:
- 28: Revisions and outputs: revision clouds and the revision log, sending a set to the client, the countertop sheets in the client set, one PDF per sheet, the department profile checks at export, the Scope PDF, the responsibility tick box, and the plumbing, mechanical and tile sheets
- 29: The detail editor: details, the drawing tools, line weights and hatches, notes and dimensions, parts, scale and NTS, steps and layers, the detail libraries in Settings
- 30: Details on sheets: leader warnings, placing a detail on a sheet, cutting a section from the plan, tracing over a photo or PDF, extruding to 3D, the company detail library and the countertop bracket link, the detail PDF, the freehand pen
- 31: The product catalog drawer: browse, search and filter, drag a product onto the plan, add a product from a link, pasted text or a screenshot, confirm the fields, save and place
- 32: Catalog item detail, Standard spec star, and per-project price snapshots with a price check
- 33: The 3D view: walls, openings, floors, ceilings, beams, cabinets, fixtures, devices, textures, orbit and view cube, section and display modes, 3D layers, saved views, iPad memory guard
- 34: Walk and look up, picking objects and applying finishes in 3D, the rail and status bar on the 3D tab, measure in 3D, the small 3D preview in the plan inspector
- 35: Design options A/B/C (with internal costs), making options from the ceiling plan, the phone 3D viewer, 3D model export (GLB and USDZ), AR on iPhone and iPad, IFC export
- 36: AI renders, setup: render records, Render models settings, the AI provider hookup, picking the angle or a site photo, lining up the photo with the model, style and direction, quality tiers and Generate, the renders list and notifications
- 37: AI renders, review: the render view, comment pins, fix and regenerate, two-step approval, "model changed" detection, download, the render allowance, renders in the Scope PDF

Everything else in these phases was settled from the spec, your decisions and the drawings. Those choices are listed in `vault/build/assumptions.md` (about 345 rows, tagged with each ticket) for you to look over whenever you like. They include a lot of proposed screen wording, marked "Wording for Josh to confirm".

Seven things needed you; all seven are answered (2026-11-18, Q-0771 to Q-0777). Only question 7 holds anything, and only one ticket (AR editing). Every other piece of phases 28 to 37 builds without waiting; you check the results at each phase check.

---

## 1. Screens with no drawing in phases 28 to 37: OK to build them from the written spec?

**What it is:** your approved drawings cover the main screen of each area (Sheets, Detail editor, Catalog, 3D, Render, Render view, Render models). Many smaller pieces are described in the spec but have no drawing. For example:
- Sheets: the responsibility tick box before Issue and each PDF export, the Scope PDF window and page, the list of files after "One page at a time", the issue log under an issued revision, the "Plan scale" and "File size" warnings, and the new sheets P1.0, P2.0, M1.0, M2.0, A7.0 Tile layout, A8.0 Countertop plan and A9.0 Edge details
- Details: the New detail window, the Layers and Library tabs, the shape tools, the print preview, the extrude box and small 3D viewer, tracing over a photo, drawing a section line on the plan, the Details, Hatches and Parts tabs in Settings, and the six hatch looks not on the drawing (plywood, MDF, concrete, insulation, tile, grout)
- Catalog: Paste text and Screenshot, the extra field rows (SKU, sell price, markup, supplier, rough-in, cutout, volts, amps), the item detail with Delete, the price check list, and the empty and offline states
- 3D: the right-click menu, the finish picker, the saved-view menu, the section Flip control, the iPad joystick, the "low memory" warning, the phone saved-views sheet, the Export menu entries for the 3D model and IFC, the "View in AR" button
- Renders: the model angle picker, lining up a photo with the model, tap-a-surface, the paint mask, the image count, the failed row with Retry, Reject, Hide from client, the "Model changed" banner, Compare to previous, and resolving comments

**Why you're being asked:** your yes for phases 18 to 27 (Q-0769) named only those phases' screens.

**What waits on it:** nothing. Each piece is built in the style of the nearest approved drawing, and you review it at the phase check. A change becomes a small fix ticket.

**My recommendation: (a).**

- (a) Build them from the spec in the style of the nearest approved drawing, with no new drawings (recommended)
- (b) Make drawings first for the ones you name; only those tickets wait


**Josh's answer (2026-11-18): (a), "yes".** Recorded as Q-0771.

---

## 2. Code warnings you accepted: do they print on the set the department gets?

**What it is:** when the code check flags something you've decided is fine (say, a voltage drop a little over your limit), you accept it with a note. The spec says those notes go "in the issue log". If that log printed on the permit sheets, the plan reviewer would see each accepted warning and your note.

**Why you're being asked:** what the building department sees is your call.

**What waits on it:** nothing. EZD-725 keeps the log with each issued revision and shows it on the Sheets screen. If you pick (b), printing it becomes a small follow-on ticket.

**My recommendation: (a).** The department checks the drawings, not your office notes, and a printed list of accepted warnings invites questions.

- (a) Keep the issue log inside EZ Draft, under each issued revision, never on the sheets (recommended)
- (b) Also print it on the cover sheet (A0.0)


**Josh's answer (2026-11-18): (a).** Recorded as Q-0772. The issue log never prints on the sheets.

---

## 3. Company detail library: start empty, or with a starter set?

**What it is:** the Settings spec lists a starter set of construction details: shower pan, curb and niche, tile transitions and thresholds, cabinet and countertop sections, wall types. No ticket draws them, and they would print on your permit sets.

**Why you're being asked:** what goes on your permit drawings is your call, and I won't invent construction details.

**What waits on it:** nothing with (a). With (b) or (c), a new ticket is added after phase 30.

**My recommendation: (a).** You save your own details as you draw them on jobs, so the library fills with details you've already used.

- (a) Start empty (recommended)
- (b) An agent draws a starter set from the code book and your past permit sets, and you approve each one at the phase check
- (c) You send the details you want drawn


**Josh's answer (2026-11-18): (a).** Recorded as Q-0773. The detail library starts empty.

---

## 4. Sub-categories under each catalog group (the filter chips)

**What it is:** the catalog drawing shows Sinks, Faucets and Disposals under Plumbing fixtures. The other groups need their own chips. For the groups that become things on the plan, I used the kinds EZ Draft already draws, so a dragged item becomes the right object:
- Cabinets: Base, Drawer base, Sink base, Wall, Tall, Vanity, Blind corner, Appliance panel, Filler, Panel, Corner, Open shelf
- Plumbing fixtures: Sinks, Faucets, Disposals, Toilets, Lavatories, Tubs, Showers, Water heaters
- Appliances: Ranges, Cooktops, Hoods, Refrigerators, Dishwashers, Washers, Dryers
- Windows and doors: Doors, Windows

For Countertops, Tile, Lighting, Hardware, Paint and Trim and beams, you type the sub-category on the item, and the chips show what's been typed.

**Why you're being asked:** everyone sees these lists.

**What waits on it:** nothing. EZD-1601 builds (a); a change is a quick edit.

**My recommendation: (a).**

- (a) As above (recommended)
- (b) Send your own lists


**Josh's answer (2026-11-18): (a).** Recorded as Q-0774.

---

## 5. Names in the 3D layer list

**What it is:** the 3D drawing lists layers called "Furniture" and "Lighting". EZ Draft has no furniture; the closest things are fixtures and appliances. The lighting row also covers outlets and switches.

**Why you're being asked:** the names are words you'll see.

**What waits on it:** nothing. EZD-1005 builds (a); a change is a quick edit.

**My recommendation: (a).**

- (a) "Fixtures + appliances" and "Lighting + devices" (recommended)
- (b) Keep the drawing's "Furniture" and "Lighting"


**Josh's answer (2026-11-18): (a).** Recorded as Q-0775.

---

## 6. Two-story houses in 3D

**What it is:** the plan shows one floor at a time. Floors have no stored height above each other, so the 3D view can show only the floor you're on.

**Why you're being asked:** seeing the whole house stacked is a product choice, and it needs a floor-to-floor height you would type in for each floor.

**What waits on it:** nothing. EZD-1001a builds (a). With (b), stacking becomes a later ticket.

**My recommendation: (a)** for v1. Remodels are mostly one floor at a time.

- (a) 3D shows the floor you're on (recommended)
- (b) Stack every floor, with a floor-to-floor height you type in for each floor (a later ticket)


**Josh's answer (2026-11-18): (b).** Recorded as Q-0776. New ticket EZD-1022 (phase 34) adds a floor-to-floor height per floor and stacks every floor in 3D.

---

## 7. AR editing on iPhone and iPad: what if Safari can't do it?

**What it is:** you put AR in v1 (Q-0220): viewing the model in the room at true scale, and editing in AR (for example, sliding a cabinet). Apple's built-in AR viewer (Quick Look) shows a model at true scale but can't move anything or send changes back. Moving objects in AR from a web page may not be possible in Safari at all. A short research ticket (EZD-1018) checks this first.

**Why you're being asked:** if the research says editing can't be done in a web page, the choice is between dropping it to v2 (with the native app, already v2) and keeping a partial version.

**What waits on it:** only AR editing (EZD-1020). AR viewing (EZD-1019) builds either way.

**My recommendation: (a).** Viewing in AR plus "move it in 3D, then look again in AR" covers the job-site use, and a real AR editor needs the native app.

- (a) If the research says no, AR editing moves to v2 with the native app; if it says yes, it builds as planned (recommended)
- (b) Keep AR editing in v1 with whatever partial route the research finds


**Josh's answer (2026-11-18): (a).** Recorded as Q-0777. EZD-1020 stays held until the EZD-1018 research note is read: go → it builds; no-go → it moves to v2.

---

## For your information (no answer needed)

- **Manual J still holds the mechanical calculations.** The plumbing, mechanical and tile sheets (EZD-738) no longer wait on Manual J. The mechanical sheet M2.0 prints the equipment schedule now, and the calculations block is added when your Manual J answer releases EZD-732.
- **Not in any ticket yet:** cutting a detail from an elevation (the plan cut is built); a screen that lists a project's history (the history is recorded, but there is no page to read it); render credits for paying companies (Q-0372, which never applies to Worth Properties). Each is noted for a later ticket.
- **Two library questions you asked to see again** (Q-0406: dxf-viewer for hatches, drei for 3D controls) were settled without adding either library, under your rule that only design and screen questions come to you.
