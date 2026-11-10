# Launcher fix mode (session 13): EZD-365 and the overwatch runbook

EZD-365 (2026-11-10): the full gate tests the committed commit only.
Overwatch (2026-11-10): on 2026-11-10 the build sat idle 07:03-13:06 UTC on stalls that each had a known 1-5 minute fix, because only an interactive session can apply them (record-develop, merge starts, network fetches) and none ran. Josh 2026-11-10 chat: "implement a rule for an agent to resolve all of these things that held up the build".

## Paths
- scripts/gate-user.mjs
- scripts/gate.mjs
- .claude/skills/overwatch/SKILL.md
