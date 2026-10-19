# Phase 0 · Questions for Josh

Written 2026-10-19 by the orchestrator (`questions 0` unit, PROCESS.md section 7). This replaces the earlier file of the same day (commit bba8608). New since then: one agent answer (Q-0163, the EZD-026a split), the dev-page wording of EZD-026d (items 89 to 91), and one rule candidate (L-015). Answer by number, in any form ("section 2 confirmed", "section 3 approved", "section 4 ratify"). Every item gives the recommendation first. Everything in sections 2 to 4 stands as written until you change it.

Q-0089 (storage limit) stays open for a later phase and is not asked here.

## 1. Decisions needed

None. No Phase 0 question is waiting on you.

## 2. Agent answers to confirm

1. **Q-0158** (EZD-023e): the release workflow installs packages the same way the dev-database workflow already does (`pnpm install --frozen-lockfile`). The rebuild step for the Supabase tool is dropped, because no package is allowed to run install scripts (your Q-0140 answer) and that tool has none. Source: Q-0140 (a); `.github/workflows/supabase-dev.yml`. **Confirm or override.**
2. **Q-0163** (EZD-026a): the message-helper ticket was too big for one build, so it is split into three parts built in order: EZD-026c (the translation core), EZD-026d (the English and Spanish message lists and the test-page piece), then EZD-026a (the check that phone screens hold no hard-coded text, and the docs). Nothing it delivers changes; tickets that waited on EZD-026a still wait on it. Same flow as the earlier splits (Q-0148, Q-0150, Q-0152, Q-0155, Q-0157). Source: vault/PROCESS.md section 6 Ticket size; vault/plans/EZD-026a.md. **Confirm or override.**

## 3. Proposed wording

Items 1 to 88 approved by you in chat on 2026-10-19 (decisions/process.md). New, from EZD-026d (vault/plans/EZD-026d.md section 6). These show only on the developer test page, which is not found in production (same footing as EZD-010c's "Sample text"):

89. `dev.messages.sample`: English "Sample message" · Spanish "Mensaje de ejemplo"
90. `dev.messages.greeting`: English "Hello, {name}" · Spanish "Hola, {name}"
91. `dev.messages.items`: English "{count} item" / "{count} items" · Spanish "{count} elemento" / "{count} elementos"

For information, not asked now: the English of `error.db_unavailable` is your Q-0086 (a) text, "Can't reach the database. Try again in a minute." Its Spanish is written by the builder at build time (Q-0030 (a)) and will be listed for you after the build.

## 4. Rule candidates

1. **L-015** (from EZD-023d; builder and test-author): a test fake for an outside tool does only what the real tool does, and never creates folders or files the real tool expects to already exist; the code makes those itself. **Recommend ratify:** the fake created its own output folder, so every test passed while every real release would have failed at the database dump (caught only at code review).
