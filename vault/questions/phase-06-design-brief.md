# Phase 6 · design session brief (boards for Q-0665 and Q-0666)

Paste everything below the line into a new Cowork design session. It draws two boards for Josh to approve. When he approves, his answers settle Q-0665 and Q-0666, and EZD-135, EZD-237 and EZD-6001 can be planned.

---

You are drawing two Studio boards for EZ Draft, a remodel CAD and permit-set web app for Worth Properties. Josh Bishop, a general contractor, approves them. Ask him only about design and what the screen looks like.

**Match the existing boards.** The approved boards are in `/Users/josh/Projects/ezdraft/vault/mockups/` (PNG 1600 × 1000, plus `html/project/<name>.dc.html` for exact sizes, colors, spacing and copy). Use the same Studio shell, components, type (Instrument Sans, DM Mono), Material Symbols Outlined icons and colors. Read before drawing:
- `S15Settings.dc.html` and `S15aCompany.dc.html`: the Settings shell, its left nav and card style.
- `S15hLibraries.dc.html`: another Settings page with lists.
- `S03Plan.dc.html`: the plan editor, its bottom status bar (View · Scale · Snap · Cursor · Zoom) and left panel.
- `S03dStates.dc.html` and `S03dTablet.dc.html`: how state boards and the tablet layout are laid out.
- `S03dSelectedObjects-wording.md`: the format for a wording file.

The design canvas is https://claude.ai/artifact/TTF8cGeHCB3tBEkAWAU6Ex (vault/mockups/INDEX.md). Add the new boards on its Studio page. Boards on the Polished, Refined and Layout C pages are superseded; don't use them.

**Wording.** Put every user-visible string on the board. List them in a wording file, one row per string with an ID (W1, W2, …), as in `S03dSelectedObjects-wording.md`. Use short plain words a contractor would use. Sample data on a board is not a decision. Mark it "sample".

## Board 1 · S15i Settings: System status (Q-0665)

Holds up EZD-135 (the page) and EZD-237 (Run benchmark on the same page).

- **Who sees it:** only users with the "System status" switch (the Owner by default). It is a Settings nav item named "System status", added to the S15 left nav.
- **What it shows,** four sections (spec 11 Operations; decision Q-0664):
  1. **Job failures:** failed background jobs in the last 30 days, newest first, 50 per page. Each row shows the kind (for example Export PDF, Import scan), the project, the error message, the attempts and when it failed.
  2. **Webhook failures:** failed outgoing webhook deliveries for this company: when, the target and the error.
  3. **Last off-site backup:** when the last nightly file copy and the last weekly database dump finished, their size and where they went. Show a warning look when the newest is older than its schedule (files nightly, database weekly).
  4. **Last restore drill:** when it ran and whether it passed.
- **Benchmark (EZD-237):**
  - A **Run benchmark** button opens the benchmark project and runs a scripted pan, zoom and wall drag.
  - Below it, a history list, newest first, 50 per page. Each run shows the date, device, app version, and the worst frame and average frame for pan, zoom and drag.
  - Mark a run that missed budget. The budget is a frame every 16 ms on desktop and 33 ms on iPad, and no frame over 100 ms.
  - Show a running state while the benchmark plays.
- **States to draw:**
  - filled (sample rows)
  - empty, as a fresh company with no failures, no backup yet and no drill yet: each section shows its own empty line, not an error
  - loading
  - error loading, with Retry
  - benchmark running
  - no permission is not needed, because the nav item is hidden
- **Desktop at 1600 × 1000**, plus one tablet view if the layout changes there.

## Board 2 · S03e Plan editor: floor switcher (Q-0666)

Holds up EZD-6001. Josh decided (Q-0509) that a project can have several floors, and phase 6 adds switching floors plus add, rename and delete floor. The canvas shows one floor at a time.

- **Placement options.** Draw the recommended one; add a small strip with the other two only if Josh wants to compare.
  - **(a) Recommended:** a "Floor" select at the left end of the bottom status bar, before View. It is a view setting like View, Scale and Snap, and the side panels are already full.
  - (b) At the top of the Layers tab in the left panel.
  - (c) A menu in the header under the project name.
- **The control open:** the list of floors in order, with the current one checked. Below the list: Add floor, Rename, Delete.
  - Add floor names the new floor "Floor N" and switches to it.
  - Rename edits the name in place.
  - Draw the delete confirm for a floor that still has objects. It says how many objects will be deleted with the floor, with Delete floor and Cancel.
  - An empty floor deletes without asking.
  - The last floor cannot be deleted: show that item disabled, with a short reason.
- **Permissions:** a view-only user can switch floors but does not see Add, Rename or Delete.
- **Tablet:** the same control must work by touch with no keyboard, with 44 px targets (decision Q-0630).
- **States to draw:**
  - closed
  - open
  - renaming
  - delete confirm
  - last-floor disabled
  - view-only (switch only)

## Optional (only if Josh asks)

Agents settled these without a board (Q-0664), and Josh may want to see them: the Snap popover (toggles for endpoints, midpoints, 90/45° and wall faces; increments 1/16" to 12"), the Scale popover (1/8" to 1" = 1'-0"), typed Zoom % (5% to 1600%), the lock icon beside each layer's eye, and the Rooms tab fields (room type, floor finish, ceiling type). Values are in `vault/spec/sections/09m-phase-switch-and-view-examples.md`.

## When Josh approves

Export each approved board to `vault/mockups/` with the same names as the others: `S15iSystemStatus.png` plus `html/project/S15iSystemStatus.dc.html`, and `S03eFloorSwitcher.png` plus `html/project/S03eFloorSwitcher.dc.html`. Put the wording files beside them (`S15iSystemStatus-wording.md`, `S03eFloorSwitcher-wording.md`). Add the rows to `vault/mockups/INDEX.md`, with a line saying they were approved by Josh on the date, citing Q-0665 and Q-0666.

Then tell the build session two things: (1) Josh's choice for Q-0666 (a, b or c); (2) that Q-0665 is answered by board S15i. The build session records both answers with `node scripts/ledger.mjs answer` and sets the tickets free. Don't edit anything else in the repo.
