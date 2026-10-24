# Phase 0 · Questions for Josh

Updated 2026-10-23 evening by the orchestrator (`questions 0` unit, PROCESS.md section 7). Your answers of 2026-10-23 are recorded: Q-0243 (c); Q-0239, Q-0240, Q-0242, Q-0244, Q-0245, Q-0246 and Q-0248 confirmed; wording items 98 to 107 approved (the earlier text of this file, commit 0f88f76); L-020 and L-021 ratified (Q-0249, Q-0250). Later the same evening Josh confirmed Q-0247, Q-0251, Q-0252 and Q-0253 and approved wording items 108 to 113 (commit cfd4c0b). Later, Q-0260 was answered by the orchestrator (section 2).

Q-0089 (storage limit) and Q-0237 (charging other companies) belong to later phases and are not asked here.

## 1. Decisions needed

None open. Q-0262 was answered by Josh on 2026-10-24: (a), a separate follow-up ticket, EZD-042. Q-0263 was answered the same day (EZD-027 verdict device).

## 2. Agent answers to confirm

- **Q-0260** (EZD-037): the ticket only changes `vault/` files, which the builder may not write. Answer: the orchestrator applies the plan steps directly on `develop` in one `fix(EZD-037)` commit, runs the plan's checks, and code-reviewer reviews it; no hook change. Source: vault/plans/EZD-037.md section 1; `.claude/hooks/guard-paths.mjs` orchestrator rule. Confirm or override.

Q-0258 and Q-0259 (guard-paths patches) are answered and recorded; nothing else waits on you for phase 0 except Q-0262.

## 3. Proposed wording

None open.

## 4. Rule candidates

None open.
