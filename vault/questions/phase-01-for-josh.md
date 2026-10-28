# Phase 1 · for Josh (questions unit, 2026-10-28)

EZD-243, EZD-244 and EZD-246 are ready. EZD-247 stays `questions` until you answer Q-0373.

## 1. Decisions needed

**Q-0373 · EZD-247, planner 2026-10-28.** Three more lines are stale against what Vercel holds, though they break neither Done-when sentence: runbook `## Supabase cloud projects (EZD-004)` step 7 ("go into Vercel in EZD-023b's setup"), the architecture `### Environment variables` paragraph "Which project's values go where … Entering values in Vercel is EZD-023b's", and the architecture `### Hosting` sentence "Previews use the dev database once EZD-023b enters its values." (pinned word for word by `hosting.test.mjs` EZD-149 T2). Pick:
- (a) widen EZD-247 to fix them too (same two files, one more test, EZD-149's `ARCH_BULLET` constant updated; plan sections 1, 3, 4, 6 re-planned). **Recommended**: CLAUDE.md rule 17, no known issue is parked.
- (b) a new phase 1 fix ticket for them.
- (c) leave them as they are.

**Edits only you can make for EZD-243:** phase-01 row and tickets.json need Scope item (4), a Done-when sentence, AC-EZD-243-4 and EZD-003 as a dependency. Also your hand edit of `vault/PROCESS-EZDRAFT.md` line 99 (Q-0364 (a)) for EZD-246.

(Q-0089 and Q-0237 stay escalated; not phase 1.)

## 2. Agent answers to confirm

Unchanged from the 2026-10-27 file: Q-0232, Q-0266, Q-0269, Q-0277, Q-0279, Q-0280, Q-0281, Q-0282, plus Q-0362 (orchestrator applies Block L in fix mode on t/EZD-244).

## 3. Proposed wording

EZD-243: W7–W17, see vault/plans/EZD-243.md section 6. EZD-247: W1–W4, see vault/plans/EZD-247.md section 6 (they stand under any answer to Q-0373).

## 4. Rule candidates

- **L-022** (builder, from EZD-166): catch only the errors the plan names and add no fallback it does not list. Recommend **ratify**: matches CLAUDE.md rule 4, and the check is mechanical (every catch names its code).
- **L-023** (planner, from EZD-190): a plan adding a `private` function lists its `PRIVATE_EXECUTE` entry in the test-author scope and tests it only as a role holding execute. Recommend **ratify**: it closes the grants-vs-tests mismatch class.
- **L-024** (planner, from EZD-190): catalog tests check a rule plus a minimum list (`toContain`), never `toEqual` on a snapshot. Recommend **ratify**: a dated snapshot broke the build when migrations merged in between.

Left `candidate` (unattended run; no Q-ID rows written).
