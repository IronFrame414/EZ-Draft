# Phase 1 · for Josh (questions unit, 2026-10-24, third run)

Your twelve answers from earlier today are applied to the plans: EZD-103 (draft), 136 (not-found page), 143 (10 of 20 alert emails), 151, 155 (dry run writes nothing), 162, 170, 171 (J3 on the live site) and 1704 (daily backup check). Applying them raised the new questions below. Third run: the Settings shell plan (EZD-103) grew past the size limit with your draft answer, so it is now two tickets, EZD-103a (the shell) and EZD-103b (unsaved edits and drafts); see Q-0309 in section 2.

## 1. Decisions needed

Answer by number. Recommendation first.

1. **Q-0303 · EZD-174** — Parallel lanes need two process lines changed: PROCESS-EZDRAFT.md section 8 (only you raise the one-ticket-in-progress limit) and PROCESS.md section 6 (plans are never written in parallel). The plan's proposed text is rows P1-P4 of its section 6 (listed in section 3 below). Recommend (d): you approve the P1-P4 text here, and the orchestrator puts it in during EZD-174's build, because those files change only with your approval (PROCESS.md section 1). (a) the orchestrator writes P1-P4 in the build and you confirm or revert later; (b) you edit those lines yourself before the build; (c) you change the wording first.
2. **Q-0304 · EZD-174** — Two builds whose plans name the same file never run together, because a squash merge of two edits to the same lines stops (MERGE STOP). 118 of 132 plans name docs/architecture.md. Several of the last 12 merges appended rows to the end of the same tables in that file (environment names, Dependencies, Machine checks), so an exemption would stop merges often, not rarely, and a rebase step meets the same clash. Recommend (a): count docs/architecture.md like any file; builds then rarely run side by side, but plans and other units still do, and no merge stops. (b) exempt it and accept a merge stop for a hand fix when edits clash; (c) exempt it and add a ticket that rebases before the squash.
3. **Q-0305 · EZD-136** — Your new not-found page ("Page not found." plus the disclaimer) can be reached signed in or signed out, and no rule says which language it shows. Recommend (c): the person's own language setting when signed in, else the device's sign-in language choice. A Spanish crew member then always sees Spanish (R24 #40), at the cost of one database read when someone opens a wrong address. (b) only the device's sign-in language choice, with no database read (the planner's pick), but a Spanish user who never picked Español at sign-in sees English; (a) English only.
4. **Q-0307 · EZD-171** — Your Q-0300 answer runs check J3 on the live site right after EZD-171 merges. But the live site shows `main`, which changes only when a phase PR merges (Q-0264), and tickets merge to `develop`. So the page is not on the live site until the phase 1 PR merges. Recommend (b): J3 runs on the live site after the phase 1 PR merges, and a mismatch becomes a fix ticket at the start of phase 2. It needs nothing from you in Vercel, but it gives up your condition that J3 runs before the phase gate: the phase PR auto-merges when CI passes (Q-0261), so a mismatch is found after the merge. (a) and (c) keep that condition but depend on Vercel behavior nobody has checked. (a) after the merge you deploy `develop` to production by hand in Vercel (steps not checked); (c) you set Vercel's production branch to `develop` until launch, so every ticket merge goes live (the release workflow and runbook would need their own question).

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

## 3. Proposed wording

Full tables are in each plan's section 6. Needing your approval:

- **EZD-103b** (EZD-103 plan section 6): toast when a Settings page comes back with a draft: "Your unsaved changes from last time are still here." (Q-0302).
- **EZD-112** section 6: `office.company.*` keys: subtitle "Identity used on the title block, client pages, selections PDF and email."; "Upload"; "Uploading…"; "{kind} logo"; more rows in the plan.
- **EZD-136** section 6: W1 Spanish disclaimer "Solo para diseño y planificación. Todos los cálculos y códigos deben ser verificados por el usuario y por un profesional con licencia en la jurisdicción del proyecto."; W3 Spanish not-found text "Página no encontrada." (a Spanish speaker checks both, Q-0030 (a)). W2 "Page not found." is your own text (Q-0273).
- **EZD-149** section 6: runbook sentences for the new preview rule (if Q-0284 stands).
- **EZD-151** section 6 R1: runbook text for a separate Resend preview key `ezdraft-preview`.
- **EZD-155** section 6: launcher dry-run log lines W1-W6, for example "dry run: weekly usage at <pct>%; a real run would write vault/handoff/BUDGET_HOLD.md and notify" and "dry run: would notify: <message>".
- **EZD-162** section 6: the New cells E1-E22, with option (a) of Q1-A, Q1-B, Q1-C and Q2-A per your Q-0293 and Q-0294 answers, and Q3-A.
- **EZD-172** section 6: lane tool messages, for example "EZD_LANE must be 0, 1, 2 or 3 (got "<value>")." and "GATE FAIL: another gate is running on lane <n> (pid <pid>). Run one gate per lane."
- **EZD-174** section 6: boost on/off/status lines and the process text P1-P4 (Q-0303), for example P2: "One ticket in progress at a time, or up to the boost build lanes while vault/handoff/BOOST.json exists (next_ticket.mjs --check fails on more). Josh raises the limit by editing this line."
- **EZD-1704** section 6: the new drill step "Check the backups are current" for your runbook, plus any daily-workflow lines (see plan).
- **EZD-1707** section 6 W1-W4: Terms of service page text (placeholder terms; W3 ends with your Q-0208 sentence).
- No wording: EZD-132, 143, 145, 146, 147, 148, 150, 152, 154, 161, 168, 170, 171, 173.

## 4. Rule candidates

None (no lessons entry has `status: candidate`).
