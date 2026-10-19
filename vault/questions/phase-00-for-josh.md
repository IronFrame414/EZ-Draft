# Phase 0 · Questions for Josh

Written 2026-10-19 by the orchestrator (`questions 0` unit, PROCESS.md section 7). This replaces the earlier file of the same day (commit eb6562f). New since then: two agent answers on the release checks (Q-0159, Q-0160), three earlier agent answers not yet in this file (Q-0156, Q-0157, Q-0158), wording items 56 to 88 for the release tickets EZD-023a to 023e, and six rule candidates (L-009 to L-014). Answer by number, in any form ("section 2 confirmed", "section 3 approved", "section 4 all ratify"). Every item gives the recommendation first. Everything in sections 2 to 4 stands as written until you change it.

Q-0089 (storage limit) stays open for a later phase and is not asked here.

## 1. Decisions needed

None. No Phase 0 question is waiting on you.

## 2. Agent answers to confirm

1. **Q-0154** (EZD-008a, built): how the sender name goes into the email's From line when a company name has a comma, period or similar mark (e.g. "Smith, Jones LLC"). Answer (code-reviewer): put quote marks around the name in that case, as the email standard requires, so mail apps do not read it as two addresses. Names without those marks, like "Worth Properties via EZ Draft", go out exactly as before, and mail apps never show the quote marks. Source: RFC 5322 sections 3.2.3 and 3.2.4; your Q-0036 answer. **Confirm or override.**
2. **Q-0155** (EZD-010, design tokens, built): the design-tokens ticket was too big for one ticket, so it was split into three built in order: EZD-010a (colors, corners and sizes, plus a gate check), EZD-010b (icons) and EZD-010c (fonts and a developer page). Nothing about how the app looks changed. Source: PROCESS.md section 6 Ticket size; vault/plans/EZD-010.md Split proposal. **Confirm or override.**
3. **Q-0156** (EZD-023a, built): the reviewers found holes in the check that stops a release from deleting or renaming database parts the live app still uses. Answer (orchestrator): make it stricter. Only something the live release never had counts as "new" and can be dropped. Two missed kinds of rename are now caught, and bad arguments are refused. Source: spec section 11 Operations (a release never drops what the previous release still reads). **Confirm or override.**
4. **Q-0157** (EZD-023b): the release ticket was too big, so it was split into four parts built in order. 023b covers the safety checks and the release name, 023c the Vercel checks, 023d the database copy, migrations and Worth Properties setup, and 023e going live, rollback, the workflow and your runbook. What the release does is unchanged. Source: PROCESS.md section 6 Ticket size; same as item 2. **Confirm or override.**
5. **Q-0158** (EZD-023e): the release workflow installs packages the same way the dev-database workflow already does (`pnpm install --frozen-lockfile`). The rebuild step for the Supabase tool is dropped, because no package is allowed to run install scripts (your Q-0140 answer) and that tool has none. Source: Q-0140 (a); `.github/workflows/supabase-dev.yml`. **Confirm or override.**
6. **Q-0159** (EZD-023c): before going live, the release checks Vercel's settings. Answer (code-reviewer): the release also refuses to run when the preview settings lack the sender address (`EMAIL_FROM`) or the database gate secret (`SUPABASE_API_GATE_SECRET`, once sign-in adds it). Without the first, a preview cannot send any email; without the second, nobody can sign in to a preview, so your phase field checks would fail. Source: Q-0113 (field checks run on the preview); `app/src/server/email/transport.ts` lines 23–24; `docs/runbook.md` step 10. **Confirm or override.**
7. **Q-0160** (EZD-023c): on previews, test emails go to a stand-in "outbox" that is kept in the server's memory, not sent. Answer (security-reviewer): that is fine for previews. Nothing in the app can read that outbox over the web, and sign-in emails never go through it. The release also refuses to run if the setting that would save those test emails to disk (`EMAIL_STUB_DIR`) is set on Vercel. Starting with invitations (EZD-105), the reviewers check that no screen or route ever exposes the outbox. Source: your Q-0041 answer (previews use the stand-in); `docs/architecture.md` ("never set on Vercel"); `app/src/server/email/test-harness/stub-transport.ts`. **Confirm or override.**

## 3. Proposed wording

Not answered yet (carried from the earlier file). No new screen text for clients or users; items 1 to 55 carry over, 56 to 88 are new (EZD-023a to 023e: developer and release-page text and your runbook section). `<…>` is filled in at run time. Reply "section 3 approved" or edit any line.

**EZD-001 · Repo and tooling** (already built; the product name from spec section 02)
1. Browser tab title: `EZ Draft`

**EZD-004a · Local Supabase and migrations in the gate** (developer text in gate logs)
2. When Docker is not running: `Local Supabase needs Docker running (start Docker Desktop).`

**EZD-004b · App reads the health row**
- No wording of its own. Its error message key `error.db_unavailable` shows "Can't reach the database. Try again in a minute.", already decided under Q-0086 (a) in EZD-026a.

**EZD-004c · Cloud dev migrations workflow**
3. GitHub Actions note when the secret is missing: `SUPABASE_DEV_DB_URL not set: cloud dev migrations wait for Josh`
4. `docs/runbook.md` section "Supabase cloud projects (EZD-004)": your eight steps (create `ezdraft-dev`, database password, Postgres version, lock the GitHub `dev` environment, add the secret, first run, app keys, production). Full text: vault/plans/EZD-004c.md section 6.

**EZD-000h · Usage meters, five-hour pause and weekly gate** (terminal, phone and vault-file text)
5. Status line, meters present: `5h 42% · week 63%`
6. Status line, no meters: `usage: no data`
7. `WINDOW_PAUSE.md`: `# Five-hour window pause` / `Written by scripts/run.mjs on <time>.` / `- Five-hour window: <pct>% used (pause at <pct>%)` / `- Resets at: <time>` / `- Resume at: <time>` / `The launcher starts no unit until the resume time, then deletes this file and continues (PROCESS.md section 11). A unit already running is not interrupted. Nothing is needed from Josh.`
8. `BUDGET_HOLD.md`: `# Budget hold` / `Written by scripts/run.mjs on <time>.` / `- Reason: <reason>` / `- Weekly window: <pct>% used (hold at <pct>%), resets <time>; source: <source>` / `- Five-hour window: <pct>% · Fable weekly: <pct>% or no meter` / `- Next unit when released: <unit>` / `No new ticket starts while this file exists; a ticket already in progress finishes. To continue (PROCESS.md section 11):` then the three `node scripts/budget.mjs` commands (`--hold-at <pct>`, `--until-reset`, `--api-until-reset`) / `Each removes this file. Then start node scripts/run.mjs again.`
9. Hold reason: `weekly usage reached the hold (<pct>%)`
10. Phone, weekly warning: `weekly usage at <pct>% (<source>); hold at <pct>%. Resets <YYYY-MM-DD HH:MM UTC>.`
11. Phone, hold: `budget hold: weekly usage at <pct>% (hold at <pct>%). In-progress ticket finishes; nothing new starts. See vault/handoff/BUDGET_HOLD.md.`
12. Launcher log, no meter: `no usage meter reading fresher than 20 minutes; gating on the dollar proxy (PROCESS.md section 11)`
13. Launcher log, pause: `five-hour window at <pct>%; paused until <time> (vault/handoff/WINDOW_PAUSE.md)`
14. Launcher log, Fable: `Fable weekly window at <pct>%: Fable dispatches use Opus 5.5 until <YYYY-MM-DD HH:MM UTC>`
15. `PROGRESS.md`: a `## Usage` section with `Source: <source>, read <time> UTC.` and a table Window / Used / Resets with rows Five-hour, Weekly, Fable weekly (`no meter` when there is none).
16. `budget.mjs` report: `Meters (<source>, read <time> UTC): five-hour <pct>% (resets <time>) · weekly <pct>% (resets <time>) · Fable <pct>% or no meter` and `Thresholds: pause <n>% · warn <n>% · hold <n>% · Fable fallback <n>%`
17. `budget.mjs --hold-at` bad value: `--hold-at needs a whole percent from 1 to 100`
18. `budget.mjs --raise`: `--raise was replaced by --hold-at <pct> (PROCESS.md section 11)`
19. `budget.mjs --hold-at` success: `hold set at <pct>% (was <pct>%)`

**EZD-000i · OAuth usage fallback**
20. Phone, sign-in refused: `usage endpoint refused the sign-in (<status>); usage polling paused until <YYYY-MM-DD HH:MM UTC>. Gating uses the statusline or the dollar proxy meanwhile. Check that Claude Code is signed in on this machine.`
21. Launcher log, 401 or 403: `OAuth usage poll: <status>; no poll until <time>`
22. Launcher log, 429: `OAuth usage poll: rate-limited (429, Retry-After <value or none>); next poll after <time>`
23. Launcher log, other failure: `OAuth usage poll failed (<status or network error>); next poll after <time>`
24. Launcher log, unreadable reply: `OAuth usage poll: response had no readable five-hour and weekly windows; next poll after <time>`
25. Launcher log, no token (once): `OAuth usage fallback off: no sign-in token in ~/.claude/.credentials.json or the Keychain; gating stays on the next source`
26. Launcher log, unexpected error: `OAuth usage poll error (<error name>)`
27. Probe lines (the builder's one-time check): `credential source: file|keychain|none`; `keychain service: <name> (found, credentials JSON | found, not the credentials JSON | not found)`; `HTTP status: <n>` (or `not requested (no token)`, `network error (<name>)`); `response keys: <keys>`; `window keys: <key>{<its keys>}; …`; `model-scoped weekly window: <key>` or `none found`; `token found in files under vault/, scripts/, .run/: none` or the file paths.
28. Shell guard, Keychain: `Printing a Keychain secret is not allowed (security with -w or -g, or dump-keychain -d). To check that an item exists, run security find-generic-password -s "<name>" without -w or -g (PA3 rule 8).`
29. Shell guard, sign-in file: `The Claude sign-in file is never read from the shell. Only test -f <path> or [ -f <path> ] may name it (PA3 rule 8).`

**EZD-000j · OAuth usage fallback reads `utilization`** (the probe's terminal output)
42. New probe line: `utilization: five_hour <v>, seven_day <v>` (`<v>` is a number or `none`). All other EZD-000i text is unchanged.

**EZD-005a · Tenancy tables**
- No wording (no user-visible text).

**EZD-005b · Tenant 1 and Josh: seed and cloud setup file** (the setup file's comments and your `docs/runbook.md` steps, section "Tenant 1 setup"; the `ezd_bootstrap_*` codes are not wording)
30. `supabase/bootstrap/tenant-1.sql` comment line 1: `-- One-time setup of Worth Properties (company 1) and its owner account in a cloud project. Steps: docs/runbook.md, "Tenant 1 setup".`
31. Same file, comment line 2: `-- Replace only the placeholder text on the owner_email line below with the email you sign in with. Keep the quote marks.`
32. Runbook intro: Worth Properties is company 1 in EZ Draft and you are its owner. On the local test database this happens by itself every time it is reset. Each cloud database gets it once from the file `supabase/bootstrap/tenant-1.sql`. The file holds no email; you type yours in only where it runs.
33. Dev heading: **Dev (`ezdraft-dev`), once:**
34. Step 1: **Wait for the migrations.** The "Supabase dev migrations" workflow (section "Supabase cloud projects", step 6) must have run green on `develop` after this setup reached `develop`. If it has not, open Actions, Supabase dev migrations, Run workflow, branch `develop`.
35. Step 2: **Copy the file.** Open `supabase/bootstrap/tenant-1.sql` on GitHub and copy all of it.
36. Step 3: **Paste it.** In Supabase open the `ezdraft-dev` project, then SQL Editor, New query, and paste.
37. Step 4: **Type your email.** Replace `PASTE-YOUR-EMAIL-HERE` with the email you sign in with. Keep the quote marks around it.
38. Step 5: **Run it.** Press Run. "Success" or `ezd_bootstrap_done` means Worth Properties and your owner account now exist. `ezd_bootstrap_email_missing` means the email was not typed in correctly; fix it and run again. `ezd_bootstrap_already_done` means this project is already set up, and nothing changed.
39. Step 6: **Keep the email out of the repo.** Never paste the edited text into chat, a ticket or the repo.
40. Production heading and step 7: **Production (`ezdraft-prod`): nothing to paste.** Production does not exist until launch. When you set it up from the Before-launch checklist, add the email you sign in with as the secret `TENANT1_OWNER_EMAIL` in the GitHub environment `release`. The first real release then creates Worth Properties and your owner account. If company 1 is already there, the release skips this. Do not paste the file into production.
41. Step 8: After that first release, delete `TENANT1_OWNER_EMAIL` from the `release` environment. Until you do, every release summary shows the notice `owner_email_secret_unused`.

**EZD-008b · Email setup** (your `docs/runbook.md` steps and the live check's terminal text; the check email goes only to the address you type)
43. Runbook section "Email (EZD-008)": your seven steps (check that `ezcontractorbinder.com` shows Verified in Resend; no DNS change at Spaceship; create the `ezdraft-production` sending key; Vercel Production values `EMAIL_TRANSPORT` = `resend`, `EMAIL_FROM` = `EZ Draft <no-reply@ezcontractorbinder.com>`, `RESEND_API_KEY`; the live check from a terminal; Supabase sign-in emails through Resend SMTP with sender name `EZ Draft`; company reply address from Settings, Company, Contact). Full text: vault/plans/EZD-008b.md section 6.
44. Check email subject: `EZ Draft email check`
45. Check email text: `This is a test email from EZ Draft. If it is in your inbox and not in spam, email is set up.` then the link
46. Check email link label: `Open EZ Draft`
47. Success: `Sent. Resend message id: <id>. Check your inbox (docs/runbook.md, Email, step 5).`
48. In CI: `send-test.mjs does not run in CI or the gate. Run it by hand (docs/runbook.md, Email, step 5).`
49. No or unknown argument: `Usage: node scripts/email/send-test.mjs --to <your email address>`
50. Bad address: `--to must be one email address.`
51. No key: `RESEND_API_KEY is not set in this terminal (docs/runbook.md, Email, step 5).`
52. No sender: `EMAIL_FROM is not set in this terminal (docs/runbook.md, Email, step 5).`
53. Network failure: `Could not reach Resend: <error name>.`
54. Refused: `Resend refused the email: HTTP <status> <error name if given>.`
55. No id: `Resend answered without a message id (HTTP <status>).`

**EZD-008a · Send helper and transports**
- No wording of its own. Company emails show `<Company> via EZ Draft` (your Q-0036 answer); recipients' text comes from later tickets.

**EZD-010a · Token files and check C10**
- No wording (nothing on screen; the gate message is developer text). Plan section 6.

**EZD-010b · Icon sprite and Icon component**
- No wording (the icon component shows no text). Plan section 6.

**EZD-010c · Fonts, root layout and token test page**
- No wording. The `/dev/tokens` page shows token names and values for developers and is "not found" on the live address. Plan section 6.

**EZD-023a · Release safety: migration check** (developer text in gate logs; already built)
56. No release yet: `no release tag yet: nothing is released`
57. Tags not fetched locally: `tags_not_fetched: could not fetch release tags from origin; checking against local tags`
58. Test-only flag: `tags_not_fetched (--no-fetch)`
59. M0: `[M0] origin: release tags could not be fetched`
60. M1: `[M1] <file>: <object> is dropped or renamed but <base tag> still reads it (retire it in supabase/retired.json and release that first)`
61. M2: `[M2] <file>: released migration changed` / `[M2] <file>: released migration removed`
62. M3: `[M3] <file>: version is not newer than the newest released migration <version>`
63. M4: `[M4] <file>: cannot be checked: drop with cascade` / `[M4] <file>: cannot be checked: drop or rename inside a string or function body`
64. M5: `[M5] supabase/retired.json: <missing | not valid JSON | entry <n>: <reason>>`
65. Bad `--base`: `invalid_ref: --base must be a release tag (phase-N or phase-N.k)`
66. Bad `--head`: `invalid_ref: --head must be a release tag or a commit sha (7 to 40 lower-case hex characters)`
67. Summary: `migration check passed against <base tag>` / `migration check failed against <base tag>: <n> violation(s)`

**EZD-023b · Release guards and naming** (GitHub Actions job summary on the Release run page)
68. Before launch: `production not configured — nothing released`
69. Any other stop in steps 1–8: `release stopped: <code> — nothing changed`
70. Missing secrets (second line): `missing in the release environment: <NAME>, <NAME>`

**EZD-023c · Vercel build and environment checks** (same job summary)
71. One line per wrong Vercel value: `Vercel value problem: <code> <NAME> (<target>)`, e.g. `Vercel value problem: missing EMAIL_FROM (preview)` (also covers the new Q-0159 and Q-0160 checks)
72. `notice vercel_token_expiring: the Vercel token expires on <YYYY-MM-DD>; make a new one and replace VERCEL_TOKEN in the release environment`
73. `notice vercel_token_no_expiry: the Vercel token never expires; make one that expires in 90 days`
74. `notice vercel_token_expiry_unknown: could not read when the Vercel token expires`

**EZD-023d · Dump, migrations and tenant 1** (same job summary)
75. `database dump saved: <prefix>` (e.g. `database dump saved: releases/phase-1-20261102T140000Z/`)
76. `release stopped: dump_upload_failed — the database and the live site are unchanged; an incomplete dump may be in <prefix>`
77. `release stopped: migrate_failed — the live site is unchanged; the database may be partly updated; the dump from before this release is in <prefix>`
78. `release stopped: bootstrap_failed — the live site is unchanged; the database may be partly updated; the dump from before this release is in <prefix>`
79. `notice owner_email_secret_unused: tenant 1 already exists; delete TENANT1_OWNER_EMAIL from the release environment`
80. Interim line, gone once EZD-023e is built: `release stopped: not_built — the dump and migrations ran; nothing went live`

**EZD-023e · Go live, rollback, workflow and docs** (same job summary, and your runbook section)
81. `released <tag> from pull request #<n>` (e.g. `released phase-1 from pull request #12`)
82. `release stopped: tag_failed — the live site is unchanged; the database has this release's migrations; the dump from before this release is in <prefix>`
83. `release stopped: promote_failed — the live site is unchanged; the database has this release's migrations and the tag <tag> was made; press Re-run jobs to try again`
84. `release failed: verify_failed — the checks after going live failed, so the previous build was put back; the database keeps this release's migrations; to go back further, use Instant Rollback (docs/runbook.md, Rollback)`
85. `release failed: verify_failed — the checks after going live failed and there was no earlier build to put back, so this build stays live; see docs/runbook.md, Rollback`
86. `release failed: verify_failed — the checks after going live failed and putting the previous build back also failed; use Instant Rollback in Vercel now (docs/runbook.md, Rollback)`
87. `notice previous_deployment_unknown: Vercel did not report the build that was live before this release, so an automatic rollback would have nothing to put back; tell the orchestrator, and use Instant Rollback by hand if this release has a problem`
88. `docs/runbook.md` section "Environments and releases (EZD-023)": how a merge into `main` becomes live; Until launch; the Go-live switch (Auto-assign stays off); your eleven GitHub and account settings (agent account, build computer, `main`, `develop` and tag rulesets, Actions settings, secret scanning, the `dev` and `release` environments, leave Vercel's `Production` alone); the twelve-item Before launch checklist (production database, Vercel protection and values, Vercel token, Sentry, Backblaze, `release` secrets, first release, token hook and gate hash, delete `TENANT1_OWNER_EMAIL`, token every 90 days); Each release; First real release; Rollback (automatic, by hand, leave the database alone, check, fix forward, stop if data was damaged); Dumps; Safety net. Full text: vault/plans/EZD-023e.md section 6.

## 4. Rule candidates

Each rule came from one mistake that cost a review round or a repair. Recommendation for all six: **ratify**. Each costs one extra look during planning or testing and prevents a repeat.

1. **L-009** (planner; from EZD-006): SQL that a plan fixes as exact text for a test is run once on the pinned local database first, or marked "confirm on pinned version". Recommend **ratify**: the policy text in EZD-006 did not run on our database version and needed a test repair.
2. **L-010** (builder; from EZD-008a): when a plan says a value "must fit" a type, the builder assigns it with no forced cast, and reports a type error instead of hiding it. Recommend **ratify**: the cast switched off the only proof that the email library fits our code.
3. **L-011** (test-author; from EZD-008b): a test that checks "loading this file does nothing" loads a fresh copy, never one an earlier test already loaded. Recommend **ratify**: the test passed even with the guard removed, so it proved nothing.
4. **L-012** (planner and builder; from EZD-010b): every "refuses" or "fails" rule in a plan has a test with a bad input, and the builder builds every rule in the plan, not only the tested ones. Recommend **ratify**: an untested refusal cost an extra build round.
5. **L-013** (planner; from EZD-010c): a plan that says "design tokens only" names the token for each kind of value it covers, or limits the rule to kinds that have tokens. Recommend **ratify**: the plan demanded spacing tokens that do not exist.
6. **L-014** (planner; from EZD-023a): an exception for "new" things means absent from the last release, never "a create statement exists". Recommend **ratify**: the looser version would have let a release delete a live table; both reviewers failed it.
