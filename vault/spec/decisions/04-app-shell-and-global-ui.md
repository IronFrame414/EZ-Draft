# Decisions · App shell and global UI: tokens, radii, header, states, shared wording

Josh's answers during the build, for this spec area. Each overrides the spec text and any Round 24–26 row that names the same thing. The question, the asker and the full source are in `vault/questions/QUESTIONS.md`; new answers are appended here by the orchestrator with their Q-ID.

| Q-ID | Date | Answer |
| --- | --- | --- |
| Q-0026 | 2026-10-12 | (a): spec oklch() values only, no sRGB fallback (follows Q-0013 (a), which sets Firefox 113+). |
| Q-0037 | 2026-10-12 | (b): the review pill text uses the mockups' darker amber (new token, about oklch(0.48 0.13 65)); the spec amber stays for the dot. |
| Q-0039 | 2026-10-12 | (c): no extra page or notice. Production shows whatever sign-in provides until Phase 1; the build-gate test signs in and opens /dev/shell. Josh is the only user and does not need an "under construction" screen. |
| Q-0040 | 2026-10-12 | (c): tooltip radius 6 px, as the approved mockups (board-cited exception token). [Josh answered with the batch file's letter (a); this is option (c) in the question above.] |
| Q-0051 | 2026-10-12 | (a): white lowercase "ez" on a cobalt square now; Josh may supply artwork later. |
| Q-0055 | 2026-10-12 | (a): on screens narrower than the desktop reference, Share, Export and Stop editing show only their icon (name as tooltip and for screen readers). |
| Q-0056 | 2026-10-12 | (a): "Editing is done on an iPad or a computer. Open this project there." (Spanish per Q-0030). |
| Q-0057 | 2026-10-12 | (b): dialog radius 14 px, as the approved mockups (board-cited exception token). [Josh answered with the batch file's letter (a); this is option (b) in the question above.] |
| Q-0058 | 2026-10-12 | (a): toasts clear after 5 seconds; toasts that need an answer stay until used or closed. |
| Q-0086 | 2026-10-12 | (a): "Can't reach the database. Try again in a minute." / "You don't have permission to do that." / "That job no longer exists." |
| Q-0098 | 2026-10-12 | Icon-only header buttons: Share uses `share`, Export uses `download`. |
| Q-0038 | 2026-10-18 | (b): a "More tools" button at the end of the rail opens a flyout with the tools that do not fit. New requirement: each user can set the order of the tools on the rail (placement: Q-0122). Grouping tools into categories is an idea only (BACKLOG.md). |
| Q-0122 | 2026-10-18 | (a): per-user tool order on the rail is built in Phase 2 inside EZD-230. |
| Q-0183 | 2026-10-20 | On screen as well as in the terms, on basically every page, along the lines of: "This is for design and planning purposes. These calculations and codes must be confirmed by the user and a licensed person within the jurisdiction." Exact wording and placement in Round 2. (Round 1; vault/spec/sections/00-job-stories.md) |
