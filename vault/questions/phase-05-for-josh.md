# Phase 5 · for Josh (questions unit, 2026-11-12)

Nothing waits on you for phase 5. Agents settled every open question (section 2).

## 1. Decisions needed

None.

## 2. Agent answers to confirm

Confirm or override each.
- **Q-0643 · EZD-211.** Both Offset left and Offset right typed: accepted only when left + width + right equals the space between the corners within 1/64", else refused ("Those offsets and the width don't add up to the wall."), nothing saved. Source: phase-auditor; 09k rows 9-14, 23; 03g; Q-0636.
- **Q-0644 · EZD-213.** The clause "a bearing wall still deletes" is proved by EZD-217's delete test, not by EZD-213. Source: code-reviewer; EZD-217 plan C4 (c); Q-0630 row 15.
- **Q-0645 · EZD-213.** Several doors or windows share Size, Rough opening and Impact rating (Sill height only when all are windows); Swing and Hand and Offset from corner stay single-object; walls mixed with openings show only the title and subtitle. Source: phase-auditor; S03:115,117; wording W4, W5, W8, W9, W14. Design note: a mixed wall-and-door selection shows no fields; tell me if you want something there.
- **Q-0646 · EZD-217.** Paste and Duplicate land the copied objects' bounding-box centre on the cursor (or view centre), not snapped. Source: phase-auditor; Q-0630 rows 10, 19; S03:72.
- **Q-0647 · EZD-217.** Undo, Redo, Paste and Duplicate pressed during the Wall or Room tool or a gap pick first end the tool (as tapping Select does), then act. Source: phase-auditor; S03:36, 78-79; Q-0630 rows 24, 28.
- **Q-0657 · EZD-212a.** A door or window that is Not on a wall can still be resized: the chosen jamb stays fixed along its stored direction. Typing an Offset still needs a wall. Source: phase-auditor; S03dStates board (editable Width on the flagged door); Q-0630 rows 11, 76.
- **Q-0658 · EZD-213a.** With more than one stud layer, a typed Thickness changes the first stud layer (left face to right face). Source: phase-auditor; Q-0630 row 13; 09k Thickness.
- **Q-0659 · EZD-213a.** The inspector shows Height, door and window Width and Height, Rough opening and Sill height to 1/16", like Thickness; Length and Offset stay at 1/2". Source: phase-auditor; 03g; 09j rows 15-16; Q-0635. Note: the approved door and window boards show Offset from corner finer than 1/2" (sample data, not a decision).
- **Q-0739 · EZD-389.** Notification emails (the bell-list kinds, such as an edit request) go only to their recipient; the person whose action triggered the notification gets no copy (the copy rule in Q-0701 covers emails a user sends, such as client sends and invites). Source: phase-auditor; Q-0701; glossary 00c:7; 03c-tables:49; phase-02.md:74.
- **Q-0744 · EZD-212b (UI).** With a door selected, a press on its hinge dot or swing arc flips it (the hinge dot's moving press resizes), so the door drags from its body only. Source: Q-0633 (05-screens.md:79). Tell me if you want dragging from the arc to move the door.
- **Q-0753 · EZD-395.** EZD-395 fixes only the session read. A new defect ticket, EZD-421, audits every route that can answer 500 and send an alert for an ended session, and gives them one shared rule. Source: CLAUDE.md rules 17 and 18.

Build-system answers (Q-0751, Q-0752, Q-0754 to Q-0756) are not listed for you (lean process, Josh 2026-11-04).

## 3. Proposed wording

- **EZD-211:** refusal "Those offsets and the width don't add up to the wall."; the rest per its plan section 3.
- **EZD-213, EZD-217, EZD-204, EZD-208:** see section 3 of each plan; nothing new from these answers.
- **EZD-389** (the copy of an email sent to the person who sent it; English): subject "Copy: {subject}"; first line "This is your copy of the email sent to {to}. If they can't find it, ask them to check their spam folder, or forward this email to them."
- **EZD-394, EZD-395, EZD-397, EZD-398, EZD-399, EZD-421:** no user-visible wording (EZD-395 and EZD-421 keep the existing 401 answer).
