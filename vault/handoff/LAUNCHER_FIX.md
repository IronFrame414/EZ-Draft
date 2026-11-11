# Launcher fix mode (session 17): EZD-382 to EZD-385, the planning method

EZD-377 and EZD-378 (session 15) are merged. Session 17 keeps fix mode open for the planning-method tickets (Josh 2026-11-10 Q-0693; 2026-11-11: "this is the most important thing to fix"; PLANNING-REDESIGN.md Part 1).
EZD-382 (2026-11-11): plan template v2, plan_lint v2 rules and the planner limits.

## Paths
- vault/tools/plan_lint.mjs
- vault/tools/next_ticket.mjs
- vault/tools/outline.mjs
- .claude/agents/planner.md
- .claude/agents/plan-checker.md
- .claude/skills/plan-ticket/SKILL.md
- .claude/skills/questions/SKILL.md
- vault/PROCESS.md
- vault/plans/TEMPLATE.md
- scripts/run.mjs
- scripts/process/plan-lint.test.mjs
- scripts/process/planner-limits.test.mjs
- scripts/process/fixtures/plan-lint-v1-baseline.json

EZD-386 (2026-11-11): look-ahead to every signed-off phase (Josh 2026-11-11). Paths above plus:
- scripts/ledger/phase-overlap.test.mjs

EZD-383 (2026-11-11): contract check, connections check and the shared-list register. Paths:
- vault/tools/contract_check.mjs
- vault/tools/connections_check.mjs
- vault/tools/plan_ready.mjs
- scripts/ledger.mjs
- vault/shared-lists.json
- .claude/skills/questions/SKILL.md
- scripts/process/fixtures/plan-checks.mjs
- scripts/process/contract-check.test.mjs
- scripts/process/connections-check.test.mjs
- scripts/process/ledger-lock.test.mjs

EZD-384 (2026-11-11): the brief-and-size step (P1). Paths above plus:
- vault/tools/plan_ready.mjs (already listed)
- .claude/skills/review-plans/SKILL.md
- scripts/process/plan-brief.test.mjs
- scripts/ledger/plan-steps.test.mjs
- .claude/agents/code-reviewer.md

EZD-384b (2026-11-11): the code-bound step (P3) and the phase dependency check (P5). Paths above plus:
- vault/tools/dep_check.mjs
- vault/tools/contract_check.mjs (already listed)
- scripts/process/dep-check.test.mjs

EZD-385 (2026-11-11): the plan stays true at merge. Paths above plus:
- vault/tools/merge_check.mjs
- vault/tools/connections_check.mjs (already listed)
- scripts/unit-steps.mjs
- .claude/skills/build-ticket/SKILL.md
- scripts/process/merge-check.test.mjs
- scripts/process/unit-steps-plan.test.mjs
