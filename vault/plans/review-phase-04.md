# Plan review · phase 4

Written by the launcher from the code-reviewer's final report (2026-11-05T03:38:07.515Z).

VERDICT: FAIL

1. **EZD-236** (§1 "Object types", "Wall attributes", "Status"; §4 G2, G3). *defect, behavior.* The plan is written against schema version 1, but the Slice 4 order (PHASES.md; P205 ledger note) builds it after EZD-203 and EZD-205a. EZD-203 requires wall `layers` and moves to version 2 (P203 §3). EZD-205a adds room `status` and `closureOverride` and moves to version 3. The plan says rooms have no status, which contradicts Q-0570 (`decisions/03-data-model.md:20`). G3 fixes "every schema_version 1", and G2 would fail at build. Its room outlines sit on wall centerlines, while P205a measures rooms to the inside finished face. Fix: re-plan against P203 §3 and the P205a plan, use `CURRENT_SCHEMA_VERSION`, and build walls with `createWallData`. Separately, P205's note that "205a updates any room literal it finds" cannot work, because 236 is built after 205a.
2. **EZD-201 E5 vs EZD-203 §3 (const row).** *defect, minor.* Both plans define `MAX_WALL_LENGTH_IN` and both re-export it with `export *` from `packages/geometry/src/index.ts`. TypeScript rejects the duplicate name, so typecheck fails, and EZD-221 U4 imports it. Fix: EZD-203 imports the constant from `../length` and does not export its own. Its §9 line "Not needed: EZD-201" becomes a dependency.
3. **EZD-221** (whole plan). *in-place, behavior.* About 39 files: 26 source files (including 3 icons and generated files), 8 new test files and 5 edits to earlier tests. That is over the roughly 20-file limit (PROCESS.md §6), and there is no split proposal. Suggested cut:
   - (a) server path: M1, `templates.ts`, `template-objects.ts`, `projects.ts`, U1–U4, U7–U10, D1–D3, R1, E1, E2;
   - (b) wizard step 2, the picker and the empty hint: the remaining rows.

   Also, E5 assumes P120c B2's canvas text is still "", but P207a and P210b both edit B2 first. Write E5 against B2 as those two leave it.
4. **EZD-207 split proposal**, part a/b Scope. *in-place, behavior.* The seams that dependents need are missing:
   - P209 §9: `getCursor` from the input controller's ref;
   - P206 seam: `pixelsPerInch` from the camera;
   - P210 ledger notes: model-to-screen transforms readable inside a pointer handler, a camera-change callback outside React, a pointer hand-off to the active tool, and the hover-mode setter plus the hovered wall id.

   Only the hover mode is carried over today. Put these into part a's and part b's Scope and Done-when so their §3 provides them.
5. **EZD-207 part a Done-when.** *in-place, minor.* It claims AC-EZD-207-6 and -7 word for word, but part a builds no rail and no tools. AC-7's "rail with Wall and Room rectangle" and AC-6's "tools are disabled" can only pass with EZD-210b. Assign those clauses to EZD-210b in TRACE.md.
6. **EZD-205 split, part a, "earlier-test edits".** *in-place, minor.* For the version 3 bump it leaves out pins that P203 itself edits: E2 (`schema.test.ts` G5, which refuses version 3) and E3 (`model-schema.test.ts` A3 = 3). Name both (L-021, L-049).
7. **Ledger** (`tickets.json` `depends_on`). *in-place, minor.* EZD-236 is missing EZD-203, EZD-205a and EZD-117b (P203 §9; P236 §9). EZD-203 is missing EZD-201 (after fix 2) and EZD-238 (P203 §9).
8. *note:* `STATUS.md:180-181` shows EZD-206 in phase 5 and EZD-207 without EZD-206; `tickets.json` has phase 4 and EZD-206. Every AC of phase 4 has a plan row (split ACs included). EZD-201, 206 and 209 have no findings. Q-0582–0585, Q-0587 and Q-0592 are not design or UI questions, so the orchestrator settles them (rule 3). I ran `next_ticket.mjs --report`; it rewrote `vault/PROGRESS.md` and `vault/tickets/TRACE.md` with no change (`git diff` empty).

Re-dispatch to the planner: EZD-236, EZD-203, EZD-221, EZD-207 (split proposal), EZD-205 (split proposal).

Files: `vault/plans/EZD-201.md`, `EZD-203.md`, `EZD-205.md`, `EZD-206.md`, `EZD-207.md`, `EZD-209.md`, `EZD-210.md`, `EZD-221.md`, `EZD-236.md`; `vault/tickets/TRACE.md`, `tickets.json`.
