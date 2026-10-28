# EZD-242 blocked: scripts/ledger/priority.test.mjs (2026-10-28)

Fault: test "a flagged ready ticket is built before a lower-numbered one" asserts low !== high, but the live ledger has one ready phase 1 ticket (EZD-242 itself), so low === high. It fails on develop too (`node --test scripts/ledger/priority.test.mjs`). Once EZD-242 is built, no phase 1 ticket is ready and before() throws on ready[0].id, breaking both tests and every develop gate.
Tried: promoting todo tickets (none left) or re-opening done tickets in the temp vault copy (next_ticket --next-unit then reports `ledger check failed (3)`). Not applied.
Needed: the test builds its own two ready phase 1 tickets in the temp copy (add two synthetic tickets to tickets.json and STATUS.md with done dependencies and plan files), instead of reading live ledger state. A t.skip guard would hide the build-priority path; not recommended.
EZD-242 state: t/EZD-242 worktree holds tests, builder commit 68066ea1 and test repair b79093f8. Resume at step 7 (gate) after the ledger test is fixed.
