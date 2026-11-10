# Launcher fix mode (session 15): EZD-377, EZD-378

EZD-377 (2026-11-10): the launcher recognises the documented limit messages and never restarts a unit in a loop (Josh, Q-0693).
EZD-378 (2026-11-10): the launcher switches between the two accounts automatically (Josh, Q-0693; PLANNING-REDESIGN.md 2.1).

## Paths
- scripts/run.mjs
- vault/tools/next_ticket.mjs
- vault/tools/limit-message.mjs
- scripts/launcher-idle.mjs
