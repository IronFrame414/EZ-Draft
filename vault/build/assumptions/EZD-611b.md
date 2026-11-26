# Assumptions: EZD-611b

Choices the spec, decisions and mockups did not settle, and user-visible text not on a mockup (CLAUDE.md rules 1 and 6). Add new rows at the end of the Open table. `node vault/tools/assumptions-index.mjs` rebuilds vault/build/assumptions.md and vault/build/wording-for-josh.md from these files.

## Settled

Recorded up to 2026-11-23, when Josh approved every "Wording for Josh" row (Q-0803), or confirmed by Josh on vault/build/wording-for-josh.md since.

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| EZD-611b, EZD-611c | Numbers for the fixtures | Only from each rule's catalog `check` text (for example R3-049 70 sq ft, R3-050 7 ft, R3-052 7 ft, R3-053 6 ft 8 in, R3-055 6 ft 8 in over 30 in × 30 in, R3-056 78 in with beams ≥ 36 in apart, R3-037 8 %, R3-038 4 %, R3-040 3 sq ft half openable, R3-061 15/30/21/24 in, R3-068 9 sq ft, 18 in, 36 in, 36 in, R3-070 60 in) | CLAUDE.md rule 2; non-goals "No NEC verification pass … numbers from the catalog's check text" |
| EZD-611b, EZD-611c | An Automatic rule whose value the model does not hold yet (empty needs column, so EZD-620's AC-3 test does not catch it) | Behaves like Needs data: cannot-check naming the value, until EZD-620's field is filled. EZD-620 adds these fields too: window glazed area (R3-037, R3-040), window openable area (R3-038, R3-040), door has glazing and glazing type (R3-066 to R3-070, with R3-065's tempered/laminated), and hot or cold supply on a water utility point (R3-060; UTILITY_KINDS has only `water`). Each failing and passing fixture sets the field | 09c "A check that cannot run for lack of data says so"; packages/geometry schema opening.ts, utility-point.ts |
| EZD-611b, EZD-611c | Glazed area when the field is empty | No default from width × height (frame size is not glass area): cannot-check "Glazed area not set in {window}" | 09c; no source gives a glass-to-unit ratio |
| EZD-611b | R3-057 and R3-058 (whole dwelling) when the model holds only the remodeled rooms | They run only when the work demolishes a toilet, lavatory, tub or shower (R3-057) or a kitchen sink (R3-058). They warn when none of that kind remains (Existing or New) anywhere in the model | catalog R3-057/058 applies_to "bathroom removed or converted", "kitchen relocated" |
| EZD-611b, EZD-611c | Reminder triggers with no object in the model | The trigger is false, so the Reminder never appears (this meets AC-3 "and not otherwise"), and the rule is named in the closing "not checked by EZ Draft" line. Rules affected: R3-005 (plywood panels: not in SHUTTER_TYPES), 006, 024, 027, 030, 034, 036, 042, 046, 073, 075, 078; R3-041 never runs (new dwellings only); R3-009 and R3-048 run only on the change-of-use field | 09d last paragraph "Check lists these as 'not checked by EZ Draft'"; 03f object list |
| EZD-611b, EZD-611c | Rules on objects the model cannot draw (stairs: R3-045, R3-071, R3-072; guards R3-069; skylights R3-074; garage door R3-004, R3-078; carport R3-076) | Registered, never run, listed in the closing line. The AC-1 fixture for these is "reports not checked". Decided: phase 57 adds these objects and switches their rules on (09-calculations-and-rules.md#Q-0789); until those tickets build, they stay not checked | 09c "a stair rule only if a stair is drawn"; 09d B-24 "when drawn"; no ticket builds these objects |
| EZD-611b, EZD-611c, EZD-620 | Room types the code rules need | Settled by Josh, Q-0762: Kitchen, Bath, Laundry, Bedroom, Living (living, family, dining, den), Hallway, Garage, Closet or storage, Other. EZD-620 adds the five new types in its schema step and the Rooms list; Other reads as not known ("Room type not set"). If EZD-509 builds first, its light-target popover lists the four existing types and EZD-620 adds a row per new type | Q-0762; Q-0664 |

## Open

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
