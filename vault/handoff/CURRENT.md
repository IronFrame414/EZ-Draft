# Handoff · 2026-10-19 · build EZD-000

- Phase and stage: Phase 0 · Stage 3 · EZD-000 (first build).
- Why the session ended: blocked (question for Josh, Q-0124).
- Completed this session: worktree `.claude/worktrees/EZD-000` on `t/EZD-000`; test-author (Fable 5.1) wrote T1–T26, 42 tests (72d6521); code-reviewer mode 2 (Fable 5.1) PASS; builder round 1 (Fable 5.1) built docs/architecture.md, root package.json, pnpm-workspace.yaml, .npmrc, pnpm-lock.yaml (628d1dc). T1–T6 and T26 pass; typecheck and build pass.
- In progress: none running. Worktree and branch kept for resume (step 6, builder round 1 continues).
- Blocked: EZD-000. The builder may not write `scripts/conventions/check.mjs` (`.claude/hooks/guard-paths.mjs:57` denies all of `scripts/` to the builder); T7–T25 and the gate's lint stay red until it exists. The builder's draft of the check is ready to write in one step. Unblocks when Josh answers Q-0124.
- Questions for Josh: Q-0124 (a: allow the builder to write `scripts/conventions/` only, recommended; b: move the check out of `scripts/`, which means re-planning and a test change). Item 5 in `vault/questions/phase-00-for-josh.md`.
- Decisions made: none. No lessons yet (candidate after merge: plans must check file paths against guard-paths.mjs).
- Deviations to carry to the merge notes (in STATUS): T6 accepts the v2 CLAUDE.md heading; pnpm-workspace.yaml `saveExact: true` (pnpm 12 ignores .npmrc); typescript 5.9.3, not 7.0.2.
- Gate not run by the orchestrator yet (step 7 waits for the check script). Security review still due (plan: security-review yes).
- Next unit: after Josh answers, `/build-ticket EZD-000` (resume). Under (a) Josh edits the hook first; under (b) the planner re-validates EZD-000 first.
- Earlier open items unchanged: the launcher-fix proposal (a/b) and pilot checks from the 2026-10-19 01:40 handoff (`vault/handoff/log/2026-10-19-01-53.md`).
- **2026-10-19 morning (Josh present):** Q-0124 answered (a), Q-0125 answered (a); guard-paths.mjs now lets the builder write `scripts/conventions/` and has fix mode (`vault/handoff/LAUNCHER_FIX.md`); PROCESS.md rule 19 added; lesson L-002 (planner, candidate). EZD-000 set `in-progress`; the launcher is restarted to resume it. The app's permission classifier (auto mode) refuses hook and launcher edits from a session, so this fix needed Josh's approval clicks in manual mode; unattended sessions run in auto mode, where fix mode cannot edit hooks until Josh adds a permission rule (open item).
