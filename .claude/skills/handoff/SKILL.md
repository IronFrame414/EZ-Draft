---
name: handoff
description: Write vault/handoff/CURRENT.md and commit the vault before stopping a session. Usage /handoff.
disable-model-invocation: true
---

1. Bring `vault/tickets/STATUS.md` and `vault/questions/QUESTIONS.md` up to date with this session's work.
2. Overwrite `vault/handoff/CURRENT.md` using `vault/handoff/TEMPLATE.md`. "Next" must name the exact command to run next.
3. Commit `vault/` on `develop`: `docs(vault): handoff <date>`. Do not push anything other than `develop`.
