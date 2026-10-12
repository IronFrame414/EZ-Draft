## Workflows

A project moves Draft → Client review → Permit submitted → Approved → In build. Design loops with the client until approval; after the first permit set issues, every change is gathered into a numbered revision and can produce a change order.

**W1 · New project**

1. Projects → New project → choose: From an EZ Binder job, Standalone, or Start from a file.
2. From EZ Binder: pick the job; client, address and job number fill in. Standalone: pick a customer (or add one; the customer list syncs both ways with EZ Binder when connected), then type name, address, type.
3. Optional: paste the property appraiser link. The app reads parcel, owner, legal description, year built and living area for you to confirm. Year built before 1978 sets the lead flag. If the site blocks the read, paste the page text or a screenshot.
4. Pick the submittal profile (department) and code edition (defaults from settings).
5. Pick the input: Polycam scan, PDF, DXF, supplier kitchen PDF, field measure from the phone (17b; the Foreman gets the link), or blank with a template (galley kitchen, L-kitchen, 5×8 bath, primary bath).
6. The project opens on the Plan tab (or Import review if a file was chosen).

**W2 · Import**

1. Upload the file(s). Polycam: layered DXF + GLB mesh. PDF: set scale by clicking two points and typing the distance. DXF: kept as a full-fidelity reference first. Field measure: rooms sent from 17b arrive as high-confidence existing walls and rooms (source kind field\_measure).
2. Choose a review mode: one item at a time, accept all and fix low-confidence items, or room by room.
3. Detected walls, openings, rooms and cabinets show with confidence colors. Accept, fix or reject each. Nothing becomes model data until accepted.
4. Typed or laser values override scanned ones; each override lists the conflicts it creates.
5. Finish: accepted items become model objects with status Existing. The mesh stays as a toggleable 3D underlay; the reference stays under the model.

**W3 · Draw the existing conditions and the new design**

1. Status bar on Existing: draw or fix walls, openings, rooms, ceilings, existing devices, panel, appliances with utility points, plumbing, gas, HVAC, pins (damage, protect).
2. Switch to Proposed: mark demo items, add new walls, cabinets, countertops, fixtures, devices, ceiling items.
3. Rooms must close: if typed lengths leave a gap, pick the wall that absorbs it or override and keep the room out of square.
4. Bearing walls flagged: removing or opening one is blocked until an engineer note is attached.

**W4 · Cabinets**

1. Cabinet tool → pick a wall run → Auto-fill run places real boxes in 3" increments plus fillers at walls and appliances.
2. The run total shows against the wall length; a mismatch is flagged.
3. Swap any box; set face layout, hinges, finished ends, catalog item.
4. Elevations show actual door and drawer faces. The cabinet schedule (code, qty, finish, notes) feeds sheets, takeoff and the supplier order.

**W5 · Countertops**

1. Countertop tool → Trace cabinets creates pieces from the runs; or Draw outline.
2. Add seams and cutouts (sink, cooktop). Pieces are labeled A, B, C with size and area.
3. Click an edge → pick Flush 0, Standard 1 1/2", Bar 10", Seating 12", Wall + backsplash, or type a value. The inspector's four-side diagram edits all sides at once.
4. A seating overhang past the support limit adds brackets to a detail and shows a notice.
5. Pick the edge profile, or choose which profiles to offer the client with price per linear foot. Send the choice to the client (W10).

**W6 · Ceiling (RCP)**

1. Ceiling tool switches to the reflected ceiling plan.
2. Set ceiling type and heights per room (typed at points, by pitch, or read from the mesh).
3. Place beams (size, spacing or count, direction, follow slope or level at a set height), soffits, trays, coffers, crown.
4. Auto-layout cans by count, spacing or light-level target; draw switching zones and dimmers; the fixture schedule (A, B, C…) builds.
5. ACT rooms: set 2×2 or 2×4, direction, start point; borders balance to at least half tiles; troffers and diffusers snap into tiles.
6. Add diffusers, returns, exhaust fans, detectors, speakers, access panels. Lights placed here are the same objects as on the electrical plan.

**W7 · Electrical**

1. Enter the existing panel: service size, main breaker, label photo (AI reads brand, rating, spaces), existing circuit list (typed or from a directory photo), existing large appliances.
2. Place devices; click devices to assign circuits; homeruns and switch legs draw automatically.
3. Pick the load-calc case (circuits added, service upgrade, subpanel feeder, large add, like-for-like panel). The worksheet shows every line of math.
4. Press Check on the tool rail to run code warnings for the whole project. The optional load-calc method is a toggle; voltage drop is warned above the company threshold. Fix or accept each with a note.

**W8 · 3D and design options**

1. 3D tab: orbit, walk, look up, section. Save named camera views.
2. Create option groups (e.g. Beams: A Ridge only, B Three beams, C Coffered) with internal cost lines.
3. Send options to the client link (W10).

**W9 · Render**

1. Render tab → Step 1 Angle (required): a saved view, the current 3D camera, or a site photo (photo fixes the angle; aligning the model to the photo is optional and used only when exact placement matters).
2. Step 2 Style: tap a surface and pick a finish, type an instruction, paint a mask, or render what is in the model. Pick tier (Fast, Standard, Photoreal); cost shows in dollars against the company render allowance.
3. Step 3 Generate: one image per run unless asked for more. The result opens in the render view.
4. Compare with the previous render, mark an area to fix, rerun, or regenerate.
5. Approve, then Mark client-ready (two steps); only then does it appear on the share link. If an object or finish visible in it changes later, the render gets a Model changed badge; choose keep, mark outdated, or hide, per render.

**W10 · Client review and approval**

1. Share → create or renew the link (30-day expiry). The email goes out and a Copy link button gives the same link to text.
2. Client opens on phone: renders (before/after), selections box, comment pins, option choice, edge profile choice.
3. Client verifies by typing the email on their customer profile, selects items, types a printed name and signs with a finger; name, date and IP are logged. They may sign with some selections still open; Choose alone is not approval. The approval locks that model version and emits `selection.approved`.
4. Generate the branded selections PDF: approved render per room, product list with photos (no prices), signature page; optional allowance summary with prices.

**W11 · Sheets and issue**

1. Sheets tab: review the auto-built set; adjust viewports and scales.
2. Issue set → checklist must pass: code check reviewed, no red/orphan flags, title block complete. The key lists only symbols used.
3. Issue → one PDF per set (countertop plan and schedule excluded), named from address + description with the version kept in the name, bookmarks per sheet, stamp area blank; stamped permit sets are 24×36 and a one-page-at-a-time download is offered (Round 25). First issue is Rev 0 and locks.
4. Emits `plan_set.issued` to EZ Binder.

**W12 · Revisions and change orders**

1. Edits after Rev 0 are gathered. When the set is next sent to the client or department, they become Rev N with clouds and delta tags on changed objects, and the revision block and log update.
2. Create change order → draft with before/after images (each approved before inclusion), AI-drafted scope text (editable), quantity and cost delta, schedule impact (all typed by you). It can be sent together with the revision.
3. Send to EZ Binder (manual only) → `change_order.sent`. When EZ Binder marks the CO approved, the matching revision locks.

**W13 · Field use**

1. Crew taps the field pack tab in EZ Binder → opens already signed in, in their language. Back to EZ Binder returns to the same job.
2. Plan, 3D, Measure, Tasks, Photo tabs. Works offline after first load; PDF download.
3. Foreman checks off tasks, pins photos and notes, flags conflicts (notifies office) and sends field-verified measurements with separate buttons. The office is notified and approves measurements on the Field measurements review screen. A measurement changes the model only after someone with *Approve field measurements* accepts it. For room shapes the Foreman uses Field measure (17b); the office accepts the rooms in Import review.

**W14 · Translations**

1. AI translates tasks and notes to Spanish; each phrase enters the review queue as Unreviewed.
2. A reviewer with *Approve translations* approves, edits or rejects. Edits update every use; the cache reuses it across jobs.
3. Setting "Hold issue until translations are approved" is off by default and only holds set issue. Spanish users always see the Spanish text, reviewed or not. Reject opens the phrase for manual edit; editing a phrase approves it.

**W15 · Version cleanup**

1. Unsent working versions older than 30 days come up for cleanup. A cleanup sheet lists them, each with a preview image; tick the ones to keep (they become named snapshots).
2. Unticked versions are deleted; if the sheet is ignored, they delete after 7 more days. Named snapshots and every sent version are never offered.
