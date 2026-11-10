# Session 13 brief (2026-11-10 ~18:50 UTC): for Josh's build-process review

## State
- **Live:** phases 0 to 3 (PR 6, Nov 6).
- **Phase 4:** every ticket is done. The phase gate is blocked by three fix tickets for defects that full gates found:
  - EZD-370 (the secret-key client list, EZD-323 T8): building.
  - EZD-371 (the My profile set-password test, EZD-108 T18): building.
  - EZD-372 (the long-tasks-during-pan perf check fails at random): planning.
- **Phase 5 and 56:** building; ledger at 280 of 666 tickets done.
- **Phase 6:** held. Its eight open tickets are `blocked` with a "Held by Josh" note that keeps each ticket's prior status. EZD-219 is done.
- **Open build-system tickets:**
  - EZD-365: the full gate tests only the committed HEAD. Reviewed; its gate is red only on EZD-323 T8.
  - EZD-369: three strikes, then an assessment. Code and security reviews PASS; its gate waits on EZD-370.
  - Both live in `.claude/worktrees/` and merge once EZD-370 is in.
- **Fix mode:** `vault/handoff/LAUNCHER_FIX.md` is open for EZD-365 and EZD-369. While it is open, the launcher's repair unit makes no guarded-path fix.
- **Overwatch:** scheduled task `ezdraft-overwatch` runs `.claude/skills/overwatch/SKILL.md` every 30 minutes. It made its first real fix at 16:32 (the icons for EZD-217).

## What went wrong (2026-11-09 to 11-10): one fault found per failed run
1. **10-minute background stop.** Claude Code stops a background command at 10 minutes unless the call passes `timeout`, so every full gate was cut off. Fixed by EZD-364 and the skill timeouts (81dec3ab).
2. **Leftover test server on port 3000**, after a gate was cut off. Fixed by the EZD-364 port sweep, now connect-only (091601a).
3. **Uncommitted vault files.** Units leave plans and ledger edits uncommitted on develop, and the phase gate snapshots the working tree, so its fixture ledger checks go red. Fixed by hand about 8 times. EZD-365 is the lasting fix.
4. **Merge guard.** A protected-file commit was not recorded, so every merge stopped and the build sat idle for 6 hours. The rule now is to run `record-develop` right after any such commit.
5. **Merge clashes and deadlocks.**
   - Merge clashes after develop moved need an interactive session to start the merge. They are now overwatch step D.
   - EZD-367 and EZD-368 deadlocked, each red on the other's failure. One branch was merged into the other.
6. **Cross-phase regressions.** A ticket gate runs only its own phase's tests. EZD-5601 broke two phase 1 tests, and only the full gate caught it (EZD-370, EZD-371).
7. **No total attempt count.** Releasing a hold reset the counter, so gate-phase 4 ran 19 times. EZD-369 adds the strike ledger and assessments.

## Cost and pace
- About $330 on 2026-11-10 (dollar proxy). The usage meter has been unreadable since 11-09 (OAuth poll 401).
- 9 tickets merged on 11-10, against 22 a day on 11-04 to 11-06.

## Where to look
- `vault/handoff/overseer-log.md` (every interactive action)
- `vault/tooling-notes.md`
- `~/Library/Logs/ezdraft/launcher.log`
- `vault/plans/EZD-364.md`, `EZD-365.md`, `EZD-369.md`
- `.claude/skills/overwatch/SKILL.md`
