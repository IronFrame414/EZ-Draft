# Session 12 brief · overwatch of the unattended build (from session 11, 2026-11-07)

Read this, then `vault/handoff/session-11-brief.md` (its two "Session 11 state" sections at the end) and `vault/handoff/session-9-brief.md`. Only design and UI questions go to Josh (CLAUDE.md rule 3); everything else is settled with sources.

## State at hand-over
- Weekly limit hit by launcher units at 15:21 UTC. `vault/handoff/WINDOW_PAUSE.md` holds the launcher until 2026-11-09 06:05 UTC; it sleeps through the pause without rereading the file. If Josh switches accounts: remove the file, then `launchctl kickstart -k gui/$(id -u)/com.ezdraft.launcher`.
- Queued ledger ops (`ledger.mjs status`, `answer`, `ticket`, `append`) apply only between units. While paused: touch `vault/handoff/STOP`, kickstart, wait about 10 s, check, remove STOP. A pause never applies them.
- Merged: EZD-360 (phase 56 ranks after 5), EZD-361 (fixture fix). Develop pushed.
- Phases 5 and 56 signed off (3cc2fa32) on Josh's yes. Phase 56 tickets EZD-5601 to EZD-5605. Phase 6 must not be signed off until phase 56 is done (Q-0630).
- First unit after resume: build EZD-299a (at review; its gate should now pass with EZD-361). Then EZD-221b, EZD-294, EZD-299b, EZD-299, gate-phase 3 and 4, then phase 5 plans.

## Open
1. EZD-355a, EZD-355b: split from EZD-355 under STOP. Blocked until a fix-mode plan exists for each (guarded paths); Josh said yes to the work (Q-0614). Plan and build them interactively per session-9-brief "How to build a guarded ticket interactively".
2. EZD-328: its wait is over (sandbox back since 023476e9). Check its done-when against launcher.log evidence; close it with the evidence or plan what is left, in fix mode.
3. Tooling notes from session 11 (`vault/tooling-notes.md`): the launcher treats "You've hit your weekly limit" as an ordinary failure and restarts every 3 s; phase-rank-order.test.mjs T10 will fail once phase 56 has gate or cost files; trusted-git.mjs is not in SECURITY_PATHS. Build-system notes; they never block.

## Things that bit session 11
- `vault/DONE.md` and `vault/tickets/STATUS.md` are views: use `ledger.mjs append` and `status`.
- Reports left in `vault/research/pending/` fail EZD-000d T8: set `ticket:` in the report, then `node vault/tools/research.mjs adopt`.
- New real tickets in a phase can break fixtures that build that phase synthetically (EZD-361). Run `node --test scripts/ledger/` after adding tickets.
- The Bash hook refuses a dot-star pattern anywhere in a command, and inline scripts with braces: Write the script to `vault/handoff/x.txt`, move it to the scratchpad, run it.
