# Build-watch session hand-over · 2026-11-04 (ended by Josh)

## Merged today (develop)
EZD-256 8a9d92cd · EZD-174 9b6706e3 (+ e1a6719e N12 E2BIG, 7533427f next_ticket/ledger import cycle) · EZD-326 35fdefa1 · EZD-329 86671a64 (+ 1be6b3bc mark) · EZD-117a f880bc59. Filings: EZD-329 7759fa74 (Q-0571), EZD-120b split afb02a7a (Q-0573 (a); proposal vault/plans/split-EZD-120b.md), EZD-330 0885bf14.

## Josh's decisions in chat today
- Lanes on ("Yes, turn lanes on"): vault/handoff/LANES.json 2 lanes / 2 builds. Working (plans and builds side by side).
- Unfroze EZD-154, 265, 268, 269, 270, 271, 272, 274, 279, 280 ("Yes, unfreeze those"); ready. All need guarded paths (fix mode, interactive orchestrator). Josh: "build them here".
- EZD-268 QP-1: (a) after the model ladder a build or plan unit is set aside; a phase-wide unit waits (W1).
- EZD-279 .env globs: close the class fully, knowing `*.ts`/`*.json` are refused in every folder (agents write `[!.]*.ts`).
- Then (late): Josh asked whether stripping the rules to basics would build faster; asked for a fresh session to reassess what to remove (see the new session's brief).

## In flight, not done
- EZD-279 (.claude/worktrees/EZD-279, t/EZD-279): code-reviewer PASS (r2), security-reviewer PASS (r3). Gate re-running on lane 3; its e2e step stays red until EZD-330 (Projects tabs fail EZD-289 E1 touch targets; develop CI red since 88bbadd7) merges. Then: merge develop into t/EZD-279, gate, `unit-steps.mjs merge EZD-279`, notes, DONE. EZD-280 must be re-validated against the new globReach (ENV_PROBES gone) before it is built.
- EZD-268 (.claude/worktrees/EZD-268, fresh t/EZD-268; old work kept as t/EZD-268-old-20261030): plan re-validated (31,967 chars), tests 79e0d30d (24 new); code-reviewer mode 2 test review r1 FAIL on one item: scripts/process/unit-steps-update.test.mjs:325 (EZD-175 step 10) asserts "This round is not one of step 9's three", which D12 changes to "This round is not a step 9 round;". The test-author edits that string and the planner adds the row to section 4's edit table; everything else in section 4 matched. Commit the worktree's re-validated plan copy before the build. STATUS blocked as an interactive hold. No code written yet. The worktree has an empty untracked vault/tools/model-ladder.mjs (test-author placeholder) and the plan copy.
- Q-0578 (EZD-117a plan 48,239 chars): agent answer (a) accept, to record once the inbox applies.
- Plan size waivers for EZD-268 and EZD-279 (tooling cap 5,000; both ~32k): not asked of Josh.

## Lessons / traps from today
- `unit-steps worktree` sets a ready ticket in-progress, and the launcher resumes any in-progress build, even a fix-mode one (debt D-084). Queue a blocked hold before creating a fix-mode worktree.
- A plan unit leaves tickets.json's Architecture line stale; the next ledger check fails until `--set-architecture <T>` (seen EZD-120a, EZD-120b).
- Interactive `ledger.mjs` ops wait in the launcher inbox: a merge before they apply misses the held entry (debt D-079); `answer` fails on a queued question.
- `pgrep -f "claude -p"` matches the watcher's own shell; anchor it (`^claude -p `).
- I truncated vault/tickets/tickets.json once (write-before-read in a script) and rebuilt it from HEAD plus the records DB held entries (EZD-120a, 202, 238, 317, 320).
- Debt rows added: D-073, D-074, D-077 to D-079, D-082 (questions loop), D-084.
