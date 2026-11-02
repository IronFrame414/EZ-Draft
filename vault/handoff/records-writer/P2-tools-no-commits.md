# P2 · 2.12b · ledger.mjs CLI, unit-steps.mjs and the session-end hook stop committing

Source: REMEDIATION-PLAN 2.12; AUDIT-REPORT 3.2, "Flow per ticket" steps 1 to 5; D1 (a), D2 (a). Builds on P1 (`record()`). Tests first, on temp repos with a temp database (`EZD_RECORDS_DB`) and `EZD_ROOT` (L-041).

## What to build
1. `record()` writes the views into `$EZD_ROOT/vault` when `EZD_ROOT` is set, never into the real checkout from a test.
2. `scripts/ledger.mjs` CLI: same commands, arguments and output lines; no command commits.
   - Running records go through `record()`:
     - `status` → `status`
     - `question` → `question`, with the ID from `nextQuestionId(db, $EZD_RESULTS_FILE)`
     - `answer` → `answer`
     - `append vault/DONE.md` → `done`
     - `handoff` → `handoff`
   - Reference files are written as before but not committed: `lesson`, `seen`, `lessons-index`, `architecture`, `research`, and `append` to a lessons file. They reach git with the ticket's feat commit or the phase snapshot.
3. `scripts/unit-steps.mjs`:
   - Rows are read from the database (`tickets` table).
   - Every STATUS change goes through `record()`; no `docs(vault)` commit.
   - `worktree` copies `vault/plans/<T>.md` into the worktree.
   - `merge` puts develop's `vault/plans/<T>.md` into the one `feat(<T>)` commit (the plan travels with its ticket, AUDIT-REPORT 3.2 "Sorting the vault"). Before the squash it sets develop's untracked copy aside, then writes it back and stages it.
   - `finish` runs `--check` and `--report` and pushes; it commits nothing.
   - `table` records `blocked` with the note.
4. `.claude/hooks/session-end.mjs`: no commit and no handoff archive (the handoff history is the `events` table, P1). It keeps `--check` and writes its problems to stderr.

## Tests that change expectation (each cites D1 (a) / D2 (a) in its title)
- `scripts/process/unit-steps.test.mjs`: the fixture imports its vault into a temp database and git-ignores the running records. merge, finish and table assert no `docs(vault)` commit, the database row, and `git status` clean.
- `scripts/process/unit-steps-update.test.mjs`: same fixture change.
- `scripts/hooks/session-end.test.mjs` H1 to H3: the hook never commits.
- `scripts/process/ledger-lock.test.mjs`: the K tests that run the CLI assert database rows and no commit. Library-function tests (`updateStatusRow`, `commitPaths`, locks) stay as they are until 2.15 removes ledger.mjs.

## New tests
| Test | Expected |
| --- | --- |
| U1 merge with an untracked develop plan | one new develop commit `feat(EZD-002): Thing two` whose tree holds `vault/plans/EZD-002.md` with develop's text |
| U2 merge inside a unit (`EZD_RESULTS_FILE`) | the database is unchanged until `applyQueueFile`; then EZD-002 is `done` with the feat hash |
| L1 `ledger.mjs status` inside a unit | one queued op, no commit, STATUS.md unchanged |

## Do not touch
Locks and grants (2.8 and 2.15 remove them). The grant removal commit in `merge` stays until 2.8.
