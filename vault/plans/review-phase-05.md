# Plan review · phase 5

Written by the launcher from the code-reviewer's final report (2026-11-09T11:59:54.649Z).

VERDICT: FAIL. The plans that need a planner pass are EZD-211 and EZD-204/211/217 (finding 2), EZD-217 (finding 4), and the part plans of EZD-208, EZD-212 and EZD-213 (finding 5).

All six phase 5 plans have their ACs, a `security-review` line and a complexity rating, and every plan with a visual checklist depends on EZD-016a. Every AC of EZD-204, 208, 211 and 217 appears in a test row. I re-derived the main expected values by hand and they match: door leaf and arc angles, offsets, rough openings, chip paths, paste offsets, view centre, greying sequence, and the 09k areas in the split proposals.

1. **EZD-211, step 6, `vault/plans/EZD-211.md:46`** (defect, behavior). Part a adds the `door_front` and `window` icons but has no edit row for `app/src/components/shell/HeaderButton.icon.test.tsx`. That test pins the whole icon list at lines 125 and 127, so the gate goes red. Fix: add the edit row, as EZD-208 E8 and EZD-217 E1 do (lesson L-021).
2. **Conflict, `EZD-211.md:54` and `EZD-217.md:21`** (in-place, minor). Both plans export `openingsOn` and `openingChange` from `model-changes.ts`, and neither depends on the other. Fix: have EZD-204b export the two helpers (both plans already depend on it) and drop the step from 211b and 217, or make 217 depend on 211b.
3. **EZD-211 R6, `EZD-211.md:151`** (question). The expected value reads "per the QP-1 answer", which is no source. Q-0643 is still open; once it is settled, the planner writes the value and its source.
4. **EZD-217, section 9 at `EZD-217.md:142`** (in-place, minor). The plan has 25 files (10 of them written by the icon commands) and 24 tests plus 1 edit, with no split proposal. EZD-208 counted icon files toward its total. Fix: add a split proposal, or one line citing why generated files don't count.
5. **EZD-208, EZD-212, EZD-213 split proposals** (in-place, behavior). Some tests have no expected value yet:
   - EZD-208: P2 says only "below 400", P4 and E1–E4 are deferred, and B1–B14 have none. AC-EZD-208-3 is covered only by B rows.
   - EZD-212 and EZD-213: no test rows at all; TRACE still shows "(no plan yet)".
   - Fix: once the splits are applied, the part plans (208a/b, 212a–c, 213a–c) come back through plan review before any of them is built.
6. **EZD-212c, `EZD-212.md:59`, against EZD-211's Overlay rules** (in-place, minor). EZD-212c gives chip leaders 12 px end ticks (board S03dWallSelected, drawn at 0.88 scale). EZD-211 uses 16 px ticks 36 px off the wall (board S03dStates tile 1) and says EZD-212 reuses its chips. Fix: the 212c part plan uses EZD-211's measured look, or cites a different board measurement for wall chips.
7. **Dependency facts are stale** (defect, behavior; a ledger step, not a plan change):
   - EZD-294 is `blocked` in `vault/tickets/STATUS.md:703`. Its gate is red only because the ledger test fixtures lack architecture lists for EZD-204/208/211/212/213/217. EZD-204 calls it `ready` (`EZD-204.md:163`); EZD-211, 212b and 213 call it "in progress".
   - All six plans call EZD-294 names that are not on develop: `NO_NUMBERS`, `numberNewObjects`, `withObjectNumber`, `numberHighs`.
   - Several unbuilt dependencies are missing from the ticket rows: 204→294, 211b→208, 213a→212a, 213c→212b. Without 211b→208, EZD-211 could be built before EZD-208.
   - Fix: run the ledger fixture fix and finish EZD-294, then add those dependencies before any phase 5 build.
8. **Open questions** (question):
   - Q-0645 (bulk fields for several openings, EZD-213) is a design question and goes to Josh.
   - Q-0643, Q-0644, Q-0646 and Q-0647 can be settled by the orchestrator under the standing rule.
   - EZD-217's paste-anchor values and K7 are written to option (a) of Q-0646 and Q-0647, so they need re-checking if a different option is chosen.
   - If Q-0644 is settled as (b), EZD-217 C4(c) already covers EZD-213's "a bearing wall still deletes".
9. **TRACE** (note). The phase 5 rows in `vault/tickets/TRACE.md` repeat each plan's whole test list against every AC, so they show no per-AC mapping. I checked coverage from the plans' own AC columns instead.
10. **EZD-211b** (note). It has 21 files plus EZD-208 test edits that are not named yet (E3). That list can only be written after EZD-208 merges, so the 211b part plan must name those files before its build.

Files: `vault/plans/EZD-204.md`, `EZD-208.md`, `EZD-211.md`, `EZD-212.md`, `EZD-213.md`, `EZD-217.md`, `vault/tickets/TRACE.md`, `vault/tickets/STATUS.md`, `app/src/components/shell/HeaderButton.icon.test.tsx`
