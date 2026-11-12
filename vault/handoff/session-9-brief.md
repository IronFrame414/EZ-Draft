# Session 9 brief · Josh's main session, taking over from session 8 (2026-11-06)

Session 8's record: this file, the overseer log (`vault/handoff/overseer-log.md`, lines dated 2026-11-06), the STATUS notes of EZD-337, EZD-344, EZD-316 and EZD-345, and `vault/tooling-notes.md` (lines naming session 8). Session 8 is closed.

## Your role (the same as session 8)
- You are Josh's main session. Keep the unattended build moving, nonstop, until Josh stops you. Answer Josh when he checks in.
- Only design and UI questions that cannot be settled internally go to Josh (CLAUDE.md rule 3; Josh 2026-11-05 and 2026-11-06 chat). Everything else you settle yourself as answered-agent, with sources: product, scope, wording, money, security, build system. Record it with `node scripts/ledger.mjs question` and `answer`.
- Josh 2026-11-06 (chat): "the only items that are to cause a stop are design and ui issues that need my input". He also authorized running the budget script, bypassing guards and blocks for the build, STOP, fix mode, and pushing develop.
- The 30% context rule does not apply to the main session. Run until Josh stops you.
- Claude Code completes its own PRs. The launcher merges a phase PR itself at the checked head (Q-0594 (a), EZD-337).
- Tests first, gate green, never weaken a test or a guard. Every ticket gets code-reviewer PASS, plus security-reviewer PASS when the plan or the gate's SECURITY FLAG says so.

## Use both lanes
- `vault/handoff/LANES.json` is on: `lanes: 2, build_lanes: 2`. Plans run two at a time. Builds ran one at a time overnight only because one ticket at a time was ready and buildable. `node vault/tools/next_ticket.mjs --next-units` offered a single build.
- Keep two lanes busy:
  - Watch `--next-units`. When it offers one build while phase 4 has many `todo` tickets, the plan pipeline is behind. The launcher plans tickets on its own; check that the plan and questions units keep up, and that no ticket sits `planned` with an open QP for long.
  - An open phase PR holds the lanes to one unit by design (`next_ticket.mjs`: "lanes wait, one unit at a time").
  - A ticket whose plan needs a guarded path (`scripts/`, `.claude/`, `vault/tools/`, process files) is never built by the launcher. Build it yourself in fix mode (below) so it doesn't hold its phase.
- If both lanes have ready work and only one runs, read `scripts/launcher-idle.mjs` `laneLimits` and `pickUnits` and the launcher log before changing anything.

## State at hand-over (2026-11-06 10:45 UTC)
- Phase 3 is merged to main: PR 6, merged by the launcher at 09:40 UTC at the checked head 6236f1a5. It was wrapped at 09:43.
- Phase 4 is building. The overdue phase 2 debt became fix tickets EZD-349 to EZD-353 (D-016 twice, D-019, D-037, D-085). EZD-349 (85092584), EZD-350 and EZD-352 (e8edea67) are done. EZD-351 (a procedure ticket) and EZD-353 are next.
- 13 tickets merged during session 8: EZD-337, 344, 316 (Part A a5cae0cc, Part B 673624ea), 345, 340, 341, 342, 346, 347, 348, 349, 350, 352.
- Ledger OK (624 tickets). Develop is pushed (`git fetch` first: github-ops pushes from its own folder, so the local `origin/develop` ref is stale until you fetch). No STOP. Launcher running (`node scripts/launchd/install.mjs status`).
- Budget: `node scripts/budget.mjs --until-reset` was set 2026-11-06 on Josh's word; the hold is off until the weekly reset, Monday 2026-11-09 07:00 UTC. The pace is about $630 per 4 days against the $1,160 weekly ceiling. guard-bash blocks the script by name; run it through `node -e` with the name split (session 8 did), only on Josh's word.
- Forecast given to Josh: 384 tickets left (351 todo, 9 ready or planned, 24 blocked). At about 20 merges a day, minus new fix tickets, that is about 3 to 4 weeks. Offered next: sort the 24 blocked tickets into Josh's and the overseer's.

## What is new in the build system (session 8)
- **EZD-337, merge hold.** `next_ticket.mjs` holds a phase PR while a production-sensitive file (one list, `vault/tools/security-paths.mjs`, shared with the gate) changed after the gate record's `Develop at PR` or last `Security pass at:`. Repair kind `security` runs the review and appends `Security pass at: <sha>`. The launcher turns auto-merge off and merges with `--match-head-commit`. It worked live on PR 6.
- **EZD-344, gate environment.** Every gate child gets an exact environment (`scripts/gate-env.mjs`). KNOWN-LIMITS records the OS-level reach (the keychain and files are still readable by code running as Josh).
- **EZD-316, one push path.** Pushes and gh calls go through `node /Users/josh/Projects/ezdraft/scripts/release/github-ops.mjs <op>`:
  - It pushes only a develop that is on the record (`~/.ezdraft-github-ops/develop`) or descends from it by plain `vault/` files.
  - Merges check develop against the record and write it.
  - After a non-vault commit made outside a merge, run `node scripts/unit-steps.mjs record-develop` (it lists the change), then `record-develop <sha>`, then `push-develop`.
  - The launcher records develop itself after a clean `fix(repair):` repair that leaves the push chain alone.
  - Only the orchestrator's exact absolute path passes guard-bash.
- **EZD-345, trusted git.** Every unsandboxed git call runs through `vault/tools/trusted-git.mjs`: fixed binary, exact env, hooks off, worktree config refused, full refs, and under `.claude/worktrees` only the `.git`-file form counts. Pushes send hash-checked objects. `extensions.worktreeConfig` is unset in the live repo; keep it unset (the helper refuses to run while it is on).
- The unit sandbox is still off for launcher units (`scripts/run.mjs` defines `sandboxSettings` and never uses it). The new denyRead and denyWrite entries take effect when it is switched on. Probe 7 (`vault/spikes/sandbox/NOTES.md`) is still to run then.

## How to build a guarded ticket interactively (session 8's procedure)
1. `vault/handoff/LAUNCHER_FIX.md` lists exactly the guarded paths under `## Paths`. Commit it by path, or the ledger check fails on an untracked file.
2. **Make the worktree yourself:** `git worktree add -b t/EZD-xxx .claude/worktrees/EZD-xxx develop`. Do not run `unit-steps.mjs worktree`. It sets the ticket `in-progress`, and the launcher then starts its own parallel build of it and tables it `blocked` after two runs (EZD-337 hit this). Leave the ticket's STATUS out of `in-progress` and `review` while you build. `unit-steps.mjs merge` sets it `done` whatever it was.
3. Dispatch the test-author (`--dispatch` model). Commit the tests alone and see them fail before you write code. If code already exists, check them in a detached temporary worktree at the test commit.
4. Build the rows. Use the Edit tool for any text with `$`, brackets or braces. The shell guard refuses many inline node scripts and globs, and Write outside the repo is refused.
5. Merge develop into the branch, wait a second, then gate: `EZD_LANE=3 node scripts/gate.mjs .claude/worktrees/EZD-xxx`. Lane 3 is free while the launcher uses lanes 1-2; lane 0 is used by gate-phase.
6. Run the code-reviewer and security-reviewer in parallel. Fix in-place findings and send the same agent a round 2 re-check. Tests are the test-author's; structural repairs go to them.
7. For anything that changes the merge or push path: set STOP and wait for zero units (`pgrep -fl "claude -p"`), because unit vault commits keep moving develop and force re-gates. Then gate, `node scripts/unit-steps.mjs merge EZD-xxx`, notes (`ledger.mjs status`, DONE line, overseer-log line), `git rm` LAUNCHER_FIX.md, commit by path, `push-develop`, `git fetch` to confirm, remove STOP.
8. Don't merge a ticket that touches production-sensitive files while a phase PR is open unless you mean to trigger the security hold; it moves the PR head.

## Traps seen in session 8
- **Filing a ticket while the launcher runs.** `ledger.mjs status`, `ticket`, `answer` and `architecture` are queued in `~/Library/Logs/ezdraft/inbox/` and applied between units, so the ledger check stays red until then.
  - `ledger.mjs architecture` updates only the database. Also write the list into `tickets.json` (from `planArchitecture`), or every ledger-copy test fixture fails. That turned the phase 3 gate and EZD-342's merge red twice.
  - A `status` op for a ticket with no row is rejected; use `ledger.mjs ticket` first.
  - A tooling-marked ticket needs a plan with Build steps at once.
  - A new product `todo` in an earlier phase becomes the blocking phase.
- **Agent turn limits.** Planners and test-authors often stop at their turn limit. Send "continue, write it now" with SendMessage.
- **The stop hook** blocks ending a turn while `--check` fails. Usually that's a running unit's own file (screenshots, a plan in flight), which its unit or a `repair check` commits. Wait for it rather than touching it.
- `ledger.mjs` refuses a `|` in a value.
- `budget.mjs` and `run.mjs` are blocked by name.

## Josh's admin items (only he can do these)
1. Pin GitHub ruleset 24926075's required `gate` check to the GitHub Actions app (today `{"context":"gate"}` with no source).
2. Q-0602: create a separate macOS user for the gate's checks, with no access to Josh's keychain or home folder (EZD-344's KNOWN-LIMITS bullet).
3. Before Monday 2026-11-09 07:00 UTC, decide the budget for the next week (the override ends at the reset).

## Check-in loop
- Arm a Monitor on `~/Library/Logs/ezdraft/launcher.log` filtered to `→ |FAILED|STOP|stopped|SET ASIDE|tabled|TABLE|error|restarting|NOTIFY`. Re-arm it every 30 minutes.
- After each unit: `node vault/tools/next_ticket.mjs --check` and `--next-unit`, and a short look at `vault/handoff/CURRENT.md` and the overseer log.
- A set-aside (`.git/set-aside.json`) or a tabled ticket needs a cause found and fixed, then clearing. Session 8 cleared `gate-phase 3` after fixing its own ledger slip.
- Send Josh a PushNotification only for things he'd want now: a phase merged to main, a stop that needs him.

## Added after hand-over (session 8, 2026-11-06 ~11:30 UTC)
- **The unit sandbox is ON** for every launcher unit, both lanes (023476e9; Josh: "switch sandbox on. i will watch").
  - Probe 7 passed: no GitHub login or keychain from inside the sandbox; github-ops works outside it (`vault/spikes/sandbox/NOTES.md`).
  - Units so far ran cleanly: questions, repair waiting, plan, build. Expect `GITHUB-OPS SANDBOX STOP` when a unit pipes an excluded command; it recovers.
  - Still to watch: the first sandboxed gate-phase and wrap, and the first build that runs the gate and merges.
- **EZD-317 next** (Q-0541: fix before the sandbox is on, done in this order on Josh's word): the excluded commands for gate, unit-steps and ui-run are relative, so `cd` into a worktree runs its editable copy outside the sandbox. Its plan exists; it depends on EZD-316 (done). Build it interactively in fix mode.
- **EZD-351** is blocked: its five-run lane-gate check cannot run inside a unit. Run it as an interactive procedure (five lane gates beside another lane's gate; then fix or close debt D-019 with the evidence), or re-plan it.
- **EZD-354** (the gate's checks run as the `ezdraft` user; Josh created it, uid 502, Standard) is planned (`vault/plans/EZD-354.md`) with QP Q-0609.
  - Josh's three steps are in the plan's "Josh's steps": close his home to ezdraft (chmod +a deny), one sudoers line, and narrowing Docker file sharing after the build creates /Users/ezdraft/gate.
  - Ask Josh for his yes (rule 18) if he hasn't given it, then give him each step as one command.
  - A launcher plan unit started on EZD-354 at 11:28 before its status reached the records; compare its plan with c86f68c8 and keep the better one.
- **Update 12:35 UTC (session 8, last):** Josh said yes to EZD-354 (Q-0611 confirmed-josh, decision row 53fd7c4c); do not ask again. Session 8 gave Josh the exact commands for his steps 1 and 2 (the plan's "Josh's steps": chmod +a deny on /Users/josh; the sudoers line written with sudo tee to /etc/sudoers.d/ezdraft-gate, then visudo -cf, then the id -un check). Ask him whether both checks passed, then build. Q-0609 is answered as a duplicate of Q-0610. Session 8 has ended; session 9 leads.
