# Plan review · phase 2

Written by the launcher from the code-reviewer's final report (2026-10-30T02:49:07.605Z).

VERDICT: FAIL

Phase 2 is six plans: EZD-108, EZD-110, EZD-117a, EZD-117b, EZD-118 and EZD-140. Every acceptance item in TRACE.md (phase 2 section) has a test row. Every plan has its acceptance items, a complexity rating, a `security-review: yes` line and an EZD-016a dependency. EZD-110 is over 45,000 characters and carries its split proposal (110a/110b). I found 7 problems.

1. *behavior*: EZD-108 §1 step 1 and EZD-110 §1 D28 plus build steps. Both plans hard-code a migration named `20261029120000_*`, so the second to merge fails. EZD-110's D28 renumbers only when develop holds a migration newer than `20261029120002`, which EZD-108's file is not. EZD-108 has no renumbering rule at all (source: EZD-140 §9 Risks; lesson EZD-113). Fix: make the build create all of these files with `pnpm supabase migration new`, as EZD-117a, EZD-117b and EZD-118 already do. That closes the problem for every merge order. EZD-140 M3 should then name "EZD-110's merged notification-functions migration" rather than the fixed file name.
2. *minor*: EZD-108 §4 T1 and edit E1. It expects exactly 32 icon names, which is right only if EZD-108 merges before EZD-110 (+12 icons), EZD-117a (+1) and EZD-118 (+1). Develop has 29 today (`app/src/components/shell/HeaderButton.icon.test.tsx:18-48`). No dependency fixes that order. Fix: "develop's list at build start + `logout`, `person`, `settings`, sorted", as EZD-110 §4, EZD-117a E2 and EZD-118 E3 already say.
3. *minor*: EZD-118 §4 R1 expects 403 `FORBIDDEN`. That contradicts EZD-118's own §3 route row, its "POST order" decision and U3, which all give 403 `permission_denied` / `error.not_authorized`. Fix the expected value in R1.
4. *behavior*: EZD-110 §4 T14 (store test, part 110b, rated medium, so it gets no separate test review). The expected value only says "per D15", with no concrete states. D15 (EZD-110.md:84) also never says what `applyRead(id)`, `applyRead(null)` or a successful `open(id)` do to `unreadCount`; only `markAllRead` sets it to 0. That matters because the dot and the label "Notifications, N new" follow `unreadCount` (D24, T17). Fix: decide the `unreadCount` change for each method and list the expected state after each step.
5. *behavior* (ledger, no plan change): EZD-117b §1 step 13 says its build starts only after EZD-108 and EZD-110 merge. Its STATUS.md row lists only "EZD-117a, EZD-015", so `--next-unit` could start EZD-117b before EZD-108, which is in `questions`. Fix: add EZD-108 and EZD-110 to that row.
6. *minor*: EZD-117a §3 props row says `ProjectsView` takes `{ actions?: ReactNode }` and that "EZD-118 passes New project here". That contradicts EZD-117b step 12 (`{ account; canCreate; onNewProject? }` with `NewProjectButton`) and EZD-118 step 16. Fix: drop the EZD-118 note or point to EZD-117b.
7. *minor*: EZD-140 build step 10 adds `--ez-divider-row` and `--ez-shadow-switch-knob` and says "Verify with tokens.test.ts", but §4 has no test-author edit for them. `app/src/styles/tokens.test.ts:12,76-80` checks values only for names in its `EXPECTED` list, so the two new values would go untested. EZD-110 §4 does add its three tokens to that list. Fix: an edit row adding both, with values and groups, after EZD-110's.

Re-dispatch to the planner: EZD-108 (1, 2), EZD-110 (1, 4), EZD-117a (6), EZD-118 (3), EZD-140 (1, 7). EZD-117b needs only the ledger fix in 5.

Also: I ran `next_ticket.mjs --report`, which rewrote `vault/PROGRESS.md` and `vault/tickets/TRACE.md`. Both are uncommitted in the main checkout.

Files: vault/plans/EZD-108.md, EZD-110.md, EZD-117a.md, EZD-117b.md, EZD-118.md, EZD-140.md; vault/tickets/STATUS.md; app/src/components/shell/HeaderButton.icon.test.tsx; app/src/styles/tokens.test.ts
