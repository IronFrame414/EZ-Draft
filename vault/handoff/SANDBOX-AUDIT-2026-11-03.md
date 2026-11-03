# Sandbox audit · 2026-11-03

Asked by Josh after the overnight stop ("audit the sandbox and all rules guidelines gates etc around it"). Read-only audit; evidence is today's sandboxed unit transcripts (`~/.claude/projects/-Users-josh-Projects-ezdraft/<session>.jsonl` for every unit the launcher logged as "starts sandboxed"), `scripts/unit-sandbox.json`, the code that starts and checks the sandbox, and every skill, agent file, rule and doc that mentions it.

## Plain summary for Josh

- The sandbox is **off** now (`vault/handoff/sandbox-off.patch`, 54a94edd). Nothing below can stop tonight's build.
- The sandbox settings are sound for what they protect: secrets in `.env` files, the rest of the Mac, and websites other than GitHub and npm.
- It failed because **the build was never tested end to end inside it**. Each kind of unit used a command or a folder the settings did not allow. Seven separate gaps showed up one at a time; five are fixed, two are not.
- Three things must be settled **before it is turned back on**: (1) whether a background command can run outside the sandbox (the full gate needs that, and the documentation does not say); (2) a dry run of every unit type; (3) a test that checks every command the instructions tell units to run is covered by the settings.
- Two security gaps remain even with the sandbox on: an agent can use your GitHub login (it lives in the Mac keychain, and GitHub is an allowed site), and an agent can edit the main checkout's `scripts/` and then run the changed script outside the sandbox.

## 1. What failed, and its state

| # | Gap | First seen | State |
| --- | --- | --- | --- |
| 1 | A new worktree's `.claude/agents` etc. are always write-protected; worktree creation and merge failed | EZD-285 build | Fixed: excluded commands + SANDBOX STOP self-check (ee032d32, D-008) |
| 2 | Units' records queue (`~/Library/Logs/ezdraft/inflight`) not writable | EZD-108 build | Fixed: allowWrite (29786a99) |
| 3 | Supabase CLI telemetry (`~/.supabase`) not writable | EZD-108 build | Fixed: allowWrite (9677bc21). Narrower option seen in a transcript: `DO_NOT_TRACK=1` made the CLI skip it |
| 4 | Chromium cannot start in the macOS sandbox (Mach port 1100): ui-verifier screenshots | EZD-108, EZD-110b | Fixed: `scripts/ui-run.mjs` excluded (532a140f, D-013). Never yet run in a unit |
| 5 | Gate run chained, redirected or with `timeout` stays sandboxed and fails on write denials | gate-phase 1, EZD-291 | Partly fixed: GATE SANDBOX STOP self-check (e974edeb). See 2.1: the full gate may not be runnable sandboxed at all |
| 6 | npm cache `~/.npm` not writable (`npx`, `npm`) | ui-verifier | Open: not in allowWrite |
| 7 | pnpm falls back to a 1.8 GB store in the checkout; install lock warning | EZD-290 build | Open: cause unknown (D-014); `.pnpm-store/` git-ignored |

Denials that were the sandbox working as intended: reading `scripts/launcher.config.json` (a search skipped it).

## 2. Open questions that block turning it back on

1. **Background commands and `excludedCommands`.** The docs say "Claude Code checks your entries against each Bash and Monitor call" and that a redirect, `cd` or `$(...)` keeps a call sandboxed; they say nothing about `run_in_background`, an environment-variable prefix or a `timeout` wrapper. The full gate takes longer than the 10-minute foreground limit, so `gate-phase` (and a build whose gate runs long) must run it in the background. If a background call is always sandboxed, every phase gate will print GATE SANDBOX STOP and stop. **Must be probed before re-enabling.**
2. **Records database.** `~/.ezdraft/records.db` opens in WAL mode (`scripts/records.mjs` line 98), which normally needs write access to `records.db-shm`; `~/.ezdraft` is not in allowWrite. No sandboxed unit showed a database error today, so it works or is never reached; not proven.
3. **Subagents.** Spike probe 15 showed a subagent's Bash shares the sandbox; nothing shows whether excluded commands apply in a subagent the same way. The ui-verifier is a subagent, and `ui-run.mjs` has not yet run there.

## 3. Security gaps that remain with the sandbox on

1. **GitHub credentials (new finding, high).** No token file exists on disk; the GitHub login is in the macOS keychain. Spike probes 8 and 9 showed `git push` and `gh api` work from inside the sandbox. With `github.com` and `api.github.com` allowed, a sandboxed agent can push to any of Josh's repositories or post data to GitHub (a gist, an issue). KNOWN-LIMITS lists only "GitHub domains (domain fronting)". Close the class: pushes and `gh` calls go through a trusted excluded script that allows only this repository and the named operations, and the sandbox denies the keychain lookup, or record it as a known hole with Josh's yes.
2. **Editable excluded scripts (D-012, medium).** `allowWrite` `./` covers the main checkout's `scripts/`, so a unit can change `gate.mjs`, `unit-steps.mjs` or `ui-run.mjs` and then run it outside the sandbox. The next unit's preflight notices only after the fact.
3. **Gate and ui-run run agent-written code unsandboxed (holes 1 and 6).** Known and accepted by Josh (option 3); closes with option 1 (EZD-172, EZD-174).
4. **Docker socket (hole 2).** Known.

## 4. Rules, instructions and gates around the sandbox

| Item | Finding |
| --- | --- |
| `scripts/run.mjs` | Sandbox flag removed (sandbox off). When it returns, no test asserts that units start with `--settings`; the earlier existence check (refuse to start without the file) was removed with it |
| `scripts/unit-sandbox.json` | Hard-coded paths: `~/Library/Logs/ezdraft/inflight` (wrong if `log_dir` is set), `/private/tmp/pnpm-store-operation-locks-501` (user id 501). No test checks them against the code that uses them |
| Self-checks | `unit-steps.mjs` worktree/merge and `gate.mjs` stop with a clear message when sandboxed; `ui-run.mjs` has none (Chromium crashes with SIGTRAP and no hint) |
| `.claude/skills/build-ticket/SKILL.md` step 7 | Says to run the gate "as its own Bash call"; does not say what to do when it runs longer than 10 minutes (gate-phase now says background). Same failure as EZD-291 |
| `.claude/agents/builder.md` line 30 | Says the gate is "the one command outside the unit sandbox": out of date (four excluded commands) |
| `vault/PROCESS.md` | Says nothing about the sandbox (REMEDIATION 2.17, rewrite of sections 8, 10, 13 and 14, still left) |
| `CLAUDE.md` | Nothing about the sandbox; nothing about which commands must be run alone |
| `vault/KNOWN-LIMITS.md` | Updated: sandbox off, holes (1) to (6). Missing: the GitHub credential gap (3.1) |
| Tests | No test checks that every command the skills and agent files tell units to run, in the form written, is matched by `excludedCommands` or needs no exclusion |

## 5. Checklist before the sandbox goes back on

1. Probe 2.1 (background, env prefix, `timeout`) and 2.3 (subagent) with one throwaway session each; record results in `vault/spikes/sandbox/NOTES.md`.
2. Close 1.6 (`~/.npm`) and decide 1.3 (`DO_NOT_TRACK=1` instead of allowWrite `~/.supabase`).
3. Find the cause of 1.7 (pnpm store fallback).
4. Add a `ui-run.mjs` self-check like the gate's.
5. Write the test in section 4's last row.
6. Dry-run each unit type sandboxed, one at a time, with the launcher stopped: build (with worktree, tests, builder, reviewers, ui-verifier, gate, merge, finish), plan, review-plans, questions, gate-phase (full gate in the background, PR, auto-merge), wrap, repair. Each must end with its normal result and no denial in its transcript.
7. Decide 3.1 and 3.2 with Josh (rule 18: close the class).
8. Update `builder.md`, build-ticket step 7, and PROCESS.md, then re-apply the `--settings` flag with a test that asserts it.
