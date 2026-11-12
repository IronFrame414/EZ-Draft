# Assessment: gate-phase 4 (three strikes, 2026-11-12)

Assessed by the orchestrator (session 18), from .git/unit-strikes.json, the launcher log and vault/handoff/CURRENT.md.

## Strikes
1. 2026-11-12 16:25:35Z: stopped at step 0. `record-develop` listed unrecorded develop 73467fc6 (feat(EZD-5603a), merged seconds before). The sandbox cannot run record-develop (EPERM on ~/.ezdraft-github-ops).
2. 2026-11-12 16:26:16Z: the same check on the same commit, re-run 40 s later.
3. 2026-11-12 17:47:56Z: the same check. Develop fb6161d3 (overwatch commit 17:31:57Z) was not yet recorded when the unit started at 17:47:27Z. It was recorded seconds later, after the unit had already stopped.

(The two no-progress runs on 2026-11-10 had other causes, fixed per vault/handoff/phase-4-release.md causes 1 to 3.)

## Cause
Each time, a develop commit landed after the last record and before the unit's step 0. The unsandboxed side (launcher, overwatch, orchestrator) records develop, and the sandboxed gate-phase only checks. No phase 4 code, test or ledger check was red. The full gate never started.

## Fix applied
- Develop is recorded (`node scripts/unit-steps.mjs record-develop <sha>`) right before gate-phase 4 is released, right after an overwatch commit. No unit is running, and the launcher starts no build while gate-phase 4 is next.
- Every other release check is green (vault/handoff/phase-4-release.md, Update 16:00 UTC):
  - Every phase 4 ticket is done.
  - The vault-copy ledger check is OK.
  - There is no LAUNCHER_FIX.md.
  - The full practice gate on develop 23999d6f passed every step.
  - Develop CI on b33beab4 is red only on a load-class test, now ticket EZD-399 in phase 5 (Q-0748 (a)).
- Build-system note (rule 17, note kind): a merge or overwatch commit can leave develop unrecorded at a sandboxed unit's start. Recorded in vault/tooling-notes.md.

## Strike 4 (2026-11-12 19:22:48Z)
- What happened: the run at 18:03Z got past step 0 and ran the full gate, which was red on six rail tests. EZD-5603a (73467fc6) added the Assistant button as a 7th rail tool. That run filed EZD-400 (phase 4) and counted as progress.
- Why the next run stopped: at 19:22Z it stopped at step 0 because EZD-400 was `blocked`. EZD-400's own change passed (48 of 48 e2e). Its gate was red only on six fixture-ledger tests. Their cause: the committed EZD-5603b plan's Architecture line had 7 sections, while tickets.json listed 8.
- Fix:
  - The re-validated EZD-5603b plan (the same file as in its build worktree) is committed in 450ddf7, and develop is recorded.
  - EZD-400 was set back to `ready` to resume at step 7.
  - gate-phase 4 is on `.git/set-aside.json` until EZD-400 is merged, so it cannot run on a known open fix ticket.
- Prevention: LANES.json build_lanes is 1, so no other early-phase build merges between EZD-400 and the gate. This rule comes from the two release-time regressions from early merges, EZD-396 and EZD-400.

## Strike 5 (2026-11-12 19:55:54Z): a misread, not a red check
- Develop 8a4673c (feat(EZD-400)) was recorded at 19:55:04Z, and the unit started at 19:55:24Z. With nothing to record, `node scripts/unit-steps.mjs record-develop` prints:
  `RECORD LIST 8a4673c..8a4673c`
  `RECORD CHECK: to record develop, run node scripts/unit-steps.mjs record-develop <sha>`
  The second line is printed on every run (scripts/unit-steps.mjs:473), even when nothing is unrecorded. The unit read it as "develop not recorded".
- **How to read it (step 0):** develop is recorded when the `RECORD LIST <a>..<b>` range has the same sha on both sides and no `commit` or `change` lines follow. The `RECORD CHECK` line is a standing hint, not a red check. Develop is unrecorded only when `commit ...` lines are listed.
- Tooling note in vault/tooling-notes.md. A wording fix to unit-steps.mjs is build-system work (rule 18) and is not made here.

## Open causes
None.

Covers strikes: 5
Verdict: ready
