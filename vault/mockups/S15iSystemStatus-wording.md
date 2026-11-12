# S15i System status · approved wording

Josh approved the boards, this wording and the design choices on 2026-11-11 (chat: "these all look good. follow your recommendation for all open questions"). On the board, a dotted orange underline and a W number mark this wording; the board notes still say "proposed", and this list is what counts. Switch names, groups and preset counts follow the built permission list (37 switches). Everything under Sample data is not a decision.

Design choices approved with it: the user inspector and role panel are 450 px wide so all 37 switches show without scrolling; the benchmark plays with its progress shown in the Benchmark card (the page stays open); on iPad the Settings nav is an icon rail and System status is one scrolling column with backup and restore drill first; Admin switches are named by their Settings page (Company, Users, ...); the invite-code button reads "Join". Translations and the EZ Binder sync box are off the Settings nav (Q-0234, Q-0695).

## New wording
- W1 Page title: "System status"
- W2 Page subtitle: "Failed background work, backups and how fast the plan editor runs. Only people with the System status switch see this page."
- W3 Refresh line label: "Updated"
- W4 Button: "Refresh"
- W5 Section title: "Job failures"
- W6 Section scope: "Last 30 days"
- W7 Column: when it failed: "Failed"
- W8 Column: "Kind"
- W9 Column: "Error"
- W10 Column: attempts: "Tries"
- W11 Pager, 50 per page (numbers sample): "1–50 of 63"
- W12 Section title: "Last off-site backup"
- W13 Backup row name: "Nightly file copy"
- W14 Schedule: "Every night"
- W15 Backup row label: "Finished"
- W16 Backup row label: "Size"
- W17 Backup row label: "Copied to"
- W18 Backup row name: "Weekly database dump"
- W19 Schedule: "Every Sunday"
- W20 Section title: "Last restore drill"
- W21 Restore drill result: "Passed"
- W22 Restore drill label: "Ran"
- W23 Section title: "Benchmark"
- W24 Button: "Run benchmark"
- W25 Benchmark intro: "Plays a set pan, zoom and wall drag on the benchmark project and times every frame."
- W26 Benchmark budget line: "Budget: a frame every 16 ms on desktop and 33 ms on iPad, and no frame over 100 ms."
- W27 Column: "Date"
- W28 Column: "Device"
- W29 Column: app version: "Version"
- W30 Column: "Pan"
- W31 Column: "Zoom"
- W32 Column: "Drag"
- W33 Column note: "Worst / average frame, ms"
- W34 Benchmark row mark: "Missed budget"
- W35 Benchmark count (sample): "12 runs"
- W36 Pager note: "50 per page"
- W37 Section title: "Webhook failures"
- W38 Column: webhook target: "Sent to"
- W39 Status bar label: "Jobs"
- W40 Status bar label: "Backup"
- W41 Status bar location: "Settings · System status"

## Reused, already approved or decided (no W number on the board)
"Project"; "Settings"; "Projects"; "Company"; "Users + permissions"; "Title block"; "Sheet presets"; "Defaults"; "ft-in"; "Catalog"; "Render models"; "Code edition"; "Libraries"; "Company settings".

## Sample data (not a decision)
"2 min ago"; "Nov 11, 2:41 PM"; "Export PDF"; "Kitchen remodel"; "Sheet A-3 timed out after 120 s"; "Nov 11, 9:07 AM"; "Import scan"; "Primary bath"; "GLB mesh has no floor faces"; "Nov 10, 4:55 PM"; "Photoreal render"; "Render worker out of memory"; "Nov 9, 11:20 AM"; "Send to client"; "Laundry refresh"; "Email provider refused the message"; "Nov 8, 6:02 PM"; "Field pack"; "Hall bath"; "Photo upload missing on server"; "Nov 6, 1:14 PM"; "Font file could not be read"; "Nov 3, 10:31 AM"; "DXF units not set"; "Nov 11, 2:14 AM"; "41.8 GB"; "Backblaze B2 · ezd-files"; "Nov 9, 3:02 AM"; "1.2 GB"; "Backblaze B2 · ezd-db"; "Nov 2, 4:00 AM"; "Nov 11, 3:20 PM"; "Mac · Chrome"; "0.7.2"; "14"; "9"; "15"; "10"; "22"; "11"; "Nov 10, 9:02 AM"; "iPad · Safari"; "31"; "18"; "29"; "17"; "118"; "24"; "Nov 7, 4:44 PM"; "Windows · Edge"; "0.7.1"; "16"; "19"; "12"; "Nov 4, 2:10 PM"; "30"; "44"; "36"; "41"; "Nov 11, 3:02 PM"; "EZ Binder · change orders"; "HTTP 503 · service unavailable"; "Nov 10, 8:15 AM"; "EZ Binder · projects"; "Timed out after 30 s"; "Nov 4, 5:40 PM"; "HTTP 401 · key refused"; "Worth Properties"; "4"; "426"; "63 failed · 30 days".
