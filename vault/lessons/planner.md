# Lessons · planner

Entries follow the format in PROCESS.md section 13. Keep under about 30; the wrap unit consolidates.

## L-002  areas: tooling, scripts, process  seen: 1  status: candidate
Ticket EZD-000, 2026-10-19
Mistake: the plan put the conventions check under scripts/, a folder .claude/hooks/guard-paths.mjs denies to the builder, so the build blocked on Q-0124 after the tests were written.
Cause: the Files table was not checked against the write rules in guard-paths.mjs and PROCESS-EZDRAFT.md section 3.
Rule: for every path in the plan's Files table, confirm the role that writes it is allowed to by guard-paths.mjs; if not, choose an allowed path or list the exception as an open question before Stage 2.
Check: the plan review (review-plans) greps each Files-table path against guard-paths.mjs rules for the writing role.
