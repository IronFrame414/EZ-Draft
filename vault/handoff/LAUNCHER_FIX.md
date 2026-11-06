# LAUNCHER_FIX · EZD-316 Part B (interactive)
Fault: sandboxed commands can use Josh's GitHub login (D-021); pushes and gh calls go through github-ops.mjs (Part A merged a5cae0cc).
Fix: vault/plans/EZD-316.md Part B rows 3, 6, 8-12, 14, built interactively in fix mode (session 8; Josh authorized fix mode and the overnight guard bypass, 2026-11-06).

## Paths
- scripts/unit-steps.mjs
- scripts/unit-sandbox.json
- scripts/run.mjs
- .claude/hooks/guard-bash.mjs
- .claude/skills/build-ticket/SKILL.md
- .claude/skills/gate-phase/SKILL.md
- .claude/skills/repair/SKILL.md
- .claude/skills/wrap/SKILL.md
- vault/spikes/sandbox/NOTES.md
