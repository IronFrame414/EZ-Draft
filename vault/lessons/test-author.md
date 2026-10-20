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

## L-017  areas: testing, tooling, ui  seen: 1  status: candidate
Ticket EZD-007f, 2026-10-20
Mistake: `app/playwright.config.ts` and EZD-007d's `app/test-harness/mail-catcher.ts` used `import.meta.url`; Playwright loads `.ts` files in a package without `"type": "module"` (the `app` package) as CommonJS, so the config threw `Cannot use 'import.meta' outside a module` and no browser test ran (builder stop, Q-0197). Vitest had hidden it, since it loads every file as ESM.
Cause: a helper written and checked under one runner was reused under a runner with a different module system.
Rule: test code that Playwright loads in `app/` uses no ESM-only (`import.meta`) or CommonJS-only (`__dirname`) feature; find the repo root by walking up from `process.cwd()` to `pnpm-workspace.yaml` (Q-0197 (b)).
Check: run the Playwright config once (`playwright test --list`) before handing tests to the builder; it must load.

## L-018  areas: testing, security  seen: 1  status: candidate
Ticket EZD-016d, 2026-10-20
Mistake: T5 checked the gate secret with `expect(x).toBe(secret)` and `not.toBe(secret)`; on failure the runner prints expected and received, so the secret would land in gate.log (security-reviewer, minor).
Cause: a value assertion was used on a secret, and matchers print both sides when they fail.
Rule: compare a secret only through a boolean (`expect(a === b).toBe(true)`) or a hash of both sides, never by value matchers.
Check: grep test files for `toBe(`/`toEqual(` on variables holding secrets, keys or tokens.
