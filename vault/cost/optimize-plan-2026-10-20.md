# Optimize-usage plan, 2026-10-20 (approved by Josh)

Findings: `vault/cost/efficiency-plan-2026-10-20.md`. Josh's choices: the launcher keeps running; plans get section-only reading plus a size cap; spec files get smaller pieces (C6, Josh 2026-10-20).

## Ground rules
- `.claude/`, `scripts/`, `vault/tools/`, `vault/PROCESS.md`, `vault/PROCESS-EZDRAFT.md` are Josh-only (`.claude/hooks/guard-paths.mjs:61-63`). Each chunk runs in fix mode (PROCESS.md rule 19, `vault/handoff/LAUNCHER_FIX.md`). Approving this plan is Josh's yes for the process-file edits named here, nothing more.
- Each chunk works on its own branch in its own worktree and merges into `develop` only when no unit runs (`pgrep -f "claude -p"` empty). Old dispatch lines stay valid.
- Tests first for script changes; `node scripts/gate.mjs <worktree>` green.
- One chunk per session. C1 and C2 may run together; then C3, C4, C5, C6 in order; C8 after each; C7 last.

## C1. A meter you can trust (small)
Files: `scripts/oauth-usage.mjs`, `scripts/run.mjs`, `scripts/budget.mjs`, tests in `scripts/budget/`.
1. `node scripts/oauth-usage.mjs --check`: prints only the HTTP status and the token's source (file or Keychain). Josh runs it (agents may not read the Keychain). Fix the cause of the 401 it shows.
2. Log rows gain `wall_ms` (spawn to exit, measured by run.mjs), `meter_source`, `process_rev` (develop short hash at start).
3. A hold from the dollar estimate says "estimated: check Settings → Usage" and gives the last real reading and its age.
Done when tests prove it and the gate is green.

## C2. Cost-by-agent tool (small)
`vault/tools/usage-by-agent.mjs`: reads the log, each session transcript and its `subagents/*.jsonl` + `.meta.json`, de-duplicates by message id, prices by model and token type (rates from the claude-api skill's pricing reference, source cited). Output: $ by unit kind × role × model, $ per built ticket, plan characters read per role; `--since`, `--rev`. Writes `vault/cost/baseline-2026-10-19.md`. Wrap skill's cost step uses it.

## C3. Each agent reads only its plan sections (medium)
| Role | Reads |
|---|---|
| Orchestrator | header and §7–§9, once |
| Test-author | §3, §4 |
| Builder | §1, §3, §4, §6 |
| Code-reviewer mode 2 | §3, §4 |
| Code-reviewer mode 3 | §1, §3, §4, §6 |
| Security-reviewer | §1, §3, §7 |
| Planner re-validation | §3, §4, §9 |

UI-verifier (§5) and calc-auditor (§4) already work this way. Files: `vault/tools/outline.mjs` (character count per section), `.claude/skills/build-ticket/dispatch.md` and `SKILL.md`, `.claude/agents/*.md`, one paragraph in PROCESS.md section 8. Plans without these sections are read whole. Done when plan text read per build is under half of 10-19.

## C4. Plan size cap, split at plan time (medium)
About 25,000 characters per plan. Files: `vault/plans/TEMPLATE.md`, `.claude/skills/plan-ticket/SKILL.md`, `.claude/agents/planner.md`, `vault/PROCESS.md:194`, `vault/tools/next_ticket.mjs --check` (warn on new oversized plans). On a split, the same planner session writes the child plans. Planners read other plans by outline only. Ready phase-0 plans are not rewritten. Done when phase-1 plans fit and no build stops to split.

## C5. Lean build orchestrator (medium)
`scripts/unit-steps.mjs` with `preflight`, `worktree`, `merge`, `finish`, each printing 5 lines or fewer; tests use `scripts/release/__tests__/git-fixture.mjs`. `build-ticket/SKILL.md` steps 0, 2, 10, 11 call it. Done when the orchestrator's share of a build halves.

## C6. Spec files in smaller pieces
For phases not yet spec-checked, `/spec-check` writes area files of 20,000 characters or fewer (CLAUDE.md rule 10 read limit). Each ticket's `spec_files` in `tickets.json` lists only the pieces it needs; the planner loads only those. Signed-off spec files stay as they are. Files: `.claude/skills/spec-check/SKILL.md`, `vault/spec/READINESS.md`, the planner reading list. Done when the next phase's plan sessions load at least 30% less context than phase 0's (C2).

## C7. Models (Josh's decision, later)
No change now. With C2's real prices, show Josh Fable's cost next to its review-FAIL rate (3 of 9 against 9 of 23 on 10-19).

## C8. Check every chunk
After each merge, compare the next 3 to 5 builds with 10-19: $ per ticket, role shares, review FAILs (12 of 32), second rounds (6 of 32), wall time. If quality drops, revert that chunk and tell Josh. A short result goes into `vault/cost/`.
