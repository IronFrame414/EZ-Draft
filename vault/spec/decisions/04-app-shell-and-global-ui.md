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
| Q-0206 | 2026-10-20 | The holder's unsaved changes stay on their device as a draft and they are told; the lock still releases. (Round 2) |
| Q-0208 | 2026-10-20 | Wording (Josh): "For design and planning only. All calculations and codes must be verified by the user and a licensed professional in the project's jurisdiction." Shown on every screen; not printed on sheets. (Round 2) |
| Q-0213 | 2026-10-20 | Link on or off, who it was sent to, expiry date, Copy link, Resend. (Round 2) |
| Q-0214 | 2026-10-20 | Empty list: one short line plus the main button (for example "No projects yet" with New project). Failed load: inline message with Retry, never a blank screen. No permission: controls are hidden, not greyed; a page opened without access says "You don't have access to this. Ask your supervisor." Office editor offline: banner "Offline. Changes are saved on this device and will sync." and work continues. (Round 2) |
| Q-0229 | 2026-10-20 | Disclaimer (Q-0208 wording) is one small grey line at the bottom of every page: in the editor status bar; a footer line on Projects, Settings, sign-in, terms, the client link and phone screens. Never on sheets or PDFs. Spanish on phone screens for Spanish users (Q-0030). (spec-check 1; Josh in chat, relayed by session "Spec restructure and reading map") |
| Q-0265 | 2026-10-24 | (b): with unsaved edits, the browser Back or Forward button shows the same Save / Discard / Cancel prompt as the app (EZD-103). |
| Q-0302 | 2026-10-24 | (c) "draft": unsaved Settings edits are kept as a draft on the device and restored with a notice on return, so no way of leaving loses them (EZD-103). |
| Q-0272 | 2026-10-24 | (a): the disclaimer line is cut with "…" in a narrow office status bar and shows in full on hover and to screen readers; readouts keep their room. |
| Q-0273 | 2026-10-24 | (b): add an app not-found page that carries the disclaimer line and the text "Page not found." |
| Q-0273 wording | 2026-10-24 | Wording (EZD-136): "Page not found." (Josh approved with Q-0273 (b)). |
