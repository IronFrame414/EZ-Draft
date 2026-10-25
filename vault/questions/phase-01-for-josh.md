# Phase 1 · for Josh (questions unit, 2026-10-25, eighteenth run)

This run: no new questions. Your answers Q-0331 (EZD-153 gets one more round) and Q-0333 (the orchestrator consults its advisor before a round 3) are recorded; EZD-153 was re-planned and EZD-191 was planned, both with no open question, and both are now ready. Sections 2 and 3 still wait for your confirm or override.

## 1. Decisions needed

**Q-0334 · EZD-153 (release safety check), added by build EZD-153 2026-10-25.** The extra round you allowed (Q-0331) closed every earlier finding, but the security review found two new ways to hide a table from the check: unusual letters (like `é`) in a name, and EXPLAIN inside a database function. This is the fourth round where each fix worked and a new spelling turned up. Pick one: (a) one more round that refuses anything unusual instead of listing spellings; none of today's 45 migrations would be refused (recommended); (b) change the design so a scratch database runs the new migrations and reports what they really create; bigger job; (c) merge as it is (stricter than today everywhere) with a fix ticket, shipping two known gaps until it merges. Full text: QUESTIONS.md Q-0334.

(Q-0089 storage limits and Q-0237 payments stay escalated; they are not phase 1.)

## 2. Agent answers to confirm

Confirm or override each.

| ID | Ticket | Answer | Source |
| --- | --- | --- | --- |
| Q-0232 | EZD-102, 103, 112, 113, 132, 1704, 136 | Spec-gap answers: in-place message with no redirect; Company switch gates customers; email unique ignoring case; EZ Binder fields dropped; logo in a private bucket via signed link; download link 15 minutes; backup current = nightly copy < 26 h and weekly dump < 8 days; and the rest of the row | phase-01-spec-gaps-for-josh.md |
| Q-0266 | EZD-112 | (b) EZD-112 is re-validated against EZD-132's plan before build | EZD-132.md line 208 |
| Q-0269 | EZD-132 | (b) Storage refuses supplier PDFs and order reports to members without See company costs | 03b rule 2; Q-0235 (a); Q-0087 (ii) |
| Q-0277 | EZD-143 | (a) worker-tagged events count toward the address limit and the browser row cap | architecture.md Error reporting |
| Q-0279 | EZD-145 | (b) `edit_model` for the dev test job route | EZD-102.md; Q-0202 |
| Q-0280 | EZD-146 | (a) pooler-options probe added to EZD-171 as a row you run | Q-0275 (a); Q-0268 |
| Q-0281 | EZD-147 | (b) separate fix ticket for the other four workflows' Node 20 pins | EZD-147.md; Q-0268 |
| Q-0282 | EZD-147 | (a) keep `ubuntu-latest` | architecture.md CI; Q-0144 (a) |
| Q-0283 | EZD-148 | (a) separate fix ticket refusing `pnpm_config_*` build-script overrides | Q-0268; EZD-148.md |
| Q-0284 | EZD-149 | (a) previews only for pull requests from `develop`; you paste the new command in Vercel and approve the PROCESS.md section 12 edit | Q-0116 (a) |
| Q-0285 | EZD-150 | (a) health check database limit 3,000 ms | release.mjs:39; EZD-023e |
| Q-0286 | EZD-150 | (b) health route reports a timeout through `reportError`, as a separate fix ticket | architecture.md Error reporting |
| Q-0288 | EZD-152 | (a) also replace the quoted value in psql ERROR lines (after the label colon only) | architecture.md Off-site backups logs rule |
| Q-0289 | EZD-154 | (a) pipe escaped in phase-01.md, ACs regenerated (done) | gen_acs.mjs |
| Q-0290 | EZD-155 | (b) separate fix ticket for the six other tools with the symlink main-check bug | EZD-155.md |
| Q-0292 | EZD-161 | (a) fix geometry's vitest config type-check in EZD-161 | EZD-161.md |
| Q-0295 | EZD-162 | (a) EZD-162 adds the security-review note to EZD-134 | sweep-2026-10-24.md |
| Q-0296 | EZD-168 | (a) keep the three `private` helper grants, documented | architecture.md RLS |
| Q-0298 | EZD-170 | (b) fix ticket (added by EZD-170's build): automated test of the API-credits override with a fake `claude`, no money spent | CLAUDE.md rules 3, 6 |
| Q-0299 | EZD-170 | (b) fix ticket (added by EZD-170's build): launcher saves raw text of any limit error and notifies you | Q-0268 |
| Q-0306 | EZD-171 | (a) on the live site the cloud-check page answers only to a signed-in person; everyone else gets the usual 404. Answering everyone would let anyone probe how sign-in limits count addresses | Q-0300 (d); architecture.md Folder layout, Auth and session |
| Q-0308 | EZD-155 | (a) a dry run also leaves an expired boost file in place and only says it would remove it (your Q-0291 rule: a dry run writes nothing) | Q-0291 (a); scripts/run.mjs line 7 |
| Q-0309 | EZD-103 | Split into EZD-103a Settings shell and EZD-103b Unsaved edits and drafts, because the plan is over the size limit after tightening; nothing you decided changes, and every later Settings ticket waits for both | PROCESS.md section 6; Q-0246 |
| Q-0311 | EZD-175, EZD-174 | EZD-174 (parallel lanes) now waits for EZD-175 (update before merge), because your Q-0304 (c) lets two builds edit docs/architecture.md at once only on the strength of that update step | Q-0304 (c); phase-01.md rows; Q-0268 |
| Q-0313 | gate summary (EZD-155) | No separate patch: EZD-155 (ready) already fixes the gate summary (its ticket row and plan); the planner added the missing case, a passing test whose title contains "FAIL". The gate script changes through rule 19 in that build. | phase-01.md EZD-155 row; EZD-155.md Block S |
| Q-0314 | EZD-179 (new) | Fix ticket EZD-179: remove the cause of the "ESM syntax in a file loaded as CommonJS" warning in every app test run; the warning is never just hidden | CLAUDE.md rule 17; Q-0268 |
| Q-0315 | EZD-180 (new) | Fix ticket EZD-180: EZD-005b T17 passes in any order, including right after the browser tests (the seeded Josh row must not depend on earlier sign-ins) | CLAUDE.md rule 17; Q-0268; architecture.md seed rule |
| Q-0316 | EZD-177, EZD-182 (new) | (a) fix ticket EZD-182: the repo checks refuse the pnpm switches `--dangerously-allow-all-builds`, `--config.<setting>` and `--allow-build` in workflows, package scripts and `app/vercel.json`, so no one can turn install scripts on past the settings file | Q-0283 (a); Q-0140 (a); CLAUDE.md rule 17 |
| Q-0317 | EZD-181 | (a) the health check answers its error at the 3,000 ms limit and sends the error report right after the answer, so a hung database cannot hold the answer past the release check's 4-second limit | report.ts; kick.ts `after()` pattern; Q-0285 (a) |
| Q-0318 | EZD-169, EZD-181 | (a) EZD-169 builds that change from the start (and now waits for EZD-150); two earlier health tests get a stand-in for the report so the late report cannot leak out of them (checks unchanged); EZD-181 only proves it with tests | EZD-150.md section 4; EZD-169.md; Q-0268 |
| Q-0319 | EZD-183 (new) | Fix ticket EZD-183: the public error tunnel passes on the envelope's id field to Sentry only when it is a real 32-character id, so a caller cannot slip an email address or other text through it to Sentry. Kept apart from EZD-143 (per-caller limits), as with Q-0316 | CLAUDE.md rule 17; Q-0316 (a); route.ts:87-89; EZD-142.md D8 |
| Q-0320 | EZD-184 (new) | Fix ticket EZD-184: remove the two lint warnings from our code (the realtime sign-out redirect and an unused list in a permissions test); a lint switch-off is allowed only with a cited reason | CLAUDE.md rules 16, 17; Q-0314 |
| Q-0321 | EZD-185 (new) | Fix ticket EZD-185: the merge step checks that removing the ticket folder and branch worked and says so when it did not, and the screen checker's screenshots go where they cannot block that cleanup. Waits for EZD-174 and EZD-175, which change the same step. Until then the orchestrator checks by hand after each merge | CLAUDE.md rule 17; unit-steps.mjs:143-144; EZD-173.md C12; ui-verifier.md:13 |
| Q-0322 | EZD-103a (built) | (b) keep the `auto_awesome` icon from your mockup by committing a converted copy (a small hand-run script turns the old icon format into the one the icon build accepts), with the original kept and checked by a test and a licence note; checked against B15 by screenshot | code-reviewer; icons-build.mjs:56,64-71; EZD-010b.md; architecture.md Design tokens, fonts and icons |
| Q-0324 | EZD-186 (new) | Fix ticket EZD-186: the lint tests run from the repo root stop printing "React version was set to detect" by telling the lint the real React version (the pinned one), not by hiding the warning. Waits for EZD-184, which adds one more test of the same kind | CLAUDE.md rules 16, 17; Q-0268; eslint.config.mjs:46 |
| Q-0325 | EZD-155 | No new ticket: when a root test fails, the gate's failure list names a passing test instead of the failing one. EZD-155 (ready) already fixes exactly that (same fault as Q-0313) | phase-01.md EZD-155 row; EZD-155.md lines 39-66, 151-152 |
| Q-0326 | EZD-187 (new) | (a) Fix ticket EZD-187: the test step runs the app tests even when a repo-script test fails, and fails if either part failed. Today one failing script test hides every app test result, which happened in builds EZD-132 and EZD-147. Database reset failing still stops everything | code-reviewer; scripts/gate.mjs; package.json:11; CLAUDE.md rules 12, 16, 17 |
| Q-0327 | EZD-180 | No new ticket: same as Q-0315. EZD-180's plan keeps the rule "tests never change seeded rows" and makes the browser tests put your seeded login back the way they found it when they finish | Q-0315; EZD-180.md lines 10-13 |
| Q-0328 | EZD-188 (new) | (a) Fix ticket EZD-188: the release and backup workflows (which hold the production secrets) may use only `actions/checkout` and `actions/setup-node`, pinned to an exact version; any other action, including a copied or third-party cache action, is refused by the repo checks. Today a copied cache action would pass every check in the two backup workflows | security-reviewer; ci.test.mjs:157; static.test.mjs:127-141; Q-0112; CLAUDE.md rule 17 |
| Q-0329 | EZD-147 | (a) No new ticket: EZD-147 (not merged yet) fixes its own pin check so it also sees a step written inside `[ ]` and lines with unusual space characters, reusing EZD-148's line reader. Your patch for ci.yml is unchanged; after you apply it the build takes one more test round before its gate | EZD-148.md section 9; CLAUDE.md rule 17 |
| Q-0330 | EZD-190 (new), EZD-151 | Fix ticket EZD-190: the EZD-151 build's check failed once on a test that proves a request without the server's gate header is refused (it got an empty answer instead of a refusal). The cause is a short gap after the local database reset; EZD-190 closes it and, because the plan found it can also open on a cloud project, adds a second check inside the database. EZD-151 is held until EZD-190 merges; the failure was not cleared by simply running the check again | CLAUDE.md rules 16, 17; EZD-190.md section 1; build-gate-phase-00.spec.ts:147 |
| Q-0332 | EZD-191 (new) | (a) Fix ticket EZD-191: the repo's own scripts (including the release and backup scripts) and lint rules are never checked by the lint step; add them to it, with the right settings for scripts, and fix what it finds (521 problems today, 40 once the script settings are right). Four of the files are yours (gate, launcher, usage tools), so those fixes come as a patch you apply | code-reviewer; package.json:10; eslint.config.mjs; EZD-001.md:52; CLAUDE.md rule 17 |

Fix tickets added for earlier answers: Q-0281 → EZD-176, Q-0283 → EZD-177, Q-0290 → EZD-178, Q-0286 → EZD-181, Q-0316 → EZD-182, Q-0319 → EZD-183, Q-0320 → EZD-184, Q-0321 → EZD-185, Q-0324 → EZD-186 (planned, ready), Q-0326 → EZD-187 (planned, ready), Q-0328 → EZD-188 (planned, ready), Q-0323 (your answer) → EZD-189 (planned, ready), Q-0330 → EZD-190 (planned, ready), Q-0332 → EZD-191 (planned, ready).

## 3. Proposed wording

Full tables are in each plan's section 6. Needing your approval:

- **EZD-103b** (EZD-103 plan section 6): toast when a Settings page comes back with a draft: "Your unsaved changes from last time are still here." (Q-0302).
- **EZD-112** section 6: `office.company.*` keys: subtitle "Identity used on the title block, client pages, selections PDF and email."; "Upload"; "Uploading…"; "{kind} logo"; more rows in the plan.
- **EZD-136** section 6 (W3 now also shows to a signed-in person whose language is Spanish, Q-0305 (c)): W1 Spanish disclaimer "Solo para diseño y planificación. Todos los cálculos y códigos deben ser verificados por el usuario y por un profesional con licencia en la jurisdicción del proyecto."; W3 Spanish not-found text "Página no encontrada." (a Spanish speaker checks both, Q-0030 (a)). W2 "Page not found." is your own text (Q-0273).
- **EZD-149** section 6: runbook sentences for the new preview rule (if Q-0284 stands).
- **EZD-151** section 6 R1: runbook text for a separate Resend preview key `ezdraft-preview`.
- **EZD-153** section 6: migration check output lines (developer output, no app screen), for example "cannot be checked: create inside a string or function body" and "migration check passed (no release tag: supabase/retired.json and dynamic SQL only)".
- **EZD-155** section 6: launcher dry-run log lines W1-W6, for example "dry run: weekly usage at <pct>%; a real run would write vault/handoff/BUDGET_HOLD.md and notify" and "dry run: would notify: <message>".
- **EZD-162** section 6: the New cells E1-E22, with option (a) of Q1-A, Q1-B, Q1-C and Q2-A per your Q-0293 and Q-0294 answers, and Q3-A.
- **EZD-172** section 6: lane tool messages, for example "EZD_LANE must be 0, 1, 2 or 3 (got "<value>")." and "GATE FAIL: another gate is running on lane <n> (pid <pid>). Run one gate per lane."
- **EZD-174** section 6: boost on/off/status lines and the process text P1-P4 (Q-0303), for example P2: "One ticket in progress at a time, or up to the boost build lanes while vault/handoff/BOOST.json exists (next_ticket.mjs --check fails on more). Josh raises the limit by editing this line." P4 also says docs/architecture.md no longer keeps two builds apart (Q-0304 (c)).
- **EZD-1704** section 6: the new drill step "Check the backups are current" for your runbook, plus any daily-workflow lines (see plan).
- **EZD-1707** section 6 W1-W4: Terms of service page text (placeholder terms; W3 ends with your Q-0208 sentence).
- No wording: EZD-132, 143, 145, 146, 147, 148, 150, 152, 154, 161, 168, 169, 170, 171, 173, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190 (its two new `db:up` console lines follow the existing local-stack wording), 191.

## 4. Rule candidates

None (no lessons entry has `status: candidate`).
