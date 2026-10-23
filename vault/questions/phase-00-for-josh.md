# Phase 0 · Questions for Josh

Updated 2026-10-23 evening by the orchestrator (`questions 0` unit, PROCESS.md section 7). Your answers of 2026-10-23 are recorded: Q-0243 (c); Q-0239, Q-0240, Q-0242, Q-0244, Q-0245, Q-0246 and Q-0248 confirmed; wording items 98 to 107 approved (the earlier text of this file, commit 0f88f76); L-020 and L-021 ratified (Q-0249, Q-0250). Later the same evening Josh confirmed Q-0247, Q-0251, Q-0252 and Q-0253 and approved wording items 108 to 113 (commit cfd4c0b). Later, Q-0260 was answered by the orchestrator (section 2).

Q-0089 (storage limit) and Q-0237 (charging other companies) belong to later phases and are not asked here.

## 1. Decisions needed

- **Q-0262** (EZD-041, release fix: production database password on the psql command line). The ticket moves the password off psql's command line. The two Supabase CLI calls, `supabase db dump` and `supabase db push`, also receive the same URL as a `--db-url` argument on the same runner (`scripts/release/dump.mjs:90`, `push.mjs:25` and `:31`). This is a scope choice, so it is yours.
  Options: (a) a separate follow-up ticket for the Supabase CLI calls; (b) widen EZD-041 to cover them; (c) accept it as a known limit.
  **Recommended: (a).** EZD-041 stays small and finishes now; the CLI calls need their own plan because the CLI takes the URL only as an argument, so the fix differs from the psql one. Source: vault/plans/EZD-041.md section 10 and D10.

## 2. Agent answers to confirm

- **Q-0260** (EZD-037): the ticket only changes `vault/` files, which the builder may not write. Answer: the orchestrator applies the plan steps directly on `develop` in one `fix(EZD-037)` commit, runs the plan's checks, and code-reviewer reviews it; no hook change. Source: vault/plans/EZD-037.md section 1; `.claude/hooks/guard-paths.mjs` orchestrator rule. Confirm or override.

Still escalated and waiting on you: Q-0258 (EZD-025) and Q-0259 (EZD-034), both a `guard-paths.mjs` patch only you apply (`vault/handoff/EZD-025-guard-paths.patch`, `EZD-034-guard-paths.patch`); recommended: apply both, as for `scripts/perf/` in Q-0247.

## 3. Proposed wording

None open.

## 4. Rule candidates

None open.
