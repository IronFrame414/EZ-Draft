# Phase 6 · for Josh (questions 6, 2026-11-11)

Agents settled every phase 6 question (phase-auditor and orchestrator, with sources). Nothing waits on you except the S15i System status board you chose to have drawn (Q-0665 (b), brief in vault/questions/design-brief-2026-11-11.md): EZD-135b and EZD-237 wait for it.

## 1. Decisions needed (answer by number)

None. Answered by you 2026-11-11: Q-0665 (board drawn first), Q-0666 (Floor select at the left of the status bar), Q-0682 (click two walls, then the arc; Linear / Angular switch).

## 2. Agent answers to confirm (confirm or override)

- **Q-0669 · EZD-214.** One set of rooms for both views in v1, each shown by its own status. Per-view rooms come later, before the sheet slices. Source: rooms/sync.ts; Q-0570; 09h.
- **Q-0672 · EZD-135.** The restore drill card shows the latest finished drill, passed or failed, with a red "Failed" mark. Backups stay "latest succeeded". Source: Q-0664; 11 Data retention.
- **Q-0673 · EZD-218.** The Versions tab stays hidden until EZD-122 ships, so phase 6 has two tabs, Layers and Rooms. AC-EZD-218-1 was amended to match. Source: Q-0500; PHASES slice 6.
- **Q-0674 · EZD-218/216.** Overlay rows (Electrical, Ceiling, Architect DXF, Dimensions) appear only when their kind ships; no dead eyes. Source: Q-0500; Q-0568.
- **Q-0681 · EZD-224.** Thumbnails: EZD-224 builds the pipeline and a dev hook only. Stop editing (EZD-125, slice 8) makes the checkpoint, so your slice 6 test step 6 moved there (PHASES edited). Source: 03a; PHASES slice 8.
- **Q-0684 · EZD-216.** A selected note or dimension gets an inspector panel (Text, Size, Measured value, Override) built from the standard parts, with no new board. Source: S03; Q-0664 "no new board".
- **Q-0685 / Q-0686 · EZD-216.** Auto dimensions cannot be deleted (they move and hide with the Dimensions eye). Old rooms get theirs on the next wall edit on that floor. A dimension on a deleted wall is deleted with it. Source: S03; 03b rule 5.
- **Q-0687 · EZD-216.** Notes may have several lines, up to 500 characters, with Spanish letters and ° added to the drawing font. Source: 09m; S16; PHASES slice 48.
- **Q-0688 · EZD-237.** The benchmark also stores touch points, so an iPad (33 ms budget) is told from a desktop (16 ms). Source: 11 Budgets; 09m.
- **Q-0689 · EZD-237.** The cold-open time stays out of the benchmark page for now. Source: Q-0587.
- **Q-0690 · EZD-6001.** The open floor is not remembered; each open starts on the lowest floor. Source: Q-0664; Q-0508.
- **Q-0670 / Q-0680 · EZD-214, EZD-219.** View and Scale: offline, the choice is held and sent when back online (newest wins; a planner note: held only while the tab stays open, a reload offline drops it). A failed online save shows "Changes not saved" with Retry. Source: S03 States.
- Look and behavior answers (no new board, shown at the field check): Q-0668 wall drawn whole where its opening is hidden; Q-0671/0678 hidden or locked objects leave selection, hidden ones are not snapped to; Q-0675 lock icon `lock_open` grey / `lock` ink; Q-0676 room selection is an outline, no fill; Q-0677 a drag inside a room still draws a box; Q-0679 a lone selected room shows its name and one line pointing to the Rooms tab; Q-0683 notes typed in place on the canvas, leader by press-drag.

## 3. Proposed wording

**EZD-135** (all under `office.system_status.`): Job failures / Webhook failures / Last off-site backup / Last restore drill; columns Failed, Job, Error, Tries, Last failed, Delivery, Event, Times; "No failed jobs in the last 30 days"; "No webhook failures"; "Files (nightly)" / "Database (weekly)"; "Not recorded yet"; "No restore drill recorded yet"; "Failed" (drill mark); "Couldn't load this section."; Previous / Next. Full 27-key list in the plan, section 6.

**EZD-216:** typed bar "Text / Texto"; inspector rows "Text / Texto", "Size / Tamaño", "Measured value / Valor medido", "Override / Texto propio" (Spanish for Override is a guess).

**EZD-218:** `office.inspector.room_in_rooms_tab`: "Edit this room's details in the Rooms tab."

**EZD-219:** Scale, Snap, Cursor, "—", "Plan scale", "Snap settings", Endpoints, Midpoints, "90/45°", "Wall faces", Increment, "Zoom {percent}%", "Zoom percent". Most are board text.

**EZD-224** (error text, not shown on screen): "That version isn't available." / "That plan image couldn't be saved." / "That plan image isn't available." with Spanish in the plan.

**EZD-237** (`office.benchmark.`): Benchmark; "Measures how smoothly the plan pans, zooms and drags a wall on this device."; Run benchmark; "Running the benchmark. Don't touch the screen until it finishes."; "No benchmark runs yet"; columns When / Device / App version / Pan / Zoom / Wall drag / Memory / Result; "p95 {p95} ms · max {max} ms"; "Within budget" / "Over budget"; plus four error lines (full list in the plan).

**EZD-6001:** Floor; Floor {n}; Add floor; Rename floor; Floor name; Delete floor; "A project needs at least one floor."; "Delete {name}?"; "The {count} object(s) on this floor will be deleted with it."; Delete floor.

**EZD-214:** no new wording.
