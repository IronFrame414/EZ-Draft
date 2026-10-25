# Handoff · 2026-10-25 · build EZD-147

- Phase and stage: phase 1, Stage 3 (build); see vault/PROGRESS.md
- Why the session ended: blocked (planned stop: Josh applies the ci.yml patch, plan EZD-147 section 1 steps 3-4)
- Completed this session: EZD-147 tests f6d6c07 (rules (j) SHA pins, (k) permissions, T1-T5) and docs build 5d7469b (D1-D3) on t/EZD-147. Patch vault/handoff/EZD-147-ci.patch written; V1 pass (applies, diff = D4 lines only). Pins checked on the GitHub tags API: checkout v7.0.1 3d3c42e5, setup-node v7.1.0 949feb24, upload-artifact v7.0.2 cf430e03. Pre-patch worktree gate: only test red, 4 expected failures (EZD-002 T2, EZD-147 T1, T2, EZD-004c T3).
- In progress: none
- Blocked: EZD-147 until Josh runs, from the repo root with no launcher unit running: git -C .claude/worktrees/EZD-147 apply "$PWD/vault/handoff/EZD-147-ci.patch". Resume: commit the applied ci.yml on t/EZD-147 (wip commit; the squash merge takes branch commits only), then build-ticket step 7 (gate), step 8 reviews (code-reviewer mode 3 and security-reviewer), plan step 6 (hand-started CI run on the ticket branch), merge (V4: exactly 3 files), delete the remote branch and the patch file (plan steps 7-8). Do not dispatch the builder.
- Also blocked: EZD-132 on Q-0323 (worktree kept). EZD-141 on supabase/auth#2852 (Q-0274 (a)). EZD-175 `questions` (Q-0310); EZD-174, EZD-185 wait on it; EZD-112 waits on EZD-132. EZD-186 waits on EZD-184.
- Questions for Josh: Q-0310, Q-0323 (phase 1); Q-0089, Q-0237 (later phases).
- New open questions (orchestrator, for the questions unit): Q-0325 gate-failures.log misses node:test `not ok` lines and takes a passing test title as the first error; Q-0326 the root `test` && chain skips Vitest when a root node:test fails; Q-0327 browser-test sign-ins link the seeded Josh row (seed rule).
- Decisions made: none. Lessons: none.
- Gate warnings seen, already tracked: Vitest configLoader (EZD-179, Q-0314); 2 ESLint warnings (Q-0320); React "detect" (Q-0324).
- Next unit: questions 1 (Q-0325 to Q-0327); EZD-147 resumes after Josh's patch.
