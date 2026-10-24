# Handoff · 2026-10-20 · build EZD-012

- Phase and stage: Phase 0, Stage 3; EZD-012 split into EZD-012a, EZD-012b, EZD-012c (see vault/PROGRESS.md)
- Why the session ended: unit complete (split at build step 1; each part is planned as its own unit, Q-0239)
- Completed this session:
  - Step 0 pre-flight PASS (develop clean, ledger OK, every dependency done).
  - Step 1: planner re-validation (Opus 5.5; deviating dependencies EZD-010c, EZD-011a, EZD-016a; v1 plan) found the plan over the size rule (21 builder files, 7 test files, 16 tests); split proposal and findings V1–V14 in vault/plans/EZD-012.md (13e5d49). No QP question; no test value or behavior changed.
  - Split applied in one commit (d394d21): phase-00.md, tickets.json (ACs from gen_acs.mjs), STATUS.md, QUESTIONS.md Q-0239 (answered-agent), TRACE.md. The 11 dependents of EZD-012 now depend on all three parts. LEDGER OK: 447 tickets.
  - Parts (all medium, security-review no): EZD-012a tool rail and tooltip; EZD-012b frame, status bar and empty editor; EZD-012c /dev/shell test pages and the Done-when browser test (AC-EZD-012c-1, ui-verifier, mockups/S03Plan.png).
- No worktree created; no code written.
- In progress: none
- Blocked: EZD-003 (unchanged, waiting on Josh's before-launch steps)
- Questions for Josh: Q-0175 (escalated); sections 2 to 4 of vault/questions/phase-00-for-josh.md. Proposed wording for EZD-012b's plan: "Left panel" (office.shell.left_panel, screen-reader label on no mockup).
- Ledger item for the next orchestrator (from the planner, not acted on): Q-0229 puts the disclaimer in the editor status bar (EZD-136's work), but EZD-136's depends_on (EZD-011, EZD-026c) does not list EZD-012; check it at plan EZD-136.
- Decisions made: Q-0239 (split, level 2); no lesson added.
- Next unit: plan EZD-012a
