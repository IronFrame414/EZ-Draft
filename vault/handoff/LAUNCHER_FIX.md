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
