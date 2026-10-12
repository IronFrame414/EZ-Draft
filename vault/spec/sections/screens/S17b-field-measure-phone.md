### 17b · Field measure (phone)

**Purpose:** Capture basic room and building shapes and their measurements on site from a phone. Anything more detailed is measured with pen and paper and added on desktop later (Round 25).

**Entry points:** Field pack → Measure tab → Field measure; EZ Binder job → Field measure; New project wizard → input source Field measure (01 step 2).

**Permissions:** *Send field measurement* to create and send; *View projects* to view. Shapes arrive on desktop as draft existing-condition rooms; turning them into model objects needs *Edit model*.

**Layout:** header (Back to EZ Binder, Saved on phone status, project), room chips (Building outline plus each room, + Room), shape picker, shape canvas with lettered walls, active wall field and ceiling height field, hint line with walls done, measurement keypad.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Back to EZ Binder | Header | Returns to the same job | Shared sign-on |
| Room chips | Header | Switch room; Building edits the outside outline | Active chip cobalt |
| + Room | Header | Adds a room; name typed or picked (Kitchen, Bath, Bedroom, Family, Laundry, Other) | — |
| Shape picker | Top | Rectangle, L-shape, T-shape, U-shape, Walls (free outline) | Changing shape after measuring asks to confirm and keeps matching walls |
| Walls mode | Shape picker | Tap to add corners; each new wall is lettered; tap the first corner to close | Angles snap to 90° unless held |
| Wall letter (tap) | Canvas | Selects that wall; its value goes to the active field | Selected wall cobalt |
| Active wall field | Below canvas | Shows the value being typed for the selected wall | Accepts feet, inches, fractions to 1/16" |
| Ceiling field | Below canvas | Ceiling height for the room | Optional |
| Keypad digits, ', ", 1/2, 1/4, 1/8, 1/16, space, backspace | Bottom | Type the measurement | Laser keyboard mode types here too |
| Next wall | Keypad | Saves the value and moves to the next wall | On the last wall, moves to the next unmeasured wall |
| Auto-fill wall | Canvas | The last wall of a closed shape fills itself when the others are known | Shown grey until computed |
| Closure check | Canvas badge | Shows "Closes" or "Off by X" when every wall is entered | Off by more than the company tolerance turns amber; the office resolves it on desktop |
| Send to office | Menu | Sends rooms to the project; office notified | Works offline, queued until online |

**Data shown:** rooms, shape, wall letters and lengths, ceiling height, closure result, saved and sent state.

**States:** empty room (pick a shape); measuring; closed; off by X; offline (saved on phone); sent (read-only until reopened by office).

**Validation & warnings:** a value outside 0–200 ft asks to confirm; closure difference above the tolerance setting shows amber.

**Events emitted:** `field.measure_sent` (new): project, rooms, shapes, values, by, at.

**Desktop side:** sent rooms appear in Import review as Field measure items with high confidence; accepting them creates existing walls and rooms. Openings, fixtures and details are added on desktop.

**Decisions:** shapes limited to rectangle, L, T, U and free walls; no doors, windows or fixtures on phone (Round 25).
