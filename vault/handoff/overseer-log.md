# Overseer log

One line per repair the launcher ran (EZD-333; decision 2026-11-05). Read at the daily check-in.

- 2026-11-05T14:12:22.680Z repair probe: REPAIRED: probe edited scripts/launcher/fix-mode-probe.txt
- 2026-11-05T14:12:46.832Z repair check: REPAIRED: committed the untracked `vault/handoff/overseer-log.md` (fc7d85f5) and pushed develop.; commits c011f8f5..fc7d85f5; files: vault/handoff/overseer-log.md
- 2026-11-05T14:33:54.516Z repair ci: REPAIRED: fix ticket EZD-335 for test:e2e (the phase 2 PR 5 CI gate failed there)
- 2026-11-05T19:01:06.000Z interactive (session 7): FIXED: the phase PR wait that held the launcher 3.5 h on PR 5 (cancelled push gate run, auto-merge off) is now cleared unattended: EZD-336 a837cdaf (cancelled or timed-out gate run → repair ci re-run; auto-merge off → launcher re-enables; green but open → launcher merges). PR 5 merged 18:49 UTC (bc9570d7).
- 2026-11-05T19:25:51.768Z repair check: REPAIRED: committed untracked research report `vault/research/R-053.md` (EZD-337) with its `vault/research/INDEX.md` row, and pushed develop.; commits 716a334a..9e2d43a5; files: vault/research/INDEX.md, vault/research/R-053.md
- 2026-11-05T21:06:25.879Z repair check: REPAIRED: `vault/tickets/tickets.json` now lists EZD-202's dependency as EZD-120a only. `node vault/tools/next_ticket.mjs --check` now prints `LEDGER OK: 608 tickets`.; commits a0c9e51a..1625c494; files: vault/tickets/tickets.json
- 2026-11-06T00:44:55.279Z repair check: REPAIRED: added the missing STATUS rows for the phase 3 gate fix tickets EZD-338, 339, 340 and 341.; commits a4b08e93..86614851; files: vault/spec/acceptance-criteria.md, vault/tickets/phases/phase-01.md, vault/tickets/tickets.json
- 2026-11-06T02:57:42.000Z interactive (session 8): FIXED: an unattended phase PR merge took develop's tip, not the audited commit (EZD-336 security finding 2): EZD-337 5dd9bc0b (Q-0594 (a): auto-merge off; the launcher holds the merge while a production-sensitive file changed after the phase audit lacks a recorded security pass, repair kind security records it, and the launcher merges only at the checked head with --match-head-commit).
- 2026-11-06T04:49:29.000Z interactive (session 8): FIXED: the gate gave a worktree's code the launcher's full environment (Q-0548 (a)): EZD-344 c9e024ef (scripts/gate-env.mjs, exact environment for every gate child; OS-level reach in KNOWN-LIMITS, separate macOS user is Josh's admin item Q-0602).
