# LAUNCHER_FIX · EZD-337 (session 8, interactive)
Fault: an unattended phase PR merge takes develop's tip, not the audited commit (EZD-336 security review finding 2; Q-0594 (a)).
Fix: vault/plans/EZD-337.md rows 1-12, built interactively in fix mode (Josh authorized fix mode, decision 2026-11-05 "Overseer repair unit").

## Paths
- vault/tools/security-paths.mjs
- scripts/gate.mjs
- scripts/launcher-idle.mjs
- vault/tools/next_ticket.mjs
- scripts/run.mjs
- .claude/hooks/guard-bash.mjs
- .claude/skills/repair/SKILL.md
- .claude/skills/gate-phase/SKILL.md
- .claude/skills/wrap/SKILL.md
- CLAUDE.md
- vault/PROCESS.md
- vault/PROCESS-EZDRAFT.md
