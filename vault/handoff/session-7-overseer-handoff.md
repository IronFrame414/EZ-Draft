# Session 7 hand-over · 2026-11-05 · overseer repair unit (EZD-333)

Built the overseer Josh approved (decision row 2026-11-05 "Overseer repair unit and unattended running", process.md, 6d49c273). The launcher is running again: STOP removed 14:11 UTC, fix mode closed (c011f8f5).

## What changed
- **EZD-333 done, cf0cdfcd** (gate PASS, 1936 tests; code-reviewer and security-reviewer PASS after 2 FAIL rounds, all fixed in place).
  - The `repair` unit (`.claude/skills/repair/SKILL.md`) now resolves every block that is not a design or UI question. For a guarded fix it writes `vault/handoff/LAUNCHER_FIX.md` naming only those paths (plus `Repair: <fingerprint>`), makes the change, runs the tests, gets code review (plus security review for secrets, permissions, money, data, `scripts/run.mjs`, `scripts/ledger.mjs`, `.claude/`), commits `fix(repair): …` by path, pushes and closes fix mode.
  - `.claude/hooks/guard-paths.mjs`: only units `repair-check|waiting|ci|probe` get fix mode, and only for listed paths. No other launcher unit may write LAUNCHER_FIX.md.
  - Hard limits, one list in `scripts/launcher-idle.mjs` (`repairForbidden`): the hooks, the settings files, the unit sandbox, the gate and every file it or a hook loads, CI, package.json, every test file, the repair skill and the reviewer definitions.
  - `scripts/run.mjs` checks every file a repair changed (commits, uncommitted, ignored, renames, pushes) and undoes a hard-limit change. When the change may not be the repair's, it writes STOP and sends one notice instead.
  - Josh hears only `JOSH: design:` or `JOSH: ui:`. Failed repairs are logged, not sent.
- **Daily log:** `vault/handoff/overseer-log.md`, one line per repair, written by the launcher.
- **EZD-334 done, b89471a3** (phase 2): fix for the PR 5 CI failure. The ledger test copies held the live phase 2 gate record ("PR open"). EZD-117a B6 counted the bell's second landing request.

## Dry run (task step 5): PASSED, launcher-started unit
- `vault/handoff/REPAIR_PROBE.md` made the launcher start `/repair probe` at 14:11:46. The unit ran with bypassPermissions and EZD_UNIT_ID repair-probe.
- It opened fix mode, edited the guarded `scripts/launcher/fix-mode-probe.txt` (line `probe 2026-11-05T14:11:58Z`, seen in `git diff`) and closed fix mode. Nothing was refused. I reverted the line.
- So the overseer is built, not the fallback. No scheduled check-in session was made. The auto-mode classifier does not apply to launcher units (bypassPermissions); it applies only to interactive sessions.
- The first real repair came straight after: the new log file was untracked, the ledger check failed, and `repair check` committed and pushed it (fc7d85f5) on its own.

## Round 2 (after 14:30 UTC): the PR wait gap, EZD-336 done a837cdaf
- The gap: the launcher waited 3.5 hours on PR 5.
  - Push run 42049298178 hit `timeout-minutes: 30` in the browser install, because the Ubuntu package mirror stalled. Its cancelled `gate` check kept the PR blocked although the pull_request run passed.
  - Auto-merge was also off.
- **PR 5 merged** at 18:49 UTC (bc9570d7) by auto-merge, after a green gate on a57931ba.
- **EZD-336:** next_ticket.mjs reads the PR once (`gh pr view`).
  - A failed, cancelled or timed-out `gate` run is a `repair ci` wait. The skill re-runs a cancelled run once when the cause is outside our code, and commits the fix-ticket rows it writes.
  - Under Josh's rule a57931ba the launcher itself turns auto-merge back on, and merges a green but still open PR. It does this only for this repository's develop → main PR, once per wait, logged in the overseer log. A refused try sends one notice.
  - code-reviewer and security-reviewer PASS after fixes.
- **EZD-337 (defect, todo, planned):** an unattended phase PR merge should first get a security pass of production-sensitive files changed after the phase audit. Today auto-merge takes develop's tip.
- Also fixed: the `repair ci` unit had left EZD-335's phase-file row uncommitted, which broke every clean copy's ledger check. It was committed in 3dac6d8e, and the skill now commits those rows.

## For Josh (not design; only an admin can do these)
1. **Settings:** `git apply vault/handoff/EZD-336-merge-allow.patch` moves `Bash(gh pr merge*)` from `ask` to `allow`, matching your 2026-11-05 rule. guard-bash still refuses a merge without `--auto`. The session classifier refused this edit here.
2. **CI timeout:** `git apply vault/handoff/EZD-336-ci-timeout.patch` sets the job limit to 45 minutes; runs take 17-19. guard-paths keeps `.github/` from agents.
   - Security-reviewer note: applying it while a phase PR is open sends ci.yml to main without the phase-gate pass (EZD-337 covers this).
3. **GitHub ruleset 24926075:** pin the required `gate` check to the GitHub Actions app. The security reviewer says, from documentation rather than a live check, that without a source any commit status named `gate` could satisfy it. Only an admin can change it.
4. Watchdog alerts are unchanged: an idle launcher in state repair-failed still alerts after its threshold. That is a "build is stuck" alarm, not a question.

## Open
- EZD-335 (the disclaimer e2e fix the overseer filed) was built (1e9dbed4) and went to main with PR 5.
- EZD-337 is next for the build-system queue. It touches scripts/gate.mjs, a repair hard limit, so it is built interactively in fix mode.
- Rule 17 notes are in `vault/tooling-notes.md` (EZD-333, EZD-334 lines).
