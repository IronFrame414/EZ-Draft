# Handoff: adopt seven PA3 mechanisms into the EZ Draft build tooling

To: the EZ Draft orchestrator (Opus 5.5), as one tooling ticket. Companion to `vault/PROCESS.md` v2.3. From: Josh, 2026-10-18 (revised the same day with Josh's answers; see "Josh's answers"). Where this fits: run it as the next unit after ticket 000, before the pilot ticket T-001. If ticket 000 is already done, run it before any build unit. Give it the ticket ID `EZD-000b` (the ledger uses `EZD-`, not `T-`) and add it to `STATUS.md` with complexity `medium`. What it is: seven additions to the process tooling, taken from Project Architect 3.0 (https://github.com/Druthulu/ProjectArchitect). They are tooling and configuration only. No app code. No change to the product spec.

## Rules for this ticket

1. `vault/PROCESS.md` v2.3 already describes all seven items (sections 3, 4, 10, 11, 13, 14, 15). Replace the repo's copy with the v2.3 file Josh provides before starting. Where this handoff and PROCESS.md differ, PROCESS.md wins; note the difference in your report. (Not yet in the repo as of 2026-10-18: Josh still has to provide the v2.3 file.)
2. Everything else in PROCESS.md applies: tests first, the gate, code review by code-reviewer, one commit, no extras.
3. Build each item as its own worktree commit, in the order under "Order of work and commits" (Item 1 last, because it changes the launcher), so a failure in one does not block the others.
4. Scripts are Node (`.mjs`), matching the existing `scripts/` and `vault/tools/`. Hooks follow the existing hook layout in `.claude/hooks/`.
5. Model choice: test-author and builder on Sonnet 5.5 medium; code-reviewer on Opus 5.5 high. Items 1 and 3 touch the launcher and a hook that denies reads, so code-reviewer checks both for a failure mode where the tooling blocks a legitimate run.
6. Report back in the normal 20-line format, plus the verification list at the end of this file with each item marked verified, failed, or not testable here (with the reason).
7. Write limits for this ticket only (Josh, 2026-10-18): the builder may edit `.claude/`, `CLAUDE.md`, `scripts/`, `vault/tools/` and the vault files each item names. This is an exception to CLAUDE.md rule 5; the plan says how `guard-paths.mjs` grants it for `EZD-000b` and nothing else. Tests, `vault/PROCESS.md` and `vault/spec/` stay off limits.
8. Secrets (Josh, 2026-10-18): the sign-in token is read at run time only, from the Keychain or the credentials file, held in memory, and never written to any file, log, output, commit or report. Nothing secret enters this repository: it is public on GitHub. `scripts/launcher.config.json` stays gitignored. The security-reviewer reviews Item 1b.

## Item 1: real usage meters and a five-hour gate

Replace the estimated-dollar budget proxy with the plan's real usage percentages. Keep `vault/cost/log.jsonl` as a secondary record; stop using it as the hold trigger once the meters work.

Sources, in order of preference:

a. The statusline payload. Claude Code passes a JSON object on stdin to the configured statusline command on every refresh. It carries the account's rate-limit windows (PA3 reads a `rate_limits` object whose entries have `used_percentage` and `resets_at`, plus model-scoped entries for Fable). Write a statusline script, `scripts/statusline.mjs`, that prints a short status line and writes the windows it received to `vault/cost/usage.json` as `{ "five_hour": {pct, resets_at}, "seven_day": {pct, resets_at}, "fable_seven_day": {pct, resets_at}, "read_at": <ISO time>, "source": "statusline" }`. Configure it in the project's `.claude/settings.json` `statusLine`. Confirm the exact field names against the installed version's payload by logging one raw payload to `vault/cost/usage-raw-sample.json` during the first run, then delete that file.

b. The OAuth usage endpoint, as the fallback for headless runs if the statusline never fires under `claude -p`: `GET https://api.anthropic.com/api/oauth/usage` with `Authorization: Bearer <token>`. This endpoint is undocumented and rate-limited; it returns 429 with a `Retry-After` header after a handful of calls per hour. Rules: poll at most every 15 minutes; on 429 wait `max(Retry-After, 120) + 30` seconds; on 401/403 stop polling for an hour and notify Josh; never write the token to any file, log or output. The token on Linux and Windows is `claudeAiOauth.accessToken` in `~/.claude/.credentials.json`. On the Mac, Claude Code may keep it in the Keychain instead of that file. Check `~/.claude/.credentials.json` first; if absent, look for a Keychain item (`security find-generic-password -s "Claude Code-credentials" -w` is the likely command) and confirm before relying on it. If neither source works on this machine, say so in the report and leave the dollar proxy in place as the trigger.

Gates in `scripts/budget.mjs`, read from `vault/cost/usage.json` when it is fresher than 20 minutes, otherwise from the fallback poll, otherwise from the dollar proxy with a warning in the log:

- Five-hour window at or above 90%: pause. Write `vault/handoff/WINDOW_PAUSE.md` with the percent and the reset time. The launcher starts no unit until `resets_at + 2 minutes`, then deletes the file and continues. This is a pause, not a hold: no notification to Josh, no override needed.
- Weekly window: the existing rules, now on the real percent. Warn once at 70% (ntfy). At 80%, write `BUDGET_HOLD.md`, notify, start no new ticket, let the in-progress ticket finish, exit. The existing overrides (`--raise` becomes `--hold-at <pct>`, `--until-reset`, `--api-until-reset`) stay.
- Fable weekly window: at or above 90%, dispatches that would use Fable use Opus instead, logged in STATUS notes. No pause.
- A unit already running is never interrupted by any gate.

`budget.json` changes: `weekly_ceiling_usd_est` and `fable_ceiling_usd_est` become optional (used only in proxy mode). Add `five_hour_pause_pct: 90`, `warn_at_pct: 70`, `hold_at_pct: 80`, `fable_fallback_pct: 90`, `meter_source: "auto" | "statusline" | "oauth" | "proxy"`.

`PROGRESS.md` shows the three percentages and their reset times instead of estimated spend against the ceiling.


Tests: gate decisions from a fixture `usage.json` at 69/70/79/80/89/90% for each window; staleness fallback; the 429 backoff arithmetic; the token never appearing in any written file (grep the output directory for the fixture token after a run).

## Item 2: settings that remove hidden tokens

In the project's `.claude/settings.json`, add:

```json
{
  "todoFeatureEnabled": false,
  "promptSuggestionEnabled": false,
  "autoCompactEnabled": false,
  "env": {
    "CLAUDE_CODE_TOTAL_TOKENS_REMINDER": "off",
    "CLAUDE_CODE_GOAL_CHECKIN_MINUTES": "0"
  }
}
```

Merge into the existing `env` block; do not replace it. Before adding `todoFeatureEnabled: false`, grep `.claude/skills/` and `.claude/agents/` for `TaskCreate`, `TaskUpdate` or `TaskList`; if any skill relies on them, remove that reliance first (the ledgers are files, so nothing should). `autoCompactEnabled: false` means a unit whose context fills ends instead of compacting; the per-unit design keeps that rare, and the builder's work-in-progress commits let the next unit resume. PROCESS.md §14 Settings says the same.

Verify: start one interactive session, confirm no task-list widget appears and no prompt suggestion fires after a reply.

## Item 3: whole-read guard

A `PreToolUse` hook, `.claude/hooks/guard-reads`, on `Read` and `Bash`:

- Read of a file over 20,000 characters with no `offset`/`limit`: deny. The denial message is an outline of the file (for Markdown: the headings to depth 2 with line numbers; for code: top-of-file comment block, then each exported function, class or constant with its line number; capped at 60 lines) ending with "Read the ranges you need with offset and limit."
- Bash `cat`, `head`, `tail`, `sed -n` or `less` on such a file without a narrowing range: deny with the same message. `grep`, `wc` and ranged `sed -n 'a,bp'` are allowed.
- Threshold in `.claude/settings.json` env `GUARD_WHOLE_READ_CHARS` (default `20000`). Exempt list in the same place, default empty; `gate.log` is not exempt (reviewers read its ranges).
- Put the outline generator in `vault/tools/outline.mjs` so agents can call it directly.


Tests: a 25,000-character fixture is denied whole and allowed with a range; a 5,000-character file passes; `grep` on the large file passes; the outline for a sample `.mjs` and a sample `.md` matches expected output.

## Item 4: digest and web retrievers

Two new agent files in `.claude/agents/`:

- `retriever-digest.md`: model `claude-haiku-5-5`, effort `medium`, tools `Read, Grep, Glob, Write`. Answers one question about documents in the repo (spec files, plans, logs, lessons, research) and returns the answer only, 40 lines at most, with `path:line` pointers. Writes a report (Item 6) when the brief says `REPORT: yes`.
- `retriever-web.md`: model `claude-haiku-5-5`, effort `medium`, tools `WebSearch, WebFetch, Write`. Same contract for the outside world.

Brief format for both, added to `.claude/skills/build-ticket/dispatch.md`: `QUESTION · FOR (which agent and ticket) · SCOPE (paths or sites) · CAP (max lines) · REPORT yes|no · KNOWN (what the asker already has)`.

Who may dispatch them: the orchestrator, the planner, code-reviewer, security-reviewer and phase-auditor. Not the builder, test-author or ui-verifier. Enforce it with each agent file's `tools` line: those five get `Agent(retriever-digest, retriever-web)`; the others get no `Agent` tool. The retrievers themselves have no `Agent` tool, so the chain ends there.

Spawn depth: `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2` in the project settings (orchestrator → planner → retriever). as PROCESS.md rule 15 and §14 now say. Everything else stays at depth 1 by the `tools` restriction. `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` stays at 3.

Rule for the dispatching agents (add to the planner and reviewer agent files): a lookup that would pull more than about 30,000 tokens into your context, or needs sifting (a long log, the whole spec, a web search), goes to a retriever. One grep or one small file is fine inline. Never read a research report's body; cite its ID.

Tests: a dispatch from the builder agent file has no `Agent` tool (inspect the frontmatter); a planner dispatch can reach a retriever in a dry run (part of the pilot's verification list, not a unit test).

## Item 5: honesty rules

Append to `CLAUDE.md` under `## Rules (every agent)`:

```
14. Report only what a tool result in this session backs. A claim about our code is verified by reading it in the same action.
15. Another agent's report, a test runner's summary, a profiler, a metric or a past log is a claim until checked against the primary artifact (the file, the diff, the output).
16. A result that looks too good is a bug until proven otherwise. Prove a fix with a re-run. Never redefine a term, weaken a check or narrow a test to make a failure pass; report failures as failures, with the output.
```

(Numbered 14 to 16 because `CLAUDE.md` already has rules 11 to 13; Josh, 2026-10-18: the existing numbers win.)

Add the same three to the body of `code-reviewer.md`, `security-reviewer.md` and `phase-auditor.md` under a heading `## Honesty`. Keep `CLAUDE.md` under about 60 lines; if it goes over, shorten the directory table's wording, not the rules.


## Item 6: research reports

- `vault/research/` with `INDEX.md` (one line per report: `R-NNN | date | title | scope | ticket`) and `pending/`.
- A retriever briefed with `REPORT: yes` writes its findings to `vault/research/pending/<agent>-<slug>.md` and returns `REPORT: pending/<file>` as its first line, then the answer.
- `node vault/tools/research.mjs adopt` moves every pending file to `vault/research/R-NNN.md` (next free number), appends the index line, and prints the IDs. The orchestrator runs it after any dispatch that returned a `REPORT:` line, and the `plan` unit runs it before the planner finishes.
- Plans cite reports in section 2 (Sources) as `R-NNN`. A ticket no report covers says so in section 2.
- Agents never read a report body unless their plan or dispatch names that ID. The whole-read guard (Item 3) applies to reports.
- Add `vault/research/` to the repo tree in `CLAUDE.md`'s directory table: "Findings from earlier lookups | vault/research/INDEX.md (read only the reports your plan names)".


Tests: adopt renumbers two pending files, appends two index lines, leaves `pending/` empty; a second run with nothing pending prints nothing and changes nothing.

## Item 7: rule ratification

Lessons that carry a `Rule:` line are proposals until Josh says yes.

- Each lessons entry gets a `status:` field: `candidate` (default when written), `ratified`, `rejected`.
- `node vault/tools/next_ticket.mjs --lessons <role> <areas>` prints only `ratified` entries. Candidates never reach a dispatch.
- The `questions` unit adds a fourth section to `vault/questions/phase-NN-for-josh.md`: Rule candidates, one line each: the L-number, the rule in one sentence, the ticket it came from, and a recommendation (ratify or reject). Josh answers by number like the other sections; the orchestrator sets each entry's status from his answer and records it in `QUESTIONS.md` with the question ID.
- Candidates that arrive after Stage 2 of a phase wait for the next phase's Stage 2. The gate-phase PR keeps listing lessons added this phase (informational, as now).
- The wrap step's "seen ≥ 2 becomes a gate check" rule applies only to ratified entries.
- `next_ticket.mjs --check` fails if any lessons entry lacks a `status:` field.


Tests: `--lessons` with a mixed fixture returns only ratified entries; `--check` fails on a missing status.

## Order of work and commits

1. Item 2 (settings) and Item 5 (rules): small, no scripts; one commit each.
2. Item 3 (guard) with `outline.mjs`.
3. Item 6 (research store) then Item 4 (retrievers), since the retrievers write reports.
4. Item 7 (ratification).
5. Item 1 (meters and gates), last, because it changes the launcher.

## Verification list (report each as verified / failed / not testable here)

1. The statusline script receives rate-limit data in an interactive session and writes `usage.json`; the field names are recorded in the report.
2. Whether the statusline fires during a `claude -p` unit. If not, whether the OAuth fallback returns data on this Mac, and from which credential source.
3. The five-hour pause writes `WINDOW_PAUSE.md`, the launcher waits, and it resumes after the reset time (simulate with a fixture and a short reset time).
4. The weekly warning fires once at 70% and the hold at 80% lets an in-progress ticket finish (fixture).
5. No token string from the credentials appears in any file under `vault/`, `scripts/`, `.run/` or the logs after a poll.
6. No task-list widget and no prompt suggestions in an interactive session.
7. The guard denies a whole read of a 25,000-character file and allows the ranged read; `grep` still works on it.
8. The builder agent cannot dispatch any agent; the planner can dispatch `retriever-digest` and the chain stops there.
9. `research.mjs adopt` works end to end from a retriever's pending file.
10. `--lessons` excludes candidates; `--check` rejects an entry without `status:`.
11. `CLAUDE.md` is at or under about 60 lines after Items 3, 5 and 6.
12. `vault/PROCESS.md` in the repo is the v2.3 file (its section 11 starts "The launcher gates on the plan's real usage percentages").

## Findings before the build (orchestrator, 2026-10-18, Claude Code 2.1.303 on the Mac)

Checked by searching the installed binary (`~/.local/share/claude/versions/2.1.303`) for each name. Confirmed means the name is present and used; it does not prove the behaviour, which the verification list covers.

| Item | Name | Result |
| --- | --- | --- |
| 2 | `todoFeatureEnabled`, `promptSuggestionEnabled`, `autoCompactEnabled` | Confirmed as settings keys. |
| 2 | `CLAUDE_CODE_TOTAL_TOKENS_REMINDER` | Confirmed. Valid values: `off`, `infinite`, `fixed`, `countdown`, `padded-countdown`. `off` is valid. |
| 2 | `CLAUDE_CODE_GOAL_CHECKIN_MINUTES` | Confirmed; `0` turns the check-in off. |
| 4 | `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` | Confirmed (already in the project settings). |
| 1a | statusline `rate_limits` | Confirmed. The payload documents exactly three windows: `five_hour`, `seven_day` and `spend_limit` (gateway only), each with `used_percentage` (0 to 100) and `resets_at` (Unix seconds, not ISO). **No per-model window**: the statusline cannot supply `fable_seven_day`. The API's own rate-limit types include `seven_day_opus` and `seven_day_sonnet`, so a model-scoped window may come from the OAuth endpoint (Item 1b) or not at all; the builder reports which. Until then the Fable fallback uses the dollar proxy. |
| 1b | `api/oauth/usage` | The path is present in the binary. Behaviour, rate limit and whether it returns a Fable window: not testable without the token; the builder tests it at run time and reports. |
| 1b | Keychain item | The literal `Claude Code-credentials` does not appear; the service name is built at run time (`<prefix>-credentials`, account = the Mac user name). `~/.claude/.credentials.json` is referenced. The builder confirms the service name with `security find-generic-password -s "<name>"` **without** `-w` (so the secret is never printed), then reads it only inside the script. |
| 4 | `Agent(retriever-digest, retriever-web)` in `tools:` | **Does not work as written** (docs: code.claude.com/docs/en/sub-agents). In a `.claude/agents/` file the names inside `Agent(...)` are ignored; `Agent` there only lets the agent spawn any subagent, limited by depth. The names are honoured only for a main-thread agent started with `claude --agent`. Only deny rules are documented: `"permissions": { "deny": ["Agent(builder)", ...] }` in settings, or `--disallowedTools "Agent(name)"` on the launcher's command line. **Change for the plan:** the five dispatching agents get a plain `Agent` tool; the builder, test-author, ui-verifier and both retrievers get no `Agent` tool (that part works); and the project settings deny `Agent(<name>)` for every agent except the two retrievers, so a nested spawn can reach only a retriever. The verification list item 8 stays. |
| 1a | statusline under `claude -p` | Not documented either way (code.claude.com/docs/en/statusline, headless). The docs list when it refreshes (session start, new assistant message, `/compact`, permission-mode change, `refreshInterval`), not whether print mode runs it. Verification item 2 settles it on this Mac. |
