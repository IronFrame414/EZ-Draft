# Lessons index

One file per role. Format and rules: PROCESS.md section 13. Only the orchestrator writes here, at the end of a unit. `next_ticket.mjs --lessons <role> <areas>` prints the entries a dispatch carries.

`vault/lessons/findings.jsonl` holds every review finding (`node vault/tools/findings.mjs categories` lists the categories). `node vault/tools/findings.mjs repeats` lists categories seen on two or more tickets that no planner lesson covers.

| File | Role | Areas with entries |
| --- | --- | --- |
| orchestrator.md | dispatch, model choice, ledgers, merges | tooling, scripts, process (L-003, ratified); tooling, process (L-005, ratified) |
| planner.md | plans, contracts, citations, ticket size | tooling, scripts, process (L-002, L-004, ratified); ci, tooling, security (L-006, ratified); data-model, migrations, security (L-009, ratified); tooling, scripts (L-012, ratified); ui, tokens (L-013, ratified); migrations, release, security (L-014, ratified); migrations, auth, security (L-016, ratified); ui, testing (L-021, ratified); migrations, security (L-023, candidate); migrations, testing (L-024, candidate); tooling, process (L-025, L-026, L-027, L-028, candidate); tooling, security (L-029, candidate); tooling, tests (L-030, candidate); release, testing, scripts (L-031, candidate); tooling, scripts, testing (L-032, L-033, L-034, L-036, candidate); tooling, scripts, ledger (L-035, candidate); tooling, scripts, security (L-037, candidate) |
| test-author.md | tests, fixtures, expected values | tooling, scripts, process (L-003, ratified); data-model, migrations, tooling (L-008, ratified); tooling, scripts (L-011, ratified); tooling, scripts, release (L-015, ratified); testing, tooling, ui (L-017, ratified); testing, security (L-018, L-019, ratified); testing, ui (L-020, ratified) |
| builder.md | implementation, scope discipline, structural repair | tooling, dependencies (L-010, ratified); tooling, scripts (L-012, ratified); tooling, scripts, release (L-015, ratified); tooling, scripts (L-022, candidate) |
| reviewer.md | code-reviewer and security-reviewer | auth, security (L-001, ratified); tooling, dependencies (L-007, ratified) |
| ui.md | ui-verifier: screenshots and mockups | (none yet) |
| spec.md | Stage 0 gaps found late | (none yet) |
