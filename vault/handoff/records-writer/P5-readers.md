# P5 · 2.13 · next_ticket.mjs reads the records database; --check validates it

Source: REMEDIATION-PLAN 2.13, "Done when": `--check` and `--next-unit` pass. D1 (a), D9 (a) (parent session, 2026-11-02: plans held in the database). The CLI is unchanged.

## What to build
1. `records.mjs import` writes `meta.checkout`, the real path of the checkout. `next_ticket.mjs` reads the record docs (STATUS, the three QUESTIONS files, DONE, debt, needs-from-josh, CURRENT, cost log, findings) from the database when `meta.checkout` is its own root.
   - With no such database (CI, test copies of vault/), it reads its own files.
   - An `$EZD_RECORDS_DB` that belongs to another checkout is an error.
2. `--check` adds:
   - SQLite's `integrity_check`;
   - every view on disk must equal its database rendering;
   - every open ticket's plan file must exist and match the sha256 held for it.
3. `--sort-questions` with the database: one `move` op per row. Inside a unit it prints `QUESTIONS SORT DEFERRED`, and the launcher runs it after applying the unit (as a direct child with `EZD_RECORDS_WRITER`).
4. `assignQuestionIds` refuses with the database (the launcher uses `planQuestionRows`).

## Tests (`scripts/ledger/records-reader.test.mjs`, a copied checkout with its own temp database)
| Test | Expected |
| --- | --- |
| N1 | after import, with the view files deleted: `--check` prints `LEDGER OK: <n> tickets` and `--next-unit` equals the file-read answer |
| N2 | a ticket changed only in the database changes `--next-unit` |
| N3 | an edited STATUS.md view → `--check` exit 1, "differs from the records database" |
| N4 | a held plan whose file changed → `--check` names it; missing → names it |
| N5 | `$EZD_RECORDS_DB` of another checkout → exit 1 with "belongs to" |
| N6 | `--sort-questions` moves an answered row in the database; inside a unit it is deferred |
