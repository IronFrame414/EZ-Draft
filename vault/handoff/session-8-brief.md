# Session 8 brief · build EZD-337 (2026-11-05)

Session 7 hand-over: `vault/handoff/session-7-overseer-handoff.md`. Session 7 is closed.

## The task
Build EZD-337 to a merged, green-gate commit on develop.
- Plan: `vault/plans/EZD-337.md` (35,000 characters; read it with `node vault/tools/outline.mjs`).
- Ticket row: `vault/tickets/phases/phase-01.md`. STATUS `ready`, high.
- The planner rewrote the plan after Q-0594 (a):
  - GitHub auto-merge is no longer used.
  - The launcher holds the phase PR's merge while a production-sensitive file changed after the phase audit lacks a security review.
  - A repair unit runs that review and records it.
  - The launcher then merges the exact PR head it checked, on a green gate.
- The plan's rows 1-12 are guarded paths: `scripts/gate.mjs`, `.claude/hooks/guard-bash.mjs`, the skills, CLAUDE.md and the process files. So this is built interactively in fix mode, never by the launcher (repair units may not touch `scripts/gate.mjs` or the hooks; EZD-333 hard limits).

## How (as session 7 did EZD-333 and EZD-336)
1. Write `vault/handoff/STOP` once no unit is running (`pgrep -fl "claude -p"`). Josh authorized STOP, fix mode and pushing develop (decision 2026-11-05 "Overseer repair unit", process.md).
2. Write `vault/handoff/LAUNCHER_FIX.md` with a `## Paths` list, and commit it, or the ledger check fails on an untracked file.
3. Work in the worktree `.claude/worktrees/EZD-337` on branch `t/EZD-337`. Tests first, in their own commit.
4. Gate: `node scripts/gate.mjs <worktree>`.
5. Get code-reviewer and security-reviewer PASS (section 7 of the plan).
6. Merge: `node scripts/unit-steps.mjs merge EZD-337`, as its own call.
   - Merge develop into the branch at least one second before the gate starts. A commit in the gate's start second fails the freshness check.
   - Re-gate after any develop commit.
7. Record the STATUS note (`node scripts/ledger.mjs status`) and a line in `vault/handoff/overseer-log.md`. Close fix mode (`git rm` LAUNCHER_FIX.md), push develop, remove STOP, check `node scripts/launchd/install.mjs status`.

## Traps seen in session 7
- The shell guard refuses commands whose text could name a secret file: wildcards over `scripts/`, `.env` strings, and `$'…'` forms. Write helper text with the Write tool and splice it with node.
- In `node -e` code, `String.replace` expands `$`-patterns in the replacement text. This once pasted a whole file into a line. Use the Edit tool for any replacement text that contains `$`.
- guard-paths keeps `.github/` (and the settings files) from the orchestrator even in fix mode; such changes go to Josh as patches.
- A gate stopped half way can leave the worktree's `node_modules` broken ("next: command not found"). Run `pnpm install --frozen-lockfile` in the worktree, then re-gate.
- The plan's row 15 deletes `vault/handoff/EZD-336-merge-allow.patch`. That patch is obsolete under Q-0594 (a).

## Still Josh's, an admin action (not part of this ticket)
GitHub ruleset 24926075: pin the required `gate` check to the GitHub Actions app. Today it is `{"context":"gate"}` with no source.
