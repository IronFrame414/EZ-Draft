# Phase 1 · for Josh (questions unit, 2026-10-28)

EZD-243, EZD-244 and EZD-246 are ready (Q-0363 to Q-0366 answered by you, plans updated, lint OK).

## 1. Decisions needed

**Q-0370 · EZD-243 follow-on, planner 2026-10-28.** After Q-0365 (a), more docs lines still contradict Q-0264: runbook Vercel step 3 ("No Supabase values yet"), Supabase step 10 ("Production = prod project"), the architecture `dev` row ("phase field checks use it until launch") and possibly the `Until launch` bullet. Pick: (a) a new phase 1 fix ticket for them (recommended: rule 17, EZD-243 stays as planned); (b) widen EZD-243 again.

**Edits only you can make for EZD-243:** phase-01 row and tickets.json need Scope item (4), a Done-when sentence, AC-EZD-243-4 and EZD-003 as a dependency. Also your hand edit of `vault/PROCESS-EZDRAFT.md` line 99 (Q-0364 (a)) for EZD-246.

(Q-0089 and Q-0237 stay escalated; not phase 1.)

## 2. Agent answers to confirm

Unchanged from the 2026-10-27 file: Q-0232, Q-0266, Q-0269, Q-0277, Q-0279, Q-0280, Q-0281, Q-0282, plus Q-0362 (orchestrator applies Block L in fix mode on t/EZD-244).

## 3. Proposed wording

EZD-243: W7–W17 (new runbook/architecture texts for the Q-0264 lines), see vault/plans/EZD-243.md section 6, with the earlier W1 etc.

## 4. Rule candidates

- **L-022** (builder, tooling/scripts): recommend ratify only after reading it; not decided here, unattended.
- **L-023, L-024** (planner, migrations): same.
Left `candidate` (unattended run).
