# Launcher fix mode (session 13, 2026-11-10): background gate timeout

Fault: a run_in_background Bash call with no `timeout` is stopped at 10 minutes in Claude Code 2.1.321 (default background deadline; BASH_MAX_TIMEOUT_MS only raises the ceiling, EZD-364). gate-phase 4 was cut at 10:00 again at 01:45 UTC with BASH_MAX_TIMEOUT_MS=7200000 set. The gate calls must pass timeout 7200000.

## Paths
- .claude/skills/gate-phase/SKILL.md
- .claude/skills/build-ticket/SKILL.md
- .claude/agents/builder.md
