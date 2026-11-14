# Phase 4 · for Josh (questions unit, rerun 2026-11-10, eighth pass)

Nothing waits on you for phase 4. Agents settled everything else (section 2).

## 1. Decisions needed

None. Your four design answers of 2026-11-05 (Q-0588 to Q-0591, all (a)) are recorded in `vault/spec/decisions/05-screens.md` and the plans EZD-210 and EZD-221 follow them.

## 2. Agent answers to confirm

Confirm or override each.
- **Q-0582 · EZD-201.** A fraction with no whole number (`3/4"`, `12' 1/2"`) is accepted as inches (0.75, 144.5). Source: phase-auditor; Q-0561; 09j rows 7, 17, 20.
- **Q-0583 · EZD-203.** A move that would pull a wall's end off the middle of the wall it meets (or rotate a stretched wall so a partition end falls off it) is refused. Source: phase-auditor; 09e line 7; Q-0570.
- **Q-0584 · EZD-206.** With both 90/45° and the 1/2" increment on, the angle fixes the direction and the length along it rounds to 1/2". Source: phase-auditor; Q-0569 (a); Q-0570.
- **Q-0585 · EZD-206.** The first click of a chain rounds x and y each to the nearest 1/2" when the increment is on. Source: phase-auditor; Q-0570; 09j row 2.
- **Q-0598 · EZD-203.** A wall crossing another wall (neither end on the other) counts as a join (kind cross); a move keeps it or is refused, as for tee joins. Built in EZD-203 already; EZD-205 plan corrected. Source: phase-auditor; Q-0570; Q-0583 (a).
- **Q-0587 · EZD-236.** The `open.cold` perf row stays pending for EZD-237 (a perf-check change is frozen build system). Source: rule 18; EZD-236 plan.
- **Q-0592 · EZD-221.** EZD-221 is re-validated after EZD-205a is planned, and gets a test that a template room survives room reconcile. Source: Q-0565; review-phase-04.md.
- **Q-0612 · EZD-205a.** A wall or box of walls inside a room that does not divide it: the room outline goes around it (its footprint is not floor area; a free-standing one is a hole; a closed box is also its own room). Source: phase-auditor; Q-0559; Q-0569 (b); Q-0570; 09j Room area rows 7, 9, 10.
- **Q-0613 · EZD-205a.** When a partition splits a room, the larger part keeps the id and name and the other is a new room; on a merge the larger stored room keeps its name. New rooms are numbered one more than the highest `Room N`, never reused. No source names which part keeps the name (reversible with the EZD-218 rename). Source: phase-auditor; Q-0570; Q-0592 (a); Q-0568.
- **Q-0621 · EZD-359.** The pan long-task gate counts a task only when its CPU time × the profile's throttle rate is over 50 ms (or unknown); tasks the Mac's other lanes merely stretched are listed in `details.waits`. Budget 0, the 50 ms line and the 4× iPad throttle stay. Cost: a block that burns no CPU (sync request, alert) would be listed, not counted; none is on the pan path today. Source: phase-auditor; Q-0073 (a); Q-0619; spec 11. Confirm or override.
- **Q-0629 · EZD-294.** The server numbers every new wall and opening that arrives without a number or with one the project already used (insert trigger plus one index); the save answer carries the stored number back to the device. Closes the Keep mine, two-people-editing and old-app-deploy duplicates. Cost: the 3,000-object benchmark save does 3,000 index lookups (67 ms measured) and benchmark objects become numbered. Source: phase-auditor; 03b rules 6, 9; Q-0511; Q-0531; Q-0568; Q-0625 (a); rule 18. Confirm or override.
- **Q-0691 · EZD-367.** A member without Edit model keeps Select on their rail (no Wall or Room rectangle); "no tool rail" in AC-EZD-367-1 reads "no drawing tools", so the stale EZD-221b B6 test line is edited, not the app. Source: orchestrator; Q-0630 row 9 (05-screens.md:60). Confirm or override.
- **Q-0694 · EZD-376.** The "text could not be drawn" message is a red banner over the plan in the same spot and style as "Changes not saved", with no Retry button (the text atlas is made once; the wording says to reload). Source: orchestrator; Q-0506 (no new boards for editor error banners); S03 States. Confirm or override.
- Earlier phase 4 spec-gap answers (Q-0570 and its neighbours) stand; confirm or override on the phase 4 spec-gap file.

## 3. Proposed wording

- **EZD-201:** none new; `Use 12'6", 12' 6 1/2", 150" or 12.5'` is S01 Validation's approved text.
- **EZD-203, EZD-206, EZD-236:** none new (EZD-236: "Benchmark project", "Generated for speed tests", Floor 1 …, Room 1 …).
- **EZD-210:** (snap marker has no text, your Q-0589 (a)) expected, not yet written: Width and Depth labels, absorb refusal texts, the gap pill (`5/8" gap`) and the rail labels; see its plan.
- **EZD-221:**
  - Empty tile size line: "No walls"
  - Area when Width or Length is refused or blank: "—"
  - Template block failed to load: "The templates couldn't load. Try again."
  - Create will, Empty selected: "Open an empty Plan editor"
  - Empty plan hint (Edit model only): "Draw walls with Wall (W) or Room rectangle (R)." (your Q-0591 (a))

- **EZD-376:** Banner when the plan cannot draw room names and measurements: "Couldn't show the room names and measurements on the plan. Reload the page to try again."
- **EZD-359, EZD-372, EZD-373, EZD-374, EZD-375:** none (no user-visible text).

## 4. Plan changes you should know

- The plan review (review-phase-04.md) failed. Since then: EZD-203 and EZD-236 were re-planned, EZD-221 has its two-part split, and the EZD-207 and EZD-205 split proposals gained the seams and test edits the review asked for (2026-11-05). EZD-236, EZD-209 and EZD-221 are ready; EZD-210 is planned (split proposal; Q-0588 to Q-0591 answered).
- Still open for the plan units: `depends_on` rows in the ticket list (EZD-236 needs EZD-203, EZD-205a, EZD-117b), and AC-EZD-207-3's pick-mode clause, which EZD-210 builds but EZD-207 part b still claims.
- 2026-11-06: Q-0608 (EZD-352, exit code of a `send_failed` run) was a build-system question, settled by the orchestrator: exit 1, rerun after a failed send (not listed in section 2). EZD-349, EZD-350, EZD-351, EZD-352 and EZD-353 (phase 2 debt fixes) are ready. EZD-205, EZD-207 and EZD-210 stay planned: split proposals that still need their plan units.
- Lessons: L-057 to L-061 and L-064 (plans name each fixture's source file and each browser test's project and run command) were ratified by the orchestrator (information only: plans end with a done-when list; contracts list every return and failure entry; failure paths state an outcome; migrations follow develop's newest and new controls get tap-area tests; inputs reaching SQL, files or patterns state their bound).
- Third pass (2026-11-06): no open questions. EZD-357 (gap box at exactly 12 inches) and EZD-358 (EZD-207c E3 test waits for first draw) are defect fixes with no new wording; both set ready.
- Fourth pass (2026-11-07): Q-0629 settled by phase-auditor (section 2). EZD-294 re-planned (17 build files, above the split guide; noted in its section 9) and set ready. EZD-299 and EZD-299b unchanged.
- Fifth pass (2026-11-09): no open questions. EZD-363 (disabled tool button hover rule, defect from the phase 4 full gate; no new wording) passes the plan lint and is set ready. EZD-221b stays blocked (needs a session with network for the icon fetch; see the handoff).
- Seventh pass (2026-11-10): Q-0694 settled by the orchestrator (section 2). EZD-373, EZD-374, EZD-375 and EZD-376 pass the plan lint and are set ready. EZD-372 stays blocked (build blocked on lane-gate flakes; see the handoff), so its status is not changed here.
- Eighth pass (2026-11-10): no open questions. EZD-379 (EZD-207b B2 hover test flakes under another lane's gate) and EZD-380 (EZD-133 W1 smoke test ECONNRESET under another lane's gate) pass the plan lint, no new wording; both set ready. EZD-372 stays blocked.
- Ninth pass (2026-11-11): Q-0737 (EZD-388, how the pan.test iPad long-task row counts under load) was a build-system test question, settled by the orchestrator at option (a) (not listed in section 2). EZD-388 passes the plan lint, contract and connections checks, no new wording; set ready.
- Tenth pass (2026-11-11): Q-0742 (EZD-390, CI log for the route-test race) and Q-0743 (EZD-392, what the N5 throttle test measures) were build-system test questions, settled by the orchestrator (not listed in section 2): the log was already on disk, and N5 measures main-thread CPU time from a Chrome trace. EZD-390, EZD-391 and EZD-392 (develop CI intermittents) pass the plan lint, contract and connections checks, no new wording; set ready.
- Eleventh pass (2026-11-12): no open phase 4 questions (Q-0744 is a phase 5 question on EZD-212b; Q-0740/Q-0741 and the Q-0709 to Q-0728 rows belong to phase 8). EZD-393 (EZD-356 T1 pan-row test finds a wait under load) passes the plan lint, contract and connections checks, no new wording; set ready. EZD-390 and EZD-391 stay blocked.
- Twelfth pass (2026-11-12): no open phase 4 questions. EZD-400 (six rail tests count 6 tools where an editor's rail now has the Assistant button as a 7th; test-only fix, no new wording) passes the plan lint, contract and connections checks; set ready.
