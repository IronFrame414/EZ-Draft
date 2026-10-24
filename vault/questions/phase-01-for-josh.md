# Phase 1 · for Josh (questions unit, 2026-10-24, sixth run)

Six tickets turned ready this run: EZD-176, EZD-177, EZD-178, EZD-179, EZD-180 and EZD-181 (46 ready in phase 1 now). Three new questions were answered by the reviewers (rows Q-0316 to Q-0318 below). One more fix ticket was added so nothing is parked (rule 17, your Q-0268): EZD-182, the repo checks also refuse the pnpm command-line switches that turn on install scripts (Q-0316); the next unit plans it. EZD-169 and EZD-181 were re-planned: a health check on a hung database now answers its error at the 3,000 ms limit and reports it right after, instead of waiting on the same hung database (Q-0317, Q-0318); EZD-169 now also waits for EZD-150. The two decisions below are unchanged; Q-0312 still makes every phase 1 build gate red until the patch is in.

## 1. Decisions needed

**Q-0312 · develop gate (urgent: every phase 1 build is red until this is in).** The test `scripts/ledger/questions-flow.test.mjs` has failed 4 of 4 since EZD-101 merged: its practice copy of the ledger looks up dependencies in the STATUS table, which names split tickets by their old parent name (EZD-005 rather than EZD-005a and EZD-005b), so the copy's ledger check fails. It is the same kind of slip as Q-0145 and Q-0147. The fix touches only the test's setup and changes no expected result; it passes 4 of 4 in a scratch copy.
1. (recommended) Apply the ready patch: `git apply vault/handoff/questions-flow-fixture.patch`, then commit.
2. Say yes, and the orchestrator applies it in fix mode (rule 19).

**Q-0310 · EZD-175 (parallel lanes: bring a ticket branch up to date before its merge).** When two builds finish close together, the second one first takes in develop's newest changes; if both edited the same lines of a file, that update stops before anything reaches develop. Who fixes that clash?
1. (recommended) The build stops: the ticket goes to `blocked` with the clashing file names and a question, and you or an interactive session fix it in the ticket's folder. Same as every other stop today; nothing new to build.
2. The build hands the clash to the builder as one more review round (it merges develop and resolves the clash itself), falling back to option 1 when a clashing file is one the builder may not edit (vault/, scripts/, .claude/). Fewer stops, a bit more to build.
3. The orchestrator fixes it itself in fix mode and the build goes on. Not recommended: fix mode is meant for broken tools, not for merging two tickets' work.

Answering Q-0310 unblocks EZD-175, and through it EZD-174 (marked ready, but it waits for EZD-175, Q-0311).

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

Fix tickets added for earlier answers: Q-0281 → EZD-176, Q-0283 → EZD-177, Q-0290 → EZD-178, Q-0286 → EZD-181, Q-0316 → EZD-182.

## 3. Proposed wording

Full tables are in each plan's section 6. Needing your approval:

- **EZD-103b** (EZD-103 plan section 6): toast when a Settings page comes back with a draft: "Your unsaved changes from last time are still here." (Q-0302).
- **EZD-112** section 6: `office.company.*` keys: subtitle "Identity used on the title block, client pages, selections PDF and email."; "Upload"; "Uploading…"; "{kind} logo"; more rows in the plan.
- **EZD-136** section 6 (W3 now also shows to a signed-in person whose language is Spanish, Q-0305 (c)): W1 Spanish disclaimer "Solo para diseño y planificación. Todos los cálculos y códigos deben ser verificados por el usuario y por un profesional con licencia en la jurisdicción del proyecto."; W3 Spanish not-found text "Página no encontrada." (a Spanish speaker checks both, Q-0030 (a)). W2 "Page not found." is your own text (Q-0273).
- **EZD-149** section 6: runbook sentences for the new preview rule (if Q-0284 stands).
- **EZD-151** section 6 R1: runbook text for a separate Resend preview key `ezdraft-preview`.
- **EZD-155** section 6: launcher dry-run log lines W1-W6, for example "dry run: weekly usage at <pct>%; a real run would write vault/handoff/BUDGET_HOLD.md and notify" and "dry run: would notify: <message>".
- **EZD-162** section 6: the New cells E1-E22, with option (a) of Q1-A, Q1-B, Q1-C and Q2-A per your Q-0293 and Q-0294 answers, and Q3-A.
- **EZD-172** section 6: lane tool messages, for example "EZD_LANE must be 0, 1, 2 or 3 (got "<value>")." and "GATE FAIL: another gate is running on lane <n> (pid <pid>). Run one gate per lane."
- **EZD-174** section 6: boost on/off/status lines and the process text P1-P4 (Q-0303), for example P2: "One ticket in progress at a time, or up to the boost build lanes while vault/handoff/BOOST.json exists (next_ticket.mjs --check fails on more). Josh raises the limit by editing this line." P4 also says docs/architecture.md no longer keeps two builds apart (Q-0304 (c)).
- **EZD-1704** section 6: the new drill step "Check the backups are current" for your runbook, plus any daily-workflow lines (see plan).
- **EZD-1707** section 6 W1-W4: Terms of service page text (placeholder terms; W3 ends with your Q-0208 sentence).
- No wording: EZD-132, 143, 145, 146, 147, 148, 150, 152, 154, 161, 168, 169, 170, 171, 173, 175, 176, 177, 178, 179, 180, 181.

## 4. Rule candidates

None (no lessons entry has `status: candidate`).
