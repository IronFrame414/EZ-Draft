# LAUNCHER_FIX · EZD-360 (interactive)
Fault: the ledger tools and release tags order phases by number, so phase 56 would run after phase 55; Josh wants it right after phase 5 (Q-0630).
Fix: vault/plans/EZD-360.md rows 1-4, built interactively by the orchestrator (session 11) in .claude/worktrees/EZD-360.

## Paths
- vault/tools/phase-rank.mjs
- vault/tools/next_ticket.mjs
- vault/tools/security-paths.mjs
- scripts/release/tags.mjs
