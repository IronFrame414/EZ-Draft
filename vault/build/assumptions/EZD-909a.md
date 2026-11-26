# Assumptions: EZD-909a

Choices the spec, decisions and mockups did not settle, and user-visible text not on a mockup (CLAUDE.md rules 1 and 6). Add new rows at the end of the Open table. `node vault/tools/assumptions-index.mjs` rebuilds vault/build/assumptions.md and vault/build/wording-for-josh.md from these files.

## Settled

Recorded up to 2026-11-23, when Josh approved every "Wording for Josh" row (Q-0803), or confirmed by Josh on vault/build/wording-for-josh.md since.

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| EZD-909a | The reference_diff table | Columns: id; tenant_id; project_id; reference_id; from_version_id (Compared); to_version_id (Current); status (queued, ready or failed); changes json (per change: id, kind added, removed, moved or changed, layer, type, old and new entity indexes and handles, distance and direction for moves, old and new values for changed); affected_markup_ids; affected_object_ids; tolerance_used; built_at. A pair is unique on (reference_id, from, to). RLS works like markup, and there is a cross-company database test | 03c reference_diff; CLAUDE.md rule 4 |
| EZD-909a | The tolerance contradiction ("matched … within the tolerance" vs "moved = matched beyond the tolerance") | Matching runs in this order. (1) Handles, when both files keep them. (2) Same layer and type, with geometry within the tolerance: unchanged. (3) Remaining entities with the same layer, type and shape (lengths, radii, vertex count equal within 03g 1/64", and text equal), paired greedily nearest-first: moved. (4) Remaining text or dims of the same layer and type whose insert point is within the tolerance but with a different value: changed. (5) Whatever is left is added or removed. Moved means the displacement is more than the tolerance (S11 Decision 9 "more than"). Exactly at the tolerance is not a change | ticket row; S11 Decision 9; 03g Statement |
| EZD-909a | Tolerance while Defaults is Not set (registry default null) | The job reads the effective `reference_change_tolerance`, converted to drawing units. While it is Not set, the job uses the fixed 1/64" comparison tolerance from 03g, and the inspector shows "Set in Defaults". This follows the EZD-308 and EZD-310 Not set fallbacks | registry.ts; 03-data-model.md#Q-0697 "else Not set"; 03g; assumptions EZD-308, EZD-310 |
| EZD-909a | "Affected" (nothing stores what was snapped) | Geometry only, with no new data. A markup or model object is affected when any of its points or segments is within the tolerance of a changed entity's old or new geometry. A snapped point lies on its entity, so a distance of 0 covers "snapped to". Model objects are compared through the alignment transform | ticket row; S11 Validation "which markups and model objects sit on changed areas" |
| EZD-909a | When it runs | After the EZD-901a conversion of a new version, the same job builds the diff for (current, new). Any other pair is queued as the same job kind on request, then cached. A pair that is already queued or ready is not queued again. The diff must fit one job run (EZD-009 budget, 300 s and 2 GB under Q-0027). It uses a uniform grid index in its own code, with no new dependency | ticket row; 02-product-overview.md#Q-0027; docs/architecture.md DXF time and memory |
| EZD-909a | Numbers for AC-EZD-909a-1 | The EZD-901a fixture pair: 1 moved (the wall), 1 added, 1 removed, 1 changed (the dim value), as the EZD-901a row states. The test sets the tolerance to 1/2", below the fixture's move distance. A second case strips every group-5 handle and expects the same four. A boundary case uses 03g grid values: a move exactly at the tolerance is not a change | phase-09 EZD-901a, EZD-909a rows; 03g worked examples; CLAUDE.md rule 2 |
| EZD-909a, EZD-909b, EZD-910, EZD-911 | "Rev C" on the board vs "Arch rev C" | The spec overrides the board. Every version label reads "Arch rev {X}": the selects, "Show Arch rev C changes", "Keep Arch rev B", "Accept Arch rev C", and the PDF legend. Never "Rev C" | S11 Decision 9; 13b-round-26.md#R31; AC-EZD-921-1 |

## Open

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
