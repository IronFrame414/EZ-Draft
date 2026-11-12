# Glossary addendum · Phase 5

Added by spec-check 5 (Q-0630, settled row 31). Definitions only, each from the source named; no new rules. Read with `vault/spec/glossary.md` and addenda 00b to 00e.

| Term | Meaning | Code name | Source |
| --- | --- | --- | --- |
| Host wall | The wall a door or window sits on. An opening off every wall has none. | `hostWallId` | S03 Validation; Q-0630 row 5 |
| Offset | How far an opening is along its host wall's line, from the inside finished-face corner to the opening's edge. | none yet (EZD-204 plan names it) | S03 Door; 09e; Q-0630 row 1 |
| Swing | Which side of the wall a door opens to; two values. | none yet (EZD-204 plan names it) | S03 Door; Q-0630 row 4 |
| Hand | Which end of a door the hinge is on; two values. | none yet (EZD-204 plan names it) | S03 Door; Q-0630 row 4 |
| Rough opening | The framed hole for a door or window, larger than its size. | none yet (EZD-204 plan names it) | S03 Door/window inspector fields; Q-0630 |
| Sill | The height of a window's bottom edge above the floor. | none yet (EZD-204 plan names it) | S03 Door/window inspector fields; Q-0630 |
| Impact rating | Not rated, Impact rated, or Shutter with its type. | none yet (EZD-204 plan names it) | S03 Door/window inspector fields; Q-0630 row 4 |
| Chip | A live distance shown beside a dragged or selected object; click it to type the distance. | none yet (EZD-212 plan names it) | S03 Live distance chips; Q-0630 row 10 |
| Handle | The mark on a selected object that is dragged to resize it. | none yet (EZD-212 plan names it) | S03 Drag selection handle; Q-0630 row 12 |
| Mixed | What a shared inspector field reads when the selected objects' values differ. | none yet (EZD-213 plan names it) | S03 Bulk edit; 04 Left panel and inspector |
| Not on a wall | The flag on an opening left off every wall; the opening turns error red and the words show in the inspector on click. | none yet (EZD-204 plan names it) | S03 Validation; 04 Selection, undo and flags; Q-0630 rows 5 and 27 |
| Canvas selection | The objects picked on the plan with Select. Not the same as Selection in `glossary.md` line 17, a client's recorded choice. | none yet (EZD-208 plan names it) | S03 Canvas interactions; glossary.md:17 |
| Select more | The tablet toggle: while it is on, each tap adds or removes an object. | none yet (EZD-208 plan names it) | S03d E T1, T4 |
| Bar | The on-screen row of Undo, Redo, Delete, Duplicate, Select more, Select all, Copy and Paste on a tablet. | none yet (EZD-217 plan names it) | S03d E; Q-0633 |
| Arc | The curved line of a door on the plan; a tap on a selected door's arc flips its swing. | none yet (EZD-211 plan names it) | S03d W11, W12; Q-0633 |
| Hinge dot | The dot at a door's hinge end; a tap on a selected door's dot flips its hand. | none yet (EZD-211 plan names it) | S03d W11, W12; Q-0633 |
| Next field | The tablet chip button that does what Tab does. | none yet (EZD-212 plan names it) | S03d E T2 |
| Tablet | A device whose main pointer is coarse. | `COARSE_POINTER_QUERY` | device-layout.ts:6; Q-0633 |
| Assistant | The panel on the plan where a user types prompts and gets a preview of changes. | none yet (EZD-5603 plan names it) | S03c; Q-0474 |
| AI preview | The changes a reply proposes, drawn on the plan and not saved. Not a Vercel Preview. | none yet (EZD-5604 plan names it) | S03c; Q-0638 |
| Accept, Adjust, Reject | Save the preview as one undo step; edit it by hand first; clear it. | none yet (EZD-5605 plan names them) | S03c; Q-0638 |
| Ref | A short name such as w1, good for one request, that stands for an object sent to the AI. | none yet (EZD-5602 plan names it) | Q-0637 |
| Send list | The object fields sent to the AI. | none yet (EZD-5602 plan names it) | Q-0637 |
| AI key | The user's own Anthropic API key, stored encrypted. | `user_ai_key` | Q-0637 |
| AI usage | The record of who, when, model and cost for a prompt. | `ai_usage` | Q-0637 |
| Session (Assistant) | This editor page load; its total is on the cost line. | none yet (EZD-5603 plan names it) | Q-0638 |
