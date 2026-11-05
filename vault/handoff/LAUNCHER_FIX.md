# Fix mode · 2026-11-05 · EZD-336 phase PR wait gaps

Opened by the interactive session that built EZD-333, on Josh's authorization in vault/spec/decisions/process.md (row 2026-11-05 "Overseer repair unit and unattended running", commit 6d49c273: "Josh authorizes interactive sessions to pause the launcher (STOP), use fix mode and push develop as needed for this without asking").

Fault: the launcher waited 3.5 hours on PR 5 because a cancelled (timed-out) CI gate run and auto-merge being off were not repairable waits.

## Paths
- vault/tools/next_ticket.mjs
- scripts/launcher-idle.mjs
- scripts/run.mjs
- scripts/launcher/
- .claude/skills/repair/SKILL.md
- .github/workflows/ci.yml
