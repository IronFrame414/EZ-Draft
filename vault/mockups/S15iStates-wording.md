# S15i System status · states · approved wording

Josh approved the boards, this wording and the design choices on 2026-11-11 (chat: "these all look good. follow your recommendation for all open questions"). On the board, a dotted orange underline and a W number mark this wording; the board notes still say "proposed", and this list is what counts. Switch names, groups and preset counts follow the built permission list (37 switches). Everything under Sample data is not a decision.

Design choices approved with it: the user inspector and role panel are 450 px wide so all 37 switches show without scrolling; the benchmark plays with its progress shown in the Benchmark card (the page stays open); on iPad the Settings nav is an icon rail and System status is one scrolling column with backup and restore drill first; Admin switches are named by their Settings page (Company, Users, ...); the invite-code button reads "Join". Translations and the EZ Binder sync box are off the Settings nav (Q-0234, Q-0695).

## New wording
- W1 Section title: "Job failures"
- W2 Section scope: "Last 30 days"
- W3 Job failures empty: "No failed jobs in the last 30 days."
- W4 Section title: "Webhook failures"
- W5 Webhook failures empty: "No failed webhook deliveries."
- W6 Section title: "Last off-site backup"
- W7 Backup empty: "No off-site copy has finished yet."
- W8 Section title: "Last restore drill"
- W9 Restore drill empty: "No restore drill has run yet."
- W10 Error state title: "Couldn't load system status."
- W11 Error state line: "Check your connection and try again."
- W12 Button: "Retry"
- W13 Section title: "Benchmark"
- W14 Benchmark button while it plays: "Running…"
- W15 Benchmark intro: "Plays a set pan, zoom and wall drag on the benchmark project and times every frame."
- W16 Benchmark budget line: "Budget: a frame every 16 ms on desktop and 33 ms on iPad, and no frame over 100 ms."
- W17 Benchmark step: "Pan"
- W18 Benchmark step: "Zoom"
- W19 Benchmark step: "Wall drag"
- W20 Benchmark running line: "Playing on the benchmark project. Don't touch the mouse or keyboard until it finishes."
- W21 Column: "Date"
- W22 Column: "Device"
- W23 Column: app version: "Version"
- W24 Column: "Drag"
- W25 Column note: "Worst / average frame, ms"
- W26 Benchmark count (sample): "12 runs"
- W27 Pager note: "50 per page"
- W28 Backup row name: "Nightly file copy"
- W29 Schedule: "Every night"
- W30 Backup warning pill: "Older than its schedule"
- W31 Backup row label: "Finished"
- W32 Backup row label: "Size"
- W33 Backup row label: "Copied to"
- W34 Backup row name: "Weekly database dump"
- W35 Schedule: "Every Sunday"
- W36 Restore drill result: "Failed"
- W37 Restore drill label: "Ran"
- W38 Button: "Run benchmark"
- W39 Benchmark history empty: "No benchmark runs yet."

## Sample data (not a decision)
"0:14"; "Nov 11, 3:20 PM"; "Mac · Chrome"; "0.7.2"; "14"; "9"; "15"; "10"; "22"; "11"; "Nov 9, 2:14 AM"; "41.8 GB"; "Backblaze B2 · ezd-files"; "Nov 9, 3:02 AM"; "1.2 GB"; "Backblaze B2 · ezd-db"; "Nov 2, 4:00 AM".
