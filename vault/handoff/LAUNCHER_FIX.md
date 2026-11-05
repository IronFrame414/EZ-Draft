# Fix mode · 2026-11-05 · overseer repair unit

Opened by the interactive session building the overseer repair unit, on Josh's authorization in vault/spec/decisions/process.md (row 2026-11-05 "Overseer repair unit and unattended running", commit 6d49c273: "Josh authorizes interactive sessions to pause the launcher (STOP), use fix mode and push develop as needed for this without asking").

Fault: the repair unit cannot edit guarded paths, so every guarded fix stops with "needs Josh".

## Paths
- .claude/hooks/guard-paths.mjs
- .claude/skills/repair/SKILL.md
- scripts/run.mjs
- scripts/launcher-idle.mjs
- scripts/launcher/
- vault/PROCESS.md
