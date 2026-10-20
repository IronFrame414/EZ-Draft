# Fix mode: launcher waits instead of stopping (2026-10-20)

Fault: the launcher exits when vault/handoff/STOP appears or when nothing can run yet, and nobody restarts it. Josh (2026-10-20, in chat): the build should never stop unless it hits a usage limit or truly nothing can be done until he answers. Q-0233. Touches scripts/run.mjs, scripts/launcher-idle.mjs, scripts/launcher/idle.test.mjs, vault/PROCESS.md section 10.
