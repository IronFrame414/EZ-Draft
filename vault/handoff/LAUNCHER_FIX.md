# LAUNCHER_FIX · EZD-345 (interactive)
Fault: commands outside the unit sandbox trust git state the sandbox can write (refs, hooks, worktree config, objects, locks; Q-0548 (a)).
Fix: vault/plans/EZD-345.md rows 1-16, built interactively in fix mode (session 8; Josh authorized fix mode and the overnight guard bypass, 2026-11-06).

## Paths
- vault/tools/trusted-git.mjs
- scripts/ledger.mjs
- scripts/unit-steps.mjs
- scripts/run.mjs
- scripts/release/github-ops.mjs
- scripts/gate.mjs
- scripts/release/check-migrations.mjs
- scripts/release/release.mjs
- scripts/db/stack-config.mjs
- scripts/backup/restore.mjs
- scripts/perf/check.mjs
- scripts/unit-sandbox.json
- vault/tools/next_ticket.mjs
- vault/tools/security-paths.mjs
- vault/tools/ledger-queue.mjs
