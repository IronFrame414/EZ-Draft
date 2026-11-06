# LAUNCHER_FIX · EZD-317 (interactive, session 9)
Fault: the unit sandbox's excluded commands are relative (`node scripts/gate.mjs *` and three more), so a sandboxed command that `cd`s into a worktree runs that worktree's writable copy outside the sandbox (Q-0541; vault/spikes/sandbox/NOTES.md rounds 5-6). The sandbox is on for every unit since 023476e9.
Fix: EZD-317 (vault/plans/EZD-317.md), built interactively by the orchestrator in .claude/worktrees/EZD-317 (session-9 brief, guarded tickets).

## Paths
- scripts/unit-sandbox.json
- scripts/excluded-form.mjs
- scripts/gate.mjs
- scripts/unit-steps.mjs
- scripts/ui-run.mjs
- scripts/launcher-idle.mjs
- scripts/process/sandbox-coverage.test.mjs
- scripts/process/gate-sandbox.test.mjs
- scripts/process/ui-run.test.mjs
- scripts/process/unit-steps.test.mjs
- .claude/agents/builder.md
- .claude/agents/ui-verifier.md
- .claude/skills/build-ticket/SKILL.md
- .claude/skills/gate-phase/SKILL.md
- vault/PROCESS.md
- vault/PROCESS-EZDRAFT.md
- CLAUDE.md (line 17 only; Josh's yes 2026-11-06, chat)
