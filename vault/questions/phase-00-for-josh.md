# Phase 0 · Questions for Josh

Written 2026-10-19 by the orchestrator (`questions 0` unit, PROCESS.md section 7; unattended launcher run, Q-0129). Overwrites the earlier file of the same day (commit 2773e48); nothing in it was answered yet, so its items carry over. Answer by number, in any form ("section 2 all confirmed except 4: …", "section 3 approved", "section 4: 1 ratify, 2 reject"). Recommendation first in every item. Only item 1.1 is waiting on you; everything in sections 2 to 4 stands as written until you change it.

Q-0089 (storage limit) stays open for a later phase and is not asked here.

## 1. Decisions needed

1. **Q-0138** · EZD-000i follow-up · escalated (adds a ticket, so it is a scope decision)
   - Context: the launcher pauses and holds work based on your Claude usage meters. The live usage reply from Anthropic names its numbers `utilization`, but the reader EZD-000i built looks for `used_percentage` (the status line's name, Q-0134 (a)), so whenever the status line is stale the launcher falls back to the dollar estimate instead of the real percentages.
   - Options: (a) add one small Phase 0 tooling ticket that reads `utilization` and checks from one live probe whether it is 0–1 or 0–100; (b) add it later, after Phase 0; (c) no ticket, keep the dollar fallback.
   - **Recommend (a)**: unattended runs then pause and hold on the real percentages, and the work is one function plus its test. EZD-001, which the original question named as the deadline, is already done, so the ticket would go in before the Phase 0 gate instead.

## 2. Agent answers to confirm

Every `answered-agent` row for Phase 0 not yet confirmed (24; items 22 to 24 are new). Each stands as written unless you override it. Reply "section 2: all confirmed" and name only the ones to change.

1. **Q-0126** · EZD-000b to EZD-000i, EZD-001 · orchestrator
   - Answer: (c) PILOT.md gains only the verification items a part reports as "not testable here"; items a part verified are not re-run.
   - Source: PA3-MECHANISMS.md rule 6; PROCESS.md section 15; PROCESS-EZDRAFT.md section 5.
2. **Q-0127** · EZD-000h · orchestrator
   - Answer: (a) the PROCESS-EZDRAFT.md budget line records your Q-0119 answer and the values you set (ceiling 300, cap 40; dollar proxy until EZD-000h).
   - Source: Q-0119; PROCESS.md section 11; PROCESS-EZDRAFT.md section 8.
3. **Q-0128** · EZD-000b to EZD-000i · orchestrator
   - Answer: (a) your PA3 write grant for the builder covers all eight parts through one exception in the path guard, removed after the last part merges.
   - Source: PA3-MECHANISMS.md rule 7; Q-0010; Q-0125.
4. **Q-0130** · EZD-000d · orchestrator
   - Answer: (a) the acceptance criteria come from the "Done when" text. The AC tool (`vault/tools/gen_acs.mjs`) had split the row at a `|` inside the text; it was fixed under the tooling-fix rule and re-run. EZD-000d has four ACs matching its "Done when"; no other ticket's ACs changed.
   - Source: vault/spec/acceptance-criteria.md header; vault/tools/gen_acs.mjs; PROCESS.md section 3 rule 19. Confirming also confirms the tool fix.
5. **Q-0131** · EZD-000e · orchestrator
   - Answer: (a) same fault and fix as item 4; EZD-000e has five ACs matching its "Done when".
   - Source: Q-0130.
6. **Q-0132** · EZD-000f · orchestrator
   - Answer: (a) PROCESS.md should name the hook that limits which agents may start helper agents. Process files change only with your yes, so the two edits below are made only if you confirm.
   - Proposed edit, section 14 Hooks, new line after guard-reads: "**guard-agents** (before Agent): the main session may start any agent; the planner, code-reviewer, security-reviewer and phase-auditor may start only retriever-digest and retriever-web; every other agent, the retrievers included, starts none."
   - Proposed edit, section 4 Retrievers: "enforced by each agent file's `tools` line" becomes "enforced by each agent file's `tools` line and, for which agent they may start, by the guard-agents hook (section 14)".
   - Source: PROCESS.md sections 4 and 14; .claude/hooks/guard-paths.mjs line 58; Q-0127.
7. **Q-0133** · EZD-000i · orchestrator
   - Answer: (a) the usage check waits 15 minutes between requests; after a "too many requests" (429) reply it retries after the wait the reply asks for (counted as at least 120 seconds) plus 30 seconds.
   - Source: AC-EZD-000i-1, AC-EZD-000i-2; PA3-MECHANISMS.md Item 1b.
8. **Q-0134** · EZD-000i · orchestrator
   - Answer: (a) the usage reader uses the status line's field names; the builder's probe reports the real names, and a mismatch goes to a follow-up ticket. The probe found a mismatch: that follow-up is item 1.1 (Q-0138).
   - Source: PA3-MECHANISMS.md Item 1b and Findings row 1b; vault/plans/EZD-000i.md H4.
9. **Q-0135** · EZD-000i · security-reviewer
   - Answer: (a) EZD-000i blocks the shell commands that would print your Claude sign-in token (Keychain reads with `-w` or `-g`, and any command naming `.credentials.json` other than a plain "does the file exist" test); the Read tool is blocked from that file too. It guards against accidents, not a determined agent.
   - Source: PA3-MECHANISMS.md rule 8 and Findings row 1b; .claude/hooks/guard-bash.mjs; PROCESS.md section 14 Settings; Q-0128.
10. **Q-0136** · EZD-000b (gate) · orchestrator
    - Answer: two repo-script tests fixed in place: the expected question IDs are the next three after the copied ledger's highest, and the hook test uses a fixed fake folder. Nothing removed or weakened; both pass in the main checkout and in a ticket worktree.
    - Source: PROCESS.md section 3 rule 19; Q-0125 (a); Q-0128 (a); Q-0129. Confirm or revert.
11. **Q-0137** · EZD-000i · orchestrator
    - Answer: (a) a dry run of the launcher reads the usage meters the same way a real run does; the 15-minute spacing and the 429 wait limit the requests either way.
    - Source: scripts/run.mjs lines 7, 219, 284; STATUS.md EZD-000h Notes deviation (3); vault/plans/EZD-000i.md H5, H9; Q-0133.
12. **Q-0139** · EZD-001 · orchestrator
    - Answer: (a) the "one package at a time" install setting moves to `pnpm-workspace.yaml`, because pnpm 12 ignores it in `.npmrc` (same fix EZD-000 used for exact versions).
    - Source: vault/plans/EZD-001.md; pnpm-workspace.yaml; Q-0019; Q-0114.
13. **Q-0140** · EZD-001 · security-reviewer
    - Answer: (a) every install script a package wants to run is denied; a test checks none is allowed. If one turns out to be needed, the builder stops and asks.
    - Source: Q-0112; vault/plans/EZD-023b.md; scripts/conventions/__tests__/architecture-doc.test.mjs lines 203–208.
14. **Q-0141** · EZD-001 (gate) · orchestrator
    - Answer: one ledger test's copied data fixed in place so live escalations and in-progress tickets no longer break it. No check, expected value or test count changed.
    - Source: PROCESS.md section 3 rule 19; Q-0125 (a); Q-0136. Confirm or revert.
15. **Q-0142** · EZD-001 (build) · code-reviewer
    - Answer: (a) four sample test files inside EZD-000's tests were wrapped in a ticket-labelled block so the new "every test names its ticket" check (C9) applies to them; what each test checks is unchanged. Recorded as a plan deviation.
    - Source: vault/plans/EZD-001.md lines 76, 169; scripts/conventions/__tests__/check.test.mjs; PROCESS.md section 8.
16. **Q-0143** · EZD-002 · orchestrator
    - Answer: (a) the CI test reads the gate's final `GATE FAIL: test` line from normal output, where your gate script now prints it.
    - Source: scripts/gate.mjs lines 31, 165; vault/plans/EZD-002.md.
17. **Q-0144** · EZD-002 · orchestrator
    - Answer: (a) `main` should require the `gate` check to pass before a merge, as PROCESS.md section 12 says. It is your GitHub step, listed in needs-from-josh.md; it did not block EZD-002.
    - Source: PROCESS.md section 12; Q-0022 (b).
18. **Q-0145** · EZD-002 (gate) · orchestrator
    - Answer: the same ledger test fixed again, data only, after EZD-001 went done. No check changed.
    - Source: PROCESS.md section 3 rule 19; Q-0125 (a); Q-0141. Confirm or revert.
19. **Q-0146** · EZD-002 (review) · security-reviewer
    - Answer: yes, the CI-workflow check was tightened: it now fails other ways of writing secrets, environments, triggers and the cache action that could slip past it. Stricter only; the allowed lists (Q-0112) are unchanged.
    - Source: Q-0112; vault/plans/EZD-002.md sections 4 and 7; scripts/ci/__tests__/ci.test.mjs.
20. **Q-0147** · EZD-003 (gate) · orchestrator
    - Answer: the same ledger test fixed a third time, data only, so it handles any chain of finished tickets. No check changed.
    - Source: PROCESS.md section 3 rule 19; Q-0145. Confirm or revert.
21. **Q-0148** · EZD-004 · orchestrator
    - Answer: EZD-004 was too big for one ticket and was split into EZD-004a (local database in the gate), EZD-004b (app reads the health row) and EZD-004c (cloud dev database workflow and runbook). Everything that depended on EZD-004 now depends on all three.
    - Source: PROCESS.md section 6 Ticket size; vault/plans/EZD-004.md Split proposal (dbf4985); Q-0042; Q-0125.
22. **Q-0149** · EZD-004a (gate) · orchestrator
    - Answer: the research-store test (EZD-000d T8) was fixed in place: it checked that the store was empty, which stopped being true once the first research report was adopted; it now checks the store's format (header, one line per report, files match the list, nothing left pending). A stray report file still fails it. This one changes what the test checks, unlike items 14, 18 and 20.
    - Source: PROCESS.md section 3 rule 19; Q-0125 (a); Q-0141. Confirm or revert.
23. **Q-0150** · EZD-005 · orchestrator
    - Answer: EZD-005 was too big for one ticket and was split into EZD-005a (the company, user, membership and project tables) and EZD-005b (Worth Properties as company 1 with you as owner: the seed and the one-time cloud setup file). Everything that depended on EZD-005 now depends on both.
    - Source: PROCESS.md section 6 Ticket size; vault/plans/EZD-005.md Split proposal; Q-0148.
24. **Q-0151** · EZD-005b · orchestrator
    - Answer: (a) an EZD-004a test required the seed file to hold only comments; EZD-005b's test-author narrows it to "the seed file exists", and EZD-005b's own test checks what the seed creates. The comment-only state was always meant to end with EZD-005. A change to a merged test.
    - Source: vault/plans/EZD-004a.md line 26; supabase/seed.sql; docs/architecture.md Local database; vault/plans/EZD-005.md V5. Confirm or revert.

## 3. Proposed wording

No new screen text for clients or users. Items 30 to 41 are new since the last file; items 1 to 29 carry over unanswered. `<…>` is filled in at run time. Reply "section 3 approved" or edit any line.

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

## 4. Rule candidates

Lessons with status `candidate` (PROCESS.md section 13). Nothing is applied until you answer. Ledger note: two different lessons had both been numbered L-005; the later one (planner, from EZD-002) is now L-006.

1. **L-001** (reviewer; from EZD-033): a policy number users run into (password length, retention period, a limit) goes to you with a recommendation; a reviewer does not set it. **Recommend: ratify.** Your password-length override (Q-0094) is the case it comes from, and it keeps product numbers yours (CLAUDE.md rule 3).
2. **L-002** (planner; from EZD-000): for every path in a plan's Files table, check that the path guard lets the writing role write it; if not, choose an allowed path or raise a question before Stage 2. **Recommend: ratify.** It would have prevented the EZD-000 block (Q-0124); EZD-004a's plan already applies it (finding F3).
3. **L-003** (orchestrator and test-author; from EZD-000b, seen again EZD-001): a repo-script test takes its expected values from its own copied data and uses a fixed fake folder, never the live ledger or the checkout it runs in. **Recommend: ratify.** The same test broke three more times for this reason (Q-0141, Q-0145, Q-0147).
4. **L-004** (planner; from EZD-000h): when a plan lists ordered steps that can stop early, check each early stop against every rule a later step enforces. **Recommend: ratify.** It caught a real bypass (an override could have started work past a budget hold) that the plan review missed.
5. **L-005** (orchestrator; from EZD-000i): a dispatch adds no restriction the plan does not state; a caution taken from the plan's Risks section is quoted with the plan's exceptions. **Recommend: ratify.** The extra restriction made the builder skip a check the plan required, which became a deviation.
6. **L-006** (planner; from EZD-002): a check that allows only listed values in config text fails every way of writing it that it cannot read (brace form, inherit, expressions), and the plan proves each one. **Recommend: ratify.** The gap cost a plan amendment and two extra test rounds (Q-0146).
7. **L-007** (reviewer; from EZD-004a): a claim about how a third-party tool behaves cites the source of the exact package and version the lockfile installs, or a run of that binary. **Recommend: ratify.** A review failed a correct test from reading a different program's source (the Supabase CLI's Go repo, not the npm `supabase` 2.121.0 the repo runs). The rule makes a reviewer check the installed program before failing a test on it.
