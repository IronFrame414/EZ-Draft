# Assessment: build EZD-393 (three strikes, 2026-11-13)

Assessed by the overwatch (2026-11-13T01:05Z), from .git/unit-strikes.json, the launcher log (~/Library/Logs/ezdraft/launcher.log), the EZD-393 STATUS note and vault/plans/EZD-393.md.

## Strikes
1. 2026-11-12T11:06:56Z (outcome ok, no progress): the unit ended while its builder was still running a gate in the background ("I'm waiting for its next notification"). No gate result was recorded.
2. 2026-11-12T11:23:41Z (outcome ok, no progress): the ledger check failed on the EZD-5602 plan Architecture line, which the sandboxed unit could not clear (it ran --set-architecture EZD-5602; the stop hook kept blocking).
3. 2026-11-13T00:51:55Z (outcome ok, no progress): the builder stopped at D-Runs (vault/plans/EZD-393.md D-Runs) because no other lane was running a gate. Its dispatch lasted 69 s, so it did not poll D-Busy for the 60 minutes the plan allows. Run 1 never started; 0 of 10 counting gates. Test commit 98d5d2a8 is in worktree .claude/worktrees/EZD-393 (649002d8, develop merged).

## Causes, fixes, evidence
- Cause 1 (builder left a background gate running at unit end): build-system behaviour, no fix commit. Evidence it holds: none possible from a cheap check. Note kind (rule 17); the same shape is in vault/tooling-notes.md for gate runs.
- Cause 2 (EZD-5602 plan Architecture line): fixed by earlier overwatch step A/B runs (vault/handoff/overseer-log.md). Evidence: `node vault/tools/next_ticket.mjs --check` on a vault copy with untracked files prints `LEDGER OK: 701 tickets` (2026-11-13T01:04Z).
- Cause 3 (no other lane live during the D-Runs series): not fixed. The launcher starts EZD-393 on database lane 1, which serialises it with other database-lane builds, so the only other gates that can run beside it come from non-database builds. D-Busy at 01:04Z: lane1 live (pid 79609, build EZD-399), lane2 idle, lane3 idle, so while EZD-399 holds lane 1 EZD-393 cannot start, and when it does start nothing guarantees a live other lane. The builder also did not use the 60-minute D-Busy wait the plan gives.
- Other checks: develop recorded at 2ee800c7 by this overwatch (range since the last record: 2ee800c7, 696e3c3d, 4e2ab3cf, touching only vault/handoff/overseer-log.md and vault/tickets/tickets.json, no protected path); LAUNCHER_FIX.md absent; lanes 2 and 3 free.

## What is left
The D-Runs proof needs a run of up to 14 gates while another lane is running a gate. Either the run starts while a second build lane has a gate live and the builder actually waits up to 60 minutes per D-Busy, or the orchestrator re-plans D-Runs. EZD-393 stays `blocked` (set aside) and the launcher goes on with other work.

Covers strikes: 3
Verdict: not ready
