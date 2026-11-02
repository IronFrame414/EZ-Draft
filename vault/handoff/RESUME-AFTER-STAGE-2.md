# Resume after Stage 2 (2026-11-02)

For the session Josh starts to resume the build. Details: `vault/handoff/STAGE2-LOG.md`; decisions: the 2026-11-01 and 2026-11-02 rows at the end of `vault/spec/decisions/process.md`; sandbox: `vault/spikes/sandbox/NOTES.md`, `vault/KNOWN-LIMITS.md`.

## State

- `vault/handoff/STOP` is in place; the launchd launcher service is running, has loaded the new code, and waits on STOP. Fix mode (`vault/handoff/LAUNCHER_FIX.md`) is still open; launcher units never get it (310f0cd5).
- develop: **CI is red** since 48512117 (run 41457992149): `ledger-lock.test.mjs` K7 and EZD-281 T7 read git-ignored record files a fresh checkout does not have. The records session is fixing it; do not remove STOP until a CI run on develop is green. The local Mac gate passes.
- Records now live in `~/.ezdraft/records.db` (the launcher is the only writer); the markdown record files are generated and git-ignored. A copy of the pre-migration database sits in a temporary folder (`/private/tmp/claude-501/-Users-josh-Projects-ezdraft/86e62342-b886-4484-9600-b62edcbf067b/scratchpad/records-2.11-backup.db`) that macOS may clear.
- Units start sandboxed (`--settings scripts/unit-sandbox.json`); the gate (`node scripts/gate.mjs *`) runs outside the sandbox, and the merge step runs no gate itself.

## REMEDIATION-PLAN Stage 2

| Item | State | Commits |
| --- | --- | --- |
| H7 CI on Linux, CI on every develop push | done | b07dee8f |
| 2.1 non-goals | done | 191e40a9 |
| 2.2 duplicate sentence | done | b60437ae |
| 2.3 rules 17 and 18, debt list, plan caps, build-system freeze | done | ff63dbaa, c103fb74 |
| 2.4 one launcher at a time | done | d4be9db6 |
| 2.5 lesson L-041 | done | 7259c07f |
| 2.6 sandbox spike | done | 727f3ffb |
| 2.7 unit sandbox (option 3 now) | done | 3b8e49a5, 55aad5ba, b8dad847, a72dc651, 20c73e6d |
| 2.8 grants removed (path and read guards kept) | done | 26ba6dee |
| 2.9 EZD-282 closed; EZD-279, EZD-280 open | done | (with 26ba6dee) |
| 2.10, 2.11 records database and round trip | done | d69d7cf7, aef626d9, 76365f41 |
| 2.12 to 2.14 launcher as only writer, readers, git-ignore | done | f82b0110, 2efb1234, 20b26e42, 48512117 |
| Ticket triage (24 tickets set aside), resume order | done | d7f234b2 |
| Fix tickets can't skip planning | done | f20fb07e |
| 2.15 remove `ledger.mjs` library and locks, the ledger queue, `questions-files.mjs`, `stop-ledger-check.mjs` | left | waits on a maintenance window (Josh's yes on the list) |
| 2.16 close the dropped tickets | partly: they are `blocked` with the triage reason, not closed | maintenance window |
| 2.17 PROCESS.md sections 8, 10, 13, 14 describe the new flow | left | maintenance window; needs Josh's yes on the text |
| 2.18 log interactive sessions and the weekly meter per row | left | maintenance window |
| 2.19 unit and db test projects | left | a ticket; build-system, needs Josh's yes (rule 18 freeze) |
| 2.20 to 2.23 cleanup | done | 8f2e83c1 (worktrees removed and tagged `archive/*`, local tags only) |
| 2.24 delete `~/Projects/ezdraft-audit/repo` and `snapshot/` | left | Josh |
| Sandbox option 1 (gate and database outside the sandbox, per lane) | left | the lanes work: EZD-172 then EZD-174, after 20 baseline tickets (P1 (a)) |

## Tickets and debt to know about

- Phase 1: EZD-284, EZD-285 and EZD-289 (M10: a Settings link on the signed-in home page) are ready; EZD-286 and EZD-287 are done. Then the phase 1 gate; its PR auto-merges on green CI and Josh walks the punch list after (Q-0261).
- Phase 2 product tickets build after the phase 1 gate (overrides D7), including EZD-283 and EZD-288.
- Morning list, not yet tickets: L9 (one proxy rule hiding `/dev` and `/api/dev` on the live site: an app security defect, becomes a ticket without Josh's yes), L8 (dependency audit in CI, Sentry update), L10 (knip in the gate), M9 (measure the real Settings pages; make the size check required), M11 steps 2 and 3 (Before-launch checklist; step 1 is Josh's sign-in on the live address). L8, L10 and 2.19 are build-system tickets: rule 18 needs Josh's yes.
- Debt (`vault/debt.md`): D-001, D-002 (L11, L12), D-003, D-004, D-005 (needs a `gate.mjs` change: bind gate.log to the commit, not the time). Also: CI's browser-test step prints "The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set" (from the H7 NO_COLOR meeting a FORCE_COLOR set below the gate): add it as a debt row.
- EZD-279, EZD-280 (guards on secret files) stay open; EZD-141 still waits on Supabase.

## Josh to confirm

CLAUDE.md rules 17 and 18 wording · the settings.json deny entries moved into the shell guard · L-041 marked ratified · the records session's decisions (2) and (4) in STAGE2-LOG (two extra kinds of allowed untracked file; `debt.md` and `needs-from-josh.md` stay in git) · the known sandbox holes in KNOWN-LIMITS (the gate runs unsandboxed, the Docker socket, `enableWeakerNetworkIsolation`, GitHub domains).

## What the resume session does first

1. Confirm `node vault/tools/next_ticket.mjs --check` prints LEDGER OK and the newest CI run on develop is green.
2. Back up the records database: `node scripts/records.mjs backup ~/.ezdraft/backups/records-2026-11-02.db`.
3. Remove `vault/handoff/STOP` (`unlink vault/handoff/STOP`). The service is already running and starts the next unit within a minute. If `node scripts/launchd/install.mjs status` shows it not running, Josh runs `cd /Users/josh/Projects/ezdraft && node scripts/launchd/install.mjs install` himself (auto mode refuses it for agents).
4. Watch the first build unit in `~/Library/Logs/ezdraft/launcher.log`: it must log "starts sandboxed (scripts/unit-sandbox.json)". One MERGE GATE (exit 5) right after develop moved is expected. If that unit's worktree `gate.log` or `gate-failures.log` shows `bootstrap_check_in ... MachPortRendezvousServer ... Permission denied (1100)` or other "Operation not permitted" denials, run `git revert 55aad5ba 3b8e49a5` at once and push (keep b8dad847).
5. Keep usage low: the account is on a lower plan for now; the launcher pauses on the real meter by itself.
