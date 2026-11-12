# A2. Spec coverage; A6. Debt and open findings

Audit 2026-11, session 16. The counts come from a general-purpose agent using grep, awk and git. That agent could not write files, so the orchestrator wrote this one.

## A2. Spec coverage, phases 0 to 4

**What "covered" means today.** TRACE.md says in its own header: "An AC is covered when its ticket is `done`". TRACE also gives every AC its ticket's whole test list: for example, AC-EZD-117a-5 and -7 have identical lists (TRACE.md:625, 627). So `ACs covered` in PROGRESS.md (0: 221/222, 1: 302/364, 2: 62/64, 3: 84/84, 4: 91/92) counts done tickets, not tested criteria.

**ACs not covered by ticket status.** Source: `grep -n '^| AC-' vault/tickets/TRACE.md | grep -v '| done |'`.

| Phase | Uncovered | Why |
| --- | --- | --- |
| 0 | 1: AC-EZD-003-1 | EZD-003 is blocked, waiting on Josh's before-launch checklist and first release (Q-0032 (a)). The repo work is merged (dc6e8e6). |
| 1 | 62, across 22 blocked tickets | See the blocked table in A1-tickets.md. Put off by Josh 11-03: EZD-185, 191, 248, 249, 261, 263, 264, 275. Dropped by the lean process 11-04: EZD-265, 268, 269-274. External: EZD-141. Sandbox: EZD-328. Need fix-mode plans: EZD-355a/b. **EZD-365 and 369 are merged, and only the ledger lags; with them counted, phase 1 is 306/364.** |
| 2 | 2: AC-EZD-276-1, -2 | EZD-276 was put off by Josh on 11-03. The 1 s first-cards budget is still checked by app/e2e/projects.spec.ts:152. |
| 3 | 0 | |
| 4 | 1: AC-EZD-372-1 | EZD-372 is still building. |

**Real coverage, ticket by ticket.**
- **Method.** Whole-word ticket-ID mentions in tracked test files: column `test_file_mentions` in `a1-mechanical.csv`, from `scripts/mech.mjs`.
- **Totals.** Done tickets that no test file mentions: phase 0: EZD-037, 038, 039 (5 ACs); phase 1: EZD-162, 170, 195, 196, 282, 361 (10); phase 2: EZD-292 (2); phase 4: EZD-351, 371 (2). That is **19 of the 765 ACs TRACE counts as covered**.
- **Most are not gaps.**
  - Plans that list checks, not test files: vault wording fixes (037, 038, 039, 162), pilot checks (170, 195, 196), and re-runs of existing tests (292, 351).
  - Edits inside another ticket's test: EZD-371 changes EZD-108 T18.
- **Real gaps.**
  - **EZD-361:** plan test T1 has no test naming EZD-361.
  - **EZD-282:** no tests, but it was closed as obsolete and not built (STATUS.md:610). That is a ledger fault (marked `done`), not a missing test.
- **Test-ID spot check (20 plan test IDs).**
  - 15 found on a test title line.
  - 2 found by title text (EZD-006 T15 in rls.audit.test.ts; EZD-007d T4 in sign-in.test.ts).
  - **3 not found:** EZD-005a T9; EZD-007a T28, named only at docs/architecture.md:1357; EZD-224 T-D7 (phase 6).
- **Limits.**
  - This works at ticket level only, because TRACE cannot separate ACs.
  - A mention can be a comment, so zero mentions is strong evidence and a mention is weak evidence.
  - Many titles say "EZD-xxx done when: ..." without a T-ID.
  - A title that matches proves neither a pass nor a real assertion. That needs the per-ticket reading in A1, which found the weak tests listed there.
  - The 20-pair sample was not random.

## A6. Debt and open findings

`vault/debt.md` has 46 rows: 13 closed, 33 open. The uncommitted working-tree edits add D-102 and D-103 (`git diff --stat -- vault/debt.md`: +2 lines).

**Overdue under rule 17.** Medium debt is due before the phase gate; low debt within two phases. Phases 0 to 3 have merged.

| Rows | Severity | Why overdue |
| --- | --- | --- |
| D-016 (second row: list-pinning tests not tagged @smoke), D-037, D-085 | medium | The phase 2 gate passed with them open. Tickets EZD-349 to 353 were filed in phase 4 for some of them (6236f1a5). |
| D-001, D-002, D-042, D-080 | low | Two phases have passed |
| D-026, D-046, D-052, D-056 | low | Found in phase 1; phase 3 has passed |

**11 overdue: 3 medium, 8 low.** Due at the phase 4 gate now: D-017, D-035, D-038, D-039, D-057, D-058, D-059 and D-099.

**Faults in the debt file itself:**
- D-099's Closed cell says "open: fix ticket EZD-366", but EZD-366 is done.
- The ID D-016 is used for two different rows.
- D-042 and D-052 are the same finding (profile/route.ts:25, the unused `_request`).
- The new D-102 and D-103 are malformed: the deadline is cut off and the Closed column is missing.
- Closed build-system rows (D-004, 008, 012, 014, 021, 022, 023, 075) remain, though the header says they belong in tooling-notes.

**Tooling notes that keep coming back.** 142 bullets in all.

| Recurring cause | Lines | Where |
| --- | --- | --- |
| **ui-verifier could not take screenshots** (local Supabase or Chromium unavailable in the unit sandbox) | 7 | lines 12, 26, 65, 117, 129, 143, 146 (D-013, D-034, EZD-332, 209, 299, 217, 211b) |
| Tests need the local Supabase stack inside the sandbox | 6 | 91, 117, 120, 129, 143, 146 |
| Tests and plan drift through structural repairs | 4 | 83, 84, 98, 142 |
| ui-run serves a stale .next build | 2 | 62, 111 |
| Prettier; nextQuestionId race; proxy/ENOTFOUND; stop-ledger-check "plan differs" | 2 each | |

The worst is the ui-verifier one. Visual checklists keep going unchecked: the 11-10 handoff says EZD-211b's 8 visual rows were "not screenshot-checked". That is app verification, filed as tooling, so under rule 17 it never blocks anything.

**Parking check (rule 17: no finding is parked).**
- "Follow-up" items appear only in 23 phase 0 and 1 STATUS rows. Split on ";", that gives 35 items, all of them checked:
  - **0 of 35 have a debt row.**
  - About 22 were handled in the 2026-10-24 sweep (Q-0268, vault/tickets/sweep-2026-10-24.md). Whether its 28 proposed fix tickets were built was not checked.
  - 2 were fixed in code with tests, 3 became a ticket or question, and 3 were accepted by their plan.
- **5 have no record anywhere:**
  - EZD-008b: the runbook should say to create a separate sending key for previews.
  - EZD-021: the net guard covers only fetch, http and https.
  - EZD-025: B2 behaviours unverified.
  - EZD-040: the email regex runs in quadratic time, and some fields are not scrubbed. The only record is research R-041.
  - EZD-008b: the http-link follow-up.
- Since phase 2, findings go to debt.md or tooling-notes instead. The phase 4 slices found more items that sit only in STATUS notes or tooling notes; A1 lists them.
