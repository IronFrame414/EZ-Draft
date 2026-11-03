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
