# Assumptions: EZD-135b

Choices the spec, decisions and mockups did not settle, and user-visible text not on a mockup (CLAUDE.md rules 1 and 6). Add new rows at the end of the Open table. `node vault/tools/assumptions-index.mjs` rebuilds vault/build/assumptions.md and vault/build/wording-for-josh.md from these files.

## Settled

Recorded up to 2026-11-23, when Josh approved every "Wording for Josh" row (Q-0803), or confirmed by Josh on vault/build/wording-for-josh.md since.

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| EZD-135b | The plan (written while Q-0665 was open) and the approved S15i boards (2026-11-11) differ in layout and wording | Built to the boards: two columns on desktop (Job failures left; backup, restore drill, webhooks right), one column below 1280 px with backup and drill first; page subtitle, Updated line and Refresh button in the page head; board wording for titles, columns and empty lines | S15i System status, states and iPad boards and wording files; CLAUDE.md rule 6 |
| EZD-135b | Job failures table: the board has a Project column, but the route (EZD-135) returns no project | Column left out (Failed, Kind, Error, Tries) | S15i W7-W10; EZD-135 JobFailureRow |
| EZD-135b | Webhook failures table: the board shows Failed, Sent to, Error; the route returns title `<event>: <status>`, event id and count | Sent to shows the event name and Error the status, split from the title at the last ": "; event id and count not shown | S15i W7, W38, W9; report.ts reportWebhookFailure title |
| EZD-135b | Backup card when one of the two copies has never run | Both blocks show, with — for Finished, Size and Copied to of the missing one; the empty line W7 shows only when neither has run | S15i states W7 |
| EZD-135b | "Older than its schedule" pill on a late backup (S15i states W30) | Not built: no spec rule says when a copy is late; needs a ticket with the rule | S15i states; 11 Operations |
| EZD-135b | Restore drill card | "Ran" + time + Passed or Failed pill; the dump location is not shown (the board shows none) | S15i W20-W22, states W36; Q-0672 (b) |
| EZD-135b | Error text on a card that could not load | Each card shows its own inline error with Retry (a failed card never blanks the others), text "Couldn't load system status. Check your connection and try again." (the board's W10 and W11 joined in one line) | S15i states W10-W12; ARCH Errors and logging |
| EZD-135b | Updated line value | The time since the page loaded or Refresh was pressed, in the notification wording ("Just now", "{count} min ago", ...), updated every 30 s | S15i W3 (sample "2 min ago"); office.notifications.time.* |
| EZD-135b | Wording for Josh: pager button labels (read aloud and on hover; the buttons show chevrons) | "Previous page" / "Next page" | S15i W11 pager; style of office.users.prev/next |
| EZD-135b | Icons on the page: chevron_left and chevron_right added to the icon set for the pager | Added from the pinned Material Symbols commit (icons:fetch) | S15i pager chevrons |
| EZD-135b | Status bar items Jobs and Backup (S15i W39-W41) and the Benchmark card | Not built here: the Benchmark card is EZD-237; the status bar items are not in this ticket's criteria | S15i; tickets.json EZD-237 |
| EZD-135b | Where EZD-237 puts its Benchmark card (the plan said: a sibling after `<SystemStatusPanel />`) | On the S15i board Benchmark sits in the left column under Job failures, inside the panel grid; EZD-237 adds a grid area under Jobs in `SystemStatusPanel` (and its CSS) instead of a sibling after the panel, which would render below the whole grid | S15i System status board; vault/plans/EZD-237.md:41 |

## Open

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
