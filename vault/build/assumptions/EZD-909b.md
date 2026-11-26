# Assumptions: EZD-909b

Choices the spec, decisions and mockups did not settle, and user-visible text not on a mockup (CLAUDE.md rules 1 and 6). Add new rows at the end of the Open table. `node vault/tools/assumptions-index.mjs` rebuilds vault/build/assumptions.md and vault/build/wording-for-josh.md from these files.

## Settled

Recorded up to 2026-11-23, when Josh approved every "Wording for Josh" row (Q-0803), or confirmed by Josh on vault/build/wording-for-josh.md since.

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| EZD-909b | Selects and default pair | Current defaults to the newest version and Compared to the accepted current one. If the newest is the current one, Compared is the version before it. The selects only choose which pair is shown and write nothing. Options read "Arch rev {X} · {Mon D}" | board S11 "Current Rev C · Oct 11", "Compared to Rev B · Sep 22"; S11 Decision 9 |
| EZD-909b | Change summary | "{n} changes · {m} touch your markups · {k} touches a cabinet". There is one clause per affected model-object kind, singular or plural ("1 touches a cabinet", "2 touch walls"), and a clause is dropped when its count is 0. "Your markups" means every markup on this reference. The tag counts are added, removed and changed, and moves count as changed (on the board 5 + 3 + 6 = 14) | board S11 |
| EZD-909b | Change rows and sort | The mark is ~ for moved or changed, + for added and − for removed (board). The row text is built from layer and type, because the DXF carries no room names: "{label} moved {d} {direction}", "{label} changed: {new}, was {old}", "{label} added on {layer}", "{label} removed from {layer}". {label} is the block name or text value if there is one, otherwise the entity type. Directions use plan +y = north (docs/architecture.md Plan canvas). Lengths follow plan display precision. Affected rows carry tags "Markup {n}" or "{object label}" and sort first ("Affects you first"). Other text and dim rows fold behind "Show {n} more (text and dims)". Clicking a row zooms to the change. The list is windowed by hand, with no new dependency | board S11; S11 Change row, Show N more; CLAUDE.md rule 7 |
| EZD-909b | Canvas tags and chip | The "Show Arch rev {X} changes" chip toggles tags: "MOVED {d}", "+ {label} ADDED", "− {label}" (board). Changed geometry is drawn in amber and removed geometry in red dashed, which are the Q-0703 colors | board S11; S11 Chip; 05-screens.md#Q-0703 |
| EZD-909b | A pair still building, or failed | "Comparing Arch rev {X} to Arch rev {Y}…" while it is queued. A failed pair shows "Couldn't compare these versions." with Retry, which queues the job once | 04-app-shell-and-global-ui.md#Q-0214 |
| EZD-909b | AC tests | AC-909b-1: with the fixture pair, the moved wall has a row and a canvas tag. AC-909b-2: choosing another pair adds exactly one job row, and choosing it again adds none and reads the stored diff | AC-EZD-909b-1, -2 |
| EZD-909b | Wording for Josh to confirm | Board text that is decided: "Reference version", "Current", "Compared to", "changes", "touch your markups", "touches a cabinet", "added", "removed", "changed", "Changes", "Affects you first", "Show {n} more (text and dims)". Proposed: the row patterns and tag patterns above, "Comparing … to …", "Couldn't compare these versions.", "Retry", "Set in Defaults", "No changes between these versions." | CLAUDE.md rule 6 |

## Open

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
