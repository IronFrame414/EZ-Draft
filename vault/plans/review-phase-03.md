# Plan review · phase 3

Written by the launcher from the code-reviewer's final report (2026-11-04T19:36:53.869Z).

VERDICT: FAIL

1. **in-place, behavior.** EZD-120a §3 and §4 (test edits E1–E4) don't cover EZD-133's route check (§3 `money/route-cases.ts`, test C1, smoke). 133 builds first, and 120a then adds `POST /api/projects/[id]/objects` and `POST /api/projects/[id]/checkpoints` with no money-test entries. C1 would report both routes as missing, M1 and M2 would never check them, and 120a's gate would go red. 133 §9 already says "EZD-120a needs re-validation". Fix: add E5, the two cases (200 and 201, using the R1 and R2 success requests).
2. **in-place, behavior.** EZD-120a, Decided "parseSaveRequest" and M5 step (5): the "repeated id → null" check doesn't say case. U1 accepts an upper-case uuid, so one object sent in two cases passes a plain string compare. Both changes then reach the insert, which gives 23505, mapped to 500 instead of 400. EZD-202 ("Document checks") compares lower-cased. Fix: compare lower-cased in both the TypeScript and SQL checks, and add a mixed-case repeat row to U1 and D6.
3. **in-place, behavior.** EZD-120b is only a split proposal, yet the ledger says `planned`. `vault/tickets/tickets.json` has no EZD-120c or EZD-120d, and TRACE lists AC-EZD-120b-1 to -11 as "(no plan yet)". There is no contract or test table to review. Fix: the orchestrator applies the split (part rows, ACs through `gen_acs.mjs`), the planner plans part 120b, and plan review re-runs on the part plans.
4. **in-place, minor.** EZD-120b split, "Applies to every part": no part adds a money-test entry for its new route (part b `GET /api/projects/[id]/model`, part d `app/src/app/api/dev/model/[id]/route.ts`). Same gate failure as finding 1. Fix: add one line.
5. **question (already Q-0573).** Two plans conflict. The EZD-120b split builds 120b before 202. EZD-202 §3 "dependents" has 120b sending `CURRENT_SCHEMA_VERSION` and reading through `parseStoredObject`, and tickets.json has EZD-202 depending on 120a and 120b. Either answer changes one plan: (a) 202 depends on 120a only, and the 120b split and build order use 202 §3; (b) 202 adds a step that reworks 120b's load and outbox.
6. **in-place, minor.** Two plans are over the 15,000-character product-plan cap (`vault/PROCESS.md:218`, H2): EZD-133 (15,008) and EZD-238 (15,020). While trimming 133, also fix its "Do not touch" line ("no builder file under app/src/ contains the text @supabase/"). It is stricter than D5 and T34 (non-type imports only), and the type import in `app/src/server/customers/customers.ts:4`, which 120a copies, already breaks it.
7. **in-place, minor.** EZD-238 §4 T6, "segment 16 (0,0)→(120,120)": that segment is the k = 0 line, number 16 counting from 0 (the 17th). Write "index 16 (0-based, k = 0)" so the test-author doesn't take the k = −1 line.
8. **Not reviewed.** EZD-299 is blocked on board S03b (Q-0510), so AC-EZD-299-1 to -12 have no plan yet. Review it after Josh approves the board.

Checked and correct:
- **202 and 238 fit together.** `Point`, `ModelDocument` and the fields 238 reads all exist in 202 §3.
- **202 matches 120a.** The floor shape matches 120a M4, and 120a M6's checkpoint document has the same shape as 202's `StoredObject`.
- **238 test values.** I recomputed T1–T6, T8, T9, T11 and T13 by hand; all match.
- **133's 28 route cases.** They match the 25 `route.ts` files plus 3 routes with a second method.
- **SQL probe rule (L-009).** 120a's SQL was run on PostgreSQL 17.11; 202's M1 is marked "confirm on pinned stack".
- **Visual checklists.** Only 120c and 120d have one, and both depend on EZD-016a.
- **Required lines.** Every plan has its ACs, a complexity rating and a `security-review` line, and every AC of 120a, 133, 202 and 238 has a test row.

Re-dispatch to the planner: EZD-120a (1, 2), EZD-120b part plans (3, 4), EZD-133 (6), EZD-238 (6, 7). EZD-202 waits on Q-0573 (5).
