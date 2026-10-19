# Phase 0 · Questions for Josh

Written 2026-10-19 by the orchestrator (`questions 0` unit, PROCESS.md section 7; unattended launcher run, Q-0129). Overwrites the earlier file of the same day (commit 9cd2ae1). New since then: one agent answer to confirm (Q-0155, section 2), the three EZD-010 parts in section 3 (no wording) and two rule candidates (L-010, L-011). Answer by number, in any form ("section 2 confirmed", "section 3 approved", "section 4: 1 ratify, 2 reject"). Recommendation first in every item. Everything in sections 2 to 4 stands as written until you change it.

Q-0089 (storage limit) stays open for a later phase and is not asked here.

## 1. Decisions needed

None. No Phase 0 question is waiting on you.

## 2. Agent answers to confirm

1. **Q-0154** (EZD-008a): how the sender name is written into the email's From line when a company name has a comma, period or similar mark (e.g. "Smith, Jones LLC"). Answer (code-reviewer): put quote marks around the name in that case, as the email standard requires, so mail apps do not misread it as two addresses; names without those marks, like "Worth Properties via EZ Draft", go out exactly as before, and mail apps never show the quote marks. Source: RFC 5322 sections 3.2.3 and 3.2.4; your Q-0036 answer. **Confirm or override.**
2. **Q-0155** (EZD-010, design tokens): the planner found the design-tokens ticket too big for one ticket (about 30 files, 12 tests). Answer (orchestrator): split it into three tickets built in order: EZD-010a (the color, corner and size values in one file, plus a gate check that refuses a color written anywhere else), EZD-010b (the icons as one small picture file plus an icon component) and EZD-010c (the two fonts served from our own server, and a developer page showing every value, which is "not found" on the live address). Nothing about what the app looks like changes; every ticket that waited on EZD-010 now waits on all three. Source: PROCESS.md section 6 Ticket size; vault/plans/EZD-010.md Split proposal; same flow as Q-0152. **Confirm or override.**

## 3. Proposed wording

Not answered yet: Josh was on mobile on 2026-10-19; raise again when he is at the desktop.

No new screen text for clients or users. Items 1 to 55 carry over unanswered; EZD-010a, 010b and 010c add none. `<…>` is filled in at run time. Reply "section 3 approved" or edit any line.

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

## 4. Rule candidates

Josh ratified L-001 to L-007 in chat on 2026-10-19. Still open:

1. **L-008** (test-author; from EZD-005a): a test that matches text in generated output (types, lockfiles, CLI output) does not anchor on line starts or assume formatting; it bounds the key on both sides. **Recommend: ratify.** A line-start match missed four of five table names in the generated types file because the Supabase CLI puts a key after the previous closing brace on the same line, which cost a structural repair.
2. **L-009** (planner; from EZD-006): SQL that a plan fixes as contract text (policy templates, function signatures a test copies) is run once on the pinned local database by the planner, or marked "confirm on pinned version" for the test-author to check. **Recommend: ratify.** The EZD-006 policy template was written from memory, did not run on the pinned PostgreSQL, failed the builder's first migration and needed a structural repair.
3. **L-010** (builder; from EZD-008a): when a plan says a value "must be assignable" to a contract type, the builder assigns it to a variable of that type with no `as` cast, and reports a type error instead of casting it away. **Recommend: ratify.** The builder's `as unknown as` cast switched off the only check that the real Resend library fits the email helper's contract.
4. **L-011** (test-author; from EZD-008b): a test that checks what happens when a file is loaded loads a fresh copy of it (a unique import name or a separate process), never one an earlier test in the same file already loaded. **Recommend: ratify.** The "importing the live email check sends nothing" test reused a cached copy, so it would have passed even with the safety guard removed; the test review caught it.
