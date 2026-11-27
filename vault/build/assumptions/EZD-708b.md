# Assumptions: EZD-708b

Choices the spec, decisions and mockups did not settle, and user-visible text not on a mockup (CLAUDE.md rules 1 and 6). Add new rows at the end of the Open table. `node vault/tools/assumptions-index.mjs` rebuilds vault/build/assumptions.md and vault/build/wording-for-josh.md from these files.

## Settled

Recorded up to 2026-11-23, when Josh approved every "Wording for Josh" row (Q-0803), or confirmed by Josh on vault/build/wording-for-josh.md since.

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| EZD-708b, EZD-708c | Wording of the note that the electrical contractor verifies the design | "Electrical design to be verified by the electrical contractor of record." on E1.0 and E2.0, in the general notes block (wording for Josh) | S06 Decisions "Every electrical sheet carries the note…"; R24 #43; CLAUDE.md rule 6 |

## Open

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| EZD-708b | What a plan viewport on E1.0 draws | The floor plan of its view (Proposed by default) with every device's symbol, each device's own height note (off unless turned on for that device), the circuit number beside each device on a circuit, the circuit line through its devices, every circuit's home run tagged with the panel letter and number (as the Electrical tab with the Home runs chip on), and the switch legs. A light on the RCP is the same device object, so it prints on A6.0 and on E1.0 with its circuit | AC-EZD-708b-1; Q-0763 "E1.0 is the layout with devices and symbols"; board S06Electrical ("14" tag, home run "A-14"); R24 #36 |
| EZD-708b | Which sheets draw their plans as the electrical plan | Every plan viewport on an electrical sheet (E1.0, E2.0 ...), including one a user adds to the panel sheet | Q-0763; lib/sheets/electrical-kinds.ts |
| EZD-708b | Electrical sheets for a second floor (Q-0763, handed on by EZD-703) | Each floor after the lowest adds a layout sheet after E1.0 (E2.0 for the second floor, E3.0 for the third), titled "Electrical · <floor name>", with a Proposed plan of that floor at 1/4"; the panel sheet "Panel + load calc" moves to the number after the last layout (E3.0 with two floors). A one-floor project keeps E1.0 and E2.0. Viewports changed on an E sheet stay with its number, so adding or removing a floor later moves them with the number | Q-0763; Q-0509; vault/build/assumptions/EZD-703.md |
| EZD-708b | Load calc labels on a project with more floors | The issue checklist (`LOAD_CALC_SHEET`) and its messages still name "E2.0"; with two floors the panel sheet is E3.0. Left for EZD-708c, which owns the panel sheet, to point them at `panelSheetNumber` | lib/sheets/issue-checklist.ts; app/src/server/messages/catalogs/en.ts office.issue_checklist.load_calc.* |
| EZD-708b | Where the EC verification note's general notes block goes | The settled wording, under a "GENERAL NOTES" heading (as on the cover), at the bottom of the notes column left of the title block, wrapped to the column, on every electrical sheet, in the preview and the PDF alike; the symbol key keeps the column's top and the viewports keep the whole drawing area. The preview draws an electrical sheet even with no viewport, so the panel sheet shows the note in the preview as in the PDF. No EC signature block (EZD-708c, per submittal profile) | Settled row above; 09a / S06 "Every electrical sheet carries the note"; board S13Sheets notes column; AC-EZD-708c-3 |
| EZD-708b | Wording: second-floor electrical sheet title | "Electrical · <floor name>", e.g. "Electrical · Second floor" | Wording for Josh; EZD-703 floor copy titles |
