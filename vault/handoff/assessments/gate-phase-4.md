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

## Open causes
None.

Covers strikes: 3
Verdict: ready
