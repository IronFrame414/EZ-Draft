# Handoff · 2026-10-19 · build EZD-006

- Phase and stage: Phase 0, Stage 3 (building tickets)
- Why the session ended: unit complete
- Completed this session: EZD-006 done (0ff28b9). Tenant and listed-project RLS policies, token hook (active tenant claim), session ending on deactivation / scope narrowing, explicit table grants, PostgREST request gate (Q-0087 (ii)), RLS audit test and harness under app/test-harness/rls/. Gate PASS on worktree (round 1) and on develop phase 0 (255 tests). code-reviewer (mode 2, structural repair, mode 3) and security-reviewer PASS, all Fable 5.1.
- In progress: none
- Blocked: EZD-003 (unchanged)
- Questions for Josh: none new. Q-0089 stays escalated. Cloud steps for Josh: docs/runbook.md steps 9–11 (hook switch, per-project API gate secret, project settings) once the dev project exists.
- Decisions made: no Q-IDs. Lesson L-009 (planner, candidate): run plan SQL contract text on the pinned stack. Structural repair T16 (`::uuid[]` cast).
- Operational: the local auth hook loads only at `supabase start`; any stack started before 0ff28b9 needs `pnpm db:stop` once (done on develop).
- Follow-ups for later plans: EZD-105/106/129 add `membership.user_id`/`tenant_id` to the end-sessions trigger if they update them; the first ticket adding a sequence or `public` function grants explicitly and adds it to GATED_RPC_CALLS; table tickets copy the `::uuid[]` policy form.
- Next unit: build EZD-008
