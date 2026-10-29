# Handoff · 2026-10-29 · build EZD-173

- Phase and stage: see vault/PROGRESS.md
- Why the session ended: unit complete
- Completed: EZD-173 done, merged 7a3bd64a (1442 tests, gate PASS, code-reviewer PASS after the Q-0409 (a) last round)
- Josh action: apply vault/handoff/EZD-173-remove-grant.patch (git apply --check passed); it removes the EZD-173 builder grant (ezd173Grant) from .claude/hooks/guard-paths.mjs. Then run `node scripts/launchd/install.mjs install` once if not done after EZD-250 (plan D17)
- New fix ticket (ready): EZD-262 (findings.mjs record/cover under the ledger lock, committed with their unit); EZD-174 now depends on it. Build EZD-262 before EZD-174
- Ready fix tickets from before: EZD-260 (guards resolve symlinks), EZD-261 (plan_lint rejects bare-folder node --test)
- Note: vault/plans/EZD-173.md is over 45,000 characters (plan lint has no size check)
- Models: test-author sonnet/medium (two structural repairs), builder opus/high (off-ladder, Q-0409 (a)), code-reviewer opus/high
- Deviations (accepted): lessons-index run from lessonsIndexText in the worktree; two develop launcher test files repaired under the plan's Launcher test roots rule; grantNotices commits only the grant patch under the lock; build-ticket step 11 uses ledger.mjs seen/lesson
- needs-josh-confirm wording: LEDGER USAGE reasons, SKILL.md Ledger writes paragraph, MERGE WAIT sentence, step 11, lesson/seen sentences in SKILL.md and PROCESS.md section 13, plan-ticket step 2 research line
- Lesson: L-033 (candidate, planner): a plan that changes a shared test helper names the options and comments it makes stale
- Blocked: EZD-154 (Q-0418), EZD-248 (Q-0421) unchanged
- Next: node vault/tools/next_ticket.mjs --next-unit
