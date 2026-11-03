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
