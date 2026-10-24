# Spec readiness checklist

PROCESS.md section 5. A phase's spec files are ready when every item below is covered for everything the phase builds. The phase-auditor audits against this list in the `spec-check` unit and returns a gap list; the orchestrator turns gaps into `vault/questions/phase-NN-spec-gaps-for-josh.md`.

1. **Goal and non-goals** for the phase (in `vault/tickets/PHASES.md`), and the product-wide `vault/spec/non-goals.md`.
2. **Every screen:** who sees it, purpose, each field shown and where its data comes from, each action and its result, every state (empty, loading, error, filled, no permission), where it links to, its mockup, and the wording on the mockup.
3. **Every workflow:** the steps, who does each, and what happens when each step fails.
4. **Every rule or calculation:** the statement, its inputs, the formula or table, and at least three worked examples with real numbers, including edge cases (zero, maximum, rounding).
5. **Data:** each thing the system stores, its fields, which are required, how things relate, who can create, edit and delete them, and what is kept after deletion.
6. **Roles and permissions:** a table of role × action × which data, including who can see money (See company costs, See sell prices).
7. **Outside services:** which, what we send and receive, what happens when they fail, and a sample response to build stubs from.
8. **Acceptance criteria:** each feature's checks as short, testable sentences, each with an ID (see `acceptance-criteria.md`).
9. **Glossary:** `vault/spec/glossary.md` covers every term the phase's plans will use.
10. **Open questions:** none, or each one marked decided or deferred to a named phase.

## EZ Draft notes

- Item 4: the spec's Calculations and rules section has one worked load-calc example (35,868 VA, 149.5 A) and one voltage-drop example (3.1%). Phase 6's Stage 0 must add at least two more of each, including a zero and a maximum case, before planning. The 1,248 code rules are data, not calculations; each Automatic rule's "check" text is its statement and its test fixtures are written per rule (EZD-611b and following).
- Item 8: EZ Draft's tickets carry a "Done when" test instead of AC IDs. Until Phase 1's Stage 0, ACs are generated from Done-when (see PROCESS-V2-MIGRATION.md, step 4). Stage 0 for each later phase writes real ACs for that phase.
- Item 2: every screen has a Studio board in `vault/mockups/` (36 boards; the 14 added on Oct 11, 2026 covered the screens that had none, decisions file `05-screens.md`). A screen added later without a board is a gap under this item unless Josh waives the mockup in the gap list; tickets README rule 6 (build from Layout and Controls text) is the waiver when he does.
- Item 8 for Phase 0: the generated ACs are in `acceptance-criteria.md`; `tickets.json` carries each ticket's `acs`.
