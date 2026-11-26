# Assumptions: EZD-702b

Choices the spec, decisions and mockups did not settle, and user-visible text not on a mockup (CLAUDE.md rules 1 and 6). Add new rows at the end of the Open table. `node vault/tools/assumptions-index.mjs` rebuilds vault/build/assumptions.md and vault/build/wording-for-josh.md from these files.

## Settled

Recorded up to 2026-11-23, when Josh approved every "Wording for Josh" row (Q-0803), or confirmed by Josh on vault/build/wording-for-josh.md since.

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| EZD-702b | Which sheets draw the plan before viewports (EZD-703) | A1.0, A2.0, A3.0, A6.0 and E1.0 draw the lowest floor, every status, at 1/4" = 1'-0", centred in the paper inside the border and left of the title block; the other sheets show frame and title block only. Per-sheet phases (A1.0 existing, A2.0 demo) and other floors come with EZD-703 viewports | 09h Scales per viewport; S13 States Empty; AC-EZD-703-1 |
| EZD-702b | Sheet pen widths, colours and text size | Cut 0.50 mm, beyond 0.25 mm, hidden 0.25 mm dashed 1/16" on 1/32" off, dimensions 0.18 mm; black ink; wall poché light grey (#c8c8c8). Dimension and room label text 9 pt (1/8"), one size up from 3/32" notes. No PDF writer exists yet to match; EZD-705 print rules may revise | 09h "Line weights by role", "minimum 3/32\" on 24×36; labels and dims one size up" |
| EZD-702b | Thumbnails, schedules and the symbol key | Not drawn yet: the strip keeps its plain page thumbnails, and the cached per-sheet, per-checkpoint thumbnail images are left to a later ticket with the symbol key (EZD-706) and schedules, since no AC covers them and no non-plan sheet has content yet. Only the open sheet is drawn, and only while Sheets is shown; a model change while shown draws it again, one render at a time | phase-07 EZD-702b; 11 rule 2; AC-EZD-702b-2 |

## Open

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
