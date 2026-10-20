# Phase 0 · Questions for Josh

Written 2026-10-20 by the orchestrator (`questions 0` unit, PROCESS.md section 7). This replaces the earlier file (commit 6ee7942). New since then: two agent answers (Q-0221 how the gate picks a phase's tests, Q-0238 the split of the header ticket), wording 94 to 97 (EZD-011c), rule candidates L-018 and L-019. Items carried over unanswered: Q-0175, Q-0158 to Q-0198 in section 2, wording 89 to 93, rule candidates L-015 to L-017. Answer by number, in any form ("section 2 confirmed", "section 3 approved", "section 4 ratify"). Every item gives the recommendation first. Everything in sections 2 to 4 stands as written until you change it.

Q-0089 (storage limit) stays open for a later phase and is not asked here.

## 1. Decisions needed

1. **Q-0175** (EZD-007d, EZD-007f; both built). EZ Draft's own sign-in page gives the same answer for every email address, so it never shows whether someone has an account. But the sign-in service behind it (Supabase) can also be called directly by a script, and it refuses an address with no account, so someone with a script could test addresses one by one and learn which ones are invited.
   - **(a) Recommended: accept it as a known risk for v1**, with Supabase's built-in rate limits as the only control. It takes a deliberate script, it reveals only whether an email is invited (nothing inside the account), and adding protection later does not change any screen.
   - (b) Add a "prove you're human" check (captcha) to sign-in. Supabase supports hCaptcha and Cloudflare Turnstile; it needs a new ticket, a new account with that service, and one more step on the sign-in page.
   - Source: vault/plans/EZD-007.md line 536; docs/architecture.md (Before-user-created hook); vault/plans/EZD-007d.md section 9 Risk (3).

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
10. **Q-0173** (EZD-007c, EZD-007d): every page response that sets or refreshes a sign-in cookie is marked "private, do not store", so a shared cache can never hand one person's sign-in to another. EZD-007d sets it (EZD-007c had no place to). Source (security-reviewer): `@supabase/ssr` 0.12.7 cookies code; vault/plans/EZD-007c.md section 3. **Confirm or override.**
11. **Q-0174** (EZD-007d): when someone asks for a sign-in code twice within a second, the page answers "check your email" exactly as it does for any address, instead of "too many tries", because only an invited address could ever hit that limit, so a different answer would show who has an account. "Too many tries" is shown only for the per-network-address limit. Source (security-reviewer): vault/spec/acceptance-criteria.md line 38; supabase/config.toml; vault/plans/EZD-007d.md section 9 Risk (3). **Confirm or override.**
12. **Q-0176** (EZD-007d): if the sign-in service itself fails (outage, network error) when a code is requested, the person sees an error rather than "check your email", so nobody waits for an email that was never sent. Source (security-reviewer): docs/architecture.md Errors and logging; Q-0174. It ties to decision 1 (Q-0175) above; your answer there may change it. **Confirm or override.**
13. **Q-0197** (EZD-007f): a test-setup file failed to load in the browser test runner; it was fixed inside the test files (no test changed what it checks) rather than by changing how the whole app package loads. Source (code-reviewer): vault/plans/EZD-007f.md section 3; app/next.config.ts; docs/architecture.md Root config files. **Confirm or override.**
14. **Q-0198** (EZD-016a): the browser-test helpers ticket was too big for one build, so it is split into three parts built in order: EZD-016c (a second test company and 200 test projects in the local database), EZD-016d (the four device sizes for browser tests), then EZD-016a (sign-in, two-person and offline helpers). Nothing it delivers changes. Source: vault/PROCESS.md section 6 Ticket size; vault/plans/EZD-016a.md (commit 548a74e); Q-0164. **Confirm or override.**
15. **Q-0221** (every phase; the gate script): after the phases were re-cut, a phase no longer holds only tickets whose numbers start with that phase number, so the per-ticket check now picks a phase's tests from the ticket list (each ticket's phase in tickets.json) instead of from the number. Phase 0 runs the same tests as before. Source (orchestrator): scripts/gate.mjs; docs/architecture.md Test scope; vault/tickets/tickets.json; proved by scripts/tooling/__tests__/tooling.test.mjs T13. **Confirm or override.**
16. **Q-0238** (EZD-011): the editor header ticket was too big for one build, so it is split into three parts built in order: EZD-011a (the header card and its buttons), EZD-011b (the header's content: wordmark, project name, view tabs, Share, Export, Issue set), then EZD-011c (a developer test page and the browser test that proves it). Nothing it delivers changes. Source: vault/PROCESS.md section 6 Ticket size; vault/plans/EZD-011.md Split proposal; Q-0198. **Confirm or override.**

## 3. Proposed wording

Items 1 to 88 approved by you in chat on 2026-10-19 (decisions/process.md). The plans for EZD-016a, EZD-016c, EZD-016d and EZD-011a have none (section 6 of each).

From EZD-026d (vault/plans/EZD-026d.md section 6). These show only on the developer test page, which is not found in production (same footing as EZD-010c's "Sample text"):

89. `dev.messages.sample`: English "Sample message" · Spanish "Mensaje de ejemplo"
90. `dev.messages.greeting`: English "Hello, {name}" · Spanish "Hola, {name}"
91. `dev.messages.items`: English "{count} item" / "{count} items" · Spanish "{count} elemento" / "{count} elementos"

From EZD-007c (vault/plans/EZD-007c.md section 6). Developers only, printed in the terminal, never in the app:

92. `supabase/.temp/ezd-api-gate-secret is missing: run pnpm db:up`

From EZD-007f (Q-0170; vault/plans/EZD-007f.md section 6). Shown on the sign-in and finish-signing-in pages when something unexpected fails. Spanish is written by the builder (Q-0030 (a)):

93. `error.sign_in_failed`: English "Something went wrong. Try again in a minute."

From EZD-011c (vault/plans/EZD-011c.md section 6). Sample data on the developer header test page, which is not found in production (same footing as items 89 to 91):

94. Project name: "Sample project"
95. Subtitle, client part: "Sample client"
96. Subtitle, version part: "Working copy" (04 Header card; S03 board)
97. Subtitle, save-state part: "Saved just now" (04 Header card subtitle example)

EZD-011a has no wording. EZD-011b's header labels (ez/draft wordmark, Views, Plan, 3D, Sheets, Render, Share, Export, Issue set) are the spec's and the approved S03 board's text, so they are not asked again (vault/plans/EZD-011b.md section 6).

## 4. Rule candidates

1. **L-015** (from EZD-023d; builder and test-author): a test fake for an outside tool does only what the real tool does, and never creates folders or files the real tool expects to already exist; the code makes those itself. **Recommend ratify:** the fake created its own output folder, so every test passed while every real release would have failed at the database dump (caught only at code review).
2. **L-016** (from EZD-007a; planner): every plan step that creates a database function says to take away public access first and then grant access by name, never relying on the database's defaults. **Recommend ratify:** the plan trusted a docs sentence about defaults, the real database gave everyone access to the new function, and only an existing security test caught it.
3. **L-017** (from EZD-007f; test-author): test code that the browser test runner loads uses no feature that works under only one of the two ways Node loads files, and test-author loads the runner's settings once before handing tests to the builder. **Recommend ratify:** a helper that worked under the unit-test runner broke the browser-test runner, so no browser test ran until the builder stopped and asked (Q-0197).
4. **L-018** (from EZD-016d; test-author): a test compares a secret only as a yes/no (or by comparing hashes), never with a check that prints both values when it fails. **Recommend ratify:** a failing check would have printed the database gate secret into the gate log (security-reviewer finding).
5. **L-019** (from EZD-016a; test-author): a test that proves something "never appears" counts what it could not look at and requires that count to be 0. **Recommend ratify:** the secret-never-in-a-page test treated any page it could not read as empty, so it could pass without checking anything (code-reviewer FAIL, round 1).
