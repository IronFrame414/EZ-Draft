# Phase 3 spec gaps for Josh · Model store and editor route

Stage 0 (spec-check 3), 2026-11-02. Phase 3 is the re-cut phase (vault/tickets/PHASES.md, Q-0218): EZD-133, 120a, 120b, 202, 238. Not the old imports file `vault/tickets/phases/phase-03.md`, which is spec phase 3 and is now phases 12 and 13. Phase-auditor run 1 (Opus 5.5; Fable 5.1 was out of credits) found 24 gaps against `vault/spec/READINESS.md`: 7 questions below need Josh; the rest are settled by an agent with a citation (end of file). User-visible wording not on a mockup is proposed by the planner and approved at Stage 2 (vault/PROCESS.md 3a), so it is not asked here.

## For Josh

**1. What the editor shows in phase 3 (gaps 2, 3, 17).** Phase 3 builds the save machinery; the grid, walls and tools come in phase 4. S03 says a blank project shows "grid only with a hint", which cannot be built yet. Q-0394 kept project cards unclickable in phase 2 because the page would change.
- Recommended: project cards and Create now open the editor. It shows the header (project name, client, "Working copy", save state) and an empty drawing area with no hint until phase 4. Tabs (3D, Sheets, Render), side panels (Layers, Rooms, Versions, Tasks) and status-bar items appear only when the phase that builds them ships (same rule as Q-0394 and Q-0398; Q-0226 went the other way for Settings pages only). Someone who can only view sees the same header without the save state.
- Alternative: cards stay unclickable until phase 4; phase 3 is checked through a test page only.

**2. Offline in phase 3 (gap 1).** The saving design keeps every edit on the device first and sends it when it can, so going offline already works by design (Architecture rule 9: "offline is only a long drain"). The full offline mode (opening the app with no connection, field pack) is phase 14 and later.
- Recommended: phase 3 shows the offline banner (wording already approved, Q-0214: "Offline. Changes are saved on this device and will sync.") and edits keep queuing and send on reconnect.
- Alternative: no banner until phase 14; edits still queue silently.

**3. A change the server refuses (gap 8).** Edits are sent in order. If the server refuses one for good (someone else changed the same wall in another tab, the project was deleted, access was removed), every edit after it waits behind it and nothing more saves. Keep mine / Keep theirs is planned for phase 44; the edit lock that prevents two editors is phase 8.
- Recommended: build a simple Keep mine / Keep theirs in phase 3, so a refused change is shown and you pick; nothing is lost and later edits keep saving. Cost: about one more ticket in phase 3.
- Alternative: set the refused change aside on the device with a banner, keep saving the rest, and resolve it when phase 44 builds Keep mine / Keep theirs (nothing lost, but you cannot act on it until then).
- Not recommended: a "reload from server" button, which throws the stuck edits away.

**4. Signing out with edits not yet saved (gap 9).** Unsaved edits are tied to the person and the company and are never sent under someone else's sign-in (Architecture rules 1 and 18; not a choice). The sign-out warning is planned for phase 14.
- Recommended: from phase 3, Sign out first tries to save; if it cannot (offline), it warns and asks before signing out; the edits stay on that device for that person and send when they sign back in.
- Alternative: sign out without a warning; the edits still wait for that person.

**5. One floor or several (gap 14).** The data design gives every object a `level`, but nothing says whether a project can have more than one floor (a two-story whole-home job). The design is frozen in phase 3 (EZD-202), so this is cheap now and costly later.
- Recommended: the data carries a floor on every object from day one, with one floor in the app for v1; a second floor is a later request (BACKLOG) that needs no data rework.
- Alternative: several floors in v1 (adds a floor switcher and floor-aware sheets in a later phase).

**6. Your test script (gap 24).** Steps 2 and 4 need a way to fire 50 edits and force a failed save; steps 1 and 5 ask you to read the browser's network panel.
- Recommended: a test page on the develop preview only (it never exists in production) with buttons for "50 edits" and "fail next save", showing the result on the page. Steps 1 and 5 are covered by the automated tests, so your step 1 becomes "click a card, the editor opens with Saved", and step 5 is dropped.
- Alternative: keep the script as written.

**7. Screen boards for the new states (gap 7).** S03 has a board for the normal editor only; the error banner, offline banner, loading and no-access states have none. In phase 2 you chose to draw boards first (Q-0391).
- Recommended: no new boards; these are one-line banners and messages built from the approved wording (Q-0214, Q-0086, Q-0273) and the shared state components.
- Alternative: draw the boards first (phase 3 waits for them).

## Settled by an agent (say if you object)

- Gap 4: save-state timing is a build choice (precedent Q-0425); the planner proposes thresholds (just now under 1 minute, N min up to 59, then a clock time) and wording goes to Stage 2 (3a).
- Gap 5: retry count before the error banner is a build choice (Q-0425 precedent); offline shows the offline banner, not the error banner (Q-0214).
- Gap 6: load failure, not found and no access use Q-0214, Q-0273 and Q-0086 wording; loading uses the shared Skeleton/AsyncView (docs/architecture.md State components).
- Gap 10: the outbox drains whenever the app is open, not only in the editor (03b rule 9).
- Gap 11: `model.saved` is emitted by the save route once per successful save (S03 Events; EZD-120a).
- Gap 12: the 1/64 inch tolerance gets worked examples (zero, exactly 1/64", just over) from the calc-auditor in a new spec section.
- Gap 13: the wall reference line and opening/room geometry are a schema choice (R4), reviewed by the code-reviewer before phase 4.
- Gap 15: attribute shapes now; pick-list values later through migrate.
- Gap 16: deleted objects stay as markers in the working copy and are left out of checkpoints; the mutable model_version columns are recorded (03b rules 7 and 8).
- Gap 18: Foreman and Crew do not see company costs by default (Q-0235 overrides the ticket text); can() and the RLS audit already exist (app/src/server/permissions/can.ts, app/test-harness/rls/audit.ts), so EZD-133 is the lint rule plus the money-field test.
- Gap 19: money fields per R1/R2 and Architecture rule 2; the test finds them by column name list kept with the schema.
- Gap 20: dimension text uses DM Mono (04 Type: "DM Mono for every measurement"); text sizes come with the sheets phase as view-setting inputs; the line-weight roles are in 09h.
- Gap 21: EZD-238 receives dimension text already formatted (the length formatter is EZD-201, phase 4).
- Gap 22: real acceptance criteria are written for all five tickets after the answers (acs_source stage-0).
- Gap 23: glossary addendum `vault/spec/sections/00d-glossary-phase-03.md` (precedent Q-0231, Q-0403).

## Answers (Josh, 2026-11-02, in chat)

5 Q-0504: "build ability for multiple floors now." (several floors per project in v1; the EZD-202 schema holds floors from phase 3). The rest: "the rest are accepted": 1 Q-0500, 2 Q-0501, 3 Q-0502 (new ticket EZD-299 "Conflict list: Keep mine / Keep theirs" in phase 3), 4 Q-0503, 6 Q-0505, 7 Q-0506. Agent-settled list: Q-0507 (tolerance examples in `vault/spec/sections/03g-tolerance-and-rounding.md`, calc-auditor; glossary `vault/spec/sections/00d-glossary-phase-03.md`). Recorded as decision rows (new file `vault/spec/decisions/03-data-model.md`); ACs written (acs_source stage-0); PHASES.md slice 3 updated.

## Round 2 (re-audit after the answers): 12 gaps, 3 for Josh

**1. Floors: which phase builds the floor tools (gap 1; Q-0504).** Phase 3 stores floors (every project starts with one floor). Adding, renaming and deleting floors, the floor switcher in the editor and a floor on each plan view and sheet need the canvas and sheets.
- Recommended: phase 6 (with the phase switch and layers) adds the floor switcher and add, rename and delete floor; the sheets phases (25 and 26) give each plan sheet its floor. Deleting a floor that still has objects asks first and deletes them with it.
- Alternative: phase 4, with the first canvas (phase 4 grows from 8 tickets).

**2. A board for the conflict list (gap 3).** Q-0506 waived boards only for one-line messages; the conflict list (EZD-299) is a real screen part.
- Recommended: draw a board first (as in phase 2, Q-0391); phase 3's EZD-299 waits for it, the other tickets do not.
- Alternative: build it from the text, no board.

**3. How the conflict list works (gap 4).**
- (a) Where it shows. Recommended: a notification (bell and email, per each person's settings) names the project and the objects (Architecture rule 9), and a banner in that project's editor opens the list; both open the same list.
- (b) How a row names an object. Recommended: its type and number in the project ("Wall 4", "Door 2"), plus what changed; once the canvas exists (phase 4) a Show button zooms to it.
- (c) Keep mine when the other person deleted the object brings it back; Keep mine when my change was a delete deletes theirs.
- (d) Keep mine that is refused again goes back on the list; Keep mine while offline waits in the queue like any edit.
- (e) Other refusals. Edit model taken away while the project stays visible: the row says so and offers only removing it (like a project that is gone). A change from an older app version: the app asks to reload, then sends it again (Architecture rule 12). A change the app itself built wrong (fails the data check): reported automatically as an error, kept on the list with only Remove.
- Alternative: say which part you want different.

Agent-settled (Q-0508): floor record (project floors with id, name and order; one floor made at Create; floors edited by anyone with Edit model; the drawing list's view settings name one floor; schema choice reviewed by the code-reviewer, gap 2); test page gets a "make a conflict" button and shows rows written and checkpoints made, step 5 uses it (gap 5, Q-0505 precedent); phase numbers in Q-0501 to Q-0503 checked against the re-cut table (EZD-134 phase 14, EZD-1403 phase 44): no change (gap 6); EZD-134 and EZD-1403 carry Q-0502 and Q-0503 in their decisions lists (gap 7); slice 3 entry updated (gap 8); EZD-202 reads Q-0504 (gap 9); ACs added for undo, changed ids, the device copy, arcs, fills, hatches and layers (gap 10); glossary separates Floor from a room's floor level (gap 11); Q-0507 gets a decision row (gap 12).

Answer (Josh, 2026-11-02, chat): "accept all. make sure #2 is drawn tomorrow in cowork". Recorded as Q-0509 (floor tools in phase 6, sheets 25 and 26), Q-0510 (board S03b drawn 2026-11-03 in Cowork, brief `vault/handoff/board-S03b-conflict-list.md`; EZD-299 blocked until approved), Q-0511 (conflict list workflow). Agent-settled round 2: Q-0507 and Q-0508 decision rows (`vault/spec/decisions/03-data-model.md`).

Renumbered 2026-11-03: the launcher refused the first queue because a build unit took Q-0486 first; this spec-check's questions are Q-0500 to Q-0511 (old Q-0486 to Q-0497, same order). Q-0487 to Q-0499 stay unused.

Ticket renamed 2026-11-03: a questions 1 unit took EZD-294 for a phase 1 fix ticket at the same time; the conflict-list ticket is EZD-299.

Note: commit 39703d3d's title still says EZD-294 and Q-0486 to Q-0497 (written before the renames); its content uses Q-0500 to Q-0511 and EZD-299.

## Round 3: 8 gaps, 1 for Josh

**1. Where the conflict list lives (gap 6).** Q-0502 keeps the list on the device that made the edits, but the notification email (Q-0511 a) links to "the same list". On another device, or after the browser's data is cleared, that list would be empty.
- Recommended: refused changes are also kept on the server for that person, so the list opens from any device and survives a cleared browser; one notification per project per sync, listing every object (a Keep mine refused again joins the next one). Cost: a little server storage and one more route in EZD-299.
- Alternative: device only; another device shows a short message saying the changes are on the device that made them.

Agent-settled (Q-0520): PHASES.md table row 3 says 299, not 294 (gap 1); EZD-299 depends on EZD-110b and EZD-140 (bell list, per-person settings) and reads 04 Notifications, Q-0393, Q-0220 and board S01c (gap 2); EZD-299 sends the app version on save requests and handles the older-version refusal, EZD-134 keeps it for all other requests and the after-drain prompt (gap 3; Q-0511 e, Q-0503 precedent); EZD-120b and EZD-120a depend on EZD-118 (Create) (gap 4); EZD-120a owns the floor list's storage and makes the first floor when a project's working copy is created, EZD-202 checks every object's floor against it (gap 5); AC-EZD-299-10 leaves the Show button out until phase 4 (gap 7, Q-0500); the board's notification row proposes new wording naming the project and objects, for online conflicts too, and EZD-299 extends the `sync_conflict` kind (gap 8, Q-0510, PROCESS.md 3a).
