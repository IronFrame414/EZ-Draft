# Phase 5 · spec gaps (spec-check, round 1, 2026-11-07)

Audit by phase-auditor (Opus, read-only). Josh 2026-11-07 authorised running this check and signing off phase 5 unless a design or UI question needs him. Stage-0 ACs: f23f2040 (60). Nothing below is recorded in the spec yet; settled rows go into decisions and sections, then the audit re-runs (PROCESS section 5 step 5).

## Questions for Josh
1. New door and window sizes (rows 3). Suggested, not from the spec: door 3' 0" × 6' 8"; window 3' 0" × 4' 0", 3' 0" sill. Rough opening: door 2" wider, 2 1/2" taller; window 1/2" larger each way; follows the size until typed. All become Defaults rows in EZD-116.
2. Box select (row 7). (a) fully inside only, recommended; (b) CAD style by drag direction.
3. iPad with no keyboard (rows 18, 28). (a) small on-screen Undo, Redo, Delete, Duplicate now, recommended; (b) keyboard only for now.
4. Wall and door panels, selected look, handles, door preview, red door (rows 25, 26). (a) one new board, recommended, only EZD-204 proceeds until approved; (b) waive, builder copies existing boards, Josh checks at the Field check.
5. AI assistant photos (A7). S03c allows attaching one; the approved board has no control. Recommended: no photos in the first AI phase.
6. AI phase sign-off: Josh's 2026-11-07 yes names phase 5 only; the AI phase needs its own row.

## Settled rows (answered-agent; source in brackets)
1. Door offset: along the host wall's line, from the inside finished-face corner to the door's edge at door width. A corner is a wall end or the face of a wall teeing in. 0" accepted. Refused past the wall end or overlapping another opening by over 1/64"; exact fit accepted. [S03:40,74,82; 09e; Q-0559; Q-0570; 03g; joins.ts; overlap rule 18]
2. Worked examples: table below. [03g; 09j]
4. Swing: which side of the wall, 2 values. Hand: hinge end, 2 values. Space flips swing only; Mirror swaps hand. Windows have neither. Impact: Not rated (default), Impact rated, Shutter with its type. Labels per 3a. [S03:40,41,117; EZD-233 row; R3-003]
5. On a wall: same level, center within 1/64" of the wall's line, whole width on its span. Partial overhang counts as off. On contact with any wall it re-hosts and the flag clears in the same undo step. Off: hostWallId null. Ties to the first id. [S03:152; 03g; opening.ts; EZD-205b]
6. New opening status: Existing until EZD-214. [Q-0558; wall.ts; S03:38]
7. Smallest: smallest plan footprint, ties to first id. Cycle wraps. Click on empty clears; Shift+click on empty keeps. [S03:36,60,61; 04:34]
8. Rooms not selectable until EZD-218; a click inside a room is empty space. [EZD-208 row; S03:63,100]
9. View-only users select, box select and read the inspector as plain text; Select shows on their rail. EZD-225 "no tools" reads "no drawing tools". [S03:16-21; Q-0214]
10. Chips show while dragging and at rest on one selected object. The selection moves. Wall: nearest parallel wall face each side. Opening: both sides along its host. None with several selected. Display 1/2", stored 1/16". [S03:40,82; board S03; 09e; Q-0207]
11. A hosted door slides along its wall, cannot be dragged off, stays at its last spot away from every wall, re-hosts near another. A flagged door follows the cursor until on a wall. Selected wall and door move together; unselected hosted items stay. [S03:37,40,66; 04:86]
12. Typed length: end moves, start stays, joined walls follow. A handle moves the dragged end. Offsets from the start corner do not shift. [absorb.ts; 09j Absorbing row 2; move.ts]
13. Thickness equals the sum of layers; typed thickness changes the stud layer; refused if stud reaches 0" or no stud. [schema/wall.ts; 09j Default wall]
14. Opening width, height, rough opening, wall height and thickness above 0". Offset, sill, chips and move accept 0". [EZD-202/203 schema; Q-0570; 03g row 9]
15. Bearing settable in phase 5; a bearing wall still deletes; the warning comes with EZD-215. Phase 10 risk: Q-0205 conflicts with EZD-215 row, S03:77 and 09e. [EZD-213, EZD-215 rows]
16. Pill and Status field display only until EZD-214. [EZD-213, EZD-214 rows]
17. Catalog, cost, 3D preview, selection tiles and primary action hidden; More waits for EZD-233. [Q-0500; S03:113,114]
19. Paste at the cursor, or view center; Duplicate the same. New ids; hostWallId remapped if the host was copied, else the on-wall test decides. Current floor; status kept. Joins from coordinates; rooms reconcile. Clipboard in memory, open project only. [AC-217-2; 04:86; joins.ts; rules 4, 18]
20. Undo: no depth cap in the session; a bulk edit is one step; a new edit clears redo; reload empties both. [model-store.ts; S03:78; AC-120b-2]
21. Redo: Ctrl/Cmd+Shift+Z only; correct script step 7. [S03:78; 04:58; S15d:50]
22. 207-3, 207-7, 210-6, 210-8 superseded by design; phase 5 plans name the merged tests and TRACE marks them. Typed bar under Select: one selected shows its main size; none or several hides it. [Q-0568; Q-0569; Q-0570; board S03]
23. EZD-212 replaces office.tools.gap.fix_later under 3a; still only Keep out of square. Tests: tool-defs.test.ts:37, gap.test.ts:102, GapBoxes.test.tsx:82. [Q-0569 (c)]
24. Red gap marker stays. Clicking it, or selecting any wall of the chain, shows Resolve the gap. Finishing a chain with a gap selects its last wall. Esc in pick mode returns to the section. [S02 board; S02:74; Q-0569; Q-0570]
25 (wording). Title per Q-0511 (b); multi-select title and empty line proposed under 3a. [S15:103]
27. The whole object turns error red; the words show in the inspector on click. Script step 3: "turns red; click it to read Not on a wall". [04:86; S03:83; 12 Wall move]
28 (part). Esc = tap Select; Tab = the bar's Tab chip; Space = inspector Swing. [S03:36,40,74; 02:42-43]
29. Add 09j and 03g to spec_files, decisions 09 and 03 to the tickets, S02Import to EZD-212 and EZD-213, EZD-204 to depends_on of 208, 212, 213, 217. Order 212 and 213. [tickets.json; PROCESS-EZDRAFT:39]
30. Add a Build gate: 12 Selection (door to wall part), 12 Wall move, the six Done-when tests. [phase-02.md:3; PROCESS-EZDRAFT:89]
31. Glossary 00f: host wall, offset, swing, hand, rough opening, sill, impact rating, chip, handle, Mixed, Not on a wall; canvas selection separate from glossary.md:17. [READINESS 9; 00e]
32. Q-0625: option (a), stored number per type and project; answer before EZD-204. [Q-0511 (b); Q-0540]
33. Two slow clicks cycle; a true double-click focuses wall Length. EZD-213 owns it. [S03:61,67]
34. Space tap flips the door in preview, just placed or selected; Space-drag pans. [S03:40,71]
35. Select also drags. A typed move uses the cursor direction after snapping. With nothing selected, Move's first click selects. [S03:37,64; Q-0560; Q-0570]
36. Esc with nothing to cancel clears at once. Keys in a focused field go to the field. [S03:76; EZD-210b plan]
37. No door height limit against wall height in phase 5; check at the 3D spec check. [Q-0570; 11 rule 6]
38. 03f data statement: opening adds swing, hand, impact, shutter type, number. Edit model creates, edits, deletes. Deleting a host leaves hostWallId null. Versions keep history. [03f; S03:17; 04:86]
39. Add ACs for rows 1, 4, 5, 7, 9-13, 19, 20, 24, 33-36. [READINESS 8]
40. Add the table below to 09j. [READINESS 4]

## Worked examples for 09j (12' × 10' room, explicit 36" door, 144" wall)
| Case | Input | Result |
| --- | --- | --- |
| Offset | 36" | Other side 72" (6' 0") |
| Offset, zero | 0" | Other side 108" (9' 0") |
| Offset, maximum | 108" / 108 1/16" | Other side 0" / refused |
| Offset, rounding | 36.03" / 36.03125" | Stores 36 / stores 36.0625, shows 3' 0", other side 71.9375 shows 6' 0" |
| Exact fit | 36" door on 36" wall, offset 0" / 36 1/16" door | Accepted / refused |
| Tee | Partition centered at 60" (east face 62.25"), offset 24" | Other side 21.75", shows 1' 10" (halfway up) |
| Chip display | 46.75 / 46.6 / 0 | 3' 11" / 3' 10 1/2" / 0" |
| Chip typed | Door chip 24" / 109" | Other side 84" (7' 0") / refused |
| Chip, partition | West face at 57.75" (shows 4' 10"), type 60" | Faces 60" and 64.5"; rooms 50 SF and 66 SF (66.25) |
| Typed move | 1/64" | Rounds to 0", nothing changes |
| Typed move | 6 1/32" east | Moves 6.0625", walls show 12' 6", 125 SF |
| Typed move, smallest | 11' 11 15/16" west | Walls 1/16", area 0.05, shows 0 SF |
| Typed move, maximum | 188' east / 188' 0 1/16" | Walls 200', 2,000 SF / refused |
| Typed length | 12' to 12' 6" | end moves, 125 SF, start-corner offsets unchanged |
| Door resize | 36" to 32" at offset 36" / 109" / 0" | Other side 76" / refused / refused |
| Thickness | 6 1/2" / 3 1/2" / 1" / 1 1/16" | Stud 5 1/2" / 2 1/2" / refused / 1/16" |
| Partition 6 1/2" | Line at 60" | West 56.75" = 47 SF; east 80.75" = 67 SF |
| On a wall | Wall moved 1/64" / 0.0157" / 6" | Not flagged / flagged / flagged |
| Partial overhang | Wall now 132"; door at 100" to 136" / 96" to 132" | Flagged / not flagged |

## AI assistant phase (Q-0474; process.md; S03c:3)
- Tickets are written at this spec check; phase 6 does not start before they exist; no code guards that, so do it before phase 5's gate. Needs its own SIGNOFF row. security-reviewer pass on key storage and per-call use at planning.
- Method: apply_recut.mjs is gone (8f2e83c1). Precedent 8a253cc3 inserted phase 53 in one commit. Renumber 6 to 55 as 7 to 56: 345 tickets in tickets.json, STATUS phase column and table, 50 PHASES rows and recut.json, 50 acceptance-criteria headings, 16 question rows. tickets/phases files follow spec phase and do not rename. About 150 "phase N" mentions stay; add a dated mapping note in PHASES. New tickets EZD-1801 up, vault/tickets/phases/phase-18.md, spec_phase 18; no fractional phase. Goes in at a unit boundary under STOP. --check is not proof: a7b3377c left EZD-206 at 5 in STATUS and 4 in tickets.json and it still passes; prove with a one-off comparison returning 0.
- Readiness gaps blocking its planning: A1 architecture.md:111 "AI only inside jobs", T19, EZD-021 "key from env" against per-user keys. A2 key table, usage table, encryption secret, tenant rules. A3 no formula, price source or rounding for the cost line; a web retriever supplies cited prices. A4 no stub sample or response list. A5 change-format schema, stale preview, Adjust, Accept as one undo step. A6 send-to-AI allow-list; room names. A7 photos (Josh, question 5).
- Settled: render state waits for the render phase (Q-0500; S03c Scope). "Marked as AI" emits through the event registry now (Q-0568). Edit model alone suffices until the edit lock (Q-0568). No shortcut on the Assistant button, as on the approved board.
- Proposed tickets: key storage and My profile (S01g); call path, stub and cost; panel and states (S03c); change schema and preview; Accept, Adjust, Reject and events. Depend on EZD-108, EZD-021, EZD-204, EZD-211, EZD-213, EZD-217.
