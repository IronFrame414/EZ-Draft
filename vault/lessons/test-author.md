# Lessons · test-author

Entries follow the format in PROCESS.md section 13. Keep under about 30; the wrap unit consolidates.

## L-003  areas: tooling, scripts, process  seen: 1  status: ratified
Ticket EZD-000b, 2026-10-19
Mistake: two repo-script tests went red in later runs: one hard-coded the next Q-IDs from a copy of the live ledger, one built hook inputs under the real repo root, which inside a ticket worktree changed the hook's answer.
Cause: the tests depended on live repo state (ledger size, checkout location) instead of fixed inputs.
Rule: a repo-script test derives expected values from its own fixture or copy (e.g. next ID = highest in the copy + 1) and feeds path-sensitive tools a fixed fake root, never the checkout it runs in.
Check: the test passes both in the main checkout and in a `.claude/worktrees/EZD-000b` worktree, and after one row is added to the copied ledger (Q-0136).

## L-008  areas: data-model, migrations, tooling  seen: 1  status: ratified
Ticket EZD-005a, 2026-10-19
Mistake: T15a checked table keys in the generated `database.types.ts` with a line-start-anchored regex; the Supabase CLI writes `},"tenant": {` on the previous closing brace's line, so four of five keys never matched and a structural repair was needed.
Cause: the test assumed one key per line in generated output instead of reading the real file's layout.
Rule: a test that matches text in generated output (types, lockfiles, CLI output) does not anchor on line starts or assume formatting; it bounds the key on both sides (e.g. preceded by start, `{`, `}`, `,` or space; followed by the quote or colon).
Check: the match finds every expected key in the actual generated file and rejects substring keys (`membership` vs `membership_project`).

## L-011  areas: tooling, scripts  seen: 1  status: ratified
Ticket EZD-008b, 2026-10-19
Mistake: T12 checked "importing the script sends nothing" with the same import specifier earlier tests had already loaded, so the module was cached, its top level never ran again, and the check passed even with no entry guard (test review FAIL, finding 1).
Cause: ESM modules run once per specifier per process; node:test runs a file's tests in one process, in order.
Rule: a test of import-time side effects loads a fresh instance (a unique query specifier such as `../mod.mjs?tN`, or a child process), never a specifier another test in the same file already imported.
Check: delete the entry guard locally; the import-side-effect test must go red.

## L-015  areas: tooling, scripts, release  seen: 1  status: candidate
Ticket EZD-023d, 2026-10-19
Mistake: the `supabase.dump` test fake created its output folder itself, so `dumpDatabase` passed every test without creating `<tmp>/dump`; the real CLI 2.121.0 fails `DbDumpOpenFileError … NotFound` on a missing folder, so every real release would have stopped at `dump_failed` (code-reviewer mode 3 FAIL, behavior).
Cause: the fake did more than the real tool does, hiding a precondition the code under test must meet.
Rule: a fake for an external tool does only what the real tool does (no creating folders, files or state the tool expects to exist); the builder makes every precondition the real tool needs (folders, files) itself rather than relying on the fake.
Check: the fake writes into a path it did not create and fails like the real tool when the path is missing.
