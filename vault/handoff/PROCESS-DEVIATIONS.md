# Process v2.4 deviations

Where the v2.4 migration (Josh's handoff, approved 2026-10-22) was applied differently from the handoff, with a one-line reason each.

- **Edit route.** The `.claude/`, `scripts/` and `vault/tools/` changes are patches Josh applied himself (folded into the "process v2.4" commit), not orchestrator edits: Claude Code's safety classifier refused agent self-modification even in fix mode (`vault/handoff/LAUNCHER_FIX.md`), and Josh chose the patch.
- **Pre-flight 1.** `claude --version` cannot run inside a session (guard-bash); the installed binary is `~/.local/share/claude/versions/2.1.303`, above the 2.1.293 needed.
- **Pre-flight 2.** No flag-fetching blockers to remove: none of `DISABLE_TELEMETRY`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DO_NOT_TRACK`, `DISABLE_GROWTHBOOK` is set in project or user settings, the shell profiles, the launcher or the environment.
- **Pre-flight 3 and 4.** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` and `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` are not set; `CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-5-5` already was.
- **Change 6 (plugin).** The linked docs page has no code-intelligence section and plugin installs use the `claude` command, which the hooks deny inside a session; Josh installs the TypeScript plugin and language server himself. PROCESS.md already allows code-intelligence plugins.
- **Change 8 (batches).** The gate runs once per ticket worktree, not once per batch: each ticket keeps its own branch and commit (`scripts/unit-steps.mjs` merges per ticket). `next_ticket.mjs --batch` finds overlapping files from the backticked paths in the plans.
- **Section 3 table, final review on high.** "Fable 5.1 where v2.3 allowed it" resolves to Opus 5.5: the code-reviewer never ran on Fable.
- **Section 3 table, test-author and builder on high.** No Fable retry any more for them (the v2.4 ladder ends in the orchestrator's blocked review).
- **Questions and gate-phase effort.** Both moved from high to medium with the orchestrator (handoff: Sonnet / medium for every orchestrator); their judgment calls go to the advisor.
- **Section 5 columns.** Model and effort per dispatch, advisor calls and tokens per ticket come from `usage-by-agent.mjs`; batched, first-round PASS and rounds come from STATUS Notes at the wrap step; weekly-limit % per ticket depends on the usage meter, which returned 401 on 2026-10-22.
- **Pilot P-01.** Run on the first medium ticket built on v2.4 (Josh's choice; no low ticket is ready and this repo has no P-00); the Haiku items (2 for the builder, 4) are checked on the first low ticket.
- **Found during the migration.** EZD-018's Sonnet orchestrator ended its session while its builder was still running (2026-10-22 21:15 UTC), losing that dispatch; the build skill now says never to end the turn while a dispatched agent runs. The worktree's work-in-progress commits were kept. Root cause in the launcher log: "Background tasks still running 10m after the last turn … stopping them" (EZD-017 and EZD-018). The patch also sets `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` for every unit in `scripts/run.mjs` (not in the handoff; added because it stops builds dying mid-dispatch).
