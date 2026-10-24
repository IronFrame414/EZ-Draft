# Phase 1 · for Josh (questions unit, 2026-10-24)

## 1. Decisions needed

Recommendation first in each.

1. **Q-0272 · EZD-136** — The disclaimer line is 756 px; when the office status bar is narrower, what gives way? Recommend (a): the line is cut with "…" and shows in full on hover and for screen readers; readouts keep their room. (b) readouts are cut instead; (c) a shorter line below 1600 px (new wording).
2. **Q-0273 · EZD-136** — Next.js's built-in "page not found" and error pages show no disclaimer. Recommend (a): leave them, they are not app screens. (b) add an app not-found page with the line and "Page not found." (new wording).
3. **Q-0276 · EZD-143** — How many error reports may one address send per hour before it is refused? No source sets it. Recommend (a) 60 (the plan and tests use it). (b) 30, (c) 120, (d) your number.
4. **Q-0278 · EZD-143** — Your cap of 20 alert emails per hour (Q-0068 (a)) is shared by all kinds, so many browser reports could use all 20. Recommend (b): browser and worker alerts use at most 10 of the 20 (security-reviewer agrees). (a) keep one shared 20; (c) another split.
5. **Q-0287 · EZD-151** — Preview servers keep every stub email and its link in memory. Agents answered (a): keep at most N messages, dropping the oldest (previews keep the stub by default, Q-0041). What is N? Recommend 100 (the plan's number).
6. **Q-0291 · EZD-155** — A launcher dry run still writes the budget hold file and marker and sends notifications to you (Q-0137 (a) accepted this as the "full gate path"). Recommend (a): a dry run writes no hold or marker and sends no notification (run.mjs defines a dry run as "print what would run and exit"). (b) separate fix ticket; (c) keep as is.
7. **Q-0293 · EZD-162** — Which frame-rate target does the Surface hold in field checks: (a) the iPad's 30 fps, or (b) the desktop's 60 fps? Recommend (a): a touch tablet-class device, lower risk of a false fail. Your call.
8. **Q-0294 · EZD-162** — Slice 28 says "the joystick does the same on the iPad", but you have no iPad. Recommend (a): reword to the Surface, so EZD-1003's planner must show the joystick on the Surface's touch screen too. (b) the automated iPad test checks it and you skip it.
9. **Q-0297 · EZD-170** — When do you do the launcher live checks (J1-J9, about 30 minutes)? Recommend (a): the build unit does Part A, EZD-170 waits `blocked`, you do Part J at your next sit-down. (b) all in one sit-down; (c) record Part J as replaced by unit tests, no live check.
10. **Q-0300 · EZD-171** — Check J3 can run only on a Vercel preview, which exists only for the phase PR. Recommend (a): you run J1-J2 after EZD-171 merges and J3 on the phase 1 PR preview; auto-merge is set only after J3 is recorded. (b) J3 waits for the first real release; (c) you make one preview of `develop` by hand first.
11. **Q-0301 · EZD-1704** — Should the backup check also run daily by itself (new scheduled workflow; GitHub emails you on failure)? Recommend (a): by hand in the drill only for now; the System status page shows it later. (b) add the daily workflow now.
12. **Q-0302 · EZD-103** — With your Q-0265 (b) answer, Back is caught one step at a time. A long-press Back that jumps two or more pages leaves before any prompt and loses unsaved edits. Recommend (a): accept it as a known limit (rare). (c) name another handling. Tell me if you want it treated differently.

(Q-0089 storage limits and Q-0237 payments stay escalated; they are not phase 1.)

## 2. Agent answers to confirm

Confirm or override each.

| ID | Ticket | Answer | Source |
| --- | --- | --- | --- |
| Q-0266 | EZD-112 | (b) EZD-132 now has a plan with two signature changes; EZD-112 is re-validated against it before build | EZD-132.md line 208 |
| Q-0269 | EZD-132 | (b) Storage refuses supplier PDFs and order reports to members without See company costs (adds EZD-101 dependency, one test) | 03b rule 2; Q-0235 (a); Q-0087 (ii) |
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
| Q-0298 | EZD-170 | (b) fix ticket: automated test of the API-credits override with a fake `claude` (no money spent) | CLAUDE.md rules 3, 6 |
| Q-0299 | EZD-170 | (b) fix ticket: launcher saves raw text of any limit error and notifies you | Q-0268 |

## 3. Proposed wording

Full tables are in each plan's section 6. Needing your approval:

- **EZD-112** (`vault/plans/EZD-112.md` section 6): `office.company.*` keys: subtitle "Identity used on the title block, client pages, selections PDF and email."; "Upload"; "Uploading…"; "{kind} logo"; more rows in the plan.
- **EZD-136** section 6 W1: Spanish disclaimer "Solo para diseño y planificación. Todos los cálculos y códigos deben ser verificados por el …" (a Spanish speaker checks it, Q-0030 (a)). English is yours (Q-0208).
- **EZD-149** section 6: runbook sentences for the new preview rule (if Q-0284 stands).
- **EZD-151** section 6 R1: runbook text for a separate Resend preview key `ezdraft-preview`.
- **EZD-162** section 6: the New cells E1-E22 and option texts Q1-A to Q3-A (vault text you read).
- **EZD-1707** section 6 W1-W4: Terms of service page text (placeholder terms; W3 ends with your Q-0208 sentence).
- **EZD-171** section 6: see plan.
- No wording: EZD-132, 143, 145, 146, 147, 148, 150, 152, 154, 161, 168.

## 4. Rule candidates

None (no lessons entry has `status: candidate`).
