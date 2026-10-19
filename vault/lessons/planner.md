# Lessons · planner

Entries follow the format in PROCESS.md section 13. Keep under about 30; the wrap unit consolidates.

## L-002  areas: tooling, scripts, process  seen: 1  status: candidate
Ticket EZD-000, 2026-10-19
Mistake: the plan put the conventions check under scripts/, a folder .claude/hooks/guard-paths.mjs denies to the builder, so the build blocked on Q-0124 after the tests were written.
Cause: the Files table was not checked against the write rules in guard-paths.mjs and PROCESS-EZDRAFT.md section 3.
Rule: for every path in the plan's Files table, confirm the role that writes it is allowed to by guard-paths.mjs; if not, choose an allowed path or list the exception as an open question before Stage 2.
Check: the plan review (review-plans) greps each Files-table path against guard-paths.mjs rules for the writing role.

## L-004  areas: tooling, scripts, process  seen: 1  status: candidate
Ticket EZD-000h, 2026-10-19
Mistake: the contract's ordered steps for applyGates (C7) returned early on an active override before the existing-hold check, so an override would have started new units past a BUDGET_HOLD.md; the plan's own prose and PROCESS.md section 10 step 1 say an existing hold blocks all but the in-progress build. Caught at code review round 1.
Cause: the step list was written separately from the prose rules and not checked against them; an early return silently overrode a later rule.
Rule: when a contract lists ordered steps with early returns, check each early return against every rule in the plan and its sources that a later step enforces, and order the steps so no rule is bypassed.
Check: the plan review walks each early-return step and names the later rules it skips; each skip cites a source that allows it.
