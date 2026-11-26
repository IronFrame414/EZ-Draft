# Assumptions: EZD-922a

Choices the spec, decisions and mockups did not settle, and user-visible text not on a mockup (CLAUDE.md rules 1 and 6). Add new rows at the end of the Open table. `node vault/tools/assumptions-index.mjs` rebuilds vault/build/assumptions.md and vault/build/wording-for-josh.md from these files.

## Settled

Recorded up to 2026-11-23, when Josh approved every "Wording for Josh" row (Q-0803), or confirmed by Josh on vault/build/wording-for-josh.md since.

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| EZD-922a | Empty and error | With no reference, the reference canvas shows "No architect drawing yet" with "Upload DXF" (Upload references; hidden without it). An unreadable file (EZD-901a failure or binary DXF) shows "Couldn't read {name}." with "Upload again". DWG gets the EZD-301 prompt | S11 States; docs/architecture.md DXF "binary … not parsed"; assumptions EZD-307 "Couldn't read {name}."; Q-0214 |
| EZD-922a | View only | While the lock is held elsewhere: Convert (action box, tool and Files tab) and the cloud, arrow, text and dimension tools are disabled. Comment works | S11 States; AC-EZD-922a-3 |
| EZD-922a | Offline | Upload DXF, Upload new version, Upload again and Export markup are disabled with "Needs connection". Markup follows the EZD-907 offline row | S11 States; AC-EZD-922a-4 |
| EZD-922a | Not drawn readout | Status bar "Not drawn" with "{n} entities · {t} types" (board "3 entities · 1 type"). It is hidden at 0 and opens an EZD-219 popover listing "{n} entities of type {X} not drawn", which is R16's wording. The counts come from EZD-901a's stored not-read counts. The test uses the fixture's expected not-read count | 13b-round-26.md#R16; board S11 status bar; AC-EZD-922a-5 |
| EZD-922a | Loading | "Loading layers n of m" is EZD-901b's readout and is only checked here | phase-09 EZD-901b row |
| EZD-922a | Events | reference.uploaded is EZD-901a's (Notes) and reference.layer_converted is EZD-906's. This ticket checks that both are written and adds neither | phase-09 EZD-922a row |
| EZD-922a | Wording for Josh to confirm | Board text that is decided: "Not drawn", "{n} entities · {t} type(s)". Spec text: "Reference is read only. Convert a layer to edit it.", "Upload again", "Needs connection", "{n} entities of type {X} not drawn". Proposed: "No architect drawing yet", "Upload DXF", "Couldn't read {name}." | CLAUDE.md rule 6 |

## Open

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
