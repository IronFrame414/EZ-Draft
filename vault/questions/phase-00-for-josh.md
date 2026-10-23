# Phase 0 · Questions for Josh

Updated 2026-10-23 (Q-0248, EZD-035 wording). Written 2026-10-22 by the orchestrator (`questions 0` unit, PROCESS.md section 7). This replaces the earlier 2026-10-22 file. Nothing was answered since then. New since then: the split of EZD-015 into three parts (answered by the orchestrator) and the Spanish for four common buttons from EZD-015a. EZD-015a, EZD-015b and EZD-015c are now ready to build. Answer by number, in any form ("1 a", "section 2 confirmed", "section 3 approved", "section 4 ratify both"). Every item gives the recommendation first. Everything in sections 2 and 3 stands as written until you change it.

Q-0089 (storage limit) and Q-0237 (charging other companies) belong to later phases and are not asked here.

## 1. Decisions needed

1. **Q-0243** (EZD-034). With the sign-in check (Cloudflare Turnstile) turned on, every automated sign-in test makes the local sign-in service contact Cloudflare's test server, and the browser tests load the check from Cloudflare. Our rule says tests never call live services (it lists AI, email, render services and EZ Binder), so this needs your call.
   - **(a) Recommended: allow it with Cloudflare's test keys.** Only this tests the real check end to end, as the ticket asks. The cost: the test run and CI need internet, and a Cloudflare outage turns the tests red until it recovers.
   - (b) Allow the sign-in service's call but fake the on-page check in browser tests. Still needs internet, and the real on-page check is never tested.
   - (c) Leave the check off in tests and check it by hand on the dev site. No automated proof that a request without the check is refused.
   - Source (code-reviewer): CLAUDE.md rule 6; docs/architecture.md Tests, CI; vault/tickets/phases/phase-00.md (EZD-034 row); R-013 (3). EZD-034 waits on this answer.

## 2. Agent answers to confirm

1. **Q-0239** (EZD-012): the editor frame ticket (tool rail, panels, status bar) was too big for one build, so it is split into three parts built in order: EZD-012a (tool rail and tooltip), EZD-012b (frame, status bar, empty editor), then EZD-012c (developer test pages and the browser test that proves it). Nothing it delivers changes. Source: vault/PROCESS.md section 6 Ticket size; vault/plans/EZD-012.md Split proposal; Q-0238. **Confirm or override.**
2. **Q-0240** (CI): the first CI run failed because the release-safety check could not fetch release tags when none exist yet. It now first asks GitHub whether any release tag exists and treats "none" as fine; a GitHub it cannot reach still fails the check in CI. Proved by a new test and a full gate pass. Source: scripts/release/check-migrations.mjs; CI run 39522218868. **Confirm or override.**
3. **Q-0242** (EZD-034): the captcha goes only on the "send me a code" step (and the other requests Supabase checks it on), not on the code-entry step or the email link page. The leak you closed with Q-0175 is the code request; the code and link checks already give the same answer for every email. A test on our pinned version will prove that last point before the ticket is done. Source (security-reviewer): app/src/server/auth/actions.ts; Q-0175 (b); R-013 (1). **Confirm or override.**
4. **Q-0244** (EZD-014): the device layouts ticket (phone layout, touch-size buttons, iPad and Surface checks) was too big for one build, so it is split into three parts built in order: EZD-014a (switching between desktop, iPad and phone layouts, and the phone layout itself), EZD-014b (finger-size buttons and icon-only header buttons on touch screens), then EZD-014c (the developer test page and the browser tests that prove it). Nothing it delivers changes. Source: vault/PROCESS.md section 6 Ticket size; vault/plans/EZD-014.md Split proposal; Q-0239. **Confirm or override.**
5. **Q-0245** (EZD-014b): on touch screens, hover effects are turned off so they don't stick after a tap. The tool rail's tooltips still show when someone moves through the buttons with a keyboard (for example an iPad with a keyboard), on every device. To allow that, EZD-014b changes one earlier test that expected the tooltip style as a single block. Source: vault/plans/EZD-014.md QP-1 and its Level-1 answers (EZD-012 Step 2: hover does not stick on touch, keyboard focus still shows the tooltip). **Confirm or override.**
6. **Q-0246** (EZD-015): the shared screen states ticket (online status, loading placeholders, error with Retry, offline banner, toasts, confirm dialog) was too big for one build, so it is split into three parts built in order: EZD-015a (online status, loading placeholders, error and offline banners), EZD-015b (toasts and the confirm dialog), then EZD-015c (the developer test page and the browser tests that prove it). Nothing it delivers changes. Source: vault/PROCESS.md section 6 Ticket size; vault/plans/EZD-015.md Split proposal; Q-0244. **Confirm or override.**

7. **Q-0248** (EZD-029, EZD-035): the background-jobs browser test sometimes misses its first event, which failed EZD-029's check three runs of three while the same check passes on develop. The repair ticket you added (EZD-035) is the fix, so EZD-029 now waits for EZD-035 to merge, and nobody accepts the failure meanwhile. Source: vault/plans/EZD-035.md; phase-00.md EZD-035 row. **Confirm or override.**

## 3. Proposed wording

Items 1 to 97 approved by you (2026-10-19 and 2026-10-20; decisions/process.md). EZD-012a, EZD-012c, EZD-014b, EZD-014c, EZD-015b and EZD-015c have none (their labels are the boards' and 04's text, or reuse existing keys).

From EZD-012b (vault/plans/EZD-012b.md section 6). Read aloud by screen readers only, for the empty left panel:

98. `office.shell.left_panel`: "Left panel"

From EZD-034a (vault/plans/EZD-034.md Proposed wording). Shown on the sign-in page; Spanish is written by the builder (Q-0030 (a)). The check's own text is Cloudflare's, in the page's language:

99. `error.captcha_failed` (the check was refused): "The security check didn't go through. Try again."
100. `error.captcha_unavailable` (the check could not load): "The security check didn't load. Check your connection and reload the page."

From EZD-014a (vault/plans/EZD-014a.md section 6). The English is your approved Q-0056 (a) text; the Spanish is agent-written (Q-0030 (a)) and a Spanish-speaking crew member checks it at the field check. Listed for your look only:

101. `field.device.editor_on_phone` (phone opened on the editor), Spanish: "La edición se hace en un iPad o una computadora. Abre este proyecto allí."

From EZD-015a (vault/plans/EZD-015a.md section 6). The English is on the spec and boards (Retry, Offline, Cancel, Close); the Spanish is agent-written (Q-0030 (a)) and a Spanish-speaking crew member checks it at the field check. Listed for your look only:

102. `common.retry` (Retry button), Spanish: "Reintentar"
103. `common.offline` (offline banner), Spanish: "Sin conexión"
104. `common.cancel` (dialog Cancel), Spanish: "Cancelar"
105. `common.close` (close button on a notice), Spanish: "Cerrar"

From EZD-035 (vault/plans/EZD-035.md section 6). Developer terminal lines of `pnpm db:up`, not seen by users; listed for your look only:

106. `Realtime broadcast stream ready` (success)
107. `Local Realtime is not ready (<code>): run pnpm db:stop, then pnpm db:up.` (warm-up failed)

## 4. Rule candidates

1. **L-020** (test-author, from EZD-012b): when a test renders through the language wrapper (`MessagesProvider`), checks on where markup starts or ends name the wrapper exactly or anchor on the component's own tag, never the start, end or last closing tag of the whole output. **Recommended: ratify.** It cost two structural repairs on EZD-012b and one check silently got weaker; the rule is cheap and only applies to tests that use the wrapper.
2. **L-021** (planner, from EZD-012c): when a plan expects a computed style on an element that already exists in merged code, the planner reads that element's CSS rule and writes the value the browser returns, one entry per layer for layered properties. **Recommended: ratify.** EZD-012c's gate failed on a value written from the spec instead of the code; reading the existing rule is a one-step check.
