# Plan review · phase 6 (re-planned set)

Written by the session 17 orchestrator from the code-reviewer's mode 1 report (2026-11-11, about 10:20 UTC), run by hand because next_ticket.mjs does not offer review-plans for a phase already building (vault/tooling-notes.md). Plans read: EZD-135, EZD-224, EZD-224b, EZD-235, EZD-235b. The contracts of the held plans (EZD-214, 216, 218, 237, 6001) were read too. The pre-hold review is archived at vault/archive/process/review-phase-06-before-replan.md.

VERDICT: FAIL. Re-dispatch EZD-135 (finding 1), EZD-235 (finding 3) and EZD-224b (finding 2). Findings 4 to 6 go to the code-bound step of EZD-6001, EZD-216 and EZD-237.

1. defect, behavior. EZD-135 sections 1 and 4: 46 new tests in 9 files plus 14 build steps, over both size limits (PROCESS.md section 6 "Ticket size") with no split proposal. Fix: a split proposal, for example a) migration, route, server code and alert link; b) page, cards and browser tests. Q-0665 (escalated to Josh) still applies.
2. in-place, minor. EZD-224b sections 1, 3 and 9: stale citations. EZD-235b.md:44 and :70 are now :46 (D-Types) and :72 (D-Doc). EZD-224.md :32, :49-50, :74, :114 and :135 point at the split proposal, but that file is now the part a plan. "EZD-224 not built" is no longer true (its build is running). review-phase-06.md:17 was moved to the archive.
3. in-place, minor. EZD-235 section 3 Connections: it cites review-phase-06.md:7 and :12, which were moved. It also says EZD-6001's U7 and E1 call planDrawingList(objs, {}, F2), but EZD-6001.md:105 has planDrawingList(objs, F2). State that as a change EZD-6001 still has to make.
4. in-place, at EZD-6001's code-bound step. Step 2, U7 and E1: after EZD-235, planDrawingList(objects, options = {}) means EZD-6001 must name options before chosen and write U7 and E1 as (objs, {}, F2) and (x, {}, null).
5. in-place, at EZD-216's code-bound step. It cites P235 K1-K3, K7, K8 and K10, which no longer exist. Point them at EZD-235 section 3 (DerivedDef, DerivedSource.objectsOf('wall', level), DerivedStats, the four-parameter buildDrawingList).
6. note, for EZD-237's code-bound step. Step 17 cites gate.ts "EZD-236 row (line 118)": create_benchmark_project is at app/test-harness/rls/gate.ts:141, and :118 is create_checkpoint. What it takes from EZD-135 lines up.
7. note. EZD-235 and EZD-224b both change app/src/editor/plan/controller.ts (derivedStats() and captureThumbnail(), plus RenderRoot.captureFrame) and controller.test.ts. Neither plan names the other. Either order works if test fakes go through makeFakeRoot; whichever merges second rebases.
8. debt, low. EZD-235b D-Doc hunk 2: the src/workers/ Folder layout line names serve-jobs.ts but not probe-job.ts.
9. note. EZD-224 is about 30 files with its harness and test edits, but it is being built, so it is not re-dispatched. EZD-235b, at 22 files and 25 tests, is at the limit.
10. Checked, no clash:
    - The 224/224b Seam.
    - Migration order: 135 must take a timestamp after 224's 20261111120000.
    - Shared-list counts: money page count 35 to 36 (EZD-135 only); DISCLAIMER_PAGES (EZD-135 only); storage policies 5 to 6 (EZD-224 only); GATED_RPC_CALLS (by name); perf budgets (EZD-235b only).
    - The worker hunks and the Folder layout line.
    - TRACE: every AC of these five plans has a row.
