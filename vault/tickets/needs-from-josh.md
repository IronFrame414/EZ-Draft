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
| Mockups for screens that had none: supplied Oct 11, 2026 (S01b, S15a–S15h, S17c, S19–S22 in `vault/mockups`) | EZD-118, EZD-122, EZD-123, EZD-1013, EZD-1413, EZD-1420, EZD-1613 and the settings tickets | Done |
| Docker Desktop on the Windows build machine (the local Supabase used by agent test runs needs it) | EZD-004, EZD-006, EZD-016 | No local database; agent test runs cannot start |
| Each code rule checked against the adopted code text, with 9th Edition section numbers | EZD-1710 | Rules are built from the tables in Calculations; their warnings carry the “not yet verified” tag |
| Answer to R26 R2: which money numbers Crew and Foreman may see | EZD-133 | Answered: two permissions, See company costs and See sell prices (R26 R2) |
| Terms of service text | EZD-1707 | The page ships with placeholder text |
| A real vendor cabinet line | EZD-401, EZD-408 | The generic seed line is used |
| Mockup exports of the 36 Studio boards in the vault | Every screen ticket | Done |

**Added at Phase 0 planning (Oct 11, 2026).** Status of the account row above: Docker Desktop installed; Vercel, Supabase and Resend accounts exist, shared with EZ Binder (Q-0003). Still to come: Claude API key, image-model API keys, Sentry, backup bucket at a second provider. The GitHub repository exists (`IronFrame414/EZ-Draft`, public). DNS record and Vercel domain: done (Q-0123, Oct 18, 2026).

| Item | Needed by | Without it |
| --- | --- | --- |
| A few job photos (how they are handled in a public repo: Q-0065) | EZD-016b | Photo tests use synthetic images |
| A revised version of one of the architect DXFs (same drawing, a later revision) | EZD-016b, 08 Import and export (revised architect DXF) | Revision compare is tested on a synthetic pair |
| Render trial live run: 5 room images and instructions (Q-0082, Q-0083), keys for the three image providers (Q-0076), a spending cap typed at the run, and the next-day billed totals | EZD-031 field check, R21 provider pick (Q-0016) | The spike closes on the stub run; the provider pick waits |
| iPad drawing-speed run on Josh's iPad over the office network (EZD-027) | EZD-027 note, architecture checkpoint before Phase 2 | Phase 2 cannot start (Q-0064) |
| One-time install on the build PC: Playwright browsers `pnpm exec playwright install chromium webkit` (agents can run it once Josh approves) | EZD-007, EZD-016a | Browser tests cannot run |
| Docker Desktop running whenever a build session runs | EZD-004 onward | Every check fails at the database step |
| Vercel Ignored Build Step: DONE 2026-10-19 (Settings → Build and Deployment → Ignored Build Step → Custom, the PROCESS.md section 12 command; Q-0116 (a)) | — | — |
| Vercel "Auto-assign Custom Production Domains": DONE 2026-10-19, off (Settings → Environments → Production → Branch Tracking; EZD-003 Step 5.2; Q-0123). Never turn it back on. ENABLE_EXPERIMENTAL_COREPACK=1 also added for Production and Preview (EZD-003 Step 5.3). | — | — |
| Database API gate secret (Q-0087): generate one secret and store it in each cloud Supabase project and in Vercel, per the EZD-006 runbook step | EZD-006 cloud setup, first release | The cloud app refuses all data requests (fails closed) |
