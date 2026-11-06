# LAUNCHER_FIX · unit sandbox back on (interactive)
Fault: launcher units run unsandboxed since 2026-11-03 (scripts/run.mjs defines sandboxSettings and never passes it); D-021 (GitHub login) is now closed by EZD-316 and EZD-345, so the sandbox can come back on.
Fix: vault/handoff/sandbox-on.patch rebuilt on today's code (Josh 2026-11-06 chat: "switch sandbox on. i will watch"), session 8, fix mode.

## Paths
- scripts/run.mjs
- scripts/process/sandbox-coverage.test.mjs
- .claude/agents/builder.md
- .claude/skills/build-ticket/SKILL.md
