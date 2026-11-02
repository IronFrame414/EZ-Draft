# Records redesign 2.12 to 2.14: merge runbook (branch s2/records-writer)

Merging switches the live launcher to the records database at once (run.mjs restarts itself when its code changes). In order:
1. Stop the launcher service. No unit may be in flight (`~/Library/Logs/ezdraft/inflight/` empty).
2. Rebase onto develop. develop keeps committing record files until then: in a conflict on a running-record file, take develop's version.
3. In the main checkout on develop after the merge, run `node scripts/records.mjs import --replace`. It writes `~/.ezdraft/records.db` with its checkout row, so `next_ticket.mjs` reads it. The 2.11 database has no checkout row and is stale.
4. Run `node vault/tools/next_ticket.mjs --report`. Then run `node scripts/records.mjs snapshot vault/snapshots/migration-2026-11-02`. Commit it with the message `docs(vault): records migration snapshot`; this is the one records commit.
5. `node vault/tools/next_ticket.mjs --check` must print LEDGER OK, and `git status` must be clean. Then restart the launcher.

Still open (2.15 to 2.18):
- ledger.mjs library code, the locks and the ledger queue; run.mjs still calls the queue between units.
- PROCESS.md sections 8, 10, 13 and 14 still describe record commits.
