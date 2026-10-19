# Lessons · test-author

Entries follow the format in PROCESS.md section 13. Keep under about 30; the wrap unit consolidates.

## L-003  areas: tooling, scripts, process  seen: 1  status: candidate
Ticket EZD-000b, 2026-10-19
Mistake: two repo-script tests went red in later runs: one hard-coded the next Q-IDs from a copy of the live ledger, one built hook inputs under the real repo root, which inside a ticket worktree changed the hook's answer.
Cause: the tests depended on live repo state (ledger size, checkout location) instead of fixed inputs.
Rule: a repo-script test derives expected values from its own fixture or copy (e.g. next ID = highest in the copy + 1) and feeds path-sensitive tools a fixed fake root, never the checkout it runs in.
Check: the test passes both in the main checkout and in a `.claude/worktrees/EZD-000b` worktree, and after one row is added to the copied ledger (Q-0136).

## L-008  areas: data-model, migrations, tooling  seen: 1  status: candidate
Ticket EZD-005a, 2026-10-19
Mistake: T15a checked table keys in the generated `database.types.ts` with a line-start-anchored regex; the Supabase CLI writes `},"tenant": {` on the previous closing brace's line, so four of five keys never matched and a structural repair was needed.
Cause: the test assumed one key per line in generated output instead of reading the real file's layout.
Rule: a test that matches text in generated output (types, lockfiles, CLI output) does not anchor on line starts or assume formatting; it bounds the key on both sides (e.g. preceded by start, `{`, `}`, `,` or space; followed by the quote or colon).
Check: the match finds every expected key in the actual generated file and rejects substring keys (`membership` vs `membership_project`).
