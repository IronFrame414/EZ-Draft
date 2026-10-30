EZD-260 DONE (a5d1e087, 1566 tests, 2 rounds). Write and read guards judge the real path: links, links to links, hard links and outside-repo paths are denied (W1, W2).
Reviews: code-reviewer opus PASS r1; security-reviewer fable FAIL r1 (comment wording, fixed de834062) then PASS r2.
Plan deviations: T9 fixture links to scripts/db/hard-src.mjs (plan s4 corrected); plan s1 comment text corrected.
Open (rule 17): Q-0466 to Josh: should grants apply only inside the agent's own worktree (sibling-worktree grant gap, pre-existing). Fix ticket owed in phase 1 once answered or by an interactive orchestrator (ledger has no add-ticket command).
Unblocks: EZD-277 (depends on EZD-260, EZD-267), EZD-268.
Still open from earlier: EZD-250 launcher test harness stub roots log 'queue apply failed: ledger-queue.mjs not found' needs a fix ticket; EZD-108 BLOCKED on Q-0465.
Note: node --test <folder> fails on Node 22.23.3; use scripts/hooks/*.test.mjs.
Next unit: node vault/tools/next_ticket.mjs --next-unit
