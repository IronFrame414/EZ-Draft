# Handoff · 2026-10-19 · build EZD-004

- Phase and stage: Phase 0, Stage 3 (build); EZD-000, EZD-000b to EZD-000i, EZD-001, EZD-002 done; EZD-003 blocked by design (Josh's launch steps)
- Why the session ended: unit complete. EZD-004 was not built: step 1 re-validation split it into three parts (Q-0148), each planned as its own unit
- Completed this session:
  - Step 1: planner (Opus 5.5) re-validated vault/plans/EZD-004.md after the EZD-000 and EZD-001 deviations (dbf4985): macOS build machine, Docker 29.8.2 running; the `supabase` 2.121.0 CLI has no install script, so no allowBuilds entry (Q-0140 (a) holds); root test concurrency 4; Dependencies rows already right; docs/runbook.md exists. About 26 files and 16 tests, so a split proposal, no QP.
  - Split applied (828eb0a, Q-0148 answered-agent): EZD-004a local Supabase and migrations in the gate (high, depends EZD-001); EZD-004b app reads the health row via /api/health (medium, depends 004a); EZD-004c cloud dev migrations workflow and runbook (medium, depends 004a, 004b, EZD-002). Status todo. ACs regenerated (gen_acs.mjs). EZD-005, 008, 009, 023a, 023b, 025 now depend on all three.
- In progress: none (no worktree, no branch made)
- Blocked: EZD-003 unchanged (Josh's Before-launch checklist and first real release)
- To do before EZD-004a's builder starts: add a builder write exception for `scripts/db/` in .claude/hooks/guard-paths.mjs (plan finding F3; Q-0125 (a), same form as Q-0124 (a)); record it in the handoff
- Follow-ups for the orchestrator:
  - EZD-023b re-validation: its Step 3.4 and T17 assume the `supabase` package runs an install script; it does not (plan F2)
  - vault/tickets/README.md line 47 and needs-from-josh.md line 20 still say "Windows build machine"
  - scripts/hosting/check-live.mjs (EZD-003, written by the builder) sits under the guard-paths `scripts/` deny with no recorded exception
- Questions for Josh: Q-0138 (escalated); to confirm: Q-0136, Q-0137, Q-0139 to Q-0148. Action: add required status check `gate` to the `main` ruleset before the Phase 0 PR (Q-0144).
- Decisions made: Q-0148 (split). No lesson added.
- Models: planner Opus 5.5 (re-validation; hit its 40-turn limit once, resumed to finish)
- Next unit: plan EZD-004a
