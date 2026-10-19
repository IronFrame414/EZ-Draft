# Pilot checks (PROCESS.md section 15, ticket EZD-001)

EZD-001 is the pilot ticket: the orchestrator runs it through every step of section 8 and, in the same unit or the next interactive session, confirms the items below. One deliberate failure (a test the builder cannot pass without a structural repair, or a review FAIL staged by the orchestrator) exercises escalation and lesson capture. Record each result here (date, pass or fail, what was seen); the wrap of Phase 0 reports the table.

| # | Check | How | Result |
| --- | --- | --- | --- |
| 1 | Subagents dispatched from a `claude -p` session finish before the session ends | Run `build EZD-001` through `node scripts/run.mjs --once` (ceiling set) or watch an interactive run; the orchestrator's report must include each agent's result | |
| 2 | A per-dispatch `model` override takes effect | The run's JSON `modelUsage` (or the agent's own report) names the model the dispatch asked for | |
| 3 | The session-start hook injects state after `/clear` and on startup in a `-p` run | `/clear` then ask "which unit is next?"; in a `-p` run the answer matches `next_ticket.mjs --next-unit` | |
| 4 | The Stop hook, `FORCE_STOP` and the session-end hook behave as described | Break STATUS.md on a copy; the turn cannot end; create `vault/handoff/FORCE_STOP`; the failure lands in CURRENT.md; session end archives the handoff and commits `vault/` | |
| 5 | Cost field names in the run output, and the log and budget arithmetic | `vault/cost/log.jsonl` has `est_usd` > 0 for the run; `node scripts/budget.mjs` shows it; field names noted here | |
| 6 | Budget hold, notification and override work end to end | Set a tiny ceiling, run `--once`, see `BUDGET_HOLD.md` and the ntfy message; `budget.mjs --raise` releases it | |
| 7 | The preview deploy appears on a PR | Phase 0 gate (`gate-phase 0`), after Q-0116 | |
| 8 | The plan-limit error message format, when first encountered | Paste the message here; set `limit_formats_confirmed` in `scripts/launcher.config.json` once the five-hour vs weekly forms are known | |
| 9 | `plan` and `review-plans` run as the agent with no orchestrator, and the launcher's ledger line is correct | First `plan <T>` unit of Phase 1 (or a throwaway plan on a copy) | |
| 10 | The warning at 70%, the hold at 80% letting the in-progress ticket finish, and `--api-until-reset` switching auth | Small ceiling with two units; `log.jsonl` `auth` field reads `api` after the override | |
| 11 | Resuming a subagent (step-8 reviewer, same-tier builder retry) works from a `-p` session | The deliberate failure: the resumed reviewer and builder keep their context (their reports reference the earlier round) | |
| 12 | No task-list widget and no prompt suggestions in an interactive session (PA3-MECHANISMS.md verification item 6; EZD-000b, Q-0126 (c)) | Start an interactive session in the repo; no task list or prompt suggestion appears; token reminders and goal check-ins stay off | |

CLI facts recorded on 2026-10-18 (Claude Code 2.1.302): `--max-budget-usd`, `--permission-prompts none`, `--effort`, `--agent`, `--permission-mode auto`, `--output-format json` are listed by `claude --help`; `--max-turns` is not (the launcher drops it; Q-0120).
