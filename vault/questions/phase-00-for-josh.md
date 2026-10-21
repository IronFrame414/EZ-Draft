# Phase 0 · Questions for Josh

Written 2026-10-21 by the orchestrator (`questions 0` unit, PROCESS.md section 7). This replaces the earlier file. Everything in that file was answered on 2026-10-20 (decisions/process.md, row "Q-0158 to Q-0238"). New since then: the captcha ticket EZD-034 (from your Q-0175 answer "b"), the split of EZD-012, and one CI fix. Answer by number, in any form ("1 a, 2 a", "section 2 confirmed", "section 3 approved"). Every item gives the recommendation first. Everything in sections 2 and 3 stands as written until you change it.

Q-0089 (storage limit) stays open for a later phase and is not asked here.

## 1. Decisions needed

1. **Q-0241** (EZD-034). Sign-in gets a "prove you're human" check (your Q-0175 answer). Which service provides it? You make the account and give the keys before launch; the ticket is built and tested with the service's free test keys.
   - **(a) Recommended: Cloudflare Turnstile.** Free, usually invisible to the person signing in, and its test keys work on the address the browser tests use (127.0.0.1).
   - (b) hCaptcha. Free tier; sometimes shows a picture puzzle; it refuses 127.0.0.1, so the browser tests would need a different local address.
   - Source: vault/plans/EZD-034.md Risks; R-013 (5).
2. **Q-0243** (EZD-034). With the check turned on, every automated sign-in test makes the local sign-in service contact the captcha company's test server, and the browser tests load the check from that company. Our rule says tests never call live services (it lists AI, email, render services and EZ Binder), so this needs your call.
   - **(a) Recommended: allow it with the company's test keys.** Only this tests the real check end to end, as the ticket asks. The cost: the test run and CI need internet, and an outage at that company turns the tests red until it recovers.
   - (b) Allow the sign-in service's call but fake the on-page check in browser tests. Still needs internet, and the real on-page check is never tested.
   - (c) Leave the check off in tests and check it by hand on the dev site. No automated proof that a request without the check is refused.
   - Source (code-reviewer): CLAUDE.md rule 6; docs/architecture.md Tests, CI; vault/tickets/phases/phase-00.md (EZD-034 row); R-013 (3).

## 2. Agent answers to confirm

1. **Q-0239** (EZD-012): the editor frame ticket (tool rail, panels, status bar) was too big for one build, so it is split into three parts built in order: EZD-012a (tool rail and tooltip), EZD-012b (frame, status bar, empty editor), then EZD-012c (developer test pages and the browser test that proves it). Nothing it delivers changes. Source: vault/PROCESS.md section 6 Ticket size; vault/plans/EZD-012.md Split proposal; Q-0238. **Confirm or override.**
2. **Q-0240** (CI): the first CI run failed because the release-safety check could not fetch release tags when none exist yet. It now first asks GitHub whether any release tag exists and treats "none" as fine; a GitHub it cannot reach still fails the check in CI. Proved by a new test and a full gate pass. Source: scripts/release/check-migrations.mjs; CI run 39522218868. **Confirm or override.**
3. **Q-0242** (EZD-034): the captcha goes only on the "send me a code" step (and the other requests Supabase checks it on), not on the code-entry step or the email link page. The leak you closed with Q-0175 is the code request; the code and link checks already give the same answer for every email. A test on our pinned version will prove that last point before the ticket is done. Source (security-reviewer): app/src/server/auth/actions.ts; Q-0175 (b); R-013 (1). **Confirm or override.**

## 3. Proposed wording

Items 1 to 97 approved by you (2026-10-19 and 2026-10-20; decisions/process.md). EZD-012a and EZD-012c have none (their labels are the boards' and 04's text).

From EZD-012b (vault/plans/EZD-012b.md section 6). Read aloud by screen readers only, for the empty left panel:

98. `office.shell.left_panel`: "Left panel"

From EZD-034a (vault/plans/EZD-034.md Proposed wording). Shown on the sign-in page; Spanish is written by the builder (Q-0030 (a)). The check's own text is the captcha company's, in the page's language:

99. `error.captcha_failed` (the check was refused): "The security check didn't go through. Try again."
100. `error.captcha_unavailable` (the check could not load): "The security check didn't load. Check your connection and reload the page."

## 4. Rule candidates

None. L-015 to L-019 were ratified on 2026-10-20 and no new candidate has been added since.
