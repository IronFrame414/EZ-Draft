# Decisions · Non-functional: performance targets, operations, releases, backups, error reporting, GPU

Josh's answers during the build, for this spec area. Each overrides the spec text and any Round 24–26 row that names the same thing. The question, the asker and the full source are in `vault/questions/QUESTIONS.md`; new answers are appended here by the orchestrator with their Q-ID.

| Q-ID | Date | Answer |
| --- | --- | --- |
| Q-0018 | 2026-10-11 | GPU: the build PC has Intel UHD Graphics only (no dedicated GPU memory). No local GPU rendering; all renders use cloud providers. (Whether Phase 11 still builds the local worker protocol is open as Q-0020.) |
| Q-0069 | 2026-10-12 | (a): the planner's draft in vault/plans/EZD-024.md Approach Step 8. |
| Q-0070 | 2026-10-12 | (a): a new free Sentry organization with one ezdraft project; Sentry's own new-issue emails turned off. |
| Q-0074 | 2026-10-12 | (a): Backblaze B2. Also: the system limits how much storage each company can use (Q-0089). |
| Q-0075 | 2026-10-12 | (c), Josh's own rule: replaced or deleted file versions kept 90 days off-site, weekly database dumps kept 13 weeks. Users are regularly prompted to delete older data, and each company has a storage limit (Q-0089). |
| Q-0020 | 2026-10-12 | Build it: Phase 11 still builds the local render worker protocol (R18 stands), for a future GPU machine. |
| Q-0097 | 2026-10-12 | The Surface drawing-speed run (EZD-027) is judged as a tablet: 30 fps, 95th-percentile frame ≤ 34.33 ms, no frame over 100 ms. |
| Q-0106 | 2026-10-12 | Releases are automatic when Josh merges the phase PR into main: a GitHub Actions workflow backs up the production database, applies migrations and makes the build live, stopping with the live site unchanged on any failure. Production secrets live only in a GitHub environment limited to main; agents never see them. Josh's merge is the only approval. |
| Q-0107 | 2026-10-12 | Migrations reach the cloud dev database automatically on every push to develop that changes them (overrides Q-0023). |
| Q-0111 | 2026-10-12 | Backups and release dumps are locked against deletion for at least 91 days (B2 Object Lock, Governance mode). |
| Q-0211 | 2026-10-20 | Owner only. Shows the last backup, failed background jobs and render usage. (Round 2) |
| Q-0035 (prep C11) | 2026-10-20 | Applies Q-0035 to `11-non-functional-requirements.md:77`: crew sign-in links and codes have no Copy link fallback; sign-in emails never show their link on screen. The one exception is the invite: the sender and the owner see the invite link and its 6-digit code (Q-0187, Q-0216). |
| Q-0230 | 2026-10-20 | Terms of service: a link on the sign-in page only in v1, no "I agree" step. Claude drafts placeholder terms with the two required statements; Josh or the attorney replaces them later. (spec-check 1; Josh in chat, relayed by session "Spec restructure and reading map") |
| Q-0262 | 2026-10-24 | (a): the `supabase db dump` and `supabase db push` `--db-url` password exposure gets its own phase 0 fix ticket, EZD-042, after EZD-041 (psql only). |
| Q-0267 | 2026-10-24 | A warning the database logs during normal use is fixed, not accepted: the SET LOCAL (25P01) warning at sign-in gets fix ticket EZD-141 in phase 1. |
| Q-0293 | 2026-10-24 | (a): the Surface field checks hold the tablet target of 30 fps (as the EZD-027 verdict, Q-0097 (a)). |
| Q-0294 | 2026-10-24 | (a): the slice 28 step is reworded to the Surface: the walk joystick must work on the Surface touch screen too (EZD-1003 planner). |
| Q-0089 | 2026-10-28 | One cap for all of a company's stored data: 100 GB. Every office user is reminded at 80%, 90% and 100%. At 100% the company is blocked from storing more; files already stored can still be opened, exported and sent (R-032 Option B behaviour, limit and reminders as Josh set them). Sent files are no longer permanent (reverses R24 #4a and 11 Data retention "Sent versions ... are permanent"): a company may download them, delete them for good, or keep them on EZ Draft within its limit; this needs a ticket that removes the sent-file lock (`sent_files_soft_delete`, EZD-025) and updates the spec, numbered when the storage-limit work is planned. The Supabase spend cap is decided at launch, when the production project is created (Q-0113). |
