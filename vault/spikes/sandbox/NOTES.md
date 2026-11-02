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
