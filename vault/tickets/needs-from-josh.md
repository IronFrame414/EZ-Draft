# Needs from Josh

Things no agent can produce. Copied from `tickets/README.md`; when an item arrives, note it in `questions/QUESTIONS.md` (Q-0003 for accounts) and the orchestrator unblocks the tickets that wait on it.

Phase 0 passes on the local Supabase and the stub email provider. Only EZD-003 and the cloud steps of EZD-004 and EZD-008 wait for accounts and keys.

## Josh's to-do list (kept current by the orchestrator; newest status 2026-10-20)

Every session that tells Josh he must do something adds it here, and ticks it off when he confirms it is done. The tables below are the full record.

**Before the Phase 0 gate (the preview sign-in needs these)**
- [x] Say yes or no to the install fix (yes, 2026-10-20): the GitHub Actions package install fails (pnpm minimum-release-age policy), so the dev migrations workflow never ran and CI will likely fail on the Phase 0 PR.
- [x] GitHub: `main` ruleset requires the check `gate` (done and verified 2026-10-20).
- [x] (Josh 2026-10-20: set up with another session's walkthrough; assumed right) Supabase: confirm `ezdraft-dev` exists in EZ Binder's organization and that the GitHub `dev` secret `SUPABASE_DEV_DB_URL` (added 2026-10-12) points to it; if unsure, recreate per docs/runbook.md "Supabase cloud projects" steps 1–5.
- [x] Dev migrations ran on `develop` (2026-10-21, run 39524122587, 20 migrations).
- [ ] (2026-10-21: hooks, sign-in settings and templates done; still open: the API gate secret, runbook step 10) Supabase `ezdraft-dev` (real name `ez-draft`, org Iron Frame): Custom Access Token hook and Before User Created hook on (runbook steps 9 and Sign-in 5); API gate secret (runbook step 10; the orchestrator runs the generate command, you paste); sign-in settings (runbook Sign-in steps 1–4, 6).
- [x] (done 2026-10-21) Tenant 1: paste supabase/bootstrap/tenant-1.sql into the `ezdraft-dev` SQL Editor with your email (runbook "Tenant 1 setup").
- [ ] Vercel Preview keys for the dev project (EZD-023b's setup).
- [x] Answer Q-0175 and sections 1–4 of vault/questions/phase-00-for-josh.md (2026-10-20: Q-0175 (b), rest confirmed).
- [ ] Q-0241: pick the captcha service (Cloudflare Turnstile recommended, or hCaptcha), create the account, and give the site key and secret before launch (EZD-034).
- [x] (done 2026-10-21; run 39524122587 applied 20 migrations) Fix the GitHub `dev` secret `SUPABASE_DEV_DB_URL`: the dev migrations run (39523407556) failed with "failed to parse connection string"; paste the Session pooler string with the password filled in and no brackets, then tell the orchestrator to re-run it.
- [ ] Supabase `ezdraft-dev` Site URL and redirect list (runbook Sign-in step 1), once the Phase 0 PR has a preview address.
- [x] Confirm or revert the fix-mode changes (confirmed 2026-10-20) Q-0218 (spec restructure, re-cut, reading map), Q-0221 (gate phase tests), Q-0233 (launcher waits instead of stopping).

**Before Phase 3**
- [ ] iPad drawing-speed run on your iPad over the office network (EZD-027 spike; architecture checkpoint).

**Later (not blocking now)**
- [ ] Q-0237: payment provider, plans and prices for charging other companies (before phase 53).
- [ ] Q-0089: storage limits (tabled).
- [ ] Accounts and keys: Claude API key, image-model API keys, Sentry, backup bucket at a second provider.
- [ ] Terms of service text (EZD-1707 ships placeholder text until then).
- [ ] Sample files: a real Polycam export (DXF + GLB), a vector PDF plan, a scanned PDF plan, a supplier kitchen PDF, 2–3 architect DXFs plus a later revision of one, a supplier 2020 sample, a few job photos.
- [ ] A hand load calc for one house and a hand material count for one kitchen; a past kitchen's cabinet order; a real vendor cabinet line.
- [ ] Render trial live run (5 room images, provider keys, spending cap); the GPU machine and model for the local render worker.
- [ ] Each code rule checked against the adopted code text (Q-0001, EZD-1710).
- [ ] Before-launch checklist (EZD-003 stays blocked until then).

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
| GitHub `main` ruleset: add "Require status checks to pass" with the check `gate` (Settings → Rules → Rulesets → the `main` ruleset; PROCESS.md section 12; Q-0144) | Phase 0 PR (EZD-002 CI must block a red merge) | A red CI run would not block the merge into `main` |
| Supabase cloud dev project and secret (EZD-004c; docs/runbook.md "Supabase cloud projects (EZD-004)" items 1–6): (1) create `ezdraft-dev` in EZ Binder's Supabase organization, East US (North Virginia), never one of EZ Binder's projects, no `ezdraft-prod` yet; (2) new password, letters and digits only, 20+ characters, used nowhere else, made-up data only; (3) tell the orchestrator the project's Postgres version (Project Settings → Infrastructure); (4) GitHub Settings → Environments → New environment `dev`, deployment branch `develop` only, admin bypass off; (5) then in `dev` add environment secret `SUPABASE_DEV_DB_URL` = the Session pooler connection string with the password filled in (never a repository secret); (6) after the Phase 0 merge: Actions → Supabase dev migrations → Run workflow on `develop`; a green run noting "SUPABASE_DEV_DB_URL not set" means step 5 is not done | EZD-004c field check O1 (AC-EZD-004c-3), preview deploys on the dev database (EZD-023b) | The workflow runs green and changes nothing; the cloud dev database stays empty |
| Tenant 1 setup in the cloud (EZD-005b; docs/runbook.md "Tenant 1 setup (EZD-005)" steps 1–8). Dev (`ezdraft-dev`), once: (1) wait for the "Supabase dev migrations" workflow to run green on `develop` after this setup reached `develop` (or Actions → Supabase dev migrations → Run workflow, branch `develop`); (2) open `supabase/bootstrap/tenant-1.sql` on GitHub and copy all of it; (3) in Supabase open `ezdraft-dev`, SQL Editor, New query, paste; (4) replace `PASTE-YOUR-EMAIL-HERE` with the email you sign in with, keep the quote marks; (5) press Run: "Success" or `ezd_bootstrap_done` = done, `ezd_bootstrap_email_missing` = fix the email and run again, `ezd_bootstrap_already_done` = already set up, nothing changed; (6) never paste the edited text into chat, a ticket or the repo. Production (`ezdraft-prod`), nothing to paste: (7) at launch add the secret `TENANT1_OWNER_EMAIL` in the GitHub environment `release`; the first real release creates Worth Properties and your owner account (skipped if company 1 exists); do not paste the file into production; (8) after that first release delete `TENANT1_OWNER_EMAIL`; until then every release summary shows `owner_email_secret_unused` | Sign-in on the dev database (EZD-007 field check, previews); EZD-023b first production release | The dev database has no company and no owner, so nobody can sign in on a preview |
| Sign-in setup in each cloud Supabase project (EZD-007a; docs/runbook.md "Sign-in (EZD-007)" steps 1–6), `ezdraft-dev` now, `ezdraft-prod` at launch. Step 5 first and before any real data: Authentication → Hooks → "Before User Created" → Postgres function `private.auth_before_user_created`, enabled (security-reviewer, EZD-007a review item 8) | EZD-007 field check, previews, first production release | Until step 5 is on, anyone with that project's public key can create a sign-in account for any email; until steps 1–4 are on, that project uses Supabase's default sign-in email, link times and session lengths |
