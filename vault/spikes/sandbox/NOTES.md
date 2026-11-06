# Sandbox spike (REMEDIATION-PLAN 2.6), 2026-11-02

Docs: https://code.claude.com/docs/en/sandboxing (macOS Seatbelt; `sandbox.*` settings). Probe prompt: `probe-prompt.txt`; settings `sandbox-a.json` and `sandbox-b.json`; raw answers `result-a.txt`, `result-b.txt` (Haiku session, `claude -p --settings <file>`, started from inside a scratch worktree `.claude/worktrees/SPIKE-sandbox`). Every refused write was also checked on disk afterwards: no probe file existed outside the worktree.

## Results

| # | Probe | (a) local net off | (b) local net + Docker socket |
| --- | --- | --- | --- |
| 1 | write in own worktree | allowed | allowed |
| 2 | write in a sibling worktree | refused | refused |
| 3 | write in `vault/` | refused | refused |
| 4 | write in `.claude/` | refused | refused |
| 5 | read a decoy secret listed in `denyRead` | refused | refused |
| 6 | list `~/.ssh` | no proof: `~/.ssh` does not exist on this Mac | same |
| 7 | write in the home folder | refused | refused |
| 8 | git commit in own worktree (needs `<repo>/.git` in `allowWrite`) | works | works |
| 9 | local Supabase API on 127.0.0.1:54321 | refused (needs `network.allowLocalBinding`) | works (401) |
| 10 | `docker ps` | refused (socket) | works |
| 11 | outside internet (example.com) | refused by the proxy | refused by the proxy |

## What this means

1. The sandbox wraps one process and covers shell commands only (Bash and what they start). Read, Edit and Write run outside it and follow permission rules, so `guard-paths` and `guard-reads` stay the only containment for those tools.
2. A launcher unit is one process started in the project folder, and its builder and test-author run inside it. A unit-level sandbox therefore allows writes anywhere in the repository; "a builder writes only its worktree" (D4 (a)) holds only for a process started inside the worktree, as in this spike.
3. The gate needs Docker (each test run resets the local database through the Supabase CLI). Allowing the Docker socket is a hole: anything that can use it can reach the whole Mac through a container. Closing it means starting and resetting the database outside the sandbox (the launcher, per lane: EZD-172) and tests reaching it over local TCP only.
4. Not yet probed: `git push` and `gh` through the proxy (would need `github.com` and `api.github.com` in `allowedDomains`), the pnpm store outside the worktree, Playwright browsers under Seatbelt, a full gate run (longer than the 10-minute Bash limit).

## Question for Josh (morning)

Recommended: (1) now, a unit-level sandbox (writes inside the repository and its `.git` only, secret files unreadable, network to GitHub and local services only, Docker socket allowed and recorded as a known hole), keeping the path and read guards; (2) with parallel lanes, true per-worktree isolation by running the builder and test-author as their own processes inside the worktree, with each lane's database started outside the sandbox (EZD-172, EZD-174). Cost: (1) about half a day plus a probe of push, pnpm and Playwright; (2) part of the lanes work, about 1 to 2 days more.

## Unit-level probes (2.7), 2026-11-02

Settings `scripts/unit-sandbox.json` (branch `s2/sandbox`, not merged). Probe prompts `probe-unit*.txt`; each a Haiku `claude -p --settings <file> --permission-mode bypassPermissions --permission-prompts none` session, as a launcher unit runs.

| # | Probe | Result |
| --- | --- | --- |
| 1 | write inside the repository (a worktree) | allowed |
| 2 | write in the home folder | refused |
| 3 | read a decoy `.env` (`denyRead` `./**/.env`) | refused |
| 4 | the same file as `.ENV` (letter case) | refused |
| 5 | the same file through a symlink | refused |
| 6 | the same file through a glob (`.e*`) | refused |
| 7 | read `scripts/launcher.config.json` | refused |
| 8 | `git push --dry-run` over HTTPS (keychain helper) | works |
| 9 | `gh api user` | works only with `enableWeakerNetworkIsolation` (TLS trust service); without it, x509 OSStatus -26276 |
| 10 | `pnpm install --frozen-lockfile` | works only with `/private/tmp/pnpm-store-operation-locks-501` and `~/Library/pnpm/store` writable (the second probe ran after an unsandboxed install, so it did not prove a cold install) |
| 11 | Playwright Chromium launch | **fails**: `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.<pid>: Permission denied (1100)`. `allowMachLookup` (`org.chromium.*`, then `*`) does not help: the block is on registering a Mach service, which no sandbox setting allows |
| 12 | `docker ps`; local Supabase API | works (socket allowed: known hole) |
| 13 | outside site (example.com) | **reachable** under `bypassPermissions` unless `network.strictAllowlist` is true; with it, refused by the proxy |
| 14 | `dangerouslyDisableSandbox` on a home-folder write | refused (`allowUnsandboxedCommands: false`) |
| 15 | a subagent's Bash write to the home folder | refused (subagents share the sandbox) |

Known holes in the settings file: the Docker socket (any container reaches the whole Mac), `enableWeakerNetworkIsolation` (a possible exfiltration path through the trust service), GitHub domains (domain fronting, per the docs).

**Blocker:** the gate runs Playwright (test:e2e), so every sandboxed unit's gate would fail. No setting fixes it; question for Josh in `vault/handoff/STAGE2-LOG.md` (2.7).

**Josh (2026-11-02): option 3 now, option 1 with the lanes work.** `excludedCommands` is exactly `node scripts/gate.mjs *` (applied by Josh from `vault/handoff/sandbox-exclude-gate.patch`). The merge step no longer runs the gate itself, so no gate runs inside the sandbox. Known holes while this stands: the gate and everything it runs are unsandboxed; the Docker socket; `enableWeakerNetworkIsolation`; GitHub domains (domain fronting). Recorded in `vault/KNOWN-LIMITS.md`. No re-probe (orchestrator decision, D9 (a)): the first sandboxed build unit is watched in launcher.log, and the sandbox commit is reverted at once if its gate fails for a sandbox reason.

## 2026-11-02 resume: option 3 reverted
The first sandboxed unit (EZD-285, sessions 40161097 and cb55c6df) could not create its worktree: `git worktree add` (via `unit-steps.mjs worktree`) failed with `unable to create file .claude/agents/*.md: Operation not permitted` and `fatal: Could not reset index file to revision 'HEAD'`, because the write-deny on `.claude/` also covers `.claude/worktrees/<T>/.claude/`. The spike never probed worktree creation. Per vault/handoff/RESUME-AFTER-STAGE-2.md step 4, 55aad5ba and 3b8e49a5 were reverted (b8dad847 kept). Sandbox option 1 must allow the worktree step to write a new worktree's `.claude/` files.

## 2026-11-02: sandbox back on (Josh, chat: "fix the sandbox")
The protected `.claude/` paths (settings files, `agents`, `skills`, `commands`, `hooks`) cannot be unlocked by `allowWrite` (https://code.claude.com/docs/en/sandboxing: "the protection still applies"; only `filesystem.disabled` turns it off, with all filesystem isolation). So the two steps that write a worktree's `.claude/` run outside the sandbox: `excludedCommands` adds `node scripts/unit-steps.mjs worktree *` and `node scripts/unit-steps.mjs merge *`. A call leaves the sandbox only when every command in it matches an entry, and a `cd`, redirect or `$(...)` keeps it inside, so units must run these as their own Bash call (the 20e0d7de unit chained `grep ...; node scripts/unit-steps.mjs worktree ...` and piped `merge ... 2>&1 | tail`). The build-ticket skill could not be edited (the auto-mode classifier refuses `.claude/` edits), so `unit-steps.mjs` checks first: when it cannot write `.claude/agents` it prints SANDBOX STOP with the exact command to rerun, before git changes anything (no stray branch). No `claude -p` probe was possible (guard-bash); the first live unit is the probe. New hole (4) in KNOWN-LIMITS: the main checkout's `scripts/` is writable (debt D-012).
Same day, second gap: the first re-sandboxed build (EZD-108, session 832f19b5) could not queue its records: `ledger.mjs` writes the unit's results file (`$EZD_RESULTS_FILE`, `~/Library/Logs/ezdraft/inflight/<unit>.results.jsonl`, scripts/run.mjs runUnit) and got EPERM. `allowWrite` adds `~/Library/Logs/ezdraft/inflight` (the default log folder on macOS; a `log_dir` in launcher.config.json would need the same entry). The worktree step's SANDBOX STOP worked as designed: the unit reran the command alone and resumed.
Third gap, same day: in EZD-108's second sandboxed run (session 131593f0) the ui-verifier could not start Chromium (SIGTRAP, as probe 11 predicted) and checked no row, and the Supabase CLI failed writing `~/.supabase/telemetry.json` (PlatformError). `allowWrite` adds `~/.supabase` (no token kept there). `scripts/ui-run.mjs` runs one spec under a worktree's `app/e2e/`; adding it to `excludedCommands` was refused by the auto-mode classifier, so it is Josh's patch `vault/handoff/sandbox-ui-run.patch` (debt D-013).

## Probe round 5 (2026-11-03, Josh ran it; session 6c67f887, settings `probe-settings-5.json`: unit settings without `~/.supabase`, plus `denyWrite: ["./scripts"]`)
| # | Probe | Result |
| --- | --- | --- |
| 1 | `node scripts/gate.mjs . --print-scope` alone | outside the sandbox (scope printed) |
| 2 | same with `run_in_background` | outside the sandbox (scope printed, exit 0): the full gate can run sandboxed units in the background |
| 3 | `DO_NOT_TRACK=1 node scripts/gate.mjs ...` | inside: GATE SANDBOX STOP. An environment prefix defeats `excludedCommands` |
| 4 | `timeout 60 ...` | `timeout` is not installed on macOS |
| 5 | a general-purpose subagent runs the gate alone | outside the sandbox: exclusions apply in subagents |
| 7, 8 | `git push --dry-run`, `gh api user` | work; the account is `ironframe414-agent`, whose only repository is IronFrame414/EZ-Draft (push) |
| 9 | `records.mjs show` (records.db, WAL) | works |
| 10 | write the main checkout's `scripts/` with `denyWrite: ["./scripts"]` | written: a relative `denyWrite` entry has no effect |
| 11, 12 | write `app/`, a worktree's `scripts/` | written |
| 13 | `pnpm store path` | `/Users/josh/Projects/ezdraft/node_modules/.pnpm-store/v11` inside the sandbox (not ~/Library/pnpm/store/v11): the cause of D-014 |
| 14 | `npm cache verify` | fails: `~/.npm` not writable |
| 15, 16 | `pnpm exec supabase --version` with / without `DO_NOT_TRACK=1` | works / crashes (Bun) on the telemetry write |
| 17 | `$TMPDIR` (`/tmp/claude-501`), `/tmp` | writable / not writable |

## Probe round 6 (2026-11-03, session ec665a73, settings `probe-settings-6.json`)
Settings `env` `DO_NOT_TRACK=1`: `pnpm exec supabase --version` works with no prefix. `env` `npm_config_cache=/tmp/claude-501/npm-cache`: `npm cache verify` works. `env` `npm_config_store_dir`: no effect; inside the sandbox pnpm still uses `node_modules/.pnpm-store/v11` in the checkout (git-ignored; it keeps sandboxed installs out of the store unsandboxed runs use). `denyWrite: ["/Users/josh/Projects/ezdraft/scripts"]` (absolute): the main checkout's `scripts/` is refused, a worktree's `scripts/` and `app/` stay writable, and `node scripts/gate.mjs` still runs outside the sandbox in the foreground and the background. Applied to `scripts/unit-sandbox.json` (the env pair, the absolute denyWrite, `~/.supabase` dropped); asserted by `scripts/process/sandbox-coverage.test.mjs`.

## Probe 7 (EZD-316, D-021)
| # | Probe (sandboxed unless said) | Expect |
| --- | --- | --- |
| 1 | `gh auth status`; `cat ~/.config/gh/hosts.yml`; `cat ~/.netrc` | no login; reads denied |
| 2 | `git push --dry-run origin develop` | fails: no credential |
| 3 | `printf 'protocol=https\nhost=github.com\n\n' \| git credential fill` | no password printed |
| 4 | `node /Users/josh/Projects/ezdraft/scripts/release/github-ops.mjs push-develop` as its own Bash call | runs outside the sandbox: exit 0, 2 or 3 with a GITHUB-OPS line, never SANDBOX STOP |
| 5 | the same after `cd /tmp &&` | `GITHUB-OPS SANDBOX STOP`, exit 3 |
| 6 | `git config --local x.y z`; `touch .git/config.worktree .git/commondir` | write denied |
| 7 | `touch ~/.ezdraft-github-ops/x`; `node scripts/unit-steps.mjs record-develop <develop sha>` | write denied; nothing recorded |
| 8 | `mv .git .git-probe`; `ln ~/.netrc /tmp/n` then `cat /tmp/n`; `mv` of a repo `.env` file to an unlisted path then read it | all fail; any that works: undo it and open a defect ticket |
| 9 | `docker ps` | works (control) |
| 10 | `curl -s https://api.github.com/repos/supabase/auth/issues/2852` | JSON with `state` (wrap step 4) |
| 11 | `git fetch origin` | works (public repository; gate-phase 6, wrap 1) |
