# EZD-000b · PA3 mechanisms (process tooling)

- **ACs:** AC-EZD-000b-1 (`vault/spec/acceptance-criteria.md`). When the split below is applied, the parts' ACs are generated from their Done-when text (`vault/tools/gen_acs.mjs`) and AC-EZD-000b-1 is regenerated for Part A.
- **Complexity:** medium for every part (rated per part below; PA3-MECHANISMS.md header gives `medium`, rule 5 gives the models).
- **User-visible result:** once all parts are in, the launcher pauses and holds on Josh's real Claude usage percentages instead of estimated dollars, and agents use less of his usage: no hidden extras, no whole reads of big files, big lookups go to cheap retrievers, and lessons reach agents only after Josh approves them.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: questions (split proposal)

## Split proposal

**Why split.** The ticket covers seven items (PA3-MECHANISMS.md Items 1–7). Together they touch about 30 files (settings, CLAUDE.md, 7 agent files, 3 skills, 3 new hooks or hook changes, 4 scripts, 3 vault tools, the research store) and need about 35 tests. That is far over the limit of about 8 files and 10 tests (plan-ticket skill step 3). The handoff also asks for each item as its own commit "so a failure in one does not block the others" (PA3-MECHANISMS.md rule 3). One ticket = one commit (CLAUDE.md rule 11). A split gives both: one part per item, one commit per part.

**IDs.** `EZD-000b` already carries a letter, and `next_ticket.mjs` accepts only `EZD-<number>` plus one optional letter (PROCESS-EZDRAFT.md section 2). So Part A keeps `EZD-000b`, and the other parts take the next free letters `EZD-000c` to `EZD-000i`. None of those IDs is used yet (I grepped STATUS.md). The orchestrator owns the ID choice when it applies the split.

**Order and dependencies.** The parts form one chain, b → c → d → e → f → g → h → i. This follows the handoff's "Order of work and commits": Items 2 and 5, then 3, then 6, then 4, then 7, then Item 1 last because it changes the launcher. The parts also share files: `.claude/settings.json` (b, c, f, h), `CLAUDE.md` (b, c, d), `next_ticket.mjs` (g, h), and `run.mjs` and `budget.mjs` (h, i). Only one ticket may be in progress at a time (PROCESS-EZDRAFT.md section 8). Ledger changes:
- `EZD-001` (the pilot) changes from depending on `EZD-000b` to depending on all eight parts.
- `EZD-029` stays as it is: it depends on `EZD-000` only, it was never expanded to `EZD-000b`, and a spike needs none of this tooling.

**Write grant.** Under the handoff, the builder may edit `.claude/`, `CLAUDE.md`, `scripts/`, `vault/tools/` and the vault files each item names (PA3-MECHANISMS.md rule 7). Tests, `vault/PROCESS.md` and `vault/spec/` stay off limits. The builder cannot add its own exception, so the orchestrator adds it to `guard-paths.mjs` in fix mode before Part A's build (Q-0125 (a): "a plan that names a path a guard denies … the orchestrator adds the exception and records it"). Whether the grant covers the split parts is QP-3.

**Reviewers and models (all parts).**
- code-reviewer: always.
- ui-verifier: no (no screen changes, so no visual checklist and no EZD-016a dependency).
- calc-auditor: no.
- security-reviewer: only on Part H, which handles the sign-in token (PA3-MECHANISMS.md rule 8).
- Models: test-author and builder on Sonnet 5.5, code-reviewer on Opus 5.5 at high effort (PA3-MECHANISMS.md rule 5).
- For B, E, G and H, code-reviewer checks for a failure mode where the tooling blocks a legitimate run: B is the read guard, E is the spawn guard, G and H are the launcher gates (PA3-MECHANISMS.md rule 5 names Items 1 and 3; E is added because it can block the orchestrator's dispatches).

### Part A · EZD-000b · Hidden-token settings and honesty rules (Items 2, 5)

- **Scope:**
  - `.claude/settings.json`: add `todoFeatureEnabled: false`, `promptSuggestionEnabled: false`, `autoCompactEnabled: false`, plus env `CLAUDE_CODE_TOTAL_TOKENS_REMINDER: "off"` and `CLAUDE_CODE_GOAL_CHECKIN_MINUTES: "0"`, merged into the existing `env` block (Item 2; PROCESS.md section 14 Settings).
  - Before that, grep `.claude/skills/` and `.claude/agents/` for `TaskCreate`, `TaskUpdate` and `TaskList`, and remove any reliance on them (Item 2).
  - Append rules 14–16 to `CLAUDE.md` under "Rules (every agent)" (Item 5; numbering is Josh's, 2026-10-18).
  - Add the same three rules under `## Honesty` in `code-reviewer.md`, `security-reviewer.md` and `phase-auditor.md` (Item 5).
  - Report verification item 12 (the repo's PROCESS.md is v2.3; section 11 "The budget" starts "The launcher gates on the plan's real usage percentages", PROCESS.md line ~352).
- **Files:** 5, plus 1 test file. **Tests:** about 4.
- **Done when:** `.claude/settings.json` sets `todoFeatureEnabled`, `promptSuggestionEnabled` and `autoCompactEnabled` to false and env `CLAUDE_CODE_TOTAL_TOKENS_REMINDER` to "off" and `CLAUDE_CODE_GOAL_CHECKIN_MINUTES` to "0", with every existing env key unchanged; no file under `.claude/skills/` or `.claude/agents/` names TaskCreate, TaskUpdate or TaskList; `CLAUDE.md` holds rules 14 to 16 under "Rules (every agent)" and is at most 60 lines; `code-reviewer.md`, `security-reviewer.md` and `phase-auditor.md` each hold the same three rules under "## Honesty". Verification items 6 and 12 of `vault/handoff/PA3-MECHANISMS.md` are reported (verified, failed or not testable here) and the gate is green.
- **Depends on:** EZD-000 · **Spec ref:** vault/handoff/PA3-MECHANISMS.md Items 2, 5; PROCESS.md v2.3 sections 3, 11, 14 · security-review: no

### Part B · EZD-000c · Whole-read guard and outline tool (Item 3)

- **Scope:**
  - New `.claude/hooks/guard-reads.mjs`, a PreToolUse hook on Read and Bash.
  - New `vault/tools/outline.mjs <path>`.
  - In `.claude/settings.json`: register the hook, and add env `GUARD_WHOLE_READ_CHARS: "20000"` and an exempt list that is empty by default.
  - Add the v2.3 template's sentence to CLAUDE.md rule 10: "A file over 20,000 characters is read by range after `node vault/tools/outline.mjs <path>`" (PROCESS.md section 14 CLAUDE.md template; PROCESS.md wins over the handoff, PA3-MECHANISMS.md rule 1).
- **Files:** 4, plus 1–2 test files. **Tests:** about 6.
- **Done when:** a Read with no offset or limit of a 25,000-character text file is denied with the file's outline ending "Read the ranges you need with offset and limit."; the same Read with a range, a Read of a 5,000-character file and grep on the large file all pass; cat, head, tail, sed -n and less on the large file without a range are denied and ranged `sed -n 'a,bp'` passes; `vault/tools/outline.mjs` prints the expected outline for a sample .mjs and a sample .md (Markdown headings to depth 2 with line numbers; code: top comment block then each exported function, class or constant with its line; at most 60 lines); the threshold is read from `GUARD_WHOLE_READ_CHARS`, default 20000. Verification item 7 is reported (verified, failed or not testable here) and the gate is green.
- **Depends on:** EZD-000b · **Spec ref:** PA3-MECHANISMS.md Item 3; PROCESS.md v2.3 sections 10, 13, 14 · security-review: no

### Part C · EZD-000d · Research report store (Item 6)

- **Scope:**
  - New `vault/tools/research.mjs adopt`.
  - New `vault/research/INDEX.md` and `vault/research/pending/`.
  - New `CLAUDE.md` directory row "Findings from earlier lookups | vault/research/INDEX.md (only the reports your plan names)".
  - Add the adopt step to `.claude/skills/plan-ticket/SKILL.md` (the plan unit runs adopt before the planner finishes) and to `.claude/skills/build-ticket/SKILL.md` (the orchestrator runs it after any dispatch that returned a `REPORT:` line).
  - Orchestrator step, not the builder's: `vault/plans/TEMPLATE.md` section 2 gains "research reports R-NNN; a ticket no report covers says so" (PROCESS.md section 6 item 2).
- **Files:** 6, plus 1 test file. **Tests:** about 3.
- **Done when:** `node vault/tools/research.mjs adopt` with two files in `vault/research/pending/` moves them to the next two free `R-NNN.md` numbers, appends two lines `R-NNN | date | title | scope | ticket` to `vault/research/INDEX.md`, prints the two IDs and leaves `pending/` empty; a second run with nothing pending prints nothing and changes nothing; `CLAUDE.md`'s directory table has the research row and the file is at most 60 lines. Verification item 11 is reported (verified, failed or not testable here) and the gate is green.
- **Depends on:** EZD-000c · **Spec ref:** PA3-MECHANISMS.md Item 6; PROCESS.md v2.3 sections 6, 13, 14 · security-review: no

### Part D · EZD-000e · Retriever agents and dispatch brief (Item 4, agent files)

- **Scope:**
  - New `.claude/agents/retriever-digest.md`: `claude-haiku-5-5`, effort medium, maxTurns 15, tools `Read, Grep, Glob, Write`.
  - New `.claude/agents/retriever-web.md`: the same settings, with tools `WebSearch, WebFetch, Write`.
  - Both retrievers follow Item 4's contract: answer only, 40 lines at most, `path:line` pointers. With `REPORT: yes` they write `vault/research/pending/<agent>-<slug>.md` and return `REPORT: pending/<file>` as their first line, in the file format Part C defines.
  - `planner.md`, `code-reviewer.md`, `security-reviewer.md` and `phase-auditor.md` get an `Agent` tool and the retriever rule (about 30,000 tokens, or a lookup that needs sifting, goes to a retriever; never read a report body, cite its ID).
  - The brief format `QUESTION · FOR · SCOPE · CAP · REPORT yes|no · KNOWN` is added to `.claude/skills/build-ticket/dispatch.md`.
  - Spawn depth stays at 1 in this part, so the new `Agent` tools cannot nest until Part E's enforcement exists.
- **Sources:**
  - maxTurns 15 comes from the PROCESS.md v2.3 section 4 roster; the handoff gives none.
  - The `Agent` tool line follows the handoff's Findings row for Item 4: `Agent(names)` names are ignored in subagent files.
- **Files:** 7, plus 1 test file. **Tests:** about 3 (frontmatter checks).
- **Done when:** `retriever-digest.md` and `retriever-web.md` exist with model claude-haiku-5-5, effort medium, maxTurns 15 and tools "Read, Grep, Glob, Write" and "WebSearch, WebFetch, Write" respectively; planner, code-reviewer, security-reviewer and phase-auditor have an Agent tool and the retriever rule; builder, test-author, ui-verifier, calc-auditor, Explore and both retrievers have no Agent tool; `dispatch.md` holds the retriever brief format. The gate is green.
- **Depends on:** EZD-000d · **Spec ref:** PA3-MECHANISMS.md Item 4 and Findings; PROCESS.md v2.3 sections 3 (rule 15), 4, 10 · security-review: no

### Part E · EZD-000f · Retriever spawn limits (Item 4, enforcement)

- **Scope:**
  - Make sure that a nested spawn can reach only a retriever, that only the four dispatching agents can spawn at all, and that retrievers spawn nothing (PROCESS.md section 3 rule 15).
  - Set env `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "2"` in `.claude/settings.json`; `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` stays "3" (PROCESS.md section 11 Spend discipline).
  - `guard-paths.mjs` gains the retrievers' write limit: `vault/research/pending/` only (PROCESS.md section 4 roster). Today the guard denies any agent not in its list.
  - The enforcement mechanism is the part planner's choice; see note 6.
- **Files:** 3, plus 1 test file. **Tests:** about 5.
- **Done when:** a subagent spawn requested by builder, test-author or ui-verifier is denied; one requested by the planner or a reviewer for an agent other than retriever-digest or retriever-web is denied; one requested by a retriever is denied; the planner's spawn of retriever-digest and the main session's spawn of any agent are allowed; a retriever may write only under `vault/research/pending/`; settings env `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` is "2" and `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` is "3". Verification items 8 and 9 are reported (verified, failed or not testable here) and the gate is green.
- **Depends on:** EZD-000e · **Spec ref:** PA3-MECHANISMS.md Item 4 and Findings; PROCESS.md v2.3 sections 3, 4, 11, 14 · security-review: no

### Part F · EZD-000g · Lesson ratification (Item 7)

- **Scope:**
  - `next_ticket.mjs --lessons` prints only `ratified` entries.
  - `--check` fails on any lessons entry without `status:`.
  - `.claude/skills/questions/SKILL.md` adds a fourth section, "Rule candidates", to `phase-NN-for-josh.md`: L-number, the rule in one sentence, the source ticket, and a recommendation. It sets each entry's status from Josh's answer and records it in QUESTIONS.md with the Q-ID (PROCESS.md section 7).
  - `.claude/skills/wrap/SKILL.md`: the "seen ≥ 2 becomes a gate check" rule applies to ratified entries only (PROCESS.md section 13).
  - Effect today: both existing lessons (L-001 in reviewer.md, L-002 in planner.md) are `candidate`, so after this part no lesson reaches a dispatch until Josh ratifies them at the next Stage 2. This is intended (PROCESS.md section 13).
- **Files:** 3, plus 1 test file. **Tests:** about 3. `next_ticket.mjs` is 21,665 characters, so after Part B it is read by range.
- **Done when:** `--lessons` run on a fixture with candidate, ratified and rejected entries prints only the ratified ones; `--check` fails, naming the entry, when a lessons entry has no `status:` field; the questions skill writes a fourth section "Rule candidates" and records Josh's ratify or reject answer as the entry's status. Verification item 10 is reported (verified, failed or not testable here) and the gate is green.
- **Depends on:** EZD-000f · **Spec ref:** PA3-MECHANISMS.md Item 7; PROCESS.md v2.3 sections 7, 13 · security-review: no

### Part G · EZD-000h · Usage meters, five-hour pause and weekly gate (Item 1a and the gates)

- **Scope:**
  - New `scripts/statusline.mjs`. It prints a short status line and writes the windows it receives to `vault/cost/usage.json` as `{five_hour, seven_day, fable_seven_day: {pct, resets_at}, read_at, source: "statusline"}`. It logs one raw payload to `vault/cost/usage-raw-sample.json`, which is deleted after the field names are recorded. It is configured in `.claude/settings.json` `statusLine`.
  - `scripts/budget.mjs` exports the gate decisions and keeps its CLI.
    - Source order: `usage.json` when fresher than 20 minutes, else the fallback (Part H; until then none), else the dollar proxy with a warning in the log.
    - Five-hour window ≥ 90%: write `WINDOW_PAUSE.md` and start nothing until `resets_at` + 2 minutes, then delete the file.
    - Weekly window: warn once at 70%; at ≥ 80%, hold, and an in-progress ticket finishes.
    - Fable window ≥ 90%: use Opus instead.
    - A unit already running is never interrupted.
    - `--raise` becomes `--hold-at <pct>`.
  - `scripts/run.mjs` uses these decisions.
  - `next_ticket.mjs --report` shows the three percentages and their reset times in `PROGRESS.md`.
  - `.gitignore`: the usage files.
- **Files:** 6, plus 1–2 test files. **Tests:** about 7.
- **Done when:** gate decisions from a fixture `usage.json` at 69, 70, 79, 80, 89 and 90% for each window match PROCESS.md section 11 (five-hour pause at 90; weekly warn at 70 and hold at 80; Fable fallback at 90); a `usage.json` older than 20 minutes falls back to the next source and, with none, to the dollar proxy with a warning; the pause writes `vault/handoff/WINDOW_PAUSE.md` with the percent and reset time and the launcher resumes after `resets_at` plus 2 minutes; the weekly warning fires once and the hold lets an in-progress ticket finish; `statusline.mjs` writes `usage.json` from a fixture payload. Verification items 1, 3, 4 and the statusline half of 2 are reported (verified, failed or not testable here) and the gate is green.
- **Depends on:** EZD-000g · **Spec ref:** PA3-MECHANISMS.md Item 1a and Findings; PROCESS.md v2.3 sections 10, 11, 13, 14 · security-review: no

### Part H · EZD-000i · OAuth usage fallback (Item 1b)

- **Scope:**
  - The fallback poll of `GET https://api.anthropic.com/api/oauth/usage` with the bearer token, read at run time only:
    - Linux and Windows: `claudeAiOauth.accessToken` in `~/.claude/.credentials.json`.
    - Mac: if that file is absent, the Keychain item. Confirm the service name with `security find-generic-password -s "<name>"` without `-w`, per the Findings row for 1b.
  - Poll at most every 15 minutes.
  - On 429, wait `max(Retry-After, 120) + 30` seconds. On 401 or 403, stop polling for an hour and notify Josh.
  - The token is never written to any file, log, output, commit or report (PA3-MECHANISMS.md rule 8; PROCESS.md section 11).
  - If neither credential source works on this Mac, say so and leave the proxy as the trigger.
  - Tests stub the network (CLAUDE.md rule 6).
- **Files:** 2–3, plus 1 test file. **Tests:** about 4.
- **Done when:** the poller makes no second request within 15 minutes; after a 429 with Retry-After 60 it waits 150 seconds and with Retry-After 300 it waits 330 seconds (`max(Retry-After, 120) + 30`); after a 401 or 403 it stops polling for one hour and calls the notify command; after a poll with a fixture token, no file under the output directories contains the token. Verification item 5 and the OAuth half of item 2 are reported (verified, failed or not testable here) and the gate is green.
- **Depends on:** EZD-000h · **Spec ref:** PA3-MECHANISMS.md Item 1b, rule 8 and Findings; PROCESS.md v2.3 section 11 · security-review: yes (auth: the login token; API: an outside, undocumented endpoint)

## Notes for the part planners (Level 1 answers and findings)

1. **Gate scope: no disagreement.** `git diff de5030c eea4fd7 -- vault/PROCESS.md` (v2 → v2.3) does not change section 8 step 7 or section 9. PROCESS-EZDRAFT.md section 4 (Q-0006, Q-0114) is a project refinement and stands. Asked by PA3-MECHANISMS.md rule 1; not a question.
2. **Agent roster: no disagreement.** v2.3 section 4 adds the two retrievers. PROCESS-EZDRAFT.md section 3 adds calc-auditor and write limits and contradicts neither, so both apply (PROCESS.md preamble). calc-auditor is not one of the dispatchers named in v2.3 rule 15, so it gets no `Agent` tool. The pilot list does differ: see QP-1.
3. **Budget: disagreement.** See QP-2. `vault/budget.json` holds `*_fraction` keys, and only Josh or `budget.mjs` may write it (guard-paths.mjs `joshOnly`; PROCESS-EZDRAFT.md section 3). Part G reads the v2.3 keys with the section 11 defaults (90/70/80/90, `auto`), which equal today's fractions, and no agent edits the file.
4. **Fable meter.** The statusline has no Fable window (Findings row 1a). With `fable_ceiling_usd_est` null, `run.mjs` `fableAllowed()` already returns true. Fable therefore stays allowed until a Fable meter or ceiling exists, and the limit-error fallback (PROCESS.md section 4) still applies. Not a question.
5. **PROGRESS.md.** v2.3 section 11 ("shows the three percentages") and section 13 ("this week's estimated spend against the ceiling") differ. Part G shows the percentages when a fresh meter reading exists and the spend line in proxy mode.
6. **Enforcing the spawn limits (Part E).**
   - The Findings propose project-settings deny rules `Agent(<name>)` for every non-retriever agent. Not verified this session: if those rules also bind the main session, the orchestrator could no longer dispatch the builder, planner or reviewers.
   - Part E's planner settles this with a `retriever-web` lookup (`REPORT: yes`, available after Part D) before choosing between deny rules and a PreToolUse hook on the spawn tool that checks the caller's `agent_type` (`guard-paths.mjs` already keys on `agent_type`).
7. **guard-reads must not block legitimate runs (Part B).**
   - Skip non-text files (PNG mockups, screenshots, PDFs read with `pages`), or ui-verifier's image reads are denied.
   - Decide how pipes count (`cat big | grep x` puts no file text into context).
   - `run.mjs` (21,495 characters) and `next_ticket.mjs` (21,665) are over the threshold, so the Part F, G and H builders read them by range.
8. **Handoff vs PROCESS.md v2.3 differences** (to report; PROCESS.md wins, PA3-MECHANISMS.md rule 1):
   - CLAUDE.md honesty rules are numbered 14–16 per Josh, not the template's 11–13.
   - The rule 10 outline sentence (Part B) comes from the v2.3 template.
   - Retriever maxTurns is 15 (v2.3 roster).
   - v2.3 says the statusline carries Fable entries; the Findings say it does not.
9. **Research reports:** none exist yet (`vault/research/` is absent), so no R-NNN covers this ticket.

## Open questions

- **Q-0126 (was QP-1; answered-agent (c)):** PROCESS-EZDRAFT.md section 5 says the EZD-001 pilot runs the eleven checks in `vault/handoff/PILOT.md`. PROCESS.md v2.3 section 15 now lists seventeen; its checks 1 and 13 to 17 (meters, five-hour pause, guard-reads, retrievers, research and lessons, hidden-token settings) match this ticket's verification list. Options: (a) the EZD-000b parts' verification reports cover those six and PILOT.md stays at eleven; (b) PILOT.md also gains the six, so EZD-001 re-checks them end to end; (c) PILOT.md gains only the items a part reports as "not testable here".
- **Q-0127 (was QP-2; answered-agent (a)):** PROCESS-EZDRAFT.md section 8 still says the weekly ceiling, per-unit cap and Fable ceiling are unset until Josh sets them, and that units run interactively until then. PROCESS.md v2.3 section 11 gates on the real meters and uses the dollar ceilings only in proxy mode. Q-0119 already says v2.3 supersedes the ceilings, and `budget.json` now holds `weekly_ceiling_usd_est` 300 and `per_unit_cap_usd_est` 40. Options: (a) with Josh's yes, the orchestrator rewrites that line to point to PROCESS.md section 11 and Q-0119; (b) leave the line and let Q-0119 govern.
- **Q-0128 (was QP-3; answered-agent (a)):** Josh's write grant for this ticket (PA3-MECHANISMS.md rule 7: the builder may edit `.claude/`, `CLAUDE.md`, `scripts/` and `vault/tools/`, "for EZD-000b and nothing else") has to reach the split parts EZD-000c to EZD-000i. Options: (a) the orchestrator adds one `guard-paths.mjs` exception under Q-0125 (a), keyed to the eight part worktrees EZD-000b to EZD-000i, with tests, `vault/PROCESS.md`, `vault/spec/` and `scripts/gate.mjs` still denied, and removes it after the last part merges; (b) Josh approves each part's grant separately.
