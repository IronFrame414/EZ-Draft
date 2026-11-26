# Assumptions: EZD-702a

Choices the spec, decisions and mockups did not settle, and user-visible text not on a mockup (CLAUDE.md rules 1 and 6). Add new rows at the end of the Open table. `node vault/tools/assumptions-index.mjs` rebuilds vault/build/assumptions.md and vault/build/wording-for-josh.md from these files.

## Settled

Recorded up to 2026-11-23, when Josh approved every "Wording for Josh" row (Q-0803), or confirmed by Josh on vault/build/wording-for-josh.md since.

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| EZD-702a | Sheet row Δ tag, "2 open" items, status dot and the Revision readout before revisions and checks exist (EZD-717/718 phase 27–28, EZD-716 phase 27) | Pointers: Δ tags come from EZD-718, open items from EZD-716. Until then no Δ, no open count and every dot shows "Ready to issue". Before Rev 0 is issued the set reads "Rev 0 draft" (set selector, status bar Revision, watermark "REV 0 DRAFT · NOT FOR CONSTRUCTION") | S13 board; S13 Controls "Sheet canvas"; 09h Revision rules |
| EZD-702a | Wording for Josh to confirm | Add sheet picker types "Plan", "Elevation", "Details", "Schedule", "Renders", "Blank"; empty set note "Draw or import a plan to fill these sheets." | S13 Controls "Add sheet", States "Empty"; CLAUDE.md rule 6 |
| EZD-702a | What the Sheets screen shows before later tickets | Rail and inspector are empty on the Sheets tab (Sheet tools EZD-704; Issue checklist, output settings, Revision log and Issue EZD-716/717/718). The canvas tool bar (Sheet, Clouds n) is left for EZD-718's clouds. The page shows its frame, title block number and title and the draft watermark only; the drawing and thumbnail images are EZD-702b | S13 Layout; phase-07 EZD-702a row; Q-0769 |
| EZD-702a | Status dot, Δ tag and open items | Open items (EZD-716) and Δ marks (EZD-718) have no source yet, so every sheet shows the green Ready to issue dot with no Δ tag and no "n open"; a sheet with open items will show the amber Needs approval dot and amber thumbnail. The legend's "Clouded in Rev n" line shows only when some sheet has a Δ | S13 Controls Sheet row, Thumbnail; board S13Sheets legend |
| EZD-702a | Revision and Scale readouts | A set never issued reads "Rev 0 draft" (S13 Numbering: Rev 0 at permit issue); an issued set reads "Draft" until EZD-717 numbers revisions. Scale is a viewport's (EZD-703); until then it shows "—". Zoom is the preview's shown width over the printed width at 96 px per inch | S13 Validation Numbering; board S13Sheets footer |
| EZD-702a | Add sheet picker | Add sheet shows with Edit model and the edit lock and opens the type picker (Plan, Elevation, Details, Schedule, Renders, Blank), but the types cannot be picked yet: sheets are derived from the project, not stored objects (EZD-701 assumption), so adding waits for a later ticket that stores sheets as objects | S13 Controls Add sheet; Q-0769 |
| EZD-702a | Sheets tab entry | The Sheets tab shows beside Plan (and 3D once the plan canvas is up). The plan canvas stays mounted but hidden under Sheets, as under 3D, so a return to Plan does not rebuild it; the open set and sheet are kept for the editor session | S13 Entry points; EZD-1001a precedent |
| EZD-702a | Wording for Josh to confirm | Board text: "Permit set", "N sheets · 24 × 36 · Rev N draft", "Architectural", "Electrical", "Renderings", "N open", "Add sheet", "Ready to issue", "Needs approval", "Clouded in Rev N", "N of N", "Sheet", "Size", "Scale", "Revision". Spec text: "Client set", "REV n DRAFT · NOT FOR CONSTRUCTION" (English only, not translated). New: "Sheet set" (selector menu label), "Sheet type" (picker label), "Plan", "Elevation", "Details", "Schedule", "Renders", "Blank", "Loading sheets", "The sheets could not load.", "Previous sheet", "Next sheet", "Sheet thumbnails", "Legend", "Draft", "—" | CLAUDE.md rule 6 |

## Open

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
