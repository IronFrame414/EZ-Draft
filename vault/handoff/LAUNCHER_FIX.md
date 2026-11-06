# LAUNCHER_FIX · EZD-354 (interactive)
Fault: the gate's checks run as Josh, so code they run can reach his keychain, ssh agent, launchd session and files (Q-0602 (a); EZD-344 KNOWN-LIMITS bullet).
Fix: vault/plans/EZD-354.md rows 1-6, built interactively by the orchestrator (session 9) in .claude/worktrees/EZD-354.

## Paths
- scripts/gate-user.mjs
- scripts/gate-docker-relay.mjs
- scripts/gate-env.mjs
- scripts/gate.mjs
- scripts/launcher-idle.mjs
- vault/tools/trusted-git.mjs
- docs/runbook.md
