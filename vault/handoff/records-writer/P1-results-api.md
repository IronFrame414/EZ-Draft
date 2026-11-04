# P1 · 2.12a · Results API in scripts/records.mjs

Source: REMEDIATION-PLAN 2.12; AUDIT-REPORT 3.2 "Flow per ticket after the change"; D1 (a), D2 (a) (decisions/process.md, 2026-11-01). Tests first in `scripts/__tests__/records.test.mjs`, temp databases only (L-041).

## What to build
1. `validateOp(op)`: refuses an unknown `op`, a missing field, a line break in a table cell, an unknown ticket status or complexity (the lists in `vault/tools/next_ticket.mjs`), an unknown question status.
2. Ops (one JSON object each):
   - `status {ticket, changes}`: changes from `status, complexity, commit, tests, notes, title`; a ticket with no row is refused.
   - `ticket {row}`: a new STATUS row (all nine columns); its line goes after the last ticket row.
   - `question {row}`: a new row in `questions/QUESTIONS.md`, after its last Q row; a used ID is refused.
   - `answer {id, status, answered_by, answer, source}`: an `open` or `escalated` answer moves the row to QUESTIONS.md.
   - `done {line}`: appended to DONE.md (`YYYY-MM-DD · EZD-xxx · ...`).
   - `handoff {text}`: the previous CURRENT.md text goes to `events` (kind `handoff`), then CURRENT.md is the new text. This replaces `vault/handoff/log/`.
   - `cost {entry}`, `finding {entry}`: one JSON line appended to `cost/log.jsonl` or `lessons/findings.jsonl`.
   - `event {kind, ticket?, data?}`.
3. `applyOps(db, ops)`: validates every op first, then applies them all in one transaction (one bad op = nothing applied).
4. `queueOp(file, op)`: validates and appends one line. `readQueue(file)` parses the lines; a bad line throws with its line number.
5. `applyQueueFile(db, file)`: applies the file, then renames it to `<file>.applied`; a file that fails is renamed `<file>.rejected` and the error is rethrown.
6. `nextQuestionId(db, queueFile?)`: the highest Q number in the database and in the queue, plus one.
7. `record(op, {env, root})`: the only entry point for the tools.
   - `EZD_RESULTS_FILE` set (inside a unit): `queueOp`.
   - Otherwise it applies to the database and re-exports the views into `<root>/vault`.
   - Writing directly is refused while a live launcher holds `<log_dir>/launcher.lock`, unless the caller is that launcher (`process.pid`) or its direct child with `EZD_RECORDS_WRITER=<that pid>` (`process.ppid` must equal it, so a unit's shell cannot pass the check).
   - The refusal text says records go through the launcher.
8. `refreshViews(db, vaultDir)`: `exportVault` into vault/.
9. CLI: `records.mjs apply <file>`; `records.mjs queue '<json>'` (calls `record`).

## Decided
- A part's position is its seq; to insert a row in the middle, shift the later seqs (move them to negative values first, so the primary key never clashes).
- A doc that is missing (a new database) is created with a final newline.

## Tests (expected values from the fixture in records.test.mjs)
| Test | Expected |
| --- | --- |
| R1 status op | the EZD-010 row in STATUS.md export reads `done`, `abc1234`; every other line is unchanged |
| R2 question op | Q-0003 lands after the Q-0002 line; `nextQuestionId` = Q-0003 before it, Q-0004 after |
| R3 answer escalated | a row in the answered file moves to QUESTIONS.md |
| R4 done, cost, finding | each export ends with the new line |
| R5 handoff | CURRENT.md = the new text; one `handoff` event holds the old text |
| R6 one bad op | throws; the database is unchanged (export equals before) |
| R7 queue then apply | 3 ops queued; apply gives the same export as `applyOps`; the file is renamed `.applied` |
| R8 record() under a live foreign launcher lock | throws "through the launcher"; with `EZD_RESULTS_FILE` set it queues instead |
| R9 nextQuestionId with a queue | counts the queued IDs |

## Do not touch
import/export behaviour (the 2.10 and 2.11 tests stay green).
