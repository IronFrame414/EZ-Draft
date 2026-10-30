# Phase 1 · for Josh (questions unit, 2026-10-30, twenty-first run)

Five decisions wait on you (Q-0443 to Q-0446, Q-0454). Q-0436 to Q-0442 were answered by you on 2026-10-29. Tickets with a waiting question stay `questions`: EZD-274, EZD-275, EZD-276; EZD-267 stays blocked on Q-0443. EZD-271, EZD-272, EZD-273 are now `ready` (plans carry Q-0437 to Q-0442). EZD-269 stays `questions`: its plan is a split proposal (EZD-269b) that needs your yes before it is applied (PROCESS.md section 6).

## 1. Decisions needed

**Q-0444 · EZD-274.** Two of your answers disagree on a message that has both kinds of words. Q-0438 (b): "rate limit" or "too many requests" without "usage limit" is an ordinary failure, retried on the model ladder. Q-0437 (a): a message naming "5-hour", "five-hour", "session limit" or "week" is a limit. EZD-193's tests already feed `5-hour limit reached` plus a `rate limit` line.
1. (Recommended) The rate-limit words count only when the text names no five-hour or weekly form either, so a real limit message is never retried as a failure. Reason: money-safe, and both your answers stay true. Cost: none; the plan is written this way.
2. Q-0438 as written: such a text is retried on the ladder. Cost: a real five-hour limit message that also says "rate limit" is retried instead of waiting for the reset, and three old tests need new fixtures.

**Q-0445 · EZD-274.** A passing rate-limit error goes straight to the next model with no pause. A burst longer than three tries tables the ticket, or leaves the launcher waiting for a change, for an error that clears by itself.
1. (Recommended) No pause, as Q-0438 (b) says. Reason: nothing was asked for; the ladder already limits retries. Cost: a long burst can still table a ticket.
2. Wait a fixed time before the next model after a rate-limit failure. You give the minutes. Cost: one more wait in EZD-268's ladder and one more test.

**Q-0446 · EZD-275.** Your Q-0442 asked for a text check over the skill files (`.claude/skills/*/SKILL.md`). `.claude/skills/build-ticket/dispatch.md` and the agent files (`.claude/agents/builder.md`, `test-author.md`, `log-summarizer.md`) also carry stop and wait steps (9 blocks today).
1. (Recommended) Add those files to the same check (about 9 more markers). Reason: it closes the whole class, so a stop that is not on the KEEP line cannot come back through any agent text (CLAUDE.md rule 18). Cost: a bit more work in this ticket.
2. Skill files only, as you worded it. Cost: stops in dispatch.md and the agent files stay unchecked.

**Q-0454 · EZD-276.** The acceptance criterion says the Projects first-cards row fails the check when the time is over 1000 ms. The spec (11 opening paragraph, R26 R10) and EZD-017 G1 say Projects-page times are `trend` rows that are recorded and never fail.
1. (Recommended) Keep it a `trend` row that is marked over budget while the check passes, and reword the criterion to "is marked over budget". Reason: it follows the spec and Josh's earlier rule; a slow gate machine cannot fail the gate or EZD-017 on timing noise. Cost: a slow Projects page never stops a merge by itself.
2. Make it a `gate` row that fails when the median is over 1000 ms. Cost: a slow CI runner can fail the gate; EZD-017 G1 and the spec paragraph change.

**Q-0443 · EZD-267.** EZD-267 is built and every one of its tests passes, but its gate is red on one old test, EZD-254 T2, which also fails on develop (EZD-253 is done and depends on EZD-254, so the test's copy of the ledger refuses). Every phase 1 build gate hits it until fixed. The test-author's fix (commit 9e81edb1, fixture only, no expected value changed, 3 of 3 pass) was ruled FAIL by code-reviewer as an input change outside the plan.
1. (Recommended) Accept 9e81edb1 inside EZD-267 as a recorded deviation. Reason: smallest change, restores the test's intent, and the copy then derives its dependents so the class cannot return. Cost: EZD-267 carries a change its plan does not list.
2. A fix ticket for T2 (test-author and a test review) merges first, then EZD-267 resumes without 9e81edb1. Cost: one more ticket, and EZD-267 and everything behind it wait.
Also for you: a one-line PROCESS.md rule that merge gates run before a row is set done (how EZD-253 slipped through); agents cannot edit that file.

## 2. Agent answers to confirm

New this run (confirm or override):
- **Q-0433 (EZD-265): (a)** EZD-265 owns the set-aside call; EZD-268 stops at "ladder exhausted" and calls nothing; EZD-265 is re-validated against EZD-268's merged code first. Source: vault/plans/EZD-265.md D1; vault/plans/EZD-268.md section 3.
- **Q-0435 (EZD-268): (a)** same answer: EZD-268 calls today's table step or stops; EZD-265 then widens it. Source: vault/plans/EZD-268.md section 10, tests L1, L10.
- **Q-0434 (EZD-267): (a)** the missing Architecture line was added to EZD-174, EZD-185 and EZD-191 so the launcher can apply their grants. Source: CLAUDE.md Conventions file (EZD-244); vault/tools/plan_lint.mjs.

Earlier agent answers not yet confirmed (67 rows, one line each; override any by ID):
- Q-0232 (EZD-102, 103, 112, 113, 132, 1704, 136): Q-0214 in-place message, no redirect (overrides S15 States, EZD-103 text); Company switch gates customers (S15a, Q-0210), email unique igno… Source: vault/questions/phase-01-spec-gaps-for-josh.md
- Q-0281 (EZD-147 (plan QP-1)): (b) separate phase 1 fix ticket for the four workflows, depending on EZD-146. Source: EZD-147.md section 1; phase-01.md EZD-146; Q-0268; fix ticket EZD-176 added (qu…
- Q-0283 (EZD-148 (plan QP-1)): (a) separate phase 1 fix ticket adding the refusal; planner first confirms the pnpm 12.14.0 changelog claim. Source: Q-0268; CLAUDE.md rules 4, 17; EZD-148.md; fix ticket EZD-177 added (questions …
- Q-0286 (EZD-150 (plan QP-2)): (b) call reportError with location api.health, as a separate phase 1 fix ticket. Source: docs/architecture.md Error reporting (EZD-024) Convention; Q-0268; fix ticket E…
- Q-0290 (EZD-155 (plan QP-1)): (b) separate phase 1 fix ticket for the six tools. Source: EZD-155.md lines 10, 14; Q-0268; fix ticket EZD-178 added (questions 1, 2026-10…
- Q-0298 (EZD-170 (plan QP-2)): (b) fix ticket: node:test with a fake claude checking the key and the cost row. No live run (money). Source: CLAUDE.md rules 3, 6; EZD-170.md line 171
- Q-0299 (EZD-170 (plan QP-3)): (b) fix ticket: launcher saves raw text of any limit error and notifies Josh. Source: Q-0268; EZD-170.md line 62
- Q-0309 (EZD-103): Split applied: two parts, status todo, in the phase file, tickets.json and STATUS.md in one commit; the stage-0 ACs keep their IDs (accepta… Source: PROCESS.md section 6 Ticket size; vault/plans/EZD-103.md Split proposal; Q-0246
- Q-0311 (EZD-175 (plan QP-2)): (a): EZD-175 added to EZD-174's depends (tickets.json, phase-01.md row, STATUS.md). Josh's Q-0304 (c) exempts docs/architecture.md from the… Source: Q-0304 (c); phase-01.md EZD-174, EZD-175 rows; Q-0268; Q-0010
- Q-0313 (gate (scripts/gate.mjs, gate-failures.l…): Covered by EZD-155 (ready): its phase-01.md row puts `isFailing` matching node:test `not ok N` and taking the first error after a failing l… Source: phase-01.md EZD-155 row; vault/plans/EZD-155.md lines 38-50, T2, T3; PROCESS.md…
- Q-0314 (app/vitest.config.ts): Fix ticket EZD-179 added to phase 1 (tickets.json, STATUS.md, phase-01.md row): remove the cause of the app Vitest CommonJS warning; how is… Source: CLAUDE.md rule 17; Q-0268; EZD-101 STATUS Notes; EZD-161.md
- Q-0315 (EZD-005b T17 (e)): Fix ticket EZD-180 added to phase 1 (tickets.json, STATUS.md, phase-01.md row): EZD-005b T17 passes in any run order; the planner picks bet… Source: CLAUDE.md rule 17; Q-0268; docs/architecture.md Tenancy tables (EZD-005) seed r…
- Q-0316 (EZD-177 (plan QP-1)): (a) a separate phase 1 fix ticket refusing `--dangerously-allow-all-builds`, `--config.<setting>` (dot form; bare `--config` of Vitest and … Source: Q-0283 (a); Q-0268; Q-0140 (a); Q-0158 (a); CLAUDE.md rules 4, 17; scripts/rele…
- Q-0317 (EZD-181 (plan QP-1)): (a) the health route registers the report with `after()` (try `after(report)`, catch `void report()`), so the 500 goes out at the 3,000 ms … Source: app/src/server/errors/report.ts:69-77,109-113 (store RPC with no time limit on …
- Q-0319 (EZD-143 (found in build EZD-142)): Separate phase 1 fix ticket EZD-183 (depends on EZD-142, which defines `EVENT_ID` in `scrub.ts`, and EZD-143, which edits `route.ts`): the … Source: CLAUDE.md rules 4, 17; Q-0268; Q-0316 (a); Q-0283 (a); app/src/app/api/monitori…
- Q-0320 (develop lint (found in build EZD-142)): One phase 1 fix ticket EZD-184 (depends on EZD-018, EZD-101) covering both warnings; the `permissions.test.ts` change is the test-author's … Source: CLAUDE.md rules 5, 16, 17; Q-0268; Q-0314 precedent; app/src/lib/realtime/index…
- Q-0321 (scripts/unit-steps.mjs merge (found in …): Phase 1 fix ticket EZD-185 with both parts: (a) `merge` checks the exit status of `git worktree remove` and `git branch -D` and names the f… Source: CLAUDE.md rule 17; Q-0268; Q-0314 precedent; scripts/unit-steps.mjs:143-144; va…
- Q-0324 (scripts/tooling/__tests__ lint tests (f…): Phase 1 fix ticket EZD-186 (todo): remove the cause in the root `eslint.config.mjs` so linting `app/**` from the repo root uses the pinned … Source: CLAUDE.md rules 16, 17; Q-0268; Q-0320 / EZD-184 and Q-0321 / EZD-185 precedent…
- Q-0325 (scripts/gate.mjs (found in build EZD-14…): Already covered by phase 1 fix ticket EZD-155 (ready): its scope makes `isFailing` match node:test `not ok N - <name>` and takes the first … Source: CLAUDE.md rules 12, 17; Q-0268; scripts/gate.mjs:151-168; .claude/worktrees/EZD…
- Q-0326 (root package.json `test` (found in buil…): (a): run the root node:test files and the package fan-out every time, root node:test first, and fail the step when either failed; (b) has n… Source: CLAUDE.md rules 12, 17; package.json:11; docs/architecture.md Root config files…
- Q-0327 (browser test harness (found in build EZ…): Same defect as Q-0315, already covered by phase 1 fix ticket EZD-180 (ready). Its plan picks option (b): the seed rule stands (no doc amend… Source: docs/architecture.md Tenancy tables (EZD-005) seed rule; app/test-harness/e2e (…
- Q-0328 (repo rule tests, workflow actions (foun…): (a), proven on the real checker in memory: a SHA-pinned `someone/cache@<sha>` step in `backup-files.yml` or `backup-db.yml` passes rule (i)… Source: CLAUDE.md rules 16, 17; Q-0268; Q-0112; vault/plans/EZD-148.md D2, D4, D10, D13…
- Q-0330 (EZD-151 gate (EZD-006, EZD-032)): (a): fix ticket EZD-190 added to phase 1 (tickets.json, STATUS.md, phase-01.md row; security review: yes). EZD-151 depends on it and is blo… Source: CLAUDE.md rules 12, 17; PROCESS.md rule 20; Q-0268; Q-0248 and Q-0314 (preceden…
- Q-0332 (repo tooling (EZD-001)): (a): fix ticket EZD-191 added to phase 1. Root `scripts/` was never excluded by design: EZD-001 left it out of Prettier only, and its ESLin… Source: package.json:10; eslint.config.mjs:25-134; vault/plans/EZD-001.md:52,54,160; .c…
- Q-0335 (scripts/process/retrievers.test.mjs (fo…): Re-pinned in fix mode (PROCESS.md rule 19; vault/handoff/LAUNCHER_FIX.md written, then removed): the test hashes lines 1-21 (new SHA-256 fr… Source: scripts/process/retrievers.test.mjs:156-161; .claude/skills/build-ticket/dispat…
- Q-0336 (app tooling (EZD-021, EZD-024)): Duplicate of Q-0314: option (a) is already fix ticket EZD-179 (ready, plan lints clean; the planner chooses `.mts` rename or `"type": "modu… Source: Q-0314; vault/plans/EZD-179.md; vault/tickets/phases/phase-01.md:88; CLAUDE.md …
- Q-0339 (app/e2e/net-guard.spec.ts (EZD-159 T7; …): (a) Fix ticket EZD-192: reproduce EZD-159 T7 in repeated runs and under the stale-Kong state, find the cause and fix it in code or harness … Source: CLAUDE.md rule 17; PROCESS.md rule 20; vault/plans/EZD-167.md; vault/tickets/ph…
- Q-0341 (local test stack (found in builds EZD-1…): (a) Fix ticket: reproduce, find the cause, fix it in `scripts/db/local.mjs` or the stack start, no retry and no looser test. Option (b) is … Source: CLAUDE.md rule 17; PROCESS.md rule 20; vault/handoff/CURRENT.md; vault/plans/EZ…
- Q-0344 (EZD-198 (plan QP-2)): (b) fix ticket EZD-199 (depends on EZD-198): the guard denies a ranged Bash read whose selected text is over the limit. Source: CLAUDE.md rule 17; .claude/hooks/guard-reads.mjs:102,119-126,140
- Q-0347 (EZD-176 (code review)): (a) New fix ticket EZD-200 in phase 1: the failing check prints its command and stderr, the cause is found and fixed (or the Docker-depende… Source: CLAUDE.md rule 17; Q-0268; vault/tickets/phases/phase-01.md EZD-200
- Q-0348 (scripts/release/__tests__/release.test.…): (a) New fix ticket in phase 1 (number given at the questions unit): prove the cause, fix the check so hash text cannot match '403'; no retr… Source: CLAUDE.md rule 17; PROCESS.md rule 20; scripts/release/__tests__/release.test.m…
- Q-0355 (app/src/server/permissions/permissions.…): (a) Fix ticket: reproduce, find the cause, fix in the test-author's file without weakening the check. Option (b) is refused by rule 17. Com… Source: CLAUDE.md rule 17; PROCESS.md rule 20; vault/plans/EZD-190.md
- Q-0356 (app/src/server/errors/route-timeout-rep…): (a) Fix ticket as described. Option (b) is refused by rule 17. Complexity low. Source: CLAUDE.md rule 17; PROCESS.md rule 20; vault/plans/EZD-190.md
- Q-0357 (scripts/backup/__tests__/files.test.mjs…): (a) Fix ticket as described. Option (b) is refused by rule 17. Complexity medium. Source: CLAUDE.md rule 17; PROCESS.md rule 20; vault/plans/EZD-200.md
- Q-0384 (EZD-251 (plan QP-1)): (b) 10 runs of two full lane gates started together; a failure on any run, even in an unrelated test, is reported with its output and the c… Source: EZD-035.md line 99 (V1, 10 of 10 full runs); EZD-192.md lines 28, 58 (T7 repeat…
- Q-0385 (EZD-251 (plan QP-2)): (a) a separate phase 1 fix ticket (EZD-252, depends on EZD-251) adding a check that fails a test file which makes the app write error_alert… Source: CLAUDE.md rules 4, 17, 18; Q-0281, Q-0283, Q-0290; fix ticket EZD-252 added (qu…
- Q-0415 (EZD-246 (EZD-023e T8)): Yes: the orchestrator adds phase 1 fix tickets at the questions unit (precedent Q-0348 (a), Q-0385 (a), Q-0319); same defect as Q-0348 (the… Source: CLAUDE.md rule 17; Q-0348; Q-0385; gate run builder EZD-246 round 1; gate-failu…
- Q-0417 (EZD-250 (plan QP-1)): (b): fix ticket EZD-258 (phase 1, depends on EZD-250) adds one failing-input test per listed rule and fixes any behavior a test shows wrong… Source: vault/plans/EZD-250.md section 10, vault/tickets/phases/phase-01.md
- Q-0419 (EZD-199): Not an EZD-199 defect: the flaky scratch start becomes fix ticket EZD-259 (rule 17), and EZD-199 resumes its merge; a red merge again is a … Source: STATUS EZD-199 note; Q-0268 rule 17
- Q-0430 (EZD-260 (plan QP-1)): (b): a phase 1 fix ticket where the gate fails a ticket diff that changes a file the builder's write rules deny and no grant lists. Not (a)… Source: CLAUDE.md rules 17, 18; vault/KNOWN-LIMITS.md:19; scripts/gate.mjs:10-11,69-79;…
- Q-0266 (EZD-112 (plan QP-1)): (b) EZD-132 now has a plan with two signature changes (createSignedUpload has no third argument; signedDownloadUrl opts optional); EZD-112 … Source: vault/plans/EZD-132.md line 208; EZD-112.md lines 62, 120, 189
- Q-0269 (EZD-132 (plan QP-1)): (b) Storage refuses supplier_pdf and order_report to members without See company costs (adds EZD-101 dependency and one test). Source: 03b rule 2; Q-0235 (a); Q-0087 (ii); docs/architecture.md RLS; EZD-132.md secti…
- Q-0277 (EZD-143 (plan QP-2)): (a) worker-tagged events count toward the address limit and share the browser row cap. Source: docs/architecture.md Error reporting, Render worker contract; sweep item 3; EZD…
- Q-0279 (EZD-145 (plan QP-1)): (b) edit_model on that project. Source: EZD-102.md Dev rename route; docs/architecture.md Background jobs; Q-0202
- Q-0280 (EZD-146 (plan QP-1)): (a) add the pooler-options probe to EZD-171 as a Josh-run row with an expected result. Source: Q-0275 (a); Q-0268; EZD-171.md section 1
- Q-0282 (EZD-147 (plan QP-2)): (a) keep ubuntu-latest; the phase PR gate proves Ubuntu 26. Source: docs/architecture.md CI; EZD-147.md; Q-0144 (a)
- Q-0284 (EZD-149 (plan QP-1)): (a) narrow the Ignored Build Step to pull requests from develop. Josh pastes the command in Vercel and approves the PROCESS.md section 12 e… Source: Q-0116 (a); docs/architecture.md Hosting
- Q-0285 (EZD-150 (plan QP-1)): (a) 3,000 ms. Source: scripts/release/release.mjs:39; EZD-023e.md line 28; EZD-150.md section 2
- Q-0288 (EZD-152 (plan QP-1)): (a) also replace the quoted value in ERROR lines, only after the label colon (keep relation names). Source: docs/architecture.md Off-site backups logs rule; Errors and logging
- Q-0292 (EZD-161 (plan QP-1)): (a) fix in EZD-161 with a third tsconfig program. Source: EZD-161.md steps 3-4; CLAUDE.md rules 7, 17
- Q-0295 (EZD-162 (plan QP-3)): (a) EZD-162 adds the security-review line to EZD-134 Scope. Source: vault/tickets/sweep-2026-10-24.md lines 58, 66
- Q-0296 (EZD-168 (plan QP-1)): (a) keep the three grants as documented helpers; reasons in the allow-list. Source: docs/architecture.md RLS, Realtime; EZD-168.md F3
- Q-0306 (EZD-171 (plan QP-2, re-plan for Q-0300)): (a): in production `/dev/cloud-check` and its read route answer only to a request whose claims have `sub`, and give the same empty 404 as e… Source: Q-0300 (d); docs/architecture.md Folder layout and Auth and session (PUBLIC_PAT…
- Q-0308 (EZD-155 (plan QP-1, re-plan for Q-0291)): (a): a dry run removes nothing and logs the would-be removal. Q-0291 (a) settles the rule that a dry run writes no file and sends no notifi… Source: Q-0291 (a); scripts/run.mjs dry-run definition; EZD-155.md section 10
- Q-0318 (EZD-181 (plan QP-2)): (a) re-validate EZD-169 so its health step already uses `after(report)` (EZD-181 build step 1, edit E1 and the step 2 exception sentence mo… Source: vault/plans/EZD-150.md section 4 (T2 global dead fetch); app/src/server/errors/…
- Q-0322 (EZD-103a (plan-gap QP-1, build 2026-10-…): (b), with conditions: convert by a hand-run script `app/scripts/icons-convert-legacy.mjs` (Node built-ins; M/L/H/V/Z absolute x'=48x, y'=48… Source: CLAUDE.md rule 3; app/scripts/icons-build.mjs:56,64-71; icons.test.ts:46-58; ic…
- Q-0342 (EZD-197 (plan QP-1)): (a) intended: boost removes the hold, so no warning that one is coming; PROCESS.md section 11 gets one sentence saying so (orchestrator, th… Source: vault/PROCESS.md:387,405; scripts/run.mjs:366-368; vault/tools/boost.mjs:2-3
- Q-0349 (EZD-188): (a) Parser cross-check: add js-yaml 4.3.2 as a root devDependency (lockfile already holds it via @eslint/eslintrc; pnpm-lock.yaml:3427) wit… Source: worktree .claude/worktrees/EZD-188 at 2d607b1 (gate PASS); vault/plans/EZD-188.…
- Q-0352 (EZD-112 (plan QP-1)): (b): adopt; draft = 6 fields + logo change + staged {path, kind, fileName, size}, no URL; restore re-checks the path through the logo check… Source: docs/architecture.md:562-565; Q-0302 (c); Q-0309; vault/plans/EZD-112.md:58-70
- Q-0353 (EZD-112 (plan QP-1, round 1)): (a): S15a defines "offline read-only" as behavior, not look; the plan section 5 offline row names only the S01 banner as its visual source;… Source: vault/spec/sections/screens/S15a-settings-company.md:28; docs/architecture.md S…
- Q-0362 (EZD-244 (plan QP-1)): (b): the orchestrator applies Block L (one import and one call in `scripts/run.mjs`) in fix mode on `t/EZD-244` after the test-author's com… Source: PROCESS.md section 3 rule 19; Q-0125 (a) (a ledger tool or the launcher may be …
- Q-0416 (EZD-257 (plan QP-1)): (a) 10 forced runs: every run fails on the old check, so the loop proves the fix deterministically; same count as Q-0384 (b). Source: vault/plans/EZD-257.md section 2 (Loop count row); Q-0384 (b)
- Q-0432 (EZD-175): (a). The rule 'Exit 0 = go on... 5 lines or fewer' is the existing header of scripts/unit-steps.mjs:4 (token diet); an agent may not loosen… Source: scripts/unit-steps.mjs:4; CLAUDE.md rules 3,16; vault/plans/EZD-175.md QP-1
- Q-0343 (EZD-198 (plan QP-1)): (a) as planned: the guard denies any Read of a notebook over 20,000 characters, ranged or not; PILOT.md and PROCESS.md section 14 say so. Source: CLAUDE.md rules 10, 17; PROCESS.md:601; .claude/hooks/guard-reads.mjs:157
- Q-0345 (EZD-199 (plan QP-1)): (a) accept: the limit is per file, as CLAUDE.md rule 10 and PA3 Item 3 state it; a per-command total would block nothing real (the same tex… Source: CLAUDE.md rules 10, 17; PROCESS.md:565; guard-reads.mjs:24-37,157-165
- Q-0387 (EZD-253 (plan QP-1)): (a): add EZD-250 to `depends_on`; recorded in tickets.json, phase-01.md and STATUS.md. Source: vault/plans/EZD-253.md section 9 (D2, D6/D9, Step 0 use EZD-250 output); CLAUDE…
- Q-0388 (EZD-253 (plan QP-2)): (a): all planning-stage units of any signed-off phase run first. Source: Josh row EZD-253 ("planned, plan-reviewed and questioned while the current phas…

## 3. Proposed wording

Full tables are in each plan's section 6. Launcher and ledger text only; no app screen. The texts you read:
- EZD-265 (W1 to W9): STATUS note `<date>: set aside by the launcher: the <unit> unit ended without progress after the model ladder (models tried …; last outcome: …). Who can clear it: Josh (the full model ladder failed).`; notice `<T> set aside (blocked): … The launcher goes on with the next unit. Who can clear it: Josh; see the STATUS.md note.`; wait `none: waiting on Josh (three tickets set aside in a row: <A>, <B>, <C>; the launcher resumes by itself when STATUS.md, tickets.json or a questions file changes)`.
- EZD-266: none.
- EZD-267 (W1 to W5): `guard grant for <T> needs you: <p>, <p> (<reason>); from the repo root run git apply vault/handoff/<T>-grant.patch && git commit …`; `guard grant for <T> failed: <line>. Tickets that need a guard grant stay held.`; hold `none: waiting on Josh (guard grant for <T>: <p>, <p>; see vault/handoff/)`.
- EZD-268 (W1 to W7): `<next> failed after the model ladder (models tried: …; last outcome: …). The launcher waits and tries again when STATUS.md, the next unit or the launcher code changes.`; `<T> tabled (blocked) after the model ladder (…); the launcher goes on with the next ticket. See vault/tickets/STATUS.md.`; `unit <next> failed after the model ladder (…); launcher stopped. See vault/handoff/CURRENT.md.`
- EZD-269 (W1 to W13): STATUS note `<date>: waits on <X> (<reason>); <X> added to depends_on, back to <status>; resumes by itself at step <n> when <X> is done.`; merge lines MERGE WAITS, MERGE LEDGER, MERGE CLASH, MERGE STOP, MERGE RED; wait `none: develop has uncommitted changes outside vault/ (…); a repair unit stashes them`.
- EZD-270 (W1 to W10): notice `EZ Draft: questions <N> changed nothing after the model ladder (models tried: …). Phase <N>'s questions wait until a question row or STATUS.md changes; other work goes on.`; ledger failures W3 to W8 (a ticket waiting on a question is status questions; answered-agent needs a citation; escalated needs a Level 4 reason).
- EZD-271 (W1 to W9): `plan limit reached during <next>; the message is not in a confirmed five-hour or weekly format: "<quote>". Hold written; override with budget.mjs or wait for the weekly reset.`; the WINDOW_PAUSE.md text; the PROCESS.md lines for the five-hour and weekly cases (W6, W7).
- EZD-272 (W1 to W8c): `<T> set aside (blocked): <tool> <target> was refused: "<text>". To clear it: <how>. The launcher goes on with the next ticket.`; `<unit> <arg> is waiting: <tool> <target> was refused: … The launcher runs it again when the hook or permission settings or STATUS.md change.`
- EZD-273: none (gate output for agents).
- EZD-274: one code comment, developer text: `// EZD-274 (Q-0438 (b)): "rate limit" or "too many requests" with no usage-limit, five-hour or weekly wording is a passing API error: an ordinary failed unit for the model ladder (EZD-268), not a limit.`
- EZD-275: none (checker messages are developer text).
- EZD-276: none (check output for agents; Q-0454 reword of AC-EZD-276-2 if you pick 1).

## 4. Rule candidates

All still `candidate` (unattended run; none decided). Recommendation, one line each:
- L-022 (EZD-166, builder): catch only the errors the plan names, add no fallback the plan does not list. **Ratify**: a catch-all hides real faults.
- L-023 (EZD-190): a plan adding a `private` function lists its `PRIVATE_EXECUTE` entry and tests it only as a role that has execute. **Ratify**.
- L-024 (EZD-190): catalog tests check a minimum list, never `toEqual` on a dated snapshot. **Ratify**: three migrations already broke one.
- L-025 (EZD-244): a backfill covers the open tickets at build time, derived by a command. **Ratify**.
- L-026 (EZD-244): grep the tests for hash or line-count pins on any file the plan edits. **Ratify**.
- L-027 (EZD-244): when removing a pattern, grep every skill and process file for it. **Ratify**.
- L-028 (EZD-246, EZD-240): exact-text and "after each step" plan rows become their own numbered checks. **Ratify**.
- L-029 (EZD-248): a guard plan names the threat class, the fail-closed rule, the shells in scope and whether it is the real control. **Ratify**.
- L-030 (EZD-248, EZD-251): comments or rule text about code behavior cite the file, line and branch. **Ratify**.
- L-031 (EZD-257): a distinct-hash fixture test names what makes each fixture's commits unique. **Ratify**.
- L-032 (EZD-250): verify commands run on the pinned Node; test folders given as quoted globs. **Ratify**.
- L-033 (EZD-173): a plan changing a shared test helper names the stale options, callers and comments, and says later develop files get the same repair. **Ratify**.
- L-034 (EZD-246, EZD-254): a plan's test table gives the exact test count and titles, a returned fixture shape in full, and exact-text blocks end with "nothing else". **Ratify**: reviewers found added work beyond the plan twice.
- L-035 (EZD-253, EZD-154; seen twice): for each test row, run its input through the plan's own decision rows by hand and name the D-line that yields the expected value; list every sibling form of a blocked case. **Ratify**: two plans had an unreachable or uncovered case found only at test review.
- L-036 (EZD-253, EZD-259): for each test row, state the input where old and new code differ and name every output channel the change reaches. **Ratify**: a row that passes on today's code tests nothing.
