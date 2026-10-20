# Phase 0 · Questions for Josh

Written 2026-10-20 by the orchestrator (`questions 0` unit, PROCESS.md section 7). This replaces the earlier file (commit 536f391). New since then: the EZD-007 sign-in split (Q-0164) and six answers on its parts (Q-0165 to Q-0170), two wording items (92, 93). Items carried over unanswered: Q-0158, Q-0163, wording 89 to 91, rule candidate L-015. Answer by number, in any form ("section 2 confirmed", "section 3 approved", "section 4 ratify"). Every item gives the recommendation first. Everything in sections 2 to 4 stands as written until you change it.

Q-0089 (storage limit) stays open for a later phase and is not asked here.

## 1. Decisions needed

None. No Phase 0 question is waiting on you.

## 2. Agent answers to confirm

1. **Q-0158** (EZD-023e): the release workflow installs packages the same way the dev-database workflow already does (`pnpm install --frozen-lockfile`). The rebuild step for the Supabase tool is dropped, because no package is allowed to run install scripts (your Q-0140 answer) and that tool has none. Source: Q-0140 (a); `.github/workflows/supabase-dev.yml`. **Confirm or override.**
2. **Q-0163** (EZD-026a): the message-helper ticket was too big for one build, so it is split into three parts built in order: EZD-026c, EZD-026d, then EZD-026a. Nothing it delivers changes. Source: vault/PROCESS.md section 6 Ticket size; vault/plans/EZD-026a.md. **Confirm or override.**
3. **Q-0164** (EZD-007): the sign-in ticket (about 40 files, 26 tests) was too big for one build, so it is split into six parts built in order: EZD-007a (who may get an account, local sign-in settings), 007b (linking the sign-in to the person's record), 007c (the server's sign-in session), 007d (the sign-in actions and invite acceptance), 007e (the sign-in messages in English and Spanish), 007f (the sign-in pages and their browser tests). Nothing it delivers changes. Source: vault/PROCESS.md section 6 Ticket size; vault/plans/EZD-007.md. **Confirm or override.**
4. **Q-0165** (EZD-007a): the database check that refuses an account to anyone without an invite is kept in the private part of the database, where nobody can call it from the internet, the same place as the existing sign-in check. Source (security-reviewer): docs/architecture.md Row-level security; supabase/config.toml. **Confirm or override.**
5. **Q-0166** (EZD-007f): the sign-in page gets its screenshot check at desktop size (1600 × 1000) in its own ticket, rather than waiting for a later ticket. Source (code-reviewer): vault/plans/EZD-016a.md; Q-0045 (a). **Confirm or override.**
6. **Q-0167** (EZD-007d): six refusal cases (wrong code, a code that is not 6 digits, a bad email address, a bad link, too many tries, an unknown language) each get an automatic test instead of being checked by hand at review. Source (code-reviewer): lesson L-012 (ratified). **Confirm or override.**
7. **Q-0168** (EZD-007c): if the database cannot be reached while checking who is signed in, the app treats it as an error (requests answer "Can't reach the database. Try again in a minute.") instead of sending the person back to the sign-in page as if signed out. Source (code-reviewer): docs/architecture.md Errors and logging (unexpected errors are shown as errors, nothing fails silently). **Confirm or override.**
8. **Q-0169** (EZD-007d): when someone types codes or opens links too many times and the sign-in service refuses, they see "Too many tries. Wait a minute and try again." (your approved text) rather than "That code is wrong or has expired." The limit counts per network address, so the message reveals nothing about whether an account exists. Source (security-reviewer): vault/plans/EZD-033.md (same rule for password sign-in); Q-0104 (i). **Confirm or override.**
9. **Q-0170** (EZD-007f): when sign-in fails for an unexpected reason, the form shows a short error in the person's language (wording item 93 below) instead of the framework's English-only error page. Source (code-reviewer): R24 #40 (Spanish users never see English); docs/architecture.md Errors and logging. **Confirm or override.**

## 3. Proposed wording

Items 1 to 88 approved by you in chat on 2026-10-19 (decisions/process.md).

From EZD-026d (vault/plans/EZD-026d.md section 6). These show only on the developer test page, which is not found in production (same footing as EZD-010c's "Sample text"):

89. `dev.messages.sample`: English "Sample message" · Spanish "Mensaje de ejemplo"
90. `dev.messages.greeting`: English "Hello, {name}" · Spanish "Hola, {name}"
91. `dev.messages.items`: English "{count} item" / "{count} items" · Spanish "{count} elemento" / "{count} elementos"

From EZD-007c (vault/plans/EZD-007c.md section 6). Developers only, printed in the terminal, never in the app:

92. `supabase/.temp/ezd-api-gate-secret is missing: run pnpm db:up`

From EZD-007f (Q-0170; vault/plans/EZD-007f.md section 6). Shown on the sign-in and finish-signing-in pages when something unexpected fails. Spanish is written by the builder (Q-0030 (a)) and listed for you after the build:

93. `error.sign_in_failed`: English "Something went wrong. Try again in a minute."

For information, not asked now: the English of `error.db_unavailable` is your Q-0086 (a) text, "Can't reach the database. Try again in a minute." Its Spanish is written by the builder at build time (Q-0030 (a)) and will be listed for you after the build.

## 4. Rule candidates

1. **L-015** (from EZD-023d; builder and test-author): a test fake for an outside tool does only what the real tool does, and never creates folders or files the real tool expects to already exist; the code makes those itself. **Recommend ratify:** the fake created its own output folder, so every test passed while every real release would have failed at the database dump (caught only at code review).
