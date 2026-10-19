# Handoff: adopt seven PA3 mechanisms into the EZ Draft build tooling

To: the EZ Draft orchestrator (Opus 5.5), as one tooling ticket. From: Josh, 2026-10-18. Where this fits: run it as the next unit after ticket 000, before the pilot ticket T-001. If ticket 000 is already done, run it before any build unit. Give it the next ticket ID in the `000` series (for example `T-000b`) and add it to `STATUS.md` with complexity `medium`. What it is: seven additions to the process tooling, taken from Project Architect 3.0 (https://github.com/Druthulu/ProjectArchitect). They are tooling and configuration only. No app code. No change to the product spec.

## Rules for this ticket

1. Do not edit `vault/PROCESS.md`. Josh will revise it himself later. Where an item below deviates from PROCESS.md as written, implement the item and record the deviation in a new file, `vault/handoff/PROCESS-DEVIATIONS.md`, one line per deviation: the PROCESS.md section, what it says, what the tooling now does. Josh folds these into the next PROCESS.md revision.
2. Everything else in PROCESS.md applies: tests first, the gate, code review by code-reviewer, one commit, no extras.
3. Build each item as its own worktree commit, in the order below, so a failure in one does not block the others. Item 1 is the largest; do it first.
4. Scripts are Node (`.mjs`), matching the existing `scripts/` and `vault/tools/`. Hooks follow the existing hook layout in `.claude/hooks/`.
5. Model choice: test-author and builder on Sonnet 5.5 medium; code-reviewer on Opus 5.5 high. Items 1 and 3 touch the launcher and a hook that denies reads, so code-reviewer checks both for a failure mode where the tooling blocks a legitimate run.
6. Report back in the normal 20-line format, plus the verification list at the end of this file with each item marked verified, failed, or not testable here (with the reason).

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

Deviation to record: PROCESS.md §11 "The budget", "Calibration", and §15 pilot item 1 and pilot item 10.

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

Merge into the existing `env` block; do not replace it. Before adding `todoFeatureEnabled: false`, grep `.claude/skills/` and `.claude/agents/` for `TaskCreate`, `TaskUpdate` or `TaskList`; if any skill relies on them, remove that reliance first (the ledgers are files, so nothing should). `autoCompactEnabled: false` means a unit whose context fills ends instead of compacting; the per-unit design keeps that rare, and the builder's work-in-progress commits let the next unit resume. Note this in `PROCESS-DEVIATIONS.md` against §14 Settings.

Verify: start one interactive session, confirm no task-list widget appears and no prompt suggestion fires after a reply.

## Item 3: whole-read guard

A `PreToolUse` hook, `.claude/hooks/guard-reads`, on `Read` and `Bash`:

- Read of a file over 20,000 characters with no `offset`/`limit`: deny. The denial message is an outline of the file (for Markdown: the headings to depth 2 with line numbers; for code: top-of-file comment block, then each exported function, class or constant with its line number; capped at 60 lines) ending with "Read the ranges you need with offset and limit."
- Bash `cat`, `head`, `tail`, `sed -n` or `less` on such a file without a narrowing range: deny with the same message. `grep`, `wc` and ranged `sed -n 'a,bp'` are allowed.
- Threshold in `.claude/settings.json` env `GUARD_WHOLE_READ_CHARS` (default `20000`). Exempt list in the same place, default empty; `gate.log` is not exempt (reviewers read its ranges).
- Put the outline generator in `vault/tools/outline.mjs` so agents can call it directly.

Deviation to record: none; PROCESS.md §10 "Dispatch rule" already says agents read only what their dispatch names. Add a line to `CLAUDE.md` rule 10: "A file over 20,000 characters is read by range after `node vault/tools/outline.mjs <path>`."

Tests: a 25,000-character fixture is denied whole and allowed with a range; a 5,000-character file passes; `grep` on the large file passes; the outline for a sample `.mjs` and a sample `.md` matches expected output.

## Item 4: digest and web retrievers

Two new agent files in `.claude/agents/`:

- `retriever-digest.md`: model `claude-haiku-5-5`, effort `medium`, tools `Read, Grep, Glob, Write`. Answers one question about documents in the repo (spec files, plans, logs, lessons, research) and returns the answer only, 40 lines at most, with `path:line` pointers. Writes a report (Item 6) when the brief says `REPORT: yes`.
- `retriever-web.md`: model `claude-haiku-5-5`, effort `medium`, tools `WebSearch, WebFetch, Write`. Same contract for the outside world.

Brief format for both, added to `.claude/skills/build-ticket/dispatch.md`: `QUESTION · FOR (which agent and ticket) · SCOPE (paths or sites) · CAP (max lines) · REPORT yes|no · KNOWN (what the asker already has)`.

Who may dispatch them: the orchestrator, the planner, code-reviewer, security-reviewer and phase-auditor. Not the builder, test-author or ui-verifier. Enforce it with each agent file's `tools` line: those five get `Agent(retriever-digest, retriever-web)`; the others get no `Agent` tool. The retrievers themselves have no `Agent` tool, so the chain ends there.

Spawn depth: this needs `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2` in the project settings (orchestrator → planner → retriever). PROCESS.md rule 15 and §14 say depth 1 and "no nested subagents". Record this in `PROCESS-DEVIATIONS.md` as: retrievers are the one permitted nesting; everything else stays at depth 1 by the `tools` restriction. `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` stays at 3.

Rule for the dispatching agents (add to the planner and reviewer agent files): a lookup that would pull more than about 30,000 tokens into your context, or needs sifting (a long log, the whole spec, a web search), goes to a retriever. One grep or one small file is fine inline. Never read a research report's body; cite its ID.

Tests: a dispatch from the builder agent file has no `Agent` tool (inspect the frontmatter); a planner dispatch can reach a retriever in a dry run (part of the pilot's verification list, not a unit test).

## Item 5: honesty rules

Append to `CLAUDE.md` under `## Rules (every agent)`:

```
11. Report only what a tool result in this session backs. A claim about our code is verified by reading it in the same action.
12. Another agent's report, a test runner's summary, a profiler, a metric or a past log is a claim until checked against the primary artifact (the file, the diff, the output).
13. A result that looks too good is a bug until proven otherwise. Prove a fix with a re-run. Never redefine a term, weaken a check or narrow a test to make a failure pass; report failures as failures, with the output.
```

Add the same three to the body of `code-reviewer.md`, `security-reviewer.md` and `phase-auditor.md` under a heading `## Honesty`. Keep `CLAUDE.md` under about 60 lines; if it goes over, shorten the directory table's wording, not the rules.

Deviation to record: PROCESS.md §14 CLAUDE.md template (rules 11–13 added).

## Item 6: research reports

- `vault/research/` with `INDEX.md` (one line per report: `R-NNN | date | title | scope | ticket`) and `pending/`.
- A retriever briefed with `REPORT: yes` writes its findings to `vault/research/pending/<agent>-<slug>.md` and returns `REPORT: pending/<file>` as its first line, then the answer.
- `node vault/tools/research.mjs adopt` moves every pending file to `vault/research/R-NNN.md` (next free number), appends the index line, and prints the IDs. The orchestrator runs it after any dispatch that returned a `REPORT:` line, and the `plan` unit runs it before the planner finishes.
- Plans cite reports in section 2 (Sources) as `R-NNN`. A ticket no report covers says so in section 2.
- Agents never read a report body unless their plan or dispatch names that ID. The whole-read guard (Item 3) applies to reports.
- Add `vault/research/` to the repo tree in `CLAUDE.md`'s directory table: "Findings from earlier lookups | vault/research/INDEX.md (read only the reports your plan names)".

Deviation to record: PROCESS.md §6 plan section 2, §13 (new store), §14 tree.

Tests: adopt renumbers two pending files, appends two index lines, leaves `pending/` empty; a second run with nothing pending prints nothing and changes nothing.

## Item 7: rule ratification

Lessons that carry a `Rule:` line are proposals until Josh says yes.

- Each lessons entry gets a `status:` field: `candidate` (default when written), `ratified`, `rejected`.
- `node vault/tools/next_ticket.mjs --lessons <role> <areas>` prints only `ratified` entries. Candidates never reach a dispatch.
- The `questions` unit adds a fourth section to `vault/questions/phase-NN-for-josh.md`: Rule candidates, one line each: the L-number, the rule in one sentence, the ticket it came from, and a recommendation (ratify or reject). Josh answers by number like the other sections; the orchestrator sets each entry's status from his answer and records it in `QUESTIONS.md` with the question ID.
- Candidates that arrive after Stage 2 of a phase wait for the next phase's Stage 2. The gate-phase PR keeps listing lessons added this phase (informational, as now).
- The wrap step's "seen ≥ 2 becomes a gate check" rule applies only to ratified entries.
- `next_ticket.mjs --check` fails if any lessons entry lacks a `status:` field.

Deviation to record: PROCESS.md §13 lessons ("Josh sees the lessons … and can veto" becomes ratification before use), §7 (fourth section), §16.

Tests: `--lessons` with a mixed fixture returns only ratified entries; `--check` fails on a missing status.

## Order of work and commits

1. Item 2 (settings) and Item 5 (rules): small, no scripts; one commit each.
2. Item 3 (guard) with `outline.mjs`.
3. Item 6 (research store) then Item 4 (retrievers), since the retrievers write reports.
4. Item 7 (ratification).
5. Item 1 (meters and gates), last, because it changes the launcher.
6. `vault/handoff/PROCESS-DEVIATIONS.md` is written as you go, committed with each item.

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
12. `vault/PROCESS.md` is unchanged (`git diff` shows nothing for it).
