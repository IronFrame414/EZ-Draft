# Handoff · 2026-10-26 · build EZD-176

- Phase and stage: see vault/PROGRESS.md
- Done: EZD-176 merged to develop (e66b5a7, 932 tests). Four workflows moved to checkout v7.0.1 / setup-node v7.1.0 with package-manager-cache false; security PASS.
- Open: Q-0347 (intermittent EZD-025 T16 failure, found at review) needs a fix ticket in phase 1; route it at the next questions unit.
- Check at gate-phase: release run on main after the phase PR merges ends not_configured with no "Node.js 20" annotation.
- Still blocked: EZD-172, EZD-173 (Q-0346), EZD-153, EZD-170. Waiting on Josh: Q-0334, Q-0337, Q-0338, Q-0340, Q-0346.
- Note: new worktrees need `pnpm install --frozen-lockfile` before the gate.
