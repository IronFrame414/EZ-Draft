# Phase 0 · Questions for Josh

Written 2026-10-19 by the orchestrator (`questions 0` unit, PROCESS.md section 7). This replaces the earlier file of the same day (commit eb6562f). New since then: two agent answers on the release checks (Q-0159, Q-0160), three earlier agent answers not yet in this file (Q-0156, Q-0157, Q-0158), wording items 56 to 88 for the release tickets EZD-023a to 023e, and six rule candidates (L-009 to L-014). Answer by number, in any form ("section 2 confirmed", "section 3 approved", "section 4 all ratify"). Every item gives the recommendation first. Everything in sections 2 to 4 stands as written until you change it.

Q-0089 (storage limit) stays open for a later phase and is not asked here.

## 1. Decisions needed

None. No Phase 0 question is waiting on you.

## 2. Agent answers to confirm

Josh confirmed Q-0154 to Q-0157 and Q-0159 to Q-0162 in chat on 2026-10-19. Still open:

1. **Q-0158** (EZD-023e): the release workflow installs packages the same way the dev-database workflow already does (`pnpm install --frozen-lockfile`). The rebuild step for the Supabase tool is dropped, because no package is allowed to run install scripts (your Q-0140 answer) and that tool has none. Source: Q-0140 (a); `.github/workflows/supabase-dev.yml`. **Confirm or override.**

## 3. Proposed wording

Items 1 to 88 approved by Josh in chat on 2026-10-19 (decisions/process.md). Nothing open.

## 4. Rule candidates

None. Josh ratified L-009 to L-014 in chat on 2026-10-19.
