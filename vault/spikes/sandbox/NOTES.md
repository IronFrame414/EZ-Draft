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
