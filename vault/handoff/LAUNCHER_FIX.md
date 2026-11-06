# LAUNCHER_FIX · EZD-344 (interactive)
Fault: scripts/gate.mjs gives a worktree's code the launcher's full environment, so builder code can reach Josh's credentials (Q-0548 (a)).
Fix: vault/plans/EZD-344.md rows 1-3, built interactively in fix mode (session 8; Josh authorized fix mode, decision 2026-11-05 "Overseer repair unit").

## Paths
- scripts/gate-env.mjs
- scripts/gate.mjs
- scripts/launcher-idle.mjs
