# Session 11 brief · final overwatch of the unattended build (from session 10, 2026-11-07)

Josh's words: the build runs unattended and must keep moving; an oversight agent handles blocks; only design and UI items need him; this session is the final overwatch; use every lane. Process: `vault/PROCESS.md`, `vault/handoff/session-9-brief.md`. Gap list: `vault/questions/phase-05-spec-gaps-for-josh.md`.

## Right now
- Josh 07:30 EST: five-hour usage at 96%. "finish current task in the build and then restart at 9:10". `vault/handoff/WINDOW_PAUSE.md` says Resume at 2026-11-07T14:10:00Z (9:10 EST); the launcher starts nothing new and resumes on its own. Do not start paid work (agents, audits) before 9:10.
- The running unit (`/questions 3`) may finish. `vault/plans/EZD-299.md`, `EZD-299a.md`, `EZD-299b.md` were modified by it and the ledger flags them. After it ends: commit them with `tickets.json`, run `node vault/tools/next_ticket.mjs --set-architecture EZD-299b` and `node scripts/ledger.mjs architecture` for each, then `--check`.
- Temporary override (Josh): usage limits off in `vault/budget.json`, 30% context rule off. Old values are in its history; he restores them when he says.
- Lanes: 3 units, 2 builds. Lane 3 stays for hand builds.

## Things that bite
- Launcher units leave new plans and `tickets.json` entries uncommitted on develop, and worktree gates then fail on ledger-reading suites. Commit them by path after each plan unit.
- Agents' sandbox has no network: `pnpm --filter @ezdraft/app icons:fetch <name>` then `icons:build` in the ticket worktree, commit, set the ticket ready.
- `vault/tickets/STATUS.md` is a view: never edit it by hand except under STOP followed by `node scripts/records.mjs import --replace` (back up first). Record with `ledger.mjs status`, `question`, `answer`; these queue and the launcher applies them at a unit boundary, so "differs from the text recorded" warnings last until then.
- A split parent's row goes via that import under STOP (EZD-221 is the worked example, 6d0cc8ce).
- `ledger-queue.mjs submit` fails in a queue worktree (no STATUS view). Copy the files to main and commit by path.
- general-purpose agents cannot Write or Edit; subagents have no artifact tools. Long lines with braces or brackets in a Bash heredoc are refused: Write the text to `vault/handoff/x.txt`, then move it to the scratchpad.
- Gate as ezdraft: use the branch's own `scripts/gate.mjs` while testing a change to it; start it at least a second after the last commit.
- Fable is refused or works at random on this account. `fable_fallback_pct` 0 and a tiny `fable_ceiling_usd_est` route it to Opus only in proxy meter mode.
- A Mac restart stops everything: Josh must log in, then log ezdraft in (runbook Gate user step 4). The gate refuses with F10 until then.

## Open work, in order
1. Phase 4: EZD-221b ready; EZD-294, EZD-299, EZD-299a, EZD-299b in the pipeline; then `gate-phase 4`. It was set aside once because records were uncommitted; `.git/set-aside.json` is clear.
2. Phase 5 spec check (Josh said yes to signing off unless a design or UI question needs him). Recorded: Q-0630 rows, `sections/09k-openings-and-moves-examples.md`, `sections/00f-glossary-phase-05.md`, 87 ACs, wiring, build gate (87bbc6ad). Round 2 of the audit was stopped for the usage limit: re-run phase-auditor on Opus. Check in particular that Q-0630 "Space flips swing only; Mirror swaps hand" agrees with board S03d (click the arc flips swing, click the hinge dot flips hand), and that ACs cover the S03d wording and the S03d E tablet rules. EZD-217's AC-12 and AC-13 cite the on-screen group: add ACs for Select more, Next field, Cancel, one-finger box, two-finger pan, grey-out rules. Clean audit: add the SIGNOFF row, saying plainly it was done on Josh's 2026-11-07 yes, not by him ("#6 yes", "Yes, sign off"). `vault/spec/SIGNOFF.md` is Josh-only by guard; he authorised this one row per phase.
3. Rendered images for S03c, S01g, S03d and the photo board are in `vault/mockups/` but only S03b and S01c state were looked at. Look at them. Known: the S03b PNG shows the word "close" for an icon. Boards still say "proposed"; the wording lists are what count: `S03bConflictList-wording.md`, `S03cAIAssistant-wording.md`, `S03dSelectedObjects-wording.md`. The Q-0630 row for S03d E is in `decisions/05-screens.md`.
4. Phase 56 is the AI assistant phase, built right after phase 5 (Josh: "just name the ai phase 56 and build after 5"; no renumbering). Before phase 5's gate:
   - Tools ticket, hand-built in fix mode: one exported `phaseRank(p)` (56 ranks 5.5) used at `vault/tools/next_ticket.mjs` lines about 861, 868-869, 905, 913-915, 930, 952, 956-957, 1017, 1020, 1056, 1083, 1091, 1160, 1278, and `compareReleaseTags` in `scripts/release/tags.mjs:19`, with tests (`tags.test.mjs`). Josh's 56 instruction is the yes for the freeze rule; security-reviewer too (release code). Without it the launcher deadlocks at phase 6, and a `phase-56` tag makes later releases `not_newer`.
   - Tickets EZD-5601 up in new `vault/tickets/phases/phase-56.md`: key storage and My profile (S01g); call path, stub and cost; panel and states (S03c, including photo); change schema and preview; Accept, Adjust, Reject and events. Depend on EZD-108, EZD-021, EZD-204, EZD-211, EZD-213, EZD-217. Add `spec_phase`, stage-0 ACs, PHASES row, and its own SIGNOFF row (Josh "#6 yes").
   - Close readiness gaps A1 to A6 in the gap list. A3 needs a web retriever for prices. A7 is settled: photos are in, boards approved (types, 20 MB, one per prompt, shrink, HEIC to JPG, strip GPS).
   - Add a decision that phase 6 waits for phase 56 (done in Q-0630); nothing in code enforces it except `phaseRank`.
5. Phase 5 tickets: `depends_on` for EZD-211 needs EZD-294 in `tickets.json` as well as the phase file; verify.
6. Still blocked, by Josh's hand or a third party: EZD-276, 264, 191 and the frozen build-system list; EZD-141 waits on Supabase; EZD-327 is a duplicate; EZD-003 waits on launch. 16 of the 23 blocked rows were not read; read them.
7. Notes: usage meter unreadable on this account; `mediaanalysisd` under ezdraft runs over 200% CPU; EZD-356 may partly fix a failure session 10's overlapping gates caused.

## Session 11 state, 2026-11-07 16:10 UTC
- Weekly limit hit on launcher units at 15:21 UTC ("resets Nov 9 at 1am"). WINDOW_PAUSE until 2026-11-09 06:05 UTC. The launcher sleeps through a pause without rereading the file: to resume early, have Josh switch accounts, then `launchctl kickstart -k gui/$(id -u)/com.ezdraft.launcher` after removing the file. The launcher reads this limit as an ordinary failure and restarts every 3 s, so if it recurs write the pause at once.
- Queued records apply only between passes: touch STOP, kickstart, and they apply; a pause never applies them.
- Merged: EZD-360 (3ef2fd41), EZD-361 (47e113df). Develop pushed. EZD-299a is at review; it resumes at the pause's end.
- Waiting on Josh (design): Q-0634 door placing on tablet, Q-0635 Edit layers, Q-0636 door bar order, Q-0639 Adjust on a preview. Recommendations are in the questions. On his answer: record, then for phase 5 add the SIGNOFF row (his 2026-11-07 yes, "#6 yes"); for phase 56 run a round 2 phase-auditor first, then its SIGNOFF row. Record S01g/S03c wording in ACs as settled (Q-0637, Q-0638).
- Open list items left: rest of board images (S03c, S03dStates, S03dWall, S03dWindow), EZD-327 dropped as duplicate, EZD-355 split under STOP, EZD-328 now its sandbox is back.
- Do not hand-edit vault/DONE.md (view; use `ledger.mjs append`). Do not leave reports in research/pending (use research.mjs adopt).
- 2026-11-07 19:20 UTC: Josh said yes to all four; Q-0634 to Q-0642 recorded; SIGNOFF rows 5 and 56 added (3cc2fa32) and pushed. Launcher asleep on WINDOW_PAUSE until 2026-11-09 06:05 UTC. A background wait on launcher.log wakes this session at the first unit. Then re-arm /loop and the monitor; first gate after resume should now pass EZD-299a. Remaining: rest of the board images, EZD-327 drop, EZD-355 split, EZD-328.
