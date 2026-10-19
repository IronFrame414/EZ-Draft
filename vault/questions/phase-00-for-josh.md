# Phase 0 · Questions for Josh

> **Answered by Josh on 2026-10-18** (in chat): section 1 items 1 to 3 (a), item 4 (b); section 2 all confirmed except 27 (Q-0094: minimum password length 8, not 15) and a note on 33 (the local render foundation stays in scope). Recorded in `QUESTIONS.md` and `vault/spec/decisions/`.

Written 2026-10-18 by the orchestrator (`questions 0` unit, PROCESS.md section 7). Overwrites the Oct 11 file; everything answered since then is out (answers live in `vault/questions/QUESTIONS.md` and `vault/spec/decisions/`). Answer by number, in any form ("1: a", "section 2 all confirmed except 12: …"). Recommendation first in every item.

Recorded this session from your chat answers of 2026-10-18 (no action needed): Q-0116 (a), Q-0002, Q-0038 (b), Q-0096 (all recommendations), Q-0118 (a), Q-0119 (superseded by the usage meters). Q-0089 (storage limit) stays open for a later phase and is not asked here.

## 1. Decisions needed

1. **Q-0121 · How far the Spanish switch goes** (EZD-026a now; EZD-108 and every ticket with interface text later)
   You changed R17 on Oct 18: Spanish is not the default; each user can switch their own interface language to Spanish, and the owner can switch it for another user. R17 and the S15 helper text ("Field pack, tasks and notes open in Spanish for this user. Permit sheets stay in English") limit Spanish to the crew phone screens; the office editor, Projects, Settings and the client link are English in v1.
   - **(a) Recommended:** the switch covers the field pack and the other crew phone screens only, as R17 says. The office editor, Projects, Settings and the client link stay English in v1. Reason: EZD-026a is planned and reviewed on that basis, and every office screen in Spanish means each builder in 17 phases writes Spanish for every office string (Q-0030), roughly doubling wording work and the crew check load. Whole-app Spanish can be a later phase.
   - (b) The switch covers the whole app except permit sheets. EZD-026a is re-planned (the lint and the catalogs cover office components too) and every later ticket with office text carries Spanish.
   - Either way Spanish is never the default (Q-0029) and the self-switch lives in My profile (S15 item 11, Phase 1 EZD-108).

2. **Q-0118 (b) · The 53-slice re-cut of phases 1 to 17** (`vault/tickets/PHASES.md` section 2)
   Phase 0 is approved (a). The re-cut is needed before Phase 1's Stage 0, not before Phase 0 builds. You have seen slices 1 to 3.
   - **(a) Recommended:** review the rest before Phase 1 starts; nothing is applied now. Reason: the placement notes list uncertain slices, and Phase 0 runs for a while yet.
   - (b) Approve the whole re-cut now; the orchestrator runs `node vault/tools/apply_recut.mjs` in this session.

3. **Q-0122 · Where per-user tool order is built** (new requirement from Q-0038)
   Each user can set the order of the tools on the rail.
   - **(a) Recommended:** Phase 2, inside EZD-230 (Default key map and full rail), which already owns the rail overflow and the "More tools" flyout. Reason: one ticket touches the rail layout once.
   - (b) A new ticket in a later phase; stays in BACKLOG.md until then.

4. **Q-0123 · Is the subdomain already connected to the Vercel project?** (EZD-003; EZD-023b Before-launch checklist)
   SETUP.md says the Vercel project, root `app`, production branch `main` and the domain were done on Oct 12. The plan assumes the domain is connected only before launch, after "Auto-assign Custom Production Domains" is turned off, so that a `main` merge before launch cannot go live on the subdomain.
   - **(a) Recommended if true:** the domain is not connected yet; it waits for the Before-launch checklist. The plan stands.
   - (b) It is connected now. EZD-003 Step 5 and the Before-launch order get another re-validation so nothing goes live early.

5. **Q-0124 · Where the conventions check may be written** (EZD-000, blocking the build now)
   The plan and the reviewed tests put the dependency check that makes CI fail at `scripts/conventions/check.mjs`. The path guard (`.claude/hooks/guard-paths.mjs` line 57) stops the builder from writing anything in `scripts/`, which is meant for the gate, launcher and budget. The builder stopped instead of working around the guard. Everything else in EZD-000 is built (commit 628d1dc on `t/EZD-000`).
   - **(a) Recommended:** you let the builder write `scripts/conventions/` only (one exception in the guard; gate.mjs, run.mjs and budget.mjs stay protected). Reason: the plan, tests and test review stand as written, and later tickets add to this check in place.
   - (b) The check moves out of `scripts/` (for example `tools/conventions/check.mjs`). The planner revises EZD-000 and the tests change the path. That costs one more plan and test round.

## 2. Agent answers to confirm

Every `answered-agent` row in the ledger not yet confirmed (34). Each stands as written unless you override it. Reply "section 2: all confirmed" and name only the ones to change.

1. **Q-0005** · 0 / EZD-000 · answered by orchestrator (setup)
   - Question: EZD-000 says it writes CLAUDE.md, but the setup kit already has one holding the build rules. Should EZD-000 overwrite it?
   - Answer: No. EZD-000 writes `docs/architecture.md` and appends one line to CLAUDE.md pointing to it; the build rules stay. Josh can override.
   - Source: CLAUDE.md · Conventions file; tickets phase-00 EZD-000
   - Confirm or override.

2. **Q-0007** · all / branches · answered by orchestrator (setup)
   - Question: Brief: one branch per ticket with CI and a preview, squash-merge to main per ticket. Current setup: ticket branches stay local, squash to develop, Josh merges develop → main once per phase. Which?
   - Answer: Keep develop → main per phase. Merging to main per ticket would deploy production every ticket, which conflicts with the brief's own 3.5 (production only at a phase gate). Previews come from develop and the phase PR. Josh can override.
   - Source: setup brief 3.3, 3.5; vault/PROCESS.md
   - Confirm or override.

3. **Q-0008** · all / source of truth · answered by orchestrator (setup)
   - Question: After the export, is the vault or the claude.ai document the source of truth?
   - Answer: The vault. The claude.ai spec, tickets and mockups are frozen as of Oct 11 and superseded; two editable copies would drift.
   - Source: setup brief 3.1; vault/README.md
   - Confirm or override.

4. **Q-0009** · all / spec edits · answered by orchestrator (setup)
   - Question: Who may edit spec files during the build?
   - Answer: Nobody edits the section files. Changes are recorded as Josh answers in `spec/decisions.md`, which overrides the spec text (the brief allowed the coordinator to edit spec files with a decisions row; this is stricter, so builders cannot "fix" the spec to match code). Josh can override.
   - Source: setup brief 3.7; CLAUDE.md rule 5
   - Confirm or override.

5. **Q-0010** · all / oversized tickets · answered by orchestrator (setup)
   - Question: May a ticket be split into lettered parts before work starts?
   - Answer: Yes. The planner proposes; the orchestrator adds rows to the phase file, tickets.json and STATUS.md in one commit. The 20 code-rule tickets are the likeliest.
   - Source: setup brief 3.8; tickets README; vault/PROCESS.md
   - Confirm or override.

6. **Q-0012** · 0 / EZD-000 · answered by code-reviewer (plan review)
   - Question: No source says whether `vault/architecture.md` is refreshed after later tickets edit `docs/architecture.md` (for example to add dependency rows). The options are (a) copy once after EZD-000 only, as PROCESS.md says; (b) the orchestrator re-copies on every merge that changes `docs/architecture.md`; or (c) drop the vault copy and point vault readers to `docs/architecture.md`.
   - Answer: (b): the orchestrator re-copies docs/architecture.md to vault/architecture.md on every merge that changes it. Josh can override.
   - Source: PROCESS.md Special tickets (vault copy required); Q-0008 (no drifting copies)
   - Confirm or override.

7. **Q-0021** · 0 / EZD-002 · answered by code-reviewer (plan review)
   - Question: The ticket row says CI runs "on every push", but Josh's later change (commit aad5540, `vault/PROCESS.md` CI paragraph) runs CI only on the phase PR to `main` and by hand; the options are (a) Josh's change stands and EZD-002's Done when reads "CI runs lint, type check and tests on the phase PR and on a manual run; a commit with a failing test makes that run fail" (planner's recommendation, since per-ticket commits already pass the local gate), or (b) Josh puts a `push` trigger back into `.github/workflows/ci.yml` himself (for `develop`, or for every branch), and T1/T2 change to match.
   - Answer: (a): Josh's change stands. EZD-002's Done when reads: CI runs lint, type check and tests on the phase PR and on a manual run; a commit with a failing test makes that run fail. Josh can override.
   - Source: commit aad5540; vault/PROCESS.md CI paragraph
   - Confirm or override.

8. **Q-0022** · 0 / EZD-002 · answered by code-reviewer (plan review)
   - Question: No source says whether Done when needs a real failing run on GitHub or whether local proof that the gate fails is enough; the options are (a) the orchestrator pushes a throwaway branch with one failing test, opens a PR to `main`, confirms the `gate` check fails, then closes the PR and deletes the branch (one extra Actions run, free on this public repo), or (b) local tests T1–T5 are the proof and the first real CI run is the Phase 0 PR.
   - Answer: (b): local tests are the proof (EZD-002 T3, fixed per plan review findings 5 and 17); the first real CI run is the Phase 0 PR. Josh can override.
   - Source: vault/PROCESS.md (per-ticket checks are local); vault/plans/EZD-002.md
   - Confirm or override.

9. **Q-0023** · 0 / EZD-004 · answered by code-reviewer (plan review)
   - Question: No source says how migrations reach the cloud dev project once Josh's secret exists, and guard-bash.mjs says "Remote database changes are Josh's". The options are (a) the `supabase-dev.yml` workflow runs only when Josh clicks Run workflow in the Actions tab (consistent with Q-0021 (a) and EZD-002's T2; the button appears once the file is on `main`, after the Phase 0 PR); (b) it also runs automatically on each push to `develop` that changes `supabase/migrations/`, which keeps previews in step with the dev database (11 Operations), but an agent's `develop` push then changes the cloud database and EZD-002's T2 must allow it; or (c) no workflow in this ticket: Josh applies dev migrations by hand from the runbook until EZD-023 automates releases.
   - Answer: (a): the cloud dev migration workflow runs only by manual dispatch (Josh clicks Run workflow). Josh can override. SUPERSEDED by Q-0107 (Josh, 2026-10-12): automatic on push to develop.
   - Source: .claude/hooks/guard-bash.mjs (remote database changes are Josh's); EZD-002 T2 (no push triggers)
   - Confirm or override.

10. **Q-0028** · 0 / EZD-026 · answered by orchestrator (Stage 1)
   - Question: R26 R17 says every interface string goes through the message helper "from Phase 0", but EZD-011, EZD-012 and EZD-014 build before EZD-026 and do not depend on it. Options: (a) add EZD-026 to their `depends_on` (the shell then waits for sign-in tickets), (b) EZD-026 later moves already-merged literal strings into the catalog, or (c) split EZD-026 into EZD-026a (helper, catalogs, lint; EZD-001, EZD-010) and EZD-026b (language from the user record; EZD-026a, 005, 006, 007, 016a), with EZD-011, 012, 014 and 015 depending on EZD-026a.
   - Answer: (c), applied as a split: EZD-026a and EZD-026b added to the phase file, tickets.json and STATUS.md in one commit; EZD-011, 012, 014 and 015 depend on EZD-026a; EZD-1503 depends on both parts (R33). Ticket ordering only, no product change. Josh can override.
   - Source: Q-0010; vault/PROCESS.md · Oversized tickets; decisions.md R17, R33; vault/plans/EZD-026.md Parts A and B
   - Confirm or override.

11. **Q-0042** · 0 / EZD-023 · answered by orchestrator (Stage 1)
   - Question: EZD-023 will not fit one build session; the planner proposes splitting it into EZD-023a (release safety: migration check; depends EZD-002, EZD-004) and EZD-023b (environments, promote and rollback; depends EZD-023a, EZD-004, EZD-008).
   - Answer: Split applied: EZD-023a and EZD-023b added to the phase file, tickets.json and STATUS.md in one commit. Nothing depended on EZD-023. EZD-003 is not a formal dependency of EZD-023b (its repo files merge to develop first; Q-0032). Josh can override.
   - Source: Q-0010; vault/PROCESS.md · Oversized tickets; vault/plans/EZD-023a.md, EZD-023b.md
   - Confirm or override.

12. **Q-0044** · 0 / EZD-006 · answered by security-reviewer (Stage 2)
   - Question: The ticket says "changing their project scope ends their sessions" but does not say whether adding a project to a scoped user's list counts, so the options are (a) any change to the list ends their sessions, so a crew member is signed out each time a job is added to their list, or (b) only narrowing changes (removing a listed project, All → Listed, deactivation, removal) end sessions, and an added project simply appears on their next request without a sign-out, because listed projects are read on every query.
   - Answer: (b): only narrowing changes end sessions (removing a listed project, All → Listed, Listed → All, deactivation, removal); adding a listed project does not, because listed projects are read live on every statement. Josh can override.
   - Source: 03 Tables membership; 11 Operations; 11 Security; vault/plans/EZD-006.md Step 3; vault/plans/EZD-018.md Step 1
   - Confirm or override.

13. **Q-0045** · 0 / EZD-007 (also EZD-016a) · answered by code-reviewer (plan review)
   - Question: The Done when is a browser test, but Playwright comes from EZD-016a, which depends on EZD-007, so no source says where this ticket's browser runner comes from. The options are: (a) EZD-007's test-author adds a minimal `app/playwright.config.ts` (one desktop project, workers 2, web server) that EZD-016a extends (planner's recommendation); (b) split EZD-016a so its runner part comes before EZD-007 and its sign-in parts after; (c) EZD-007 merges with its browser tests written but runs them only once EZD-016a lands, staying `review` until then.
   - Answer: (a): EZD-007's test-author adds a minimal app/playwright.config.ts that EZD-016a extends. Josh can override.
   - Source: vault/PROCESS.md Agents table (test-author writes test configs); vault/plans/EZD-016a.md Step 2; CLAUDE.md rule 9 rules out (c)
   - Confirm or override.

14. **Q-0052** · 0 / EZD-018 (also EZD-006, EZD-007) · answered by security-reviewer (Stage 2)
   - Question: Realtime checks access only when a channel is joined, so after a user is deactivated or loses a project from their list, a tab they already have open keeps receiving that project's live lock, presence, job-progress and review-count messages until their access token expires (the Supabase default lifetime, which no vault source states; 11 Operations says such changes "end their sessions"); the options are (a) accept that window and document it, since the messages carry ids and counters only; (b) shorten the access-token lifetime for everyone (for example to 10 minutes), which costs one token request per open tab per lifetime and more Auth refreshes; or (c) (a) plus a server push on the user's own channel, sent by the trigger that ends their sessions, that makes the app drop its project channels and rejoin at once (the rejoin is refused), with the token lifetime as the hard limit for a tampered browser.
   - Answer: (c): keep the payload rule; the database pushes `session.ended` on the user's own channel whenever their sessions are ended (the app drops all channels and goes to sign-in); access-token lifetime pinned explicitly at 3600 s as the hard limit for a tampered browser; `current_app_user_id()` returns null for an ended session so routes fail closed at 401. Josh can override.
   - Source: 11 Operations; 03 rules 1 and 2; R26 R2; vault/plans/EZD-006.md Step 3; vault/plans/EZD-018.md Step 3
   - Confirm or override.

15. **Q-0060** · 0 / EZD-009 (also EZD-003) · answered by code-reviewer (plan review)
   - Question: The once-a-minute sweep is added to `app/vercel.json`, which EZD-003 creates, but EZD-003 is not in this ticket's `depends_on`, and under Q-0032 (a) EZD-003 stays `blocked` until after the Phase 0 merge. Options: (a) leave EZD-003 out of `depends_on`, and the orchestrator checks that EZD-003's commit (with `app/vercel.json`) is on `develop` before starting this ticket (planner's recommendation); (b) add EZD-003 to `depends_on`, which under Q-0032 (a) holds this ticket and its 11 dependents (EZD-021, EZD-024, EZD-025 in Phase 0) until after the phase gate. In either case the orchestrator also adds EZD-007 and EZD-016a to `depends_on` (both already build earlier; no order change).
   - Answer: (a), with a condition: EZD-003 stays out of EZD-009's depends_on; the orchestrator confirms EZD-003's commit (with app/vercel.json) is on develop before starting EZD-009 and notes it in STATUS. If EZD-003 is never merged early (Q-0032), EZD-009 waits and must not create app/vercel.json itself. Josh can override.
   - Source: vault/plans/EZD-003.md Step 1; vault/plans/EZD-009.md Step 6; vault/plans/EZD-023b.md
   - Confirm or override.

16. **Q-0061** · 0 / EZD-027 (also EZD-017, EZD-207, EZD-1701) · answered by code-reviewer (plan review)
   - Question: 11 Budgets says "a frame every 16 ms on desktop (60 fps) and every 33 ms on the iPad (30 fps); no frame over 100 ms", but no source says which statistic of the measured frame intervals must meet the 16 / 33 ms part (frames on a 60 Hz screen arrive in steps of 16.7 ms, so a frame that just makes 30 fps measures 33.3 ms, and timer jitter adds about 1 ms); the options are (a) the 95th-percentile frame interval is at most 1000/30 ms (iPad) or 1000/60 ms (desktop) plus 1 ms for timer jitter, with no frame over 100 ms (planner's recommendation; EZD-017, EZD-207 and EZD-1701 should then use the same rule), (b) the average frame rate over the measured passes is at least 30 fps (iPad) or 60 fps (desktop), with no frame over 100 ms, or (c) every measured frame is at most 1000/30 or 1000/60 ms plus 1 ms.
   - Answer: (a): the 95th-percentile frame interval is at most budget + 1 ms (1000/30 iPad, 1000/60 desktop), and no frame over 100 ms. EZD-017, EZD-207 and EZD-1701 reuse this rule. Josh can override.
   - Source: 11 Budgets; decisions P1 (budgets and rules by Claude)
   - Confirm or override.

17. **Q-0062** · 0 / EZD-027 · answered by code-reviewer (plan review)
   - Question: The ticket says the page records memory and 11 Also warns that "Safari memory limits can crash large 3D scenes", but no source gives a memory limit, and Safari on the iPad reports no JavaScript memory figure (only the page's own count of GPU buffer and texture bytes, about 4 MB for this scene); the options are (a) no number: memory passes when the page does not reload, go blank or error during Josh's iPad runs, and the byte counts are recorded for later tickets (planner's recommendation), or (b) also a cap on the page's GPU buffer plus texture bytes, with the number set now by Josh or the code-reviewer.
   - Answer: (a): no memory number; memory passes if the page does not reload, go blank or error on Josh's iPad runs; byte counts are recorded. Josh can override.
   - Source: CLAUDE.md rule 2 (no source gives a number); 11 Also
   - Confirm or override.

18. **Q-0063** · 0 / EZD-027 · answered by code-reviewer (plan review)
   - Question: The only desktop available to measure is the build PC (Josh's computer: Intel UHD Graphics only, 16 GB RAM; Q-0018, Q-0019), and no source says whether its result counts toward this spike's verdict, whose ticket names only the iPad; the options are (a) recorded only: the verdict is decided on the iPad, and a desktop result outside the 16 ms budget is flagged in the note for EZD-207 and EZD-1701 (planner's recommendation), or (b) the verdict also needs the desktop budget met in a normal (not automated) browser window on the build PC.
   - Answer: (a): the build-PC desktop run is recorded only; the verdict is decided on the iPad. Josh can override.
   - Source: phase-00.md EZD-027 Field check; R26 R10; Q-0018
   - Confirm or override.

19. **Q-0064** · 0 / EZD-027 (architecture checkpoint) · answered by code-reviewer (plan review)
   - Question: The Done when says "the note is written", and the Field check says a no-go from Josh's iPad run "reopens the canvas design before Phase 2 starts", but no source says whether the note's `Verdict:` line waits for that iPad run, since the automated runs on the build PC cannot measure iPad frame times; the options are (a) the orchestrator writes the note right after review from the automated runs (`Verdict: go` if the countable checks pass), then rewrites it after Josh's iPad run (which may turn it to no-go), and does not start Phase 2 before that, or (b) the note is written only after Josh's iPad run: as soon as EZD-027 merges the orchestrator asks Josh to run it, the ticket stays `blocked` (waiting on Josh) while other tickets continue, and Phase 2 cannot start until the note exists (`next_ticket.mjs` checkpoint) (planner's recommendation).
   - Answer: (b): the note is written only after Josh's iPad run; EZD-027 stays blocked (waiting on Josh) meanwhile; Phase 2 cannot start until the note exists. Josh can override.
   - Source: phase-00.md EZD-027 (a no-go reopens the canvas design before Phase 2); vault/tools/next_ticket.mjs spike-note checkpoint
   - Confirm or override.

20. **Q-0066** · 0 / EZD-016b (also EZD-302) · answered by code-reviewer (plan review)
   - Question: EZD-302's Done when uses "the synthetic fixture with one unjoined wall", but this ticket's row describes a closed room, and no source says which ticket writes the unjoined variant or how wide its gap is. Options: (a) this ticket also writes `room-12x10-unjoined.dxf` with one wall end pulled back by a gap the orchestrator names; or (b) EZD-302 writes the variant with this ticket's exported `room`, `planDrawing` and `writeDxf` and picks the gap against its own scoring and the Defaults tolerance (Round 24 #30) (planner's recommendation, since the gap only means something next to EZD-302's scoring).
   - Answer: (b): EZD-302 writes the unjoined variant using EZD-016b's exported room, planDrawing and writeDxf, and picks the gap against its scoring and the Defaults tolerance. Josh can override.
   - Source: vault/plans/EZD-016b.md Step 4.6; R24 #30
   - Confirm or override.

21. **Q-0071** · 0 / EZD-017 (also EZD-020) · answered by code-reviewer (plan review)
   - Question: 11 Budgets gives download budgets as "compressed JavaScript" in "KB" but no source says which compression or how many bytes a KB is, and the tests compare exact byte counts. The options are: (a) gzip at zlib's default level 6 with 1 KB = 1,000 bytes. This is the planner's recommendation: the strictest of the options, independent of the server, and the convention of Next.js's own size report. (b) Brotli at quality 11 with 1 KB = 1,000 bytes. This is closer to what Vercel sends to current browsers and about 15–20% smaller, so in effect a looser budget. (c) Either compression with 1 KB = 1,024 bytes.
   - Answer: (a): gzip at zlib level 6, 1 KB = 1,000 bytes, measured from the response body. Josh can override.
   - Source: 11 Budgets; decisions P1; vault/plans/EZD-017.md Step 6
   - Confirm or override.

22. **Q-0072** · 0 / EZD-017 · answered by code-reviewer (plan review)
   - Question: 11 Budgets names download budgets only for Projects and Settings, the editor, the client link and the field pack, but the app also has the sign-in pages (`/sign-in`, `/auth/confirm`, EZD-007), which crews open on their phones. The options are: (a) Hold each sign-in page to 200 KB, the budget of every non-editor page in 11 (planner's recommendation). (b) Record their size as a trend only. (c) Do not measure them.
   - Answer: (a): each sign-in page is held to 200 KB. Josh can override.
   - Source: 11 Budgets (every non-editor entry is 200 KB); decisions P1
   - Confirm or override.

23. **Q-0073** · 0 / EZD-017 · answered by code-reviewer (plan review)
   - Question: 11 Performance lists "long tasks" among the things CI gates but gives no number or time window. The options are: (a) 0 long tasks (main-thread tasks over 50 ms) during the scripted pan. A 50 ms task already breaks the 33 ms iPad frame budget. Long tasks during page load are recorded as a trend only. This is the planner's recommendation; it matches EZD-901b's "no main-thread task over 50 ms". (b) 0 tasks over 100 ms during the pan, matching "no frame over 100 ms". (c) (a) plus 0 long tasks during page load. (d) Record long tasks only, until EZD-1701 tunes the budgets on the real iPad.
   - Answer: (a): zero main-thread tasks over 50 ms during the scripted pan; long tasks during page load recorded as a trend. Josh can override.
   - Source: 11 Performance (long tasks gated); phase-09 EZD-901b row; 11 rule 4
   - Confirm or override.

24. **Q-0079** · 0 / EZD-019 (security-reviewer, Level 3) · answered by security-reviewer (Stage 2)
   - Question: No source sets the security parameters of the contract. Options: (a) accept the planner's values: every request EZ Draft sends (API calls and webhooks) is signed with HMAC-SHA256 over `<t>.<METHOD>.<path and query>.<body>` with the tenant's signing secret, plus an `EZDraft-Tenant` header; EZ Binder learns the tenant id from a signed `connection.check` delivery at Connect (no fourth value beyond R32's three); timestamp tolerance 300 seconds; signing secret and inbound key at least 32 random bytes; sign-on codes at least 128 bits (22 base64url characters), matching EZD-1705's share-token floor; (b) the security-reviewer sets different values or a different scheme, and T11, T12 and T13 follow it.
   - Answer: (a) with three changes: the HMAC-SHA256 signed string includes the tenant (`<t>.<EZDraft-Tenant>.<METHOD>.<path and query>.<raw body>`) and EZ Binder binds the tenant at `connection.check` only after the signature verifies and the header equals the body; signing secret and inbound key are 32 CSPRNG bytes (43 base64url chars) and Connect refuses shorter; EZ Draft issues 256-bit sign-on codes (contract floor stays 128 bits), stored hashed, single use. Tolerance 300 s accepted. Josh can override.
   - Source: 11 Security; 07 Delivery rules; R32; R15; 03 rule 11; R26 R14; phase-17 EZD-1705
   - Confirm or override.

25. **Q-0085** · 0 / Phase 0 Build gate · answered by orchestrator (Stage 1)
   - Question: No ticket owns the Phase 0 Build gate browser test (signed-in tenant 1 user sees the empty shell at desktop and iPad; a second-tenant user reads zero tenant 1 rows). Options: (a) add a small ticket EZD-032 "Phase 0 build-gate test" depending on EZD-007, 011, 012, 014, 016a and 017; (b) fold it into EZD-014.
   - Answer: (a): EZD-032 added to the phase file, tickets.json and STATUS.md. It implements the phase file's own Build gate; no new scope. The product part of Q-0039 (what production `/` shows) stays with Josh. Josh can override.
   - Source: phase-00.md Build gate; vault/PROCESS.md Phase gate step 1; Q-0010
   - Confirm or override.

26. **Q-0087** · 0 / EZD-006, EZD-009 (owner to be named) · answered by security-reviewer (Stage 2)
   - Question: EZD-006 leaves `project` writable by signed-in users through the REST API, EZD-009's `enqueue_job` is callable over REST, and EZD-018 puts the access token in browser memory, so a member can write rows or enqueue jobs directly without the server's can() permission check. Which mechanism closes this, and which ticket owns it? Options: (i) revoke direct table writes and write through security-definer functions that check the permission; (ii) a PostgREST pre-request hook; (iii) a separate database role for server routes.
   - Answer: (ii): a PostgREST pre-request gate. Server requests carry a server-only secret header; `private.api_request_gate()` (registered as `pgrst.db_pre_request`) refuses every anon/authenticated PostgREST request without a matching header (allow-list: anon `rpc/health`); fails closed. RLS stays the independent backstop. EZD-006 owns it in phase 0; EZD-007's `createSessionClient()` sends the header from a server-only env name; EZD-133 adds a direct-PostgREST money-column refusal test; EZD-132 must keep Storage policies tight. Josh generates the secret for each cloud project and Vercel (runbook). Josh can override.
   - Source: 03 rules 1 and 2; R26 R1, R2; EZD-000 data access ("session client, RLS backstop"); vault/PROCESS.md Phase gate; tickets.json depends_on
   - Confirm or override.

27. **Q-0094** · 0 / EZD-033, EZD-007 · answered by security-reviewer (Stage 2)
   - Question: Password rules: length, attempts, reset, owner-set passwords, sessions.
   - Answer: Minimum 15 characters, maximum 72 bytes, no character-type rules, breached-password check on (Supabase leaked-password protection, Pro), app refuses passwords containing "ezdraft" or the email's local part (4+ chars). No hard lockout; app throttle per email (5 wrong passwords / 15 min, 10 wrong codes / 15 min, 5 sign-in emails / hour) and per IP (30 actions / 15 min), keyed hashes only; emailed-code sign-in stays open while passwords are throttled. No separate reset flow: "Forgot password?" sends the normal sign-in code email; Supabase's own recovery template is link-less. A password survives only on a confirmed account (guard trigger on auth.users) to stop pre-account takeover. Deactivation ends password sessions too; changing your own password ends your other sessions; an owner-set password ends all the member's sessions. Owner-set passwords (EZD-105b, Phase 1): server route with permission and tenant checks, never for another admin, never for a login with a membership in another company, event_log row, the only allowed service-key use on a request path. Josh can override.
   - Source: 11 Security; R26 R14; Q-0035; Q-0043; Q-0048; Q-0050; vault/plans/EZD-007.md; vault/plans/EZD-006.md
   - Confirm or override.

28. **Q-0095** · 0 / EZD-033 · answered by orchestrator (Stage 2)
   - Question: Password sign-in makes EZD-007 too large for one session.
   - Answer: New ticket EZD-033 "Password sign-in" (depends on EZD-007, EZD-006, EZD-016a), added to the phase file, tickets.json and STATUS.md. Nothing in the Phase 0 Build gate needs passwords. Owner-set passwords go to EZD-105b and "change password" to EZD-108 in Phase 1. Josh can override.
   - Source: Q-0010; Q-0090; Q-0094
   - Confirm or override.

29. **Q-0103** · 0 / EZD-033 (security-reviewer, Level 3) · answered by security-reviewer (Stage 2)
   - Question: Does "containing 'ezdraft' or the email's local part" ignore letter case, and how are the 15 characters counted? Planner recommends case-insensitive matching, Unicode code points, no normalization.
   - Answer: (a) tightened: both checks ignore letter case (toLowerCase). For "ezdraft" also strip spaces, ".", "-" and "_" before matching (so "EZ Draft 2026!" is refused); the email local part is a plain substring match after lower-casing, counted in code points (4+). The 15 characters are Unicode code points; the 72 limit stays UTF-8 bytes. No normalization, so the same bytes work on every path including direct Supabase Auth calls. Josh can override.
   - Source: Q-0094; NIST SP 800-63B-4 (context-specific words; code points); vault/plans/EZD-033.md
   - Confirm or override.

30. **Q-0104** · 0 / EZD-033 (security-reviewer, Level 3) · answered by security-reviewer (Stage 2)
   - Question: Throttle details: what counts toward the per-IP limit, whether refused attempts count, whether a success clears earlier failures, rolling windows, IPv6 /64, loopback and missing addresses, and the HMAC key derivation.
   - Answer: (i) changed: toward the per-IP 30, every sign-in email request and every wrong password, code or bad link counts; successful checks, Supabase 429 and 5xx do not. (ii) refused attempts are not counted. (iii) a success does not clear earlier failures (the earlier "success clears the count" sentence is withdrawn; it was not in Q-0094). (iv) rolling windows. (v) IPv6 by /64, IPv4 by full address. (vi) changed: no IP counting only when VERCEL_ENV is unset (local, CI); on Vercel, loopback, private, carrier-NAT, link-local, unparseable or missing addresses count as "unknown"; read only the client-IP header Vercel guarantees to overwrite (confirm on pinned platform). (vii) the throttle key is derived with HKDF from SUPABASE_API_GATE_SECRET under its own label; never sent to the database, logged or stored. Josh can override.
   - Source: Q-0094; R26 R14; RFC 5869 §3.1; 02 Stack; vault/plans/EZD-033.md
   - Confirm or override.

31. **Q-0105** · 0 / EZD-033 (security-reviewer, Level 3) · answered by security-reviewer (Stage 2)
   - Question: Direct calls to Supabase Auth's password and code endpoints bypass the app throttle: accept (Supabase per-IP limits only), use Supabase's password-verification hook if available, or another control.
   - Answer: (a), accepted for tenant 1: direct Supabase Auth calls are limited only by Supabase's per-IP limits, the 15-character minimum, leaked-password protection (required in the runbook) and the unconfirmed-password guard. The password-verification hook is Team/Enterprise only (confirm), and the bot check was declined (Q-0093). Revisit before other companies join and at EZD-1705. Recorded in KNOWN-LIMITS.md. Josh can override.
   - Source: vault/plans/EZD-006.md (Auth not behind the gate); Q-0024; Q-0093; Q-0094
   - Confirm or override.

32. **Q-0112** · 0 / EZD-023b, EZD-025, EZD-002, EZD-004, EZD-005, EZD-023a; process · answered by security-reviewer (Stage 2)
   - Question: The security review of the automated release (Q-0106) returned FAIL with findings 2–16.
   - Answer: Apply findings 2–16: lock the production environment (main only, no admin bypass) before any secret is added and refuse if unprotected; allow-list which workflows may name it and which secrets each may read; security-reviewer writes a "Production-sensitive changes" section in every phase PR (PROCESS.md phase gate); SUPABASE_DEV_DB_URL moves to a dev environment limited to develop; public-repo Actions settings, secret scanning and push protection, tag ruleset phase-* and develop ruleset; mask derived secrets and never pass child stderr through; Vercel Deployment Protection (Standard) and Git Fork Protection; separate release key limited to releases/ with write only, Object Lock (Q-0111), SSE-B2; dumps exclude auth.sessions, auth.refresh_tokens, auth.one_time_tokens, auth.flow_state; restore key file outside the repo; lock and statement timeouts on migrations; install scripts limited; delete TENANT1_OWNER_EMAIL after the first release. Josh can override.
   - Source: security-reviewer report on Q-0106; Q-0065; R26 R12, R13; CLAUDE.md rule 12
   - Confirm or override.

33. **Q-0115** · all / render worker · answered by orchestrator (2026-10-18)
   - Question: Q-0018's "Intel UHD only" fact described the Windows PC. The Mac mini has an Apple GPU (Metal, not CUDA). Does the render plan change?
   - Answer: No change: renders stay on cloud providers and Phase 11 still builds the local worker protocol (Q-0020, R18). A local-render spike on the Mac is a later question for Josh. Josh can override.
   - Source: EZ Draft Mac handoff item 2; Q-0020
   - Confirm or override.

34. **Q-0120** · 0 / process tooling · answered by orchestrator (2026-10-18)
   - Question: On the installed Claude Code (2.1.302), `claude --help` lists `--max-budget-usd`, `--permission-prompts none`, `--effort`, `--agent` and `--permission-mode`, but not `--max-turns`. The launcher drops any flag the installed version does not list, so the per-unit dollar cap is the hard stop for a runaway unit. Acceptable until the pilot?
   - Answer: Yes: PROCESS.md section 11 already makes `--max-budget-usd` the per-unit stop; `--max-turns` was a second guard. The pilot (EZD-001, PILOT.md check 5) confirms the cost field names; if a later CLI version lists `--max-turns`, the launcher passes it again automatically. Josh can override.
   - Source: scripts/run.mjs --status; PROCESS.md sections 10, 11, 15
   - Confirm or override.

## 3. Proposed wording

None new. Phase 0's plans predate the plan template's "Proposed wording" section; all user-visible wording in them went through questions you already answered (Q-0056, Q-0086, Q-0091, Q-0092, Q-0100, Q-0101, Q-0102 in `vault/spec/decisions/`).

## 4. Rule candidates

None. No lesson in `vault/lessons/` has status `candidate`.
