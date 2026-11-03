# Resume · 2026-11-03 morning

For the session that takes over from the 2026-11-03 night watch. It replaces the "Do first" list of `vault/handoff/RESUME-2026-11-03.md`; that file's "Open items to know" still hold. Josh said "Morning" for the watched sandbox switch-on.

## Night so far (to 03:45 UTC)

- **EZD-291** built and merged (d75b2b30, 02:35 to 03:26, unsandboxed, $1.38).
- **questions 1** ran (03:26 to 03:28): Q-0486 answered by agent; Q-0485 (EZD-293) waits on Josh (`vault/questions/phase-01-for-josh.md`, left uncommitted in the main checkout by that unit).
- **EZD-292** built and merged (03:28 to 03:43; STATUS done). **gate-phase 1** started 03:43:47, unsandboxed.
- **Phase 3 records clash, fixed:** the phase 3 spec-check inbox file was rejected at 03:26 (Q-0486 taken by the EZD-291 unit). That session renumbered to Q-0500 to Q-0511 and EZD-299 (0c781eeb, 80910e68, 39703d3d), applied, debt D-025 (50c74688). LEDGER OK 579. EZD-299's row in phase-01.md is correct (phase_file names the spec phase after the re-cut, as for EZD-120a).
- **Watch ended 03:45 UTC** (night session at its context limit): gate-phase 1 and everything after it ran unwatched; treat any stop since then as unattended. Commits 7bece9a8 and this file are local until a unit pushes develop.
- **D-006 (CI port 54322):** likely cause found in the gate log: the first `supabase start` on a fresh runner failed, and 54322 is inside Linux's outgoing port range. Patch `vault/handoff/d006-ci.patch` reserves 54320-54329 as the first CI step; the ci.yml tests pass with it (7bece9a8). It is a CI change, so it waits for Josh's yes. Until then the phase PR's CI can still fail on it once in a while (a re-run passed last time).

## Do first (in order)

1. Read `~/Library/Logs/ezdraft/launcher.log` from 03:43 UTC and STATUS: did gate-phase 1 pass, open the PR, did CI pass and auto-merge, did wrap 1 and phase 2 tickets run; any stop. Report to Josh in plain words.
2. Watched sandbox switch-on, as in `RESUME-2026-11-03.md` step 2 (Josh runs `git apply vault/handoff/sandbox-on.patch`; you commit; watch each listed unit type).
3. Josh's decisions, one batched list with a recommendation each: the D-006 patch (recommended: yes, he runs `git apply vault/handoff/d006-ci.patch`), D-021, Q-0485, Q-0471, and any open phase 3 question (spec-check 3 committed a round 3 question in ea497af5).
4. Rule-settled, not for Josh: add the defect tickets from Q-0477, Q-0478 and Q-0479 + Q-0486 (rule 17; agents may add fix tickets, Josh 2026-11-02). The only route that works while the launcher runs is the records inbox plus a commit of tickets.json, the phase file and acceptance-criteria.md right after it shows `.applied` (D-024, D-025). Take IDs after the highest in tickets.json and QUESTIONS* at write time. The questions unit's reverted draft (phase 1 row and 2 ACs for the Q-0479/Q-0486 ticket) is the template. Do it all in one sitting or not at all.
5. 2-3 tickets at a time, as in `RESUME-2026-11-03.md` step 4.

## Update 13:58 UTC (night session, status check)

- gate-phase 1 ended ok 04:07 and added fix tickets EZD-295 to 298 and 300. Built since: EZD-297, 283, 288 (done). EZD-108 still blocked (ui-run).
- **Launcher idle since 06:48 UTC**: `none: waiting on Josh (guarded paths for EZD-300: vault/handoff/ezd-300-ci-persist.patch)` (`vault/handoff/REPAIR.md`). EZD-295, 296 and 298 wait on Josh's questions Q-0512 to Q-0516 (`vault/questions/phase-01-for-josh.md`).
- `ezd-300-ci-persist.patch` and `d006-ci.patch` both edit the lines after the ci.yml checkout step and do not apply one after the other. `vault/handoff/ci-ezd300-d006.patch` holds both (checked with `git apply --check` on 96483261's ci.yml; not run against the EZD-300 tests). Before Josh applies it, confirm with the EZD-300 plan's fix-mode route (PROCESS.md rule 19) that applying the combined patch releases EZD-300.
- First item for the next session: get EZD-300 released (fix mode, Josh's yes), then the Q-0512 to Q-0516 answers, then the sandbox switch-on.

## Update 17:57 UTC (Josh away, unattended)

- **Josh (chat, 2026-11-03 ~17:45 UTC):** "keep build moving forward without me ... if a block is reached, set it aside and keep forward progress at all costs." Bypass permissions is on.
- Done today: hold-rule fix 932091a2 (orchestrator plan steps no longer hold a ticket); CI patch eb08213d (EZD-300 + D-006); EZD-300 648b6e15; EZD-295 7ea0aa17. Josh answered Q-0485, Q-0512 to Q-0514, Q-0516 (87244742) and Q-0517 (3524db19; EZD-301 builds the per-kind type check); phase 3 round 3 "accept all" was sent to spec-check 3.
- Josh "Yes, do that" on build-system tickets: the 9 dropped for "one gate at a time" (EZD-248, 249, 251, 252, 256, 262, 263, 273, 275) are ready (their Depends on sets the order); the 14 frozen ones (EZD-154, 185, 191, 261, 264, 265, 268 to 272, 274, 279, 280) carry a note: set ready once the sandbox is back on, guards and dead-lock fixes before lanes (EZD-172, 174).
- D-021: Josh chose close the class (decision row process.md 2026-11-03). Fix ticket **EZD-316** (priority, phase 1, 75b8441b) is being planned; it changes launcher scripts, so its build needs fix mode (an interactive session). The sandbox stays off until it lands.
- Phase 1 path: EZD-296, 298 and the ready build-system tickets, then gate-phase 1 rerun, PR auto-merge on green CI, wrap 1, phase 2. Build-system tickets whose plans touch guarded paths are held for fix mode while the rest builds.
- D-028 (ci.test.mjs capitalised Jobs:/Steps:) went into spec-check 3's commit 31ce61ce by accident; it is on develop unchanged.

## Update 20:31 UTC

- Merged since 17:57: EZD-296. Josh applied `EZD-108-ui-spec-guard.patch` (88fdf256); EZD-108 and EZD-110b set ready. Q-0541 answered "A, and fix 5.12" (44230531).
- **EZD-316** blocked again: Q-0543 (grant a 4th round; recommended yes), asked of Josh in chat, not answered yet. The sandbox stays off until EZD-316 and EZD-317 are both merged.
- **EZD-317** (probe 5.12: excluded commands run only the main checkout's scripts; e037e146) is blocked on EZD-316 by its plan. To fix: tickets.json `depends_on` lacks EZD-316 (edit it at a unit boundary or during a brief STOP, with Josh's yes for the STOP).
- e037e146 also gave EZD-299 `"architecture": []` (the EZD-244 check failed develop after the phase 3 sign-off 17bd3326). EZD-120a, 120b, 133, 202 and 238 have no architecture key either; spec-check 3 was told.
- Adding a ticket while the launcher runs: brief STOP (Josh's yes), write tickets.json, the phase file and ACs, `node scripts/ledger.mjs ticket ...`, wait for the STATUS row, run `--check`, commit, remove STOP; a 10-minute safety net removes STOP. Do not set `track: tooling` before the plan exists (the check refuses it).

## Update 21:05 UTC: develop is red; FIRST ITEM for the next session (rule 17 defect, front of queue)

- `scripts/ledger/tooling-track.test.mjs` EZD-253 U7 and U20 (and EZD-281 T7 in `scripts/ledger/live-drift.test.mjs`) fail on clean develop 218b61c9. U7 gets `plan EZD-120a` where it expects `build EZD-9981`. Cause (read, not yet proven by a fix): the phase 3 sign-off (17bd3326, `vault/spec/SIGNOFF.md` row 3) makes phase 3's todo tickets plannable. `scripts/launcher/test-utils/ledger-copy.mjs` (lines 37-52) is meant to block every unfinished ticket of a later signed-off phase by editing the copy's STATUS.md, but EZD-120a still comes out as plannable. Check whether the tool reads the copy's records database rather than STATUS.md (STATUS.md is a view since 2.12), so the fixture's edit has no effect. Fix the fixture so it holds for any signed-off phase (close the class; do not narrow the tests), in fix mode, then re-run the three tests and the full gate.
- Effect until fixed: every ticket's merge gate is red. EZD-108 passed all reviews and is blocked at step 10 (MERGE GATE); EZD-298 is ready to resume at step 7 and will hit the same red gate. Q-0544 (phase 2 file) went to Josh as a question, but it is rule-settled (rule 17): fix it, then answer Q-0544 as agent-settled.
- 218b61c9 fixed the EZD-244 architecture lists (EZD-120a, 120b, 133, 202, 238 get `[]`), which exposed this failure. Its CI run will be red for the same reason.
