# Needs from Josh

Things no agent can produce. Copied from `tickets/README.md`; when an item arrives, note it in `questions/QUESTIONS.md` (Q-0003 for accounts) and the orchestrator unblocks the tickets that wait on it.

Phase 0 passes on the local Supabase and the stub email provider. Only EZD-003 and the cloud steps of EZD-004 and EZD-008 wait for accounts and keys.

| Item | Needed by | Without it |
| --- | --- | --- |
| Accounts and keys: GitHub repository with Actions for CI, Vercel, Supabase (dev and prod), DNS for the subdomain, email provider, Claude API key, image-model API keys, Sentry, a storage bucket at a second provider for backups | EZD-002, EZD-003, EZD-004, EZD-008, EZD-1103 | EZD-003, the cloud part of EZD-004 and live email in EZD-008 wait. EZD-1103 and every AI ticket do not wait: they are built and tested on the stub providers from EZD-021 |
| A real Polycam export (layered DXF + GLB) from one job | EZD-016, EZD-302, EZD-303 | Detection is built against a synthetic file and may miss real layer names |
| One vector PDF plan, one scanned PDF plan, one supplier kitchen vector PDF | EZD-304, EZD-305, EZD-915 | Built against synthetic files |
| 2–3 architect DXFs | EZD-029, EZD-901, EZD-1702 | The benchmark uses a generated DXF |
| Supplier 2020 sample (DXF + order report) | EZD-916, EZD-918 | Built against the synthetic report committed in EZD-916; re-checked with the real sample |
| A hand load calc for one sample house, and a hand material count for one kitchen | EZD-607, EZD-1611 | Engines are tested only against textbook examples |
| A past kitchen's cabinet order | Phase 4 field check | Field check waits |
| EZ Binder side of the contract (EZD-019): job, customer and user endpoints, shared sign-on, webhook receiver, mark CO approved, model viewer, field pack tab | Field checks of Phases 1, 10, 13, 14 | EZ Draft runs against the stub |
| iPad, iPhone, keyboard-mode laser | Field checks | Automated tests use device emulation and typed keystrokes |
| The GPU machine for the local render worker, and the choice of model to run on it | EZD-1104 follow-up | The worker runs its stub runner; renders use the cloud API |
| Mockups for screens that have none (New project wizard, Takeoff, Versions and cleanup sheet, Field measurements review, Field tasks, Settings 15a to 15h, phone 3D viewer) | EZD-118, EZD-122, EZD-123, EZD-1413, EZD-1420, EZD-1613, EZD-1013 and the settings tickets | Built from the spec text (rule 6) |
| Docker Desktop on the Windows build machine (the local Supabase used by agent test runs needs it) | EZD-004, EZD-006, EZD-016 | No local database; agent test runs cannot start |
| Each code rule checked against the adopted code text, with 9th Edition section numbers | EZD-1710 | Rules are built from the tables in Calculations; their warnings carry the “not yet verified” tag |
| Answer to R26 R2: which money numbers Crew and Foreman may see | EZD-133 | Answered: two permissions, See company costs and See sell prices (R26 R2) |
| Terms of service text | EZD-1707 | The page ships with placeholder text |
| A real vendor cabinet line | EZD-401, EZD-408 | The generic seed line is used |
| Mockup exports of the 22 Studio boards in the vault | Every screen ticket | QA checks against the spec text only |
