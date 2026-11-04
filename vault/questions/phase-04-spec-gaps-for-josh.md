# Phase 4 spec gaps for Josh · Plan canvas and first walls

Stage 0 (spec-check 4), 2026-11-04. Phase 4 is the re-cut phase (vault/tickets/PHASES.md, Q-0218): EZD-201, 203, 205, 236, 207, 209, 210, 221. Not the old file `vault/tickets/phases/phase-04.md`, which is spec phase 4 and is now phases 15 and 16. Phase-auditor run 1 (Opus 5.5; Fable 5.1 was out of credits) found 34 gaps against `vault/spec/READINESS.md`. Under batched sign-offs (`vault/spec/decisions/process.md`, 2026-11-03) only business, product and wording questions go to Josh; the rest are settled at the end of this file with a citation. Wording not on a mockup is proposed by the planner and approved at Stage 2 (PROCESS.md 3a), so it is not asked here. Items 11 to 15 are Q-0474 (AI drawing assistant).

## For Josh

**1. Wall defaults (audit 1, 2).** S03 says thickness, layers and height come "from defaults", but S15d Defaults has no row for them, and a wall's status comes from the phase switch, which is phase 6.
- Recommended: one default wall until phase 8: 2x4 stud with 1/2" drywall both sides, 4 1/2" thick, 8' 0" high, no tile backer. Every wall drawn before the phase switch ships is Existing. Phase 8's Defaults gets rows for these values, entered by the owner. A second default for exterior block walls comes with those rows.
- Alternative: give different numbers, or a separate exterior block default from phase 4.

**2. What a typed length measures (audit 3).** The spec says dimensions are to finished face, but not which side of the wall. A 12' × 10' room is 120 SF only if measured inside.
- Recommended: what you draw and type is the inside finished face, and wall thickness goes outside the room. 12' × 10' is exactly 120 SF.
- Alternative: centerline of the wall (that room is then smaller than 120 SF).

**3. The Angle field (audit 16).**
- Recommended: Angle is the size of the turn from the last wall, so 90 is a square corner; the side the cursor is on picks left or right. With nothing typed, the wall goes where the cursor points.
- Alternative: angle measured from the page, 0 to 360, CAD style.

**4. Typing lengths and the laser (audit 14).** The four formats are written as examples only. A bare number has no rule, and a laser in keyboard mode sends digits then Enter (EZD-315).
- Recommended: a bare number is inches. Also accept 10', 6 1/2", 12'-6". Refuse 12 6. Josh gives his laser model and what it sends if it is not inches.
- Alternative: a bare number is feet.

**5. A room that does not close (audit 5, 6).** A 1/2" miss is not an enclosed room, nothing says when a near miss counts as a gap, and no ticket builds a gap control on the plan.
- Recommended: when a chain finishes with its end within 12" of its start, the gap shows with its size and two buttons: pick a wall to absorb it, or keep out of square. Farther than 12" is just unfinished walls. EZD-210 builds it in phase 4, since drawing a closed room by typing is the goal of the phase.
- Alternative: the math only in phase 4 and the control in a later phase; a miss just shows no room.

**6. Snapping (audit 20).** Snapping is phase 5, so walls drawn by mouse in phase 4 would rarely be square and closing on the start point would be hit and miss.
- Recommended: move EZD-206 Snapping from phase 5 to phase 4; it needs only EZD-203 and the hover in phase 4 needs its lookup anyway. Phase 4 becomes 9 tickets, phase 5 becomes 6.
- Alternative: keep it in phase 5 and draw square by typing only.

**7. No undo or delete for one phase (audit 18, 19).** Undo and delete (EZD-217) need Selection (EZD-208), both phase 5. In phase 4 a wrong wall stays. Nothing shows a finished wall's length either, because the inspector is phase 5 and auto dimensions are phase 6.
- Recommended: accept it for phase 4 and test in a throwaway project. The typed bar shows the last wall's length.
- Alternative: move Selection and Undo into phase 4 (11 tickets, over the 10-ticket phase size).

**8. Templates (audit 10, 11, 12, 13).** Board S01b's sizes are sample data, its pictures show cabinets and fixtures that do not exist until later, and nothing covers "no template".
- Recommended: Galley 8' × 14', L-kitchen 11' 9 1/2" × 14', 5x8 bath 5' × 8', primary bath 10' × 12', the board's numbers. In phase 4 each is four walls and one named room; contents are decided at the cabinet phase's spec check (phase 15). A fifth choice, Empty, is selected by default, and all choices show whatever the project type. Ceiling height on the board sets the template's wall height.
- Alternative: give other sizes, or make a template required.

**9. Foreman creating from a template (audit 22).** A Foreman can create projects but cannot edit the model.
- Recommended: the Foreman can create from a template, and the project opens view-only.
- Alternative: a Foreman gets Empty only.

**10. Board S03b is not in the repo.** Q-0510 says the conflict list board was drawn in Cowork on 2026-11-03, but it is not in `vault/mockups/`, not in its index and never was in git. EZD-299 stays blocked until it arrives. It does not hold up phase 4.
- Recommended: Josh says whether it was drawn; if yes, he exports it; if no, Cowork draws it from `vault/handoff/board-S03b-conflict-list.md`.

**11. The AI window and its board (Q-0474).**
- Recommended: the normal plan canvas stays; a panel on the right, in the inspector's place, holds the prompt box and the conversation. A board is drawn in Cowork and approved before that phase is planned (Q-0510 precedent). This does not hold up phase 4.
- Alternative: a separate pop-out window, or waive the board.

**12. Which AI model (Q-0474).** Sources: Anthropic pricing page, 2026-11-04.
- Recommended: Claude Sonnet 5.5 for everyone ($2 per million tokens in, $10 out; a prompt of 5,000 tokens in and 1,000 out costs about 2 cents, assumed sizes). The user's key pays.
- Alternative: let each user pick Sonnet or Opus 5.5 ($4 in, $20 out).

**13. What goes to the AI and what is kept (Q-0474).** Anthropic deletes API prompts and replies within 30 days, keeps flagged content up to 2 years, and does not train on API data by default (privacy.claude.com; platform.claude.com zero data retention page).
- Recommended: send the drawing's objects and measurements and the prompt; photos only when the user attaches one to that prompt. Never send client name, address, or any cost or price. EZ Draft keeps no prompts or replies after the session, only a usage line (who, when, model, cost). Accepted changes are ordinary model changes, marked as AI in the event log.
- Alternative: keep the conversation with the project for its life.

**14. Each user's key (Q-0474; decision 10-permissions-and-settings.md 2026-10-31).**
- Recommended: My profile gets an AI assistant section: paste a key, it is tested, encrypted, never shown again except its last 4 characters, never sent to the browser; Remove deletes it. No key: the Assistant button opens a short note saying how to add one, and drawing by hand is unchanged. View-only users do not see it. Each prompt shows "about $0.02" and a running total for the session; EZ Draft sets no limit. A bad or out-of-credit key shows a plain message, keeps the prompt text and leaves the drawing untouched. The storage design goes to the security-reviewer when that phase is planned.
- Alternative: no cost shown, or hide the button without a key.

**15. Preview and where it is built (Q-0474; decisions 05-screens.md and process.md, 2026-10-31).**
- Recommended: on plan, electrical, plumbing and details, additions show highlighted blue and removals red dashed, with Accept, Adjust (edit by hand first) and Reject. On renders, the prompt changes the scene and shows before and after, and the image still goes through Generate and its own credits. The first AI phase comes right after phase 5 and covers walls, doors and windows; each later tool phase adds its own AI commands. Its new tickets are written at phase 5's spec check, because inserting a phase renumbers 50 phases in the ledger while the launcher scripts are being changed; phase 6 does not start before they exist.
- Alternative: put it after phase 6.

## Settled by agents (no answer needed)

Sources in brackets. These are recorded as one Q-ID row in the matching decisions files.

- Closure comparison on the plan is the fixed 1/64" (03b rule 5, 03g); the owner's Measurement tolerance covers scan conflicts, field measurements and the 17b closure check only (S15d), so a 1/2" gap always shows (12 Room closure).
- Only a wall parallel to the gap can absorb it, since "that wall's length changes" (S02). A wall square to the gap is refused with a message.
- A room kept out of square: its area closes the outline across the gap; who, when and the gap are stored on the room; the override clears when a later edit changes the gap (build choice, reviewed).
- room.closure_overridden is emitted through the event registry now; the event log write arrives with EZD-109 in phase 7 (EZD-022 Scope). Moving EZD-109 forward would pull in EZD-104 and EZD-106. The event is added to section 07's table.
- A length of zero or below is refused; the maximum is 200 ft, as 17b's sanity range (S15d). Worked examples added by the calc-auditor.
- No Select tool until phase 5 (Q-0500 rule); a second Esc returns to no tool; hover highlights what the tool would act on. AC-EZD-207-3 and AC-EZD-210-6 are reworded.
- A room's default name is Room N, or the template's name; the label follows board S03, `NAME · N SF`. Rooms are renamed from EZD-218.
- Errors: `Use 12'6", 12' 6 1/2", 150" or 12.5'` (S01 Validation; 04 "Every length field"). Lengths display as `12' 6"`, halves going up (03g). Gap sizes display to 1/16" so a small gap is not shown as 0" (S02 board "5/8" gap").
- Room area: whole square feet (Q-0207), halves going up; worked examples added by the calc-auditor.
- AC-EZD-207-5 is rewritten: frame times are a trend, not a gate (11 Performance); countable measures gate.
- What phase 4 shows (Q-0500; EZD-230 rule): Plan tab; rail with Wall and Room rectangle, plus snapping only as item 6 says; W and R keys fixed until EZD-222; no left panel or inspector; status bar disclaimer only.
- Without Edit model: canvas, pan, zoom, Fit and hover; tools and bar hidden (Q-0214, S03 Permissions). Edit model alone is enough until the edit lock (00d).
- Canvas failure: inline message with Retry (Q-0214). A template project writes project and walls together; a failed Create keeps the dialog open (Q-0203). Esc mid-chain cancels only the current segment.
- Build choices for the plans: grid meaning, zoom limits, Fit on an empty model, hover style, joins (with worked examples), benchmark object mix and where it lives (not listed as a normal project), room storage with area derived (AC-EZD-202-1; 11 rule 2), spatial index owned by the ticket that first needs it, drawing-list entries for room labels and the gap marker.
- Test script step 1 drops "Standalone" (Q-0410); step 4 reads `12' 6"` (03g). Glossary addendum `00e-glossary-phase-04.md`; `spec_files` for EZD-201 add 03g, and for EZD-203 and EZD-205 add 03f.
- The conflict-row Show button promised for phase 4 (Q-0511 b, AC-EZD-299-10): whichever of EZD-207 and EZD-299 is built second adds it, so it does not depend on board S03b's arrival.
