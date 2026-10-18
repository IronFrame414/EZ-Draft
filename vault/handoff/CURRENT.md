# Handoff · 2026-10-18 · process v2 applied (chat session linked to the Mac)

- Phase and stage: Phase 0 · Stage 3 not started (35 tickets `ready`, 2 in `questions` on Q-0116). Process v2 is in place: `vault/PROCESS.md`, `vault/PROCESS-EZDRAFT.md`, seven unit skills, launcher, budget script, ledger tool flags.
- Why the session ended: unit complete (migration applied; see `vault/handoff/PROCESS-V2-MIGRATION.md`, "Applied").
- Completed this session: process files, decisions split (`vault/spec/decisions/`), 703 ACs generated, STATUS Complexity column, agent files (full model IDs), hooks (guard-paths, guard-bash, session-start, stop-ledger-check, stop-failure, session-end), settings, `scripts/run.mjs`, `scripts/budget.mjs`, `scripts/gate.mjs` summary + `gate.log`, `vault/tickets/PHASES.md` with the 53-slice re-cut draft, `SETUP.md` for macOS, Q-0114 to Q-0120.
- In progress: none. No worktrees.
- Blocked: EZD-003, EZD-023b (`questions`, Q-0116 Vercel Ignored Build Step). Nothing else.
- Questions for Josh: Q-0116 (Vercel), Q-0118 (approve PHASES.md: Phase 0; the re-cut), Q-0119 (weekly ceiling, per-unit cap, Fable ceiling, ntfy topic). Older: Q-0002, Q-0038, Q-0089, Q-0096 (not blocking).
- Decisions made: Q-0114 (workers 4), Q-0117 (v2 adoption), Q-0115 and Q-0120 (agent answers, Josh can override).
- Next unit: `build EZD-000` — run `/build-ticket EZD-000` interactively in Claude Code on the Mac (the launcher refuses unattended runs until Q-0119 sets the ceiling). Before that, on the Mac: finish `SETUP.md` (Node 22, pnpm, Docker Desktop, `gh` as `ironframe414-agent`, `scripts/launcher.config.json`), then `git pull` if this commit was pushed from elsewhere.
- Not verified from this session: the Mac's own tools (node, pnpm, gh, docker) — the chat shell could not see them. The first Claude Code session on the Mac runs the checks in `MAC-MIGRATION.md` "First Mac session" step 2.
