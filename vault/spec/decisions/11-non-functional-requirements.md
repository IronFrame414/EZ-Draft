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
